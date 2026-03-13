/**
 * WheelTimePicker
 *
 * Compact iOS-style drum-roll time picker: Hour | Minute | AM/PM
 *
 * Snap strategy:
 * - snapToInterval + decelerationRate="normal" handles ALL snapping natively.
 *   The OS decelerates the scroll and glides it to the nearest interval boundary
 *   on its own — smooth and natural, no abrupt programmatic jumps.
 * - We NEVER call scrollTo() after a drag. We only read the final position
 *   in onMomentumScrollEnd to emit the selected value.
 * - For slow drags (no momentum): onScrollEndDrag fires; we read the offset
 *   and emit the value. The native snapToInterval already handled the visual snap.
 *
 * Centering:
 * - One spacer View (height = ITEM_HEIGHT) at top and bottom so item[0] can
 *   sit in the center row. contentOffset = index * ITEM_HEIGHT places it there.
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
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
  loop?: boolean;
}

function WheelColumn({ items, selectedIndex, onSelect, width, loop = true }: ColumnProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const hasMomentumRef = useRef(false);

  const { displayItems, startOffset } = useMemo(() => {
    if (!loop) return { displayItems: items, startOffset: 0 };
    const arr: string[] = [];
    for (let r = 0; r < REPEATS; r++) arr.push(...items);
    return { displayItems: arr, startOffset: Math.floor(REPEATS / 2) * items.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.join('|'), loop]);

  const initialIdx = startOffset + selectedIndex;
  const [liveIdx, setLiveIdx] = useState(initialIdx);

  // Sync when external selectedIndex changes
  useEffect(() => {
    const li = startOffset + selectedIndex;
    setLiveIdx(li);
    scrollRef.current?.scrollTo({ y: li * ITEM_HEIGHT, animated: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  // Track live position for styling only — no snap logic here
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = e.nativeEvent.contentOffset.y;
      const li = clamp(nearestIndex(raw), 0, displayItems.length - 1);
      setLiveIdx(li);
    },
    [displayItems.length],
  );

  // After momentum fully settles — emit the value
  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      hasMomentumRef.current = false;
      const raw = e.nativeEvent.contentOffset.y;
      const li = clamp(nearestIndex(raw), 0, displayItems.length - 1);
      setLiveIdx(li);
      onSelect(li % items.length);
    },
    [displayItems.length, items.length, onSelect],
  );

  const handleMomentumBegin = useCallback(() => {
    hasMomentumRef.current = true;
  }, []);

  // Slow drag (no momentum): emit value directly from final drag position
  const handleDragEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Wait a tick — if momentum begins, handleMomentumEnd will handle it
      const raw = e.nativeEvent.contentOffset.y;
      setTimeout(() => {
        if (!hasMomentumRef.current) {
          const li = clamp(nearestIndex(raw), 0, displayItems.length - 1);
          setLiveIdx(li);
          onSelect(li % items.length);
        }
      }, 80);
    },
    [displayItems.length, items.length, onSelect],
  );

  return (
    <View style={{ width, height: PICKER_HEIGHT, overflow: 'hidden' }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="normal"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onScrollBeginDrag={() => { hasMomentumRef.current = false; }}
        onScrollEndDrag={handleDragEnd}
        onMomentumScrollBegin={handleMomentumBegin}
        onMomentumScrollEnd={handleMomentumEnd}
        contentOffset={{ x: 0, y: initialIdx * ITEM_HEIGHT }}
      >
        {/* Top spacer: 1 row so item[0] can sit in center */}
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

        {/* Bottom spacer */}
        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface WheelTimePickerProps {
  hour: number;   // 0-23
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
    setHourIdx(hour % 12 === 0 ? 11 : (hour % 12) - 1);
    setMinuteIdx(minute);
    setPeriodIdx(hour >= 12 ? 1 : 0);
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
      {/* Highlight band at center row */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            top: ITEM_HEIGHT,
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
    height: ITEM_HEIGHT,
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
