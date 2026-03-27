/**
 * WheelTimePicker — FlatList-based infinite drum roll picker
 *
 * Uses FlatList with a large repeated item array so the user always has
 * plenty of items to scroll through in both directions (like Apple's native
 * time picker). FlatList handles its own gesture recognition natively, so
 * it works correctly even inside a parent ScrollView.
 *
 * Key design decisions:
 * - Items are repeated N_REPEAT times so there's always content above/below
 * - On mount we scroll to the center of the repeated list (so user can go up or down)
 * - On scroll end we snap to the nearest item using scrollToOffset
 * - The parent ScrollView is disabled while the picker column is being touched
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5;          // how many rows show in the window
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const N_REPEAT = 100;             // repeat items this many times for "infinite" feel

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

  // Build a large repeated array so there's plenty of content in both directions
  const repeated = React.useMemo(() => {
    const arr: { label: string; realIndex: number; key: string }[] = [];
    for (let rep = 0; rep < N_REPEAT; rep++) {
      for (let i = 0; i < count; i++) {
        arr.push({ label: items[i], realIndex: i, key: `${rep}-${i}` });
      }
    }
    return arr;
  }, [items, count]);

  // Start in the middle of the repeated list at the correct initial item
  const midRepeat = Math.floor(N_REPEAT / 2);
  const initialFlatIndex = midRepeat * count + initialIndex;
  const initialOffset = initialFlatIndex * ITEM_HEIGHT;

  const listRef = useRef<FlatList>(null);
  const currentRealIdx = useRef(initialIndex);
  const [selectedReal, setSelectedReal] = useState(initialIndex);

  // Snap to nearest item on scroll end
  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const flatIndex = Math.round(y / ITEM_HEIGHT);
      const snappedOffset = flatIndex * ITEM_HEIGHT;

      // Scroll to exact snap position
      listRef.current?.scrollToOffset({ offset: snappedOffset, animated: true });

      const realIdx = ((flatIndex % count) + count) % count;
      if (realIdx !== currentRealIdx.current) {
        currentRealIdx.current = realIdx;
        setSelectedReal(realIdx);
        onSelect(realIdx);
      }
    },
    [count, onSelect],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: { label: string; realIndex: number; key: string }; index: number }) => {
      const dist = item.realIndex - selectedReal;
      // Wrap distance for circular feel
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
        fontSize = 19;
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
        <View style={styles.item}>
          <Text
            style={[
              styles.itemText,
              {
                color,
                fontSize,
                fontWeight,
                opacity,
              },
            ]}
          >
            {item.label}
          </Text>
        </View>
      );
    },
    [selectedReal, count, colors],
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
      <FlatList
        ref={listRef}
        data={repeated}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({
          length: ITEM_HEIGHT,
          offset: ITEM_HEIGHT * index,
          index,
        })}
        initialScrollIndex={initialFlatIndex}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        // Prevent parent ScrollView from stealing touches
        nestedScrollEnabled={true}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
        // Remove the extra padding offset since we use paddingVertical
        initialNumToRender={VISIBLE_ITEMS + 4}
        maxToRenderPerBatch={VISIBLE_ITEMS + 4}
        windowSize={5}
      />
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

  const hourW   = 72;
  const minuteW = 72;
  const periodW = 68;
  const totalW  = hourW + minuteW + periodW;

  return (
    <View style={[styles.container, { width: totalW }]}>
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
