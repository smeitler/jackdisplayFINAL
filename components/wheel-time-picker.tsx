/**
 * WheelTimePicker
 *
 * Compact iOS-style drum-roll time picker: Hour | Minute | AM/PM
 *
 * - 3 visible rows: 1 above, selected (large/bold), 1 below
 * - Adjacent rows: smaller, faded, slanted inward
 * - Infinite-loop: values repeated REPEATS times; starts in middle repetition
 * - Centering: explicit padding View items (not contentContainerStyle) so
 *   the first real item always sits in the center row on iOS and Android
 * - AM/PM: 2 clean options, no looping needed (just 2 rows + padding)
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
const PICKER_HEIGHT = ITEM_HEIGHT * 3;   // 3 rows visible: above + center + below
const REPEATS       = 21;                // repeat count for looped columns (odd = symmetric)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function snapIndex(offset: number): number {
  return Math.round(offset / ITEM_HEIGHT);
}

// ─── WheelColumn (looped) ─────────────────────────────────────────────────────
// Used for Hours and Minutes — repeats values REPEATS times for infinite feel

interface LoopedColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
}

function LoopedColumn({ items, selectedIndex, onSelect, width }: LoopedColumnProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const isDragging = useRef(false);

  // Build looped array: items repeated REPEATS times
  const looped = useMemo(() => {
    const arr: string[] = [];
    for (let r = 0; r < REPEATS; r++) arr.push(...items);
    return arr;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.join('|')]);

  const midStart = useMemo(
    () => Math.floor(REPEATS / 2) * items.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.length],
  );

  // Current looped index (tracks live scroll position for styling)
  const [liveLoopedIdx, setLiveLoopedIdx] = useState(() => midStart + selectedIndex);

  // When external selectedIndex changes (e.g. prop update), re-center
  useEffect(() => {
    if (!isDragging.current) {
      const li = midStart + selectedIndex;
      setLiveLoopedIdx(li);
      scrollRef.current?.scrollTo({ y: li * ITEM_HEIGHT, animated: false });
    }
  }, [selectedIndex, midStart]);

  const handleScrollBegin = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = e.nativeEvent.contentOffset.y;
      const li = clamp(snapIndex(raw), 0, looped.length - 1);
      setLiveLoopedIdx(li);
    },
    [looped.length],
  );

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDragging.current = false;
      const raw = e.nativeEvent.contentOffset.y;
      const li = clamp(snapIndex(raw), 0, looped.length - 1);
      // Force snap to exact grid position
      scrollRef.current?.scrollTo({ y: li * ITEM_HEIGHT, animated: true });
      setLiveLoopedIdx(li);
      onSelect(li % items.length);
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
        contentOffset={{ x: 0, y: liveLoopedIdx * ITEM_HEIGHT }}
      >
        {/* Top spacer: 1 row so first item can sit in center */}
        <View style={styles.item} />

        {looped.map((label, i) => {
          const dist = i - liveLoopedIdx;
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

        {/* Bottom spacer: 1 row so last item can sit in center */}
        <View style={styles.item} />
      </ScrollView>
    </View>
  );
}

// ─── PeriodColumn (AM / PM only, no looping) ─────────────────────────────────

interface PeriodColumnProps {
  selectedIndex: number; // 0 = AM, 1 = PM
  onSelect: (index: number) => void;
  width: number;
}

function PeriodColumn({ selectedIndex, onSelect, width }: PeriodColumnProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!isDragging.current) {
      scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    }
  }, [selectedIndex]);

  const handleScrollBegin = useCallback(() => { isDragging.current = true; }, []);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDragging.current = false;
      const raw = e.nativeEvent.contentOffset.y;
      const idx = clamp(snapIndex(raw), 0, 1);
      scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
      onSelect(idx);
    },
    [onSelect],
  );

  const PERIODS = ['AM', 'PM'];

  return (
    <View style={{ width, height: PICKER_HEIGHT, overflow: 'hidden' }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScrollBeginDrag={handleScrollBegin}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
      >
        {/* Top spacer */}
        <View style={styles.item} />

        {PERIODS.map((label, i) => {
          const dist = i - selectedIndex;
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

        {/* Bottom spacer */}
        <View style={styles.item} />
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
      {/* Selection highlight band — sits at the center row */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            // Center row = row index 1 in a 3-row window (0-indexed)
            // The top spacer View is row 0, so center content starts at ITEM_HEIGHT
            top: ITEM_HEIGHT,
            width: totalW + 32,
            left: -16,
          },
        ]}
      />

      {/* Columns */}
      <View style={styles.columns}>
        <LoopedColumn items={HOURS_12} selectedIndex={hourIdx}   onSelect={onHourSelect}   width={hourW} />
        <LoopedColumn items={MINUTES}  selectedIndex={minuteIdx} onSelect={onMinuteSelect} width={minuteW} />
        <PeriodColumn                  selectedIndex={periodIdx} onSelect={onPeriodSelect} width={periodW} />
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
