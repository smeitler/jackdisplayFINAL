/**
 * Rich-Text Editor Engine
 *
 * A block + inline-mark document model for the journal editor.
 *
 * Architecture:
 *  - Document = Block[]
 *  - Block = { id, type, runs: Run[] }
 *  - Run = { text, marks: Marks }
 *  - Marks = { bold, italic, underline, strike }
 *
 * The document is serialized to/from a markdown-compatible flat string
 * so it can be stored in AsyncStorage alongside existing journal entries.
 *
 * Selection is tracked as a flat character offset across the entire document
 * (newlines count as 1 char between blocks).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockType = 'title' | 'heading' | 'subheading' | 'body';

export interface Marks {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

export interface Run {
  text: string;
  marks: Marks;
}

export interface Block {
  id: string;
  type: BlockType;
  runs: Run[];
}

export interface RichDocument {
  blocks: Block[];
}

export interface SelectionRange {
  start: number;
  end: number;
}

export const EMPTY_MARKS: Marks = { bold: false, italic: false, underline: false, strike: false };

export const BLOCK_TYPE_PREFIXES: Record<BlockType, string> = {
  title: '# ',
  heading: '## ',
  subheading: '### ',
  body: '',
};

// ─── ID generation ────────────────────────────────────────────────────────────

let _idCounter = 0;
export function genId(): string {
  return `b${Date.now()}_${_idCounter++}`;
}

// ─── Serialization ────────────────────────────────────────────────────────────

/** Serialize a Run to markdown inline syntax */
function serializeRun(run: Run): string {
  let text = run.text;
  if (run.marks.strike) text = `~~${text}~~`;
  if (run.marks.underline) text = `__${text}__`;
  if (run.marks.italic) text = `*${text}*`;
  if (run.marks.bold) text = `**${text}**`;
  return text;
}

/** Serialize a Block to a markdown line */
function serializeBlock(block: Block): string {
  const prefix = BLOCK_TYPE_PREFIXES[block.type];
  const text = block.runs.map(serializeRun).join('');
  return prefix + text;
}

/** Serialize a RichDocument to a flat markdown string */
export function serializeDocument(doc: RichDocument): string {
  return doc.blocks.map(serializeBlock).join('\n');
}

// ─── Deserialization ──────────────────────────────────────────────────────────

/** Parse inline markdown marks from a plain text line */
function parseInlineRuns(text: string): Run[] {
  const runs: Run[] = [];
  // Regex matches: **bold**, *italic*, __underline__, ~~strike~~
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|~~[^~]+~~)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      runs.push({ text: text.slice(last, match.index), marks: { ...EMPTY_MARKS } });
    }
    const token = match[0];
    if (token.startsWith('**')) {
      runs.push({ text: token.slice(2, -2), marks: { ...EMPTY_MARKS, bold: true } });
    } else if (token.startsWith('~~')) {
      runs.push({ text: token.slice(2, -2), marks: { ...EMPTY_MARKS, strike: true } });
    } else if (token.startsWith('__')) {
      runs.push({ text: token.slice(2, -2), marks: { ...EMPTY_MARKS, underline: true } });
    } else if (token.startsWith('*')) {
      runs.push({ text: token.slice(1, -1), marks: { ...EMPTY_MARKS, italic: true } });
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    runs.push({ text: text.slice(last), marks: { ...EMPTY_MARKS } });
  }
  if (runs.length === 0) {
    runs.push({ text: '', marks: { ...EMPTY_MARKS } });
  }
  return runs;
}

/** Parse a markdown line into a Block */
function parseLine(line: string): Block {
  let type: BlockType = 'body';
  let content = line;

  if (line.startsWith('# ')) { type = 'title'; content = line.slice(2); }
  else if (line.startsWith('## ')) { type = 'heading'; content = line.slice(3); }
  else if (line.startsWith('### ')) { type = 'subheading'; content = line.slice(4); }

  return { id: genId(), type, runs: parseInlineRuns(content) };
}

