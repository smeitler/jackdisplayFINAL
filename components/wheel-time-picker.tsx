/**
 * WheelTimePicker
 *
 * A compact iOS-style drum-roll time picker with three columns:
 *   Hour (1–12)  |  Minute (00–59)  |  AM / PM
 *
 * Design: 3 visible rows (1 above, selected, 1 below).
 * Adjacent rows are smaller, italic, and faded — giving a perspective/slant feel.
 * The selection band spans all three columns.
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

const ITEM_HEIGHT   = 48;   // height of each row
const VISIBLE_ITEMS = 3;    // 1 above + selected + 1 below
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;  // 144px total
const CENTER_OFFSET = 1;    // one padding item top/bottom

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function snapIndex(offset: number): number {
  return Math.round(offset / ITEM_HEIGHT);
}

// ─── Single column ────────────────────────────────────────────────────────────

interface ColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
}

function WheelColumn({ items, selectedIndex, onSelect, width }: ColumnProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const isDragging = useRef(false);
  // Track live scroll offset so we can style items during drag, not just after snap
  const [liveIndex, setLiveIndex] = useState(selectedIndex);

  // Scroll to selected index whenever it changes externally
  useEffect(() => {
    if (!isDragging.current) {
      setLiveIndex(selectedIndex);
      scrollRef.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    }
  }, [selectedIndex]);

  const handleScrollBegin = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const raw = e.nativeEvent.contentOffset.y;
      const idx = clamp(snapIndex(raw), 0, items.length - 1);
      setLiveIndex(idx);
    },
    [items.length],
  );

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDragging.current = false;
      const raw = e.nativeEvent.contentOffset.y;
      const idx = clamp(snapIndex(raw), 0, items.length - 1);
      setLiveIndex(idx);
      scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
      onSelect(idx);
    },
    [items.length, onSelect],
  );

  // One padding item top/bottom so first/last real item can center
  const padding = Array(CENTER_OFFSET).fill('');

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
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
      >
        {/* Top padding */}
        {padding.map((_, i) => (
          <View key={`top-${i}`} style={styles.item} />
        ))}

        {items.map((label, i) => {
          const dist = i - liveIndex; // distance from currently-centered item
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
                    { scaleY: 0.82 },
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

        {/* Bottom padding */}
        {padding.map((_, i) => (
          <View key={`bot-${i}`} style={styles.item} />
        ))}
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

  const isPM    = hour >= 12;
  const hour12  = hour % 12 === 0 ? 12 : hour % 12;

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

  const onHourSelect = useCallback(
    (idx: number) => { setHourIdx(idx);   emit(idx, minuteIdx, periodIdx); },
    [minuteIdx, periodIdx, emit],
  );
  const onMinuteSelect = useCallback(
    (idx: number) => { setMinuteIdx(idx); emit(hourIdx, idx, periodIdx); },
    [hourIdx, periodIdx, emit],
  );
  const onPeriodSelect = useCallback(
    (idx: number) => { setPeriodIdx(idx); emit(hourIdx, minuteIdx, idx); },
    [hourIdx, minuteIdx, emit],
  );

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
            top: CENTER_OFFSET * ITEM_HEIGHT,
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
