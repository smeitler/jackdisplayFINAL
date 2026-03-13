/**
 * WheelTimePicker
 *
 * Compact iOS-style drum-roll time picker: Hour | Minute | AM/PM
 *
 * Features:
 * - 3 visible rows (1 above, selected, 1 below) — compact height
 * - Adjacent rows are smaller, faded, and slanted inward
 * - Infinite-loop illusion: each column repeats its values REPEATS times
 *   so the user can scroll freely in either direction without hitting an end
 * - Correct snap alignment: always lands centered on a value
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_HEIGHT   = 48;
const VISIBLE_ITEMS = 3;   // 1 above + selected + 1 below
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;  // 144px
const REPEATS       = 21;  // repeat the list this many times (odd so middle = center)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function snapIndex(offset: number): number {
  return Math.round(offset / ITEM_HEIGHT);
}

/**
 * Build an expanded list by repeating `items` REPEATS times.
 * Returns the list and the starting index for the "middle" repetition.
 */
function buildLoopedItems(items: string[]): { looped: string[]; midOffset: number } {
  const looped: string[] = [];
  for (let r = 0; r < REPEATS; r++) {
    for (const item of items) looped.push(item);
  }
  // Middle repetition starts at index: Math.floor(REPEATS / 2) * items.length
  const midOffset = Math.floor(REPEATS / 2) * items.length;
  return { looped, midOffset };
}

// ─── Single column ────────────────────────────────────────────────────────────

interface ColumnProps {
  items: string[];       // original (non-looped) items
  selectedIndex: number; // index within original items
  onSelect: (index: number) => void;
  width: number;
}