/** Parse a flat markdown string into a RichDocument */
export function parseDocument(raw: string): RichDocument {
  if (!raw || raw.trim() === '') {
    return { blocks: [{ id: genId(), type: 'body', runs: [{ text: '', marks: { ...EMPTY_MARKS } }] }] };
  }
  const lines = raw.split('\n');
  return { blocks: lines.map(parseLine) };
}

// ─── Document helpers ─────────────────────────────────────────────────────────

/** Get the total flat character length of a document (newlines between blocks) */
export function documentLength(doc: RichDocument): number {
  return doc.blocks.reduce((sum, b, i) => {
    const blockLen = b.runs.reduce((s, r) => s + r.text.length, 0);
    return sum + blockLen + (i < doc.blocks.length - 1 ? 1 : 0); // +1 for newline between blocks
  }, 0);
}

/** Get the flat character offset of the start of a block */
export function blockStartOffset(doc: RichDocument, blockIndex: number): number {
  let offset = 0;
  for (let i = 0; i < blockIndex; i++) {
    offset += doc.blocks[i].runs.reduce((s, r) => s + r.text.length, 0) + 1; // +1 newline
  }
  return offset;
}

/** Get the flat character length of a block (excluding newline) */
export function blockLength(block: Block): number {
  return block.runs.reduce((s, r) => s + r.text.length, 0);
}

/** Find which block index a flat offset falls in, and the offset within that block */
export function offsetToBlockPosition(
  doc: RichDocument,
  flatOffset: number
): { blockIndex: number; offsetInBlock: number } {
  let remaining = flatOffset;
  for (let i = 0; i < doc.blocks.length; i++) {
    const len = blockLength(doc.blocks[i]);
    if (remaining <= len || i === doc.blocks.length - 1) {
      return { blockIndex: i, offsetInBlock: Math.min(remaining, len) };
    }
    remaining -= len + 1; // +1 for newline
  }
  return { blockIndex: doc.blocks.length - 1, offsetInBlock: 0 };
}

/** Normalize runs: merge adjacent runs with identical marks, remove empty runs (except if only run) */
export function normalizeRuns(runs: Run[]): Run[] {
  if (runs.length === 0) return [{ text: '', marks: { ...EMPTY_MARKS } }];
  const result: Run[] = [];
  for (const run of runs) {
    const last = result[result.length - 1];
    if (
      last &&
      last.marks.bold === run.marks.bold &&
      last.marks.italic === run.marks.italic &&
      last.marks.underline === run.marks.underline &&
      last.marks.strike === run.marks.strike
    ) {
      last.text += run.text;
    } else {
      result.push({ text: run.text, marks: { ...run.marks } });
    }
  }
  // Remove empty runs unless it's the only one
  const filtered = result.filter((r) => r.text.length > 0);
  return filtered.length > 0 ? filtered : [{ text: '', marks: { ...EMPTY_MARKS } }];
}

// ─── Editing operations ───────────────────────────────────────────────────────

/** Insert a character (or string) at a flat offset with given pending marks */
export function insertText(
  doc: RichDocument,
  flatOffset: number,
  text: string,
  pendingMarks: Marks
): RichDocument {
  const { blockIndex, offsetInBlock } = offsetToBlockPosition(doc, flatOffset);
  const block = doc.blocks[blockIndex];
  const newRuns = insertIntoRuns(block.runs, offsetInBlock, text, pendingMarks);
  const newBlocks = doc.blocks.map((b, i) =>
    i === blockIndex ? { ...b, runs: normalizeRuns(newRuns) } : b
  );
  return { blocks: newBlocks };
}

