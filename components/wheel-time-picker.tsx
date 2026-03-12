/**
 * WheelTimePicker
 *
 * A native iOS-style drum-roll time picker with three columns:
 *   Hour (1–12)  |  Minute (00–59)  |  AM / PM
 *
 * The selected row is highlighted by a rounded-rectangle band that
 * spans all three columns, exactly like the iOS Clock app.
 *
 * Usage:
 *   <WheelTimePicker
 *     hour={7}          // 0-23 (24-hour)
 *     minute={30}
 *     onChange={(h, m) => { setHour(h); setMinute(m); }}
 *   />
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

const ITEM_HEIGHT = 52;   // height of each row
const VISIBLE_ITEMS = 5;  // rows visible at once (must be odd)
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const CENTER_OFFSET = Math.floor(VISIBLE_ITEMS / 2); // 2

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
  const pendingIndex = useRef(selectedIndex);

  // Scroll to the selected index whenever it changes externally
  useEffect(() => {
    if (!isDragging.current) {
      scrollRef.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    }
  }, [selectedIndex]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDragging.current = false;
      const raw = e.nativeEvent.contentOffset.y;
      const idx = clamp(snapIndex(raw), 0, items.length - 1);
      pendingIndex.current = idx;
      // Snap scroll position
      scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
      onSelect(idx);
    },
    [items.length, onSelect],
  );

  const handleScrollBegin = useCallback(() => {
    isDragging.current = true;
  }, []);

  // Padding items so the first/last real item can sit in the center
  const paddingItems = Array(CENTER_OFFSET).fill('');

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
        contentContainerStyle={{ paddingVertical: 0 }}
        // Initial offset
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
      >
        {/* Top padding */}
        {paddingItems.map((_, i) => (
          <View key={`top-${i}`} style={styles.item} />
        ))}

        {items.map((label, i) => {
          const isSelected = i === selectedIndex;
          return (
            <View key={i} style={styles.item}>
              <Text
                style={[
                  styles.itemText,
                  { color: isSelected ? colors.foreground : colors.muted },
                  isSelected && styles.itemTextSelected,
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}

        {/* Bottom padding */}
        {paddingItems.map((_, i) => (
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

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));   // '1' … '12'
const MINUTES  = Array.from({ length: 60 }, (_, i) =>
  i.toString().padStart(2, '0'),
);                                                                         // '00' … '59'
const PERIODS  = ['AM', 'PM'];

export function WheelTimePicker({ hour, minute, onChange }: WheelTimePickerProps) {
  const colors = useColors();

  // Decompose 24-hour into 12-hour + period
  const isPM = hour >= 12;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12; // 1-12

  const [hourIdx, setHourIdx]     = useState(hour12 - 1);   // 0-based index into HOURS_12
  const [minuteIdx, setMinuteIdx] = useState(minute);        // 0-based index into MINUTES
  const [periodIdx, setPeriodIdx] = useState(isPM ? 1 : 0);  // 0=AM, 1=PM

  // Keep local state in sync when props change externally
  useEffect(() => {
    const newIsPM = hour >= 12;
    const newHour12 = hour % 12 === 0 ? 12 : hour % 12;
    setHourIdx(newHour12 - 1);
    setMinuteIdx(minute);
    setPeriodIdx(newIsPM ? 1 : 0);
  }, [hour, minute]);

  const emit = useCallback(
    (hIdx: number, mIdx: number, pIdx: number) => {
      const h12 = hIdx + 1;  // 1-12
      let h24 = h12 % 12;    // 0 for 12, 1-11 for others
      if (pIdx === 1) h24 += 12; // PM
      onChange(h24, mIdx);
    },
    [onChange],
  );

  const onHourSelect = useCallback(
    (idx: number) => {
      setHourIdx(idx);
      emit(idx, minuteIdx, periodIdx);
    },
    [minuteIdx, periodIdx, emit],
  );

  const onMinuteSelect = useCallback(
    (idx: number) => {
      setMinuteIdx(idx);
      emit(hourIdx, idx, periodIdx);
    },
    [hourIdx, periodIdx, emit],
  );

  const onPeriodSelect = useCallback(
    (idx: number) => {
      setPeriodIdx(idx);
      emit(hourIdx, minuteIdx, idx);
    },
    [hourIdx, minuteIdx, emit],
  );

  // Column widths
  const hourW   = 72;
  const minuteW = 72;
  const periodW = 72;
  const totalW  = hourW + minuteW + periodW;

  return (
    <View style={[styles.container, { width: totalW }]}>
      {/* Selection highlight band — sits behind the columns */}
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

      {/* Fade masks — top and bottom */}
      <View
        pointerEvents="none"
        style={[
          styles.fadeMask,
          styles.fadeMaskTop,
          { backgroundColor: colors.background },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.fadeMask,
          styles.fadeMaskBottom,
          { backgroundColor: colors.background },
        ]}
      />

      {/* Columns */}
      <View style={styles.columns}>
        <WheelColumn
          items={HOURS_12}
          selectedIndex={hourIdx}
          onSelect={onHourSelect}
          width={hourW}
        />
        <WheelColumn
          items={MINUTES}
          selectedIndex={minuteIdx}
          onSelect={onMinuteSelect}
          width={minuteW}
        />
        <WheelColumn
          items={PERIODS}
          selectedIndex={periodIdx}
          onSelect={onPeriodSelect}
          width={periodW}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FADE_HEIGHT = ITEM_HEIGHT * CENTER_OFFSET;

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
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 0.2,
    ...(Platform.OS === 'ios' ? { fontFamily: 'System' } : {}),
  },
  itemTextSelected: {
    fontSize: 26,
    fontWeight: '600',
  },
  selectionBand: {
    position: 'absolute',
    height: ITEM_HEIGHT,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 0,
  },
  fadeMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 2,
    pointerEvents: 'none',
  },
  fadeMaskTop: {
    top: 0,
    height: FADE_HEIGHT,
    opacity: 0.75,
  },
  fadeMaskBottom: {
    bottom: 0,
    height: FADE_HEIGHT,
    opacity: 0.75,
  },
});
