/**
 * RichTextEditorView
 *
 * A clean markdown editor that uses a single visible TextInput.
 * The cursor is always in the correct position because there is no overlay.
 *
 * Format operations wrap/unwrap selected text with markdown syntax (**bold**, *italic*, etc.)
 * The preview card renders the markdown visually — the editor shows clean markdown syntax.
 *
 * This is the same approach used by Bear Notes, Obsidian, and Typora on mobile.
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
  StyleSheet,
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
  toggleMark: (key: keyof Marks) => void;
  setBlockType: (type: BlockType) => void;
  getValue: () => string;
  focus: () => void;
}

interface RichTextEditorViewProps {
  initialValue: string;
  onChange: (markdown: string) => void;
  onToolbarStateChange: (state: EditorToolbarState) => void;
  placeholder?: string;
}

// ─── Markdown manipulation helpers ───────────────────────────────────────────

function wrapSelection(
  text: string,
  start: number,
  end: number,
  marker: string,
): { text: string; start: number; end: number } {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  // Unwrap if already wrapped
  if (
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    selected.length > marker.length * 2
  ) {
    const unwrapped = selected.slice(marker.length, selected.length - marker.length);
    return { text: before + unwrapped + after, start, end: start + unwrapped.length };
  }
  const wrapped = marker + selected + marker;
  return {
    text: before + wrapped + after,
    start: start + marker.length,
    end: end + marker.length,
  };
}

function getBlockType(text: string, caretPos: number): BlockType {
  const lineStart = text.lastIndexOf('\n', caretPos - 1) + 1;
  const lineEnd = text.indexOf('\n', caretPos);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  if (line.startsWith('# ')) return 'title';
  if (line.startsWith('## ')) return 'heading';
  if (line.startsWith('### ')) return 'subheading';
  return 'body';
}

function setLineBlockType(
  text: string,
  caretPos: number,
  type: BlockType,
): { text: string; caret: number } {
  const lineStart = text.lastIndexOf('\n', caretPos - 1) + 1;
  const lineEnd = text.indexOf('\n', caretPos);
  const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
  // Strip existing prefix
  const content = line.replace(/^#{1,3} /, '');
  const prefix =
    type === 'title' ? '# ' :
    type === 'heading' ? '## ' :
    type === 'subheading' ? '### ' : '';
  const newLine = prefix + content;
  const newText =
    text.slice(0, lineStart) + newLine + (lineEnd === -1 ? '' : text.slice(lineEnd));
  const caretOffset = caretPos - lineStart - (line.length - content.length);
  const newCaret = lineStart + prefix.length + Math.max(0, caretOffset);
  return { text: newText, caret: newCaret };
}

// ─── Component ────────────────────────────────────────────────────────────────

const RichTextEditorView = React.forwardRef<RichTextEditorHandle, RichTextEditorViewProps>(
  ({ initialValue, onChange, onToolbarStateChange, placeholder = 'Start writing...' }, ref) => {
    const inputRef = useRef<TextInput>(null);

    const [text, setText] = useState(initialValue || '');
    const textRef = useRef(initialValue || '');

    const [selection, setSelection] = useState({ start: 0, end: 0 });
    const selectionRef = useRef({ start: 0, end: 0 });
    // Preserved on blur so format sheet buttons still work after focus loss
    const lastKnownSelectionRef = useRef({ start: 0, end: 0 });

    const [pendingMarks, setPendingMarks] = useState<Marks>({
      bold: false, italic: false, underline: false, strike: false,
    });
    const pendingMarksRef = useRef<Marks>({
      bold: false, italic: false, underline: false, strike: false,
    });

    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleAutosave = useCallback(
      (value: string) => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => onChange(value), 500);
      },
      [onChange],
    );

    const notifyToolbar = useCallback(
      (currentText: string, sel: { start: number; end: number }, pending: Marks) => {
        const blockType = getBlockType(currentText, sel.start);
        const selectedText = currentText.slice(sel.start, sel.end);
        const isBold =
          selectedText.startsWith('**') &&
          selectedText.endsWith('**') &&
          selectedText.length > 4;
        const isItalic =
          !isBold &&
          selectedText.startsWith('*') &&
          selectedText.endsWith('*') &&
          selectedText.length > 2;
        const isUnderline =
          selectedText.startsWith('__') &&
          selectedText.endsWith('__') &&
          selectedText.length > 4;
        const isStrike =
          selectedText.startsWith('~~') &&
          selectedText.endsWith('~~') &&
          selectedText.length > 4;
        onToolbarStateChange({
          activeBlockType: blockType,
          bold: isBold || pending.bold,
          italic: isItalic || pending.italic,
          underline: isUnderline || pending.underline,
          strike: isStrike || pending.strike,
          pendingMarks: pending,
        });
      },
      [onToolbarStateChange],
    );

    const handleChangeText = useCallback(
      (newText: string) => {
        setText(newText);
        textRef.current = newText;
        scheduleAutosave(newText);
        notifyToolbar(newText, selectionRef.current, pendingMarksRef.current);
      },
      [scheduleAutosave, notifyToolbar],
    );

    const handleSelectionChange = useCallback(
      (e: any) => {
        const { start, end } = e.nativeEvent.selection;
        selectionRef.current = { start, end };
        lastKnownSelectionRef.current = { start, end };
        setSelection({ start, end });
        if (start !== end) {
          const cleared: Marks = { bold: false, italic: false, underline: false, strike: false };
          setPendingMarks(cleared);
          pendingMarksRef.current = cleared;
        }
        notifyToolbar(textRef.current, { start, end }, pendingMarksRef.current);
      },
      [notifyToolbar],
    );

    const handleBlur = useCallback(() => {
      lastKnownSelectionRef.current = selectionRef.current;
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        toggleMark: (key: keyof Marks) => {
          const sel = lastKnownSelectionRef.current;
          const currentText = textRef.current;

          if (sel.start === sel.end) {
            // Collapsed: toggle pending mark
            const newPending = {
              ...pendingMarksRef.current,
              [key]: !pendingMarksRef.current[key],
            };
            setPendingMarks(newPending);
            pendingMarksRef.current = newPending;
            notifyToolbar(currentText, sel, newPending);
          } else {
            const marker =
              key === 'bold' ? '**' :
              key === 'italic' ? '*' :
              key === 'underline' ? '__' : '~~';
            const result = wrapSelection(currentText, sel.start, sel.end, marker);
            setText(result.text);
            textRef.current = result.text;
            scheduleAutosave(result.text);
            const newSel = { start: result.start, end: result.end };
            setSelection(newSel);
            selectionRef.current = newSel;
            lastKnownSelectionRef.current = newSel;
            notifyToolbar(result.text, newSel, pendingMarksRef.current);
            // Restore focus so user can keep typing
            setTimeout(() => inputRef.current?.focus(), 30);
          }
        },

        setBlockType: (type: BlockType) => {
          const sel = lastKnownSelectionRef.current;
          const result = setLineBlockType(textRef.current, sel.start, type);
          setText(result.text);
          textRef.current = result.text;
          scheduleAutosave(result.text);
          const newSel = { start: result.caret, end: result.caret };
          setSelection(newSel);
          selectionRef.current = newSel;
          lastKnownSelectionRef.current = newSel;
          notifyToolbar(result.text, newSel, pendingMarksRef.current);
          setTimeout(() => inputRef.current?.focus(), 30);
        },

        getValue: () => textRef.current,

        focus: () => {
          setTimeout(() => inputRef.current?.focus(), 50);
        },
      }),
      [scheduleAutosave, notifyToolbar],
    );

    useEffect(() => {
      return () => {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          onChange(textRef.current);
        }
      };
    }, [onChange]);

    return (
      <View style={styles.container}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={handleChangeText}
          onSelectionChange={handleSelectionChange}
          onBlur={handleBlur}
          selection={selection}
          multiline
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.3)"
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
  },
);

RichTextEditorView.displayName = 'RichTextEditorView';
export default RichTextEditorView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 400,
  },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 26,
    color: '#ffffff',
    textAlignVertical: 'top',
    minHeight: 400,
    padding: 0,
    backgroundColor: 'transparent',
    // Subtle markdown syntax coloring via opacity — the ** markers are slightly dimmed
    // so they don't distract from the content
  },
});