/** Insert text into a run array at a given offset within the block */
function insertIntoRuns(runs: Run[], offsetInBlock: number, text: string, marks: Marks): Run[] {
  const result: Run[] = [];
  let remaining = offsetInBlock;

  for (const run of runs) {
    if (remaining > run.text.length) {
      result.push({ ...run });
      remaining -= run.text.length;
    } else {
      // Split this run
      const before = run.text.slice(0, remaining);
      const after = run.text.slice(remaining);
      if (before) result.push({ text: before, marks: { ...run.marks } });
      result.push({ text, marks: { ...marks } });
      if (after) result.push({ text: after, marks: { ...run.marks } });
      remaining = 0;
      // Push remaining runs unchanged
      const idx = runs.indexOf(run);
      for (let j = idx + 1; j < runs.length; j++) result.push({ ...runs[j] });
      return result;
    }
  }
  // Offset was at end
  result.push({ text, marks: { ...marks } });
  return result;
}

/** Delete a range [start, end) in flat offsets. Returns new doc and new caret position. */
export function deleteRange(
  doc: RichDocument,
  start: number,
  end: number
): { doc: RichDocument; caretOffset: number } {
  if (start === end) return { doc, caretOffset: start };
  if (start > end) [start, end] = [end, start];

  const startPos = offsetToBlockPosition(doc, start);
  const endPos = offsetToBlockPosition(doc, end);

  const newBlocks = [...doc.blocks];

  if (startPos.blockIndex === endPos.blockIndex) {
    // Deletion within a single block
    const block = newBlocks[startPos.blockIndex];
    const newRuns = deleteFromRuns(block.runs, startPos.offsetInBlock, endPos.offsetInBlock);
    newBlocks[startPos.blockIndex] = { ...block, runs: normalizeRuns(newRuns) };
  } else {
    // Deletion spans multiple blocks
    const startBlock = newBlocks[startPos.blockIndex];
    const endBlock = newBlocks[endPos.blockIndex];

    // Keep prefix of start block
    const prefixRuns = deleteFromRuns(startBlock.runs, startPos.offsetInBlock, blockLength(startBlock));
    // Keep suffix of end block
    const suffixRuns = deleteFromRuns(endBlock.runs, 0, endPos.offsetInBlock);

    // Merge start block prefix + end block suffix into one block
    const mergedRuns = normalizeRuns([...prefixRuns, ...suffixRuns]);
    const mergedBlock: Block = { ...startBlock, runs: mergedRuns };

    // Remove blocks from startIndex to endIndex (inclusive), replace with merged
    newBlocks.splice(startPos.blockIndex, endPos.blockIndex - startPos.blockIndex + 1, mergedBlock);
  }

  if (newBlocks.length === 0) {
    newBlocks.push({ id: genId(), type: 'body', runs: [{ text: '', marks: { ...EMPTY_MARKS } }] });
  }

  return { doc: { blocks: newBlocks }, caretOffset: start };
}

/** Delete characters within a single run array from offsetStart to offsetEnd */
function deleteFromRuns(runs: Run[], offsetStart: number, offsetEnd: number): Run[] {
  const result: Run[] = [];
  let pos = 0;
  for (const run of runs) {
    const runEnd = pos + run.text.length;
    if (runEnd <= offsetStart || pos >= offsetEnd) {
      // Entirely outside deletion range
      result.push({ ...run });
    } else {
      // Partially or fully inside deletion range
      const keepBefore = run.text.slice(0, Math.max(0, offsetStart - pos));
      const keepAfter = run.text.slice(Math.max(0, offsetEnd - pos));
      if (keepBefore) result.push({ text: keepBefore, marks: { ...run.marks } });
      if (keepAfter) result.push({ text: keepAfter, marks: { ...run.marks } });
    }
    pos = runEnd;
  }
  return result.length > 0 ? result : [{ text: '', marks: { ...EMPTY_MARKS } }];
}

