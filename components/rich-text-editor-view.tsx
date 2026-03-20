/**
 * RichTextEditorView
 *
 * A React Native rich-text editor that works on both native and web.
 *
 * Architecture:
 *  - Uses a single TextInput that stores the raw markdown text
 *  - On web: renders a contenteditable-style overlay using a hidden TextInput + visible Text layer
 *  - Format operations wrap/unwrap selected text with markdown syntax
 *  - The document model (lib/rich-text-editor.ts) handles serialization for storage
 *
 * Key insight: Rather than fighting React Native's TextInput limitations,
 * we store raw markdown in the TextInput and render a visual overlay.
 * The TextInput has transparent text color so only the overlay is visible.
 * Format buttons wrap/unwrap the selected text range directly in the markdown string.
 */

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type BlockType,
  type Marks,
} from '@/lib/rich-text-editor';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditorToolbarState {
  activeBlockType: BlockType | 'mixed';
  bold: boolean | 'mixed';
  italic: boolean | 'mixed';
  underline: boolean | 'mixed';
  strike: boolean | 'mixed';
  pendingMarks: Marks;
}

export interface RichTextEditorHandle {
  /** Apply/toggle an inline mark on the current selection (or set pending mark) */
  toggleMark: (key: keyof Marks) => void;
  /** Set the block type for the current selection */
  setBlockType: (type: BlockType) => void;
  /** Get the current serialized markdown string */
  getValue: () => string;
  /** Focus the editor */
  focus: () => void;
}

interface RichTextEditorViewProps {
  /** Initial markdown string value */
  initialValue: string;
  /** Called whenever the document changes (debounced) */
  onChange: (markdown: string) => void;
  /** Called with updated toolbar state whenever selection or document changes */
  onToolbarStateChange: (state: EditorToolbarState) => void;
  /** Placeholder text when empty */
  placeholder?: string;
}

// ─── Markdown inline parser ───────────────────────────────────────────────────

interface Span {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

/** Parse a single line of markdown into styled spans */
function parseInlineMarkdown(line: string): Span[] {
  const spans: Span[] = [];
  // Regex: match **bold**, *italic*, __underline__, ~~strike~~, or plain text
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(__(.+?)__)|(~~(.+?)~~)|([^*_~]+)/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (match[1]) spans.push({ text: match[2], bold: true, italic: false, underline: false, strike: false });
    else if (match[3]) spans.push({ text: match[4], bold: false, italic: true, underline: false, strike: false });
    else if (match[5]) spans.push({ text: match[6], bold: false, italic: false, underline: true, strike: false });
    else if (match[7]) spans.push({ text: match[8], bold: false, italic: false, underline: false, strike: true });
    else if (match[9]) spans.push({ text: match[9], bold: false, italic: false, underline: false, strike: false });
  }
  return spans.length > 0 ? spans : [{ text: line, bold: false, italic: false, underline: false, strike: false }];
}

/** Get block type and display text from a markdown line */
function parseBlockLine(line: string): { type: BlockType; content: string } {
  if (line.startsWith('# ')) return { type: 'title', content: line.slice(2) };
  if (line.startsWith('## ')) return { type: 'heading', content: line.slice(3) };
  if (line.startsWith('### ')) return { type: 'subheading', content: line.slice(4) };
  return { type: 'body', content: line };
}

const BLOCK_TEXT_STYLE: Record<BlockType, object> = {
  title:      { fontSize: 28, lineHeight: 36, fontWeight: '800' as const, color: '#ffffff', marginBottom: 2 },
  heading:    { fontSize: 22, lineHeight: 30, fontWeight: '700' as const, color: '#ffffff', marginBottom: 2 },
  subheading: { fontSize: 18, lineHeight: 26, fontWeight: '600' as const, color: '#ffffff', marginBottom: 2 },
  body:       { fontSize: 17, lineHeight: 26, color: '#ffffff', marginBottom: 2 },
};

/** Render a single markdown line as a styled Text node */
function renderMarkdownLine(line: string, index: number): React.ReactNode {
  if (line === '') {
    return <Text key={index} style={{ fontSize: 17, lineHeight: 26, color: '#ffffff' }}>{'\n'}</Text>;
  }
  const { type, content } = parseBlockLine(line);
  const spans = parseInlineMarkdown(content);
  return (
    <Text key={index} style={BLOCK_TEXT_STYLE[type]}>
      {spans.map((span, si) => {
        const style: any = {};
        if (span.bold) style.fontWeight = '800';
        if (span.italic) style.fontStyle = 'italic';
        if (span.underline && span.strike) style.textDecorationLine = 'underline line-through';
        else if (span.underline) style.textDecorationLine = 'underline';
        else if (span.strike) style.textDecorationLine = 'line-through';
        return <Text key={si} style={style}>{span.text}</Text>;
      })}
    </Text>
  );
}

