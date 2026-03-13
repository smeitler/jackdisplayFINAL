/**
 * WheelTimePicker
 *
 * Compact iOS-style drum-roll time picker: Hour | Minute | AM/PM
 *
 * Centering strategy:
 * - Top + bottom spacer Views (1 row each) so item 0 can sit in center
 * - contentOffset = selectedLoopedIndex * ITEM_HEIGHT  → item lands in center row
 * - snapToInterval handles snapping during fast flicks
 * - onMomentumScrollEnd fires the final snap + value emit
 * - Slow-drag fallback: if no momentum event fires within 120ms of drag end,
 *   we manually snap to the nearest grid position
 *
 * All three columns (hour, minute, AM/PM) use the SAME component and
 * SAME spacer logic so they always align on the same row.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const PICKER_HEIGHT = ITEM_HEIGHT * 3;   // 3 visible rows
const REPEATS       = 21;                // odd → symmetric; ~10 loops each direction

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function nearestIndex(offset: number): number {
  return Math.round(offset / ITEM_HEIGHT);
}

// ─── WheelColumn ─────────────────────────────────────────────────────────────

interface ColumnProps {
  items: string[];
  selectedIndex: number;   // index within original items
  onSelect: (index: number) => void;
  width: number;
  loop?: boolean;          // true = repeat REPEATS times; false = no repeat (AM/PM)
}

function WheelColumn({ items, selectedIndex, onSelect, width, loop = true }: ColumnProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);

  // Build display list
  const { displayItems, startOffset } = useMemo(() => {
    if (!loop) {
      return { displayItems: items, startOffset: 0 };
    }
    const arr: string[] = [];
    for (let r = 0; r < REPEATS; r++) arr.push(...items);
    return {
      displayItems: arr,
      startOffset: Math.floor(REPEATS / 2) * items.length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.join('|'), loop]);

  // The looped index that corresponds to the selected value
  const initialLoopedIdx = startOffset + selectedIndex;

  // Live looped index — updated on every scroll tick for styling
  const [liveIdx, setLiveIdx] = useState(initialLoopedIdx);

  // Refs to manage snap timing
  const isDragging        = useRef(false);
  const snapTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRawOffsetRef  = useRef(initialLoopedIdx * ITEM_HEIGHT);

  // Sync when external selectedIndex changes (e.g. initial load)
  useEffect(() => {
    if (!isDragging.current) {
      const li = startOffset + selectedIndex;
      setLiveIdx(li);
      scrollRef.current?.scrollTo({ y: li * ITEM_HEIGHT, animated: false });
      lastRawOffsetRef.current = li * ITEM_HEIGHT;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  function doSnap(rawOffset: number) {
    const li = clamp(nearestIndex(rawOffset), 0, displayItems.length - 1);
    const snappedY = li * ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y: snappedY, animated: true });
    setLiveIdx(li);
    onSelect(li % items.length);
  }

  const handleScrollBegin = useCallback(() => {
    isDragging.current = true;
    if (snapTimerRef.current) {
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = e.nativeEvent.contentOffset.y;
      lastRawOffsetRef.current = raw;
      const li = clamp(nearestIndex(raw), 0, displayItems.length - 1);
      setLiveIdx(li);
    },
    [displayItems.length],
  );

  // Called when a fast flick finishes decelerating
  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDragging.current = false;
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
      doSnap(e.nativeEvent.contentOffset.y);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayItems.length, items.length, onSelect],
  );

  // Called when the user lifts their finger (may or may not be followed by momentum)
  const handleDragEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = e.nativeEvent.contentOffset.y;
      lastRawOffsetRef.current = raw;
      // Give momentum 150ms to start; if it doesn't, snap manually
      snapTimerRef.current = setTimeout(() => {
        isDragging.current = false;
        doSnap(lastRawOffsetRef.current);
      }, 150);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayItems.length, items.length, onSelect],
  );

  useEffect(() => () => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
  }, []);

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
        onScrollEndDrag={handleDragEnd}
        onMomentumScrollEnd={handleMomentumEnd}
        contentOffset={{ x: 0, y: initialLoopedIdx * ITEM_HEIGHT }}
      >
        {/* Top spacer: pushes item 0 into the center row */}
        <View style={styles.spacer} />

        {displayItems.map((label, i) => {
          const dist = i - liveIdx;
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
                    { rotateX: (dist < 0 ? '-28deg' : '28deg') as string },
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

        {/* Bottom spacer: lets last item reach the center row */}
        <View style={styles.spacer} />
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
      {/* Selection highlight band — always at the center row (row 1 of 3) */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            top: ITEM_HEIGHT,   // 1 row down = center of 3-row window
            width: totalW + 32,
            left: -16,
          },
        ]}
      />

      <View style={styles.columns}>
        <WheelColumn items={HOURS_12} selectedIndex={hourIdx}   onSelect={onHourSelect}   width={hourW}   loop />
        <WheelColumn items={MINUTES}  selectedIndex={minuteIdx} onSelect={onMinuteSelect} width={minuteW} loop />
        <WheelColumn items={PERIODS}  selectedIndex={periodIdx} onSelect={onPeriodSelect} width={periodW} loop={false} />
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
  spacer: {
    height: ITEM_HEIGHT,  // exactly one row — same as items
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
