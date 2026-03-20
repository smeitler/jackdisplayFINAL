/**
 * RichTextEditorView
 *
 * A React Native rich-text editor component built on the block+inline document model.
 *
 * Architecture:
 *  - Transparent TextInput captures all keystrokes and selection events
 *  - A rendered View overlay displays the styled text (bold/italic/headings)
 *  - The document model (lib/rich-text-editor.ts) handles all editing operations
 *
 * The component manages:
 *  - Document state (blocks + runs)
 *  - Selection tracking (flat offsets)
 *  - Pending typing marks (for collapsed caret formatting)
 *  - Toolbar state derivation
 *  - Autosave via debounce
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
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type Block,
  type BlockType,
  type Marks,
  type RichDocument,
  type SelectionRange,
  EMPTY_MARKS,
  blockTypeAtOffset,
  deleteRange,
  deriveActiveMarks,
  documentLength,
  insertText,
  parseDocument,
  serializeDocument,
  setBlockType,
  splitBlock,
  toggleMark,
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

// ─── Block renderer ───────────────────────────────────────────────────────────

const BLOCK_STYLES: Record<BlockType, object> = {
  title:      { fontSize: 28, lineHeight: 36, fontWeight: '800' as const, color: '#ffffff', marginBottom: 6 },
  heading:    { fontSize: 22, lineHeight: 30, fontWeight: '700' as const, color: '#ffffff', marginBottom: 4 },
  subheading: { fontSize: 18, lineHeight: 26, fontWeight: '600' as const, color: '#ffffff', marginBottom: 2 },
  body:       { fontSize: 17, lineHeight: 26, color: '#ffffff', marginBottom: 2 },
};

function renderBlock(block: Block, blockIndex: number): React.ReactNode {
  return (
    <Text key={block.id} style={BLOCK_STYLES[block.type]}>
      {block.runs.map((run, runIndex) => {
        const style: any = {};
        if (run.marks.bold) style.fontWeight = '800';
        if (run.marks.italic) style.fontStyle = 'italic';
        if (run.marks.underline) style.textDecorationLine = run.marks.strike ? 'underline line-through' : 'underline';
        else if (run.marks.strike) style.textDecorationLine = 'line-through';
        if (run.marks.italic && run.marks.bold) { style.fontWeight = '800'; style.fontStyle = 'italic'; }
        return (
          <Text key={`${block.id}_${runIndex}`} style={style}>
            {run.text}
          </Text>
        );
      })}
    </Text>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const RichTextEditorView = React.forwardRef<RichTextEditorHandle, RichTextEditorViewProps>(
  ({ initialValue, onChange, onToolbarStateChange, placeholder = 'Start writing...' }, ref) => {
    const inputRef = useRef<TextInput>(null);

    // Document state
    const [doc, setDoc] = useState<RichDocument>(() => parseDocument(initialValue));
    const docRef = useRef<RichDocument>(doc);
    docRef.current = doc;

    // Selection state (flat offsets)
    const [selection, setSelection] = useState<SelectionRange>({ start: 0, end: 0 });
    const selectionRef = useRef<SelectionRange>({ start: 0, end: 0 });
    selectionRef.current = selection;

    // Pending typing marks (applied to next typed chars when caret is collapsed)
    const [pendingMarks, setPendingMarks] = useState<Marks>({ ...EMPTY_MARKS });
    const pendingMarksRef = useRef<Marks>({ ...EMPTY_MARKS });
    pendingMarksRef.current = pendingMarks;

    // The "flat string" that the TextInput sees — used only for selection tracking
    // We keep it in sync with the document
    const [flatValue, setFlatValue] = useState<string>(() => serializeDocument(parseDocument(initialValue)));
    const flatValueRef = useRef<string>(flatValue);
    flatValueRef.current = flatValue;

    // Autosave debounce
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleAutosave = useCallback((markdown: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onChange(markdown);
      }, 500);
    }, [onChange]);

    // Sync doc → flatValue and notify toolbar
    const applyDocUpdate = useCallback((newDoc: RichDocument, newSelection?: SelectionRange) => {
      const markdown = serializeDocument(newDoc);
      setDoc(newDoc);
      setFlatValue(markdown);
      flatValueRef.current = markdown;
      scheduleAutosave(markdown);

      const sel = newSelection ?? selectionRef.current;
      if (newSelection) {
        setSelection(newSelection);
        selectionRef.current = newSelection;
      }

      // Derive toolbar state
      const activeMarks = deriveActiveMarks(newDoc, sel.start, sel.end);
      const activeBlockType = blockTypeAtOffset(newDoc, sel.start);
      onToolbarStateChange({
        activeBlockType,
        bold: activeMarks.bold,
        italic: activeMarks.italic,
        underline: activeMarks.underline,
        strike: activeMarks.strike,
        pendingMarks: pendingMarksRef.current,
      });
    }, [scheduleAutosave, onToolbarStateChange]);

    // Notify toolbar when selection changes without doc change
    const notifyToolbarState = useCallback((sel: SelectionRange, currentDoc: RichDocument, currentPending: Marks) => {
      const activeMarks = deriveActiveMarks(currentDoc, sel.start, sel.end);
      const activeBlockType = blockTypeAtOffset(currentDoc, sel.start);
      onToolbarStateChange({
        activeBlockType,
        bold: activeMarks.bold,
        italic: activeMarks.italic,
        underline: activeMarks.underline,
        strike: activeMarks.strike,
        pendingMarks: currentPending,
      });
    }, [onToolbarStateChange]);

    // Handle TextInput text changes
    // We intercept the raw text change and rebuild the document from it
    // This is the simplest approach that works with native keyboard on mobile
    const handleChangeText = useCallback((newText: string) => {
      const oldText = flatValueRef.current;
      const sel = selectionRef.current;

      // Detect what changed by comparing old vs new text
      // The TextInput gives us the full new string after the edit
      if (newText === oldText) return;

      // Find the diff: what was inserted/deleted
      // Simple approach: find common prefix and suffix
      let prefixLen = 0;
      while (prefixLen < oldText.length && prefixLen < newText.length && oldText[prefixLen] === newText[prefixLen]) {
        prefixLen++;
      }
      let oldSuffixLen = 0;
      let newSuffixLen = 0;
      while (
        oldSuffixLen < oldText.length - prefixLen &&
        newSuffixLen < newText.length - prefixLen &&
        oldText[oldText.length - 1 - oldSuffixLen] === newText[newText.length - 1 - newSuffixLen]
      ) {
        oldSuffixLen++;
        newSuffixLen++;
      }

      const deletedFrom = prefixLen;
      const deletedTo = oldText.length - oldSuffixLen;
      const insertedText = newText.slice(prefixLen, newText.length - newSuffixLen);

      let currentDoc = docRef.current;

      // Delete the old range if any
      if (deletedTo > deletedFrom) {
        const result = deleteRange(currentDoc, deletedFrom, deletedTo);
        currentDoc = result.doc;
      }

      // Insert new text if any
      if (insertedText.length > 0) {
        if (insertedText === '\n') {
          // Newline: split block
          const result = splitBlock(currentDoc, deletedFrom);
          currentDoc = result.doc;
          const newSel = { start: result.caretOffset, end: result.caretOffset };
          applyDocUpdate(currentDoc, newSel);
          return;
        } else {
          currentDoc = insertText(currentDoc, deletedFrom, insertedText, pendingMarksRef.current);
        }
      }

      const newCaret = deletedFrom + insertedText.length;
      applyDocUpdate(currentDoc, { start: newCaret, end: newCaret });
    }, [applyDocUpdate]);

    // Handle selection changes from TextInput
    const handleSelectionChange = useCallback((e: any) => {
      const { start, end } = e.nativeEvent.selection;
      const newSel = { start, end };
      setSelection(newSel);
      selectionRef.current = newSel;

      // When selection becomes expanded, clear pending marks
      if (start !== end) {
        setPendingMarks({ ...EMPTY_MARKS });
        pendingMarksRef.current = { ...EMPTY_MARKS };
      }

      notifyToolbarState(newSel, docRef.current, pendingMarksRef.current);
    }, [notifyToolbarState]);

    // Expose imperative handle for format sheet
    useImperativeHandle(ref, () => ({
      toggleMark: (key: keyof Marks) => {
        const sel = selectionRef.current;
        const currentDoc = docRef.current;

        if (sel.start === sel.end) {
          // Collapsed caret: toggle pending mark
          const newPending = { ...pendingMarksRef.current, [key]: !pendingMarksRef.current[key] };
          setPendingMarks(newPending);
          pendingMarksRef.current = newPending;
          notifyToolbarState(sel, currentDoc, newPending);
        } else {
          // Range selection: apply to range
          const newDoc = toggleMark(currentDoc, sel.start, sel.end, key);
          applyDocUpdate(newDoc, sel);
        }
      },

      setBlockType: (type: BlockType) => {
        const sel = selectionRef.current;
        const newDoc = setBlockType(docRef.current, sel.start, sel.end, type);
        applyDocUpdate(newDoc, sel);
      },

      getValue: () => serializeDocument(docRef.current),

      focus: () => {
        setTimeout(() => inputRef.current?.focus(), 50);
      },
    }), [applyDocUpdate, notifyToolbarState]);

    // Save immediately on unmount
    useEffect(() => {
      return () => {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          onChange(serializeDocument(docRef.current));
        }
      };
    }, [onChange]);

    const isEmpty = doc.blocks.length === 1 && doc.blocks[0].runs.every((r) => r.text === '');

    return (
      <View style={styles.container}>
        {/* Visual render layer — pointerEvents='none' so taps pass through */}
        <View pointerEvents="none" style={styles.renderLayer}>
          {isEmpty ? (
            <Text style={styles.placeholder}>{placeholder}</Text>
          ) : (
            doc.blocks.map((block, i) => renderBlock(block, i))
          )}
        </View>

        {/* Transparent input layer — captures all keystrokes */}
        <TextInput
          ref={inputRef}
          value={flatValue}
          onChangeText={handleChangeText}
          onSelectionChange={handleSelectionChange}
          selection={selection}
          multiline
          placeholder=""
          style={[
            styles.input,
            Platform.OS === 'web' ? ({ outlineWidth: 0, outlineStyle: 'none', caretColor: '#ffffff' } as any) : {},
          ]}
          textAlignVertical="top"
          autoFocus
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
    gap: 0,
  },
  input: {
    fontSize: 17,
    lineHeight: 26,
    color: 'transparent',
    textAlignVertical: 'top',
    minHeight: 400,
    padding: 0,
  },
  placeholder: {
    fontSize: 17,
    lineHeight: 26,
    color: 'rgba(255,255,255,0.3)',
  },
});