function WheelColumn({ items, selectedIndex, onSelect, width }: ColumnProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const isDragging = useRef(false);
  const lastEmittedRef = useRef(selectedIndex);

  // Build looped list once per items array reference
  const { looped, midOffset } = React.useMemo(
    () => buildLoopedItems(items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.join(',')],
  );

  // The absolute index in the looped list that corresponds to the selected value
  // We always start in the middle repetition
  const toLoopedIndex = useCallback(
    (valIdx: number) => midOffset + valIdx,
    [midOffset],
  );

  const [loopedIndex, setLoopedIndex] = useState(() => toLoopedIndex(selectedIndex));

  // Sync when external selectedIndex changes
  useEffect(() => {
    if (!isDragging.current) {
      const li = toLoopedIndex(selectedIndex);
      setLoopedIndex(li);
      scrollRef.current?.scrollTo({ y: li * ITEM_HEIGHT, animated: false });
    }
  }, [selectedIndex, toLoopedIndex]);

  const handleScrollBegin = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = e.nativeEvent.contentOffset.y;
      const li = clamp(snapIndex(raw), 0, looped.length - 1);
      setLoopedIndex(li);
    },
    [looped.length],
  );

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDragging.current = false;
      const raw = e.nativeEvent.contentOffset.y;
      const li = clamp(snapIndex(raw), 0, looped.length - 1);
      // Snap to exact position
      scrollRef.current?.scrollTo({ y: li * ITEM_HEIGHT, animated: true });
      setLoopedIndex(li);
      // Map back to original index
      const valIdx = li % items.length;
      if (valIdx !== lastEmittedRef.current) {
        lastEmittedRef.current = valIdx;
        onSelect(valIdx);
      }
    },
    [looped.length, items.length, onSelect],
  );

  return (
    <View style={{ width, height: PICKER_HEIGHT, overflow: 'hidden' }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScrollBeginDrag={handleScrollBegin}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        // Start scrolled so the selected value sits in the center row
        // Center row = row index 1 (0-based), so offset = loopedIndex * ITEM_HEIGHT
        // No extra padding needed — the center row IS the middle of the 3-row window
        contentOffset={{ x: 0, y: loopedIndex * ITEM_HEIGHT }}
        // Remove default contentContainerStyle padding
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT }}
      >
        {looped.map((label, i) => {
          const dist = i - loopedIndex;
          const isSelected = dist === 0;
          const isAdjacent = Math.abs(dist) === 1;

          const textStyle = isSelected
            ? [styles.itemText, styles.itemTextSelected, { color: colors.foreground }]
            : isAdjacent
            ? [
                styles.itemText,
                styles.itemTextAdjacent,
                {
                  color: colors.muted,
                  transform: [
                    { perspective: 300 },
                    { rotateX: dist < 0 ? '-28deg' : '28deg' },
                    { scaleY: 0.82 as number },
                  ],
                },
              ]
            : [styles.itemText, { color: 'transparent' as const }];

          return (
            <View key={i} style={styles.item}>
              <Text style={textStyle}>{label}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WheelTimePickerProps {
  /** 0-23 (24-hour) */
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES  = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
const PERIODS  = ['AM', 'PM'];

export function WheelTimePicker({ hour, minute, onChange }: WheelTimePickerProps) {
  const colors = useColors();

  const isPM   = hour >= 12;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  const [hourIdx,   setHourIdx]   = useState(hour12 - 1);
  const [minuteIdx, setMinuteIdx] = useState(minute);
  const [periodIdx, setPeriodIdx] = useState(isPM ? 1 : 0);

  useEffect(() => {
    const newIsPM   = hour >= 12;
    const newHour12 = hour % 12 === 0 ? 12 : hour % 12;
    setHourIdx(newHour12 - 1);
    setMinuteIdx(minute);
    setPeriodIdx(newIsPM ? 1 : 0);
  }, [hour, minute]);

  const emit = useCallback(
    (hIdx: number, mIdx: number, pIdx: number) => {
      const h12 = hIdx + 1;
      let h24   = h12 % 12;
      if (pIdx === 1) h24 += 12;
      onChange(h24, mIdx);
    },
    [onChange],
  );

  const onHourSelect   = useCallback((idx: number) => { setHourIdx(idx);   emit(idx, minuteIdx, periodIdx); }, [minuteIdx, periodIdx, emit]);
  const onMinuteSelect = useCallback((idx: number) => { setMinuteIdx(idx); emit(hourIdx, idx, periodIdx); },  [hourIdx, periodIdx, emit]);
  const onPeriodSelect = useCallback((idx: number) => { setPeriodIdx(idx); emit(hourIdx, minuteIdx, idx); },  [hourIdx, minuteIdx, emit]);

  const hourW   = 68;
  const minuteW = 68;
  const periodW = 64;
  const totalW  = hourW + minuteW + periodW;

  return (
    <View style={[styles.container, { width: totalW }]}>
      {/* Selection highlight band */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            // Center row = row 1 (0-indexed) in a 3-row window
            // With paddingVertical: ITEM_HEIGHT on the ScrollView content,
            // the center row sits at y = ITEM_HEIGHT (one row down from top)
            top: ITEM_HEIGHT,
            width: totalW + 32,
            left: -16,
          },
        ]}
      />

      {/* Columns */}
      <View style={styles.columns}>
        <WheelColumn items={HOURS_12} selectedIndex={hourIdx}   onSelect={onHourSelect}   width={hourW} />
        <WheelColumn items={MINUTES}  selectedIndex={minuteIdx} onSelect={onMinuteSelect} width={minuteW} />
        <WheelColumn items={PERIODS}  selectedIndex={periodIdx} onSelect={onPeriodSelect} width={periodW} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    height: PICKER_HEIGHT,
    alignSelf: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  columns: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: 0.2,
    ...(Platform.OS === 'ios' ? { fontFamily: 'System' } : {}),
  },
  itemTextSelected: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0,
  },
  itemTextAdjacent: {
    fontSize: 17,
    fontWeight: '300',
    opacity: 0.45,
  },
  selectionBand: {
    position: 'absolute',
    height: ITEM_HEIGHT,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 0,
  },
});