/** Split a block at a flat offset (newline insertion). Returns new doc and new caret. */
export function splitBlock(
  doc: RichDocument,
  flatOffset: number
): { doc: RichDocument; caretOffset: number } {
  const { blockIndex, offsetInBlock } = offsetToBlockPosition(doc, flatOffset);
  const block = doc.blocks[blockIndex];

  // Split runs at offsetInBlock
  const beforeRuns: Run[] = [];
  const afterRuns: Run[] = [];
  let remaining = offsetInBlock;

  for (const run of block.runs) {
    if (remaining >= run.text.length) {
      beforeRuns.push({ ...run });
      remaining -= run.text.length;
    } else {
      const before = run.text.slice(0, remaining);
      const after = run.text.slice(remaining);
      if (before) beforeRuns.push({ text: before, marks: { ...run.marks } });
      afterRuns.push({ text: after, marks: { ...run.marks } });
      remaining = 0;
      // Rest of runs go to afterRuns
      const idx = block.runs.indexOf(run);
      for (let j = idx + 1; j < block.runs.length; j++) afterRuns.push({ ...block.runs[j] });
      break;
    }
  }

  const newBlockBefore: Block = {
    ...block,
    runs: normalizeRuns(beforeRuns.length > 0 ? beforeRuns : [{ text: '', marks: { ...EMPTY_MARKS } }]),
  };
  // New block after inherits body type (standard behavior: heading doesn't continue)
  const newBlockAfter: Block = {
    id: genId(),
    type: block.type === 'body' ? 'body' : 'body',
    runs: normalizeRuns(afterRuns.length > 0 ? afterRuns : [{ text: '', marks: { ...EMPTY_MARKS } }]),
  };

  const newBlocks = [
    ...doc.blocks.slice(0, blockIndex),
    newBlockBefore,
    newBlockAfter,
    ...doc.blocks.slice(blockIndex + 1),
  ];

  // New caret is at start of new block (flatOffset + 1 for the newline)
  return { doc: { blocks: newBlocks }, caretOffset: flatOffset + 1 };
}

/** Apply inline marks to a range [start, end) in flat offsets */
export function applyMarks(
  doc: RichDocument,
  start: number,
  end: number,
  markKey: keyof Marks,
  value: boolean
): RichDocument {
  if (start === end) return doc;
  if (start > end) [start, end] = [end, start];

  const newBlocks = doc.blocks.map((block, blockIndex) => {
    const bStart = blockStartOffset(doc, blockIndex);
    const bEnd = bStart + blockLength(block);

    // Does this block overlap with [start, end)?
    if (bEnd <= start || bStart >= end) return block;

    const localStart = Math.max(0, start - bStart);
    const localEnd = Math.min(blockLength(block), end - bStart);

    const newRuns = applyMarksToRuns(block.runs, localStart, localEnd, markKey, value);
    return { ...block, runs: normalizeRuns(newRuns) };
  });

  return { blocks: newBlocks };
}

function applyMarksToRuns(
  runs: Run[],
  localStart: number,
  localEnd: number,
  markKey: keyof Marks,
  value: boolean
): Run[] {
  const result: Run[] = [];
  let pos = 0;

  for (const run of runs) {
    const runEnd = pos + run.text.length;

    if (runEnd <= localStart || pos >= localEnd) {
      result.push({ ...run });
    } else {
      const overlapStart = Math.max(pos, localStart);
      const overlapEnd = Math.min(runEnd, localEnd);

      if (pos < overlapStart) {
        result.push({ text: run.text.slice(0, overlapStart - pos), marks: { ...run.marks } });
      }
      result.push({
        text: run.text.slice(overlapStart - pos, overlapEnd - pos),
        marks: { ...run.marks, [markKey]: value },
      });
      if (overlapEnd < runEnd) {
        result.push({ text: run.text.slice(overlapEnd - pos), marks: { ...run.marks } });
      }
    }
    pos = runEnd;
  }
  return result;
}