// ─── Markdown manipulation helpers ───────────────────────────────────────────

/** Wrap selected text with a markdown marker (e.g. ** for bold) */
function wrapSelection(text: string, start: number, end: number, marker: string): { text: string; start: number; end: number } {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  // Check if already wrapped — if so, unwrap
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length > marker.length * 2) {
    const unwrapped = selected.slice(marker.length, selected.length - marker.length);
    return { text: before + unwrapped + after, start, end: start + unwrapped.length };
  }
  const wrapped = marker + selected + marker;
  return { text: before + wrapped + after, start: start + marker.length, end: end + marker.length };
}

/** Get the current line prefix (# / ## / ###) for a given caret position */
function getLinePrefix(text: string, caretPos: number): string {
  const lineStart = text.lastIndexOf('\n', caretPos - 1) + 1;
  const line = text.slice(lineStart);
  const match = line.match(/^(#{1,3} )/);
  return match ? match[1] : '';
}

/** Set block type prefix on the current line */
function setLineBlockType(text: string, caretPos: number, type: BlockType): { text: string; caret: number } {
  const lineStart = text.lastIndexOf('\n', caretPos - 1) + 1;
  const lineEnd = text.indexOf('\n', caretPos);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  const { content } = parseBlockLine(line);
  const prefix = type === 'title' ? '# ' : type === 'heading' ? '## ' : type === 'subheading' ? '### ' : '';
  const newLine = prefix + content;
  const newText = text.slice(0, lineStart) + newLine + (lineEnd === -1 ? '' : text.slice(lineEnd));
  const caretOffset = caretPos - lineStart - (line.length - content.length);
  const newCaret = lineStart + prefix.length + Math.max(0, caretOffset);
  return { text: newText, caret: newCaret };
}

// ─── Component ────────────────────────────────────────────────────────────────

const RichTextEditorView = React.forwardRef<RichTextEditorHandle, RichTextEditorViewProps>(
  ({ initialValue, onChange, onToolbarStateChange, placeholder = 'Start writing...' }, ref) => {
    const inputRef = useRef<TextInput>(null);

    // Raw markdown text stored in the TextInput
    const [text, setText] = useState(initialValue || '');
    const textRef = useRef(initialValue || '');

    // Selection state
    const [selection, setSelection] = useState({ start: 0, end: 0 });
    const selectionRef = useRef({ start: 0, end: 0 });
    // Last known selection before focus loss (used when format sheet buttons are tapped)
    const lastKnownSelectionRef = useRef({ start: 0, end: 0 });

    // Pending marks for collapsed caret
    const [pendingMarks, setPendingMarks] = useState<Marks>({ bold: false, italic: false, underline: false, strike: false });
    const pendingMarksRef = useRef<Marks>({ bold: false, italic: false, underline: false, strike: false });

    // Autosave debounce
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleAutosave = useCallback((value: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => onChange(value), 500);
    }, [onChange]);

    const updateText = useCallback((newText: string, newSel?: { start: number; end: number }) => {
      setText(newText);
      textRef.current = newText;
      scheduleAutosave(newText);
      if (newSel) {
        setSelection(newSel);
        selectionRef.current = newSel;
      }
      // Derive toolbar state from current line
      const caretPos = newSel ? newSel.start : selectionRef.current.start;
      const lineStart = newText.lastIndexOf('\n', caretPos - 1) + 1;
      const lineEnd = newText.indexOf('\n', caretPos);
      const line = newText.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const { type } = parseBlockLine(line);
      // Check if selection is inside bold/italic markers
      const sel = newSel ?? selectionRef.current;
      const selectedText = newText.slice(sel.start, sel.end);
      const isBold = selectedText.startsWith('**') && selectedText.endsWith('**');
      const isItalic = !isBold && selectedText.startsWith('*') && selectedText.endsWith('*');
      onToolbarStateChange({
        activeBlockType: type,
        bold: isBold || pendingMarksRef.current.bold,
        italic: isItalic || pendingMarksRef.current.italic,
        underline: pendingMarksRef.current.underline,
        strike: pendingMarksRef.current.strike,
        pendingMarks: pendingMarksRef.current,
      });
    }, [scheduleAutosave, onToolbarStateChange]);

    const handleChangeText = useCallback((newText: string) => {
      updateText(newText);
    }, [updateText]);

    const handleBlur = useCallback(() => {
      // Save the last known selection so format sheet buttons can use it
      lastKnownSelectionRef.current = selectionRef.current;
    }, []);

    const handleSelectionChange = useCallback((e: any) => {
      const { start, end } = e.nativeEvent.selection;
      selectionRef.current = { start, end };
      lastKnownSelectionRef.current = { start, end };
      setSelection({ start, end });
      if (start !== end) {
        setPendingMarks({ bold: false, italic: false, underline: false, strike: false });
        pendingMarksRef.current = { bold: false, italic: false, underline: false, strike: false };
      }
      // Update toolbar state
      const currentText = textRef.current;
      const lineStart = currentText.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = currentText.indexOf('\n', start);
      const line = currentText.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      const { type } = parseBlockLine(line);
      const selectedText = currentText.slice(start, end);
      const isBold = selectedText.startsWith('**') && selectedText.endsWith('**');
      const isItalic = !isBold && selectedText.startsWith('*') && selectedText.endsWith('*');
      onToolbarStateChange({
        activeBlockType: type,
        bold: isBold || pendingMarksRef.current.bold,
        italic: isItalic || pendingMarksRef.current.italic,
        underline: pendingMarksRef.current.underline,
        strike: pendingMarksRef.current.strike,
        pendingMarks: pendingMarksRef.current,
      });
    }, [onToolbarStateChange]);

    useImperativeHandle(ref, () => ({
      toggleMark: (key: keyof Marks) => {
        // Use lastKnownSelectionRef so format sheet buttons work even after focus loss
        const sel = lastKnownSelectionRef.current;
        const currentText = textRef.current;

        if (sel.start === sel.end) {
          // Collapsed caret: toggle pending mark
          const newPending = { ...pendingMarksRef.current, [key]: !pendingMarksRef.current[key] };
          setPendingMarks(newPending);
          pendingMarksRef.current = newPending;
          onToolbarStateChange({
            activeBlockType: 'body',
            bold: newPending.bold,
            italic: newPending.italic,
            underline: newPending.underline,
            strike: newPending.strike,
            pendingMarks: newPending,
          });
        } else {
          // Range selection: wrap/unwrap the selected text
          const marker = key === 'bold' ? '**' : key === 'italic' ? '*' : key === 'underline' ? '__' : '~~';
          const result = wrapSelection(currentText, sel.start, sel.end, marker);
          updateText(result.text, { start: result.start, end: result.end });
          // Force TextInput to update selection after state change
          setTimeout(() => {
            inputRef.current?.setNativeProps?.({ selection: { start: result.start, end: result.end } });
          }, 50);
        }
      },

      setBlockType: (type: BlockType) => {
        const sel = selectionRef.current;
        const result = setLineBlockType(textRef.current, sel.start, type);
        updateText(result.text, { start: result.caret, end: result.caret });
      },

      getValue: () => textRef.current,

      focus: () => {
        setTimeout(() => inputRef.current?.focus(), 50);
      },
    }), [updateText, onToolbarStateChange]);

    // Save immediately on unmount
    useEffect(() => {
      return () => {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          onChange(textRef.current);
        }
      };
    }, [onChange]);

    const isEmpty = text.trim() === '';
    const lines = text.split('\n');

    return (
      <View style={styles.container}>
        {/* Visual render layer — pointerEvents='none' so taps pass through to TextInput */}
        <View pointerEvents="none" style={styles.renderLayer}>
          {isEmpty ? (
            <Text style={styles.placeholder}>{placeholder}</Text>
          ) : (
            lines.map((line, i) => renderMarkdownLine(line, i))
          )}
        </View>

        {/* Transparent input layer — captures all keystrokes */}
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={handleChangeText}
          onSelectionChange={handleSelectionChange}
          onBlur={handleBlur}
          selection={selection}
          multiline
          placeholder=""
          style={[
            styles.input,
            Platform.OS === 'web'
              ? ({ outlineWidth: 0, outlineStyle: 'none', caretColor: '#ffffff' } as any)
              : {},
          ]}
          textAlignVertical="top"
          autoCorrect
          autoCapitalize="sentences"
          spellCheck
        />
      </View>
    );
  }
);

RichTextEditorView.displayName = 'RichTextEditorView';
export default RichTextEditorView;

const styles = StyleSheet.create({
  container: {
    minHeight: 400,
    position: 'relative',
  },
  renderLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  input: {
    fontSize: 17,
    lineHeight: 26,
    color: 'transparent',
    textAlignVertical: 'top',
    minHeight: 400,
    padding: 0,
    backgroundColor: 'transparent',
  },
  placeholder: {
    fontSize: 17,
    lineHeight: 26,
    color: 'rgba(255,255,255,0.3)',
  },
});
