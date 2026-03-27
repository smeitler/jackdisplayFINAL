/**
 * WheelTimePicker — ScrollView-based infinite drum roll picker
 *
 * Uses a plain ScrollView (NOT FlatList) so it can be safely nested inside
 * a parent ScrollView without triggering the "VirtualizedLists should never
 * be nested" error that breaks scrolling.
 *
 * Key design decisions:
 * - Items are repeated N_REPEAT times so there's always content above/below
 * - On mount we scroll to the center of the repeated list
 * - snapToInterval + decelerationRate="fast" gives native-feel snapping
 * - nestedScrollEnabled={true} lets the inner scroll work inside a parent ScrollView
 * - paddingVertical = 2 * ITEM_HEIGHT so selected item sits in the center row
 */

import React, { useCallback, useRef, useState } from 'react';
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

const ITEM_HEIGHT = 52;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const N_REPEAT = 80; // repeat items this many times for "infinite" feel

// ─── WheelColumn ─────────────────────────────────────────────────────────────

interface ColumnProps {
  items: string[];
  initialIndex: number;
  onSelect: (index: number) => void;
  width: number;
}

export function WheelColumn({ items, initialIndex, onSelect, width }: ColumnProps) {
  const colors = useColors();
  const count = items.length;

  // Build a large repeated array
  const repeated = React.useMemo(() => {
    const arr: { label: string; realIndex: number }[] = [];
    for (let rep = 0; rep < N_REPEAT; rep++) {
      for (let i = 0; i < count; i++) {
        arr.push({ label: items[i], realIndex: i });
      }
    }
    return arr;
  }, [items, count]);

  // Start in the middle of the repeated list at the correct initial item
  const midRepeat = Math.floor(N_REPEAT / 2);
  const initialFlatIndex = midRepeat * count + initialIndex;
  // paddingVertical = 2 * ITEM_HEIGHT, so offset is just flatIndex * ITEM_HEIGHT
  const initialOffset = initialFlatIndex * ITEM_HEIGHT;

  const scrollRef = useRef<ScrollView>(null);
  const currentRealIdx = useRef(initialIndex);
  const [selectedReal, setSelectedReal] = useState(initialIndex);

  // Scroll to initial position after mount
  const onLayout = useCallback(() => {
    scrollRef.current?.scrollTo({ y: initialOffset, animated: false });
  }, [initialOffset]);

  // Snap to nearest item on scroll end
  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const flatIndex = Math.round(y / ITEM_HEIGHT);
      const snappedOffset = flatIndex * ITEM_HEIGHT;

      // Scroll to exact snap position
      scrollRef.current?.scrollTo({ y: snappedOffset, animated: true });

      const realIdx = ((flatIndex % count) + count) % count;
      if (realIdx !== currentRealIdx.current) {
        currentRealIdx.current = realIdx;
        setSelectedReal(realIdx);
        onSelect(realIdx);
      }
    },
    [count, onSelect],
  );

  return (
    <View style={{ width, height: PICKER_HEIGHT, overflow: 'hidden' }}>
      {/* Selection highlight band */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            top: ITEM_HEIGHT * 2,
            width,
          },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        onLayout={onLayout}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        nestedScrollEnabled={true}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
        style={{ flex: 1 }}
      >
        {repeated.map((item, index) => {
          const dist = item.realIndex - selectedReal;
          const wrappedDist = ((dist + count / 2 + count) % count) - count / 2;
          const isSelected = wrappedDist === 0;
          const isAdjacent = Math.abs(wrappedDist) === 1;
          const isOuter = Math.abs(wrappedDist) === 2;

          let color: string;
          let fontSize: number;
          let fontWeight: '700' | '400' | '300';
          let opacity: number;

          if (isSelected) {
            color = colors.foreground;
            fontSize = 26;
            fontWeight = '700';
            opacity = 1;
          } else if (isAdjacent) {
            color = colors.muted;
            fontSize = 20;
            fontWeight = '400';
            opacity = 0.55;
          } else if (isOuter) {
            color = colors.muted;
            fontSize = 16;
            fontWeight = '300';
            opacity = 0.25;
          } else {
            color = 'transparent';
            fontSize = 14;
            fontWeight = '300';
            opacity = 0;
          }

          return (
            <View key={`${index}`} style={styles.item}>
              <Text
                style={[
                  styles.itemText,
                  { color, fontSize, fontWeight, opacity },
                ]}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
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

  const initialHourIdx   = hour12 - 1;
  const initialMinuteIdx = minute;
  const initialPeriodIdx = isPM ? 1 : 0;

  const hourIdxRef   = useRef(initialHourIdx);
  const minuteIdxRef = useRef(initialMinuteIdx);
  const periodIdxRef = useRef(initialPeriodIdx);

  const emit = useCallback(
    (hIdx: number, mIdx: number, pIdx: number) => {
      const h12 = hIdx + 1;
      let h24   = h12 % 12;
      if (pIdx === 1) h24 += 12;
      onChange(h24, mIdx);
    },
    [onChange],
  );

  const onHourSelect = useCallback((idx: number) => {
    hourIdxRef.current = idx;
    emit(idx, minuteIdxRef.current, periodIdxRef.current);
  }, [emit]);

  const onMinuteSelect = useCallback((idx: number) => {
    minuteIdxRef.current = idx;
    emit(hourIdxRef.current, idx, periodIdxRef.current);
  }, [emit]);

  const onPeriodSelect = useCallback((idx: number) => {
    periodIdxRef.current = idx;
    emit(hourIdxRef.current, minuteIdxRef.current, idx);
  }, [emit]);

  const hourW   = 76;
  const minuteW = 76;
  const periodW = 72;

  return (
    <View style={[styles.container, { width: hourW + minuteW + periodW }]}>
      <View style={styles.columns}>
        <WheelColumn items={HOURS_12} initialIndex={initialHourIdx}   onSelect={onHourSelect}   width={hourW} />
        <WheelColumn items={MINUTES}  initialIndex={initialMinuteIdx} onSelect={onMinuteSelect} width={minuteW} />
        <WheelColumn items={PERIODS}  initialIndex={initialPeriodIdx} onSelect={onPeriodSelect} width={periodW} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    height: PICKER_HEIGHT,
    alignSelf: 'center',
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
    letterSpacing: 0.2,
    ...(Platform.OS === 'ios' ? { fontFamily: 'System' } : {}),
  },
  selectionBand: {
    position: 'absolute',
    height: ITEM_HEIGHT,
    borderRadius: 10,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    zIndex: 0,
    left: 0,
    right: 0,
  },
});