/** Toggle an inline mark on a range. If ALL chars in range have the mark, remove it; otherwise add it. */
export function toggleMark(
  doc: RichDocument,
  start: number,
  end: number,
  markKey: keyof Marks
): RichDocument {
  if (start === end) return doc; // no selection — handled via pendingMarks
  if (start > end) [start, end] = [end, start];

  // Check if all characters in range already have this mark
  const allHaveMark = rangeHasMark(doc, start, end, markKey);
  return applyMarks(doc, start, end, markKey, !allHaveMark);
}

/** Check if all characters in [start, end) have a given mark */
export function rangeHasMark(
  doc: RichDocument,
  start: number,
  end: number,
  markKey: keyof Marks
): boolean {
  if (start >= end) return false;
  let pos = 0;
  for (let bi = 0; bi < doc.blocks.length; bi++) {
    const block = doc.blocks[bi];
    for (const run of block.runs) {
      const runEnd = pos + run.text.length;
      if (runEnd > start && pos < end) {
        if (!run.marks[markKey]) return false;
      }
      pos = runEnd;
    }
    if (bi < doc.blocks.length - 1) pos += 1; // newline
  }
  return true;
}

/** Get the marks at a specific flat offset (for pending typing marks derivation) */
export function marksAtOffset(doc: RichDocument, flatOffset: number): Marks {
  const { blockIndex, offsetInBlock } = offsetToBlockPosition(doc, flatOffset);
  const block = doc.blocks[blockIndex];
  let pos = 0;
  for (const run of block.runs) {
    const runEnd = pos + run.text.length;
    if (offsetInBlock <= runEnd) return { ...run.marks };
    pos = runEnd;
  }
  return { ...EMPTY_MARKS };
}

/** Change the block type for all blocks that overlap with [start, end) */
export function setBlockType(
  doc: RichDocument,
  start: number,
  end: number,
  type: BlockType
): RichDocument {
  const adjustedEnd = start === end ? start : end;
  const newBlocks = doc.blocks.map((block, blockIndex) => {
    const bStart = blockStartOffset(doc, blockIndex);
    const bEnd = bStart + blockLength(block);
    const overlaps = start === end
      ? (bStart <= start && start <= bEnd)
      : (bEnd > start && bStart < adjustedEnd);
    return overlaps ? { ...block, type } : block;
  });
  return { blocks: newBlocks };
}

/** Get the block type at a flat offset */
export function blockTypeAtOffset(doc: RichDocument, flatOffset: number): BlockType {
  const { blockIndex } = offsetToBlockPosition(doc, flatOffset);
  return doc.blocks[blockIndex]?.type ?? 'body';
}

/** Derive active marks for a selection range (for toolbar state) */
export function deriveActiveMarks(
  doc: RichDocument,
  start: number,
  end: number
): { bold: boolean | 'mixed'; italic: boolean | 'mixed'; underline: boolean | 'mixed'; strike: boolean | 'mixed' } {
  if (start === end) {
    const m = marksAtOffset(doc, start);
    return { bold: m.bold, italic: m.italic, underline: m.underline, strike: m.strike };
  }

  const keys: (keyof Marks)[] = ['bold', 'italic', 'underline', 'strike'];
  const result: Record<string, boolean | 'mixed'> = {};

  for (const key of keys) {
    let hasTrue = false;
    let hasFalse = false;
    let pos = 0;

    for (let bi = 0; bi < doc.blocks.length; bi++) {
      const block = doc.blocks[bi];
      for (const run of block.runs) {
        const runEnd = pos + run.text.length;
        if (runEnd > start && pos < end && run.text.length > 0) {
          if (run.marks[key]) hasTrue = true;
          else hasFalse = true;
        }
        pos = runEnd;
      }
      if (bi < doc.blocks.length - 1) pos += 1;
    }

    result[key] = hasTrue && hasFalse ? 'mixed' : hasTrue;
  }

  return result as { bold: boolean | 'mixed'; italic: boolean | 'mixed'; underline: boolean | 'mixed'; strike: boolean | 'mixed' };
}
