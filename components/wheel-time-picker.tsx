/**
 * WheelTimePicker — PanResponder-based drum roll picker
 *
 * Uses PanResponder + Animated.Value instead of ScrollView.
 * This gives us 100% control over position and snapping on ALL platforms
 * (iOS, Android, web) without any browser scroll-snap interference.
 *
 * How it works:
 * - A single Animated.Value `offsetY` tracks the vertical translation of the item list.
 * - Dragging moves the list by the pan delta.
 * - On release, we spring-snap to the nearest item's grid position.
 * - The visible window is 3 rows tall; the center row is the selected item.
 * - Items outside ±1 of selected are rendered transparent (still in DOM for layout).
 */

import React, { useCallback, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/use-colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_HEIGHT   = 48;
const PICKER_HEIGHT = ITEM_HEIGHT * 3;   // 3 visible rows
const SNAP_TENSION  = 200;
const SNAP_FRICTION = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Convert offsetY (list translation) to selected index
// offsetY = 0  → item[0] is in center row
// offsetY = -ITEM_HEIGHT → item[1] is in center row
// So: index = round(-offsetY / ITEM_HEIGHT)
function offsetToIndex(offset: number, count: number) {
  return clamp(Math.round(-offset / ITEM_HEIGHT), 0, count - 1);
}

function indexToOffset(index: number) {
  return -index * ITEM_HEIGHT;
}

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

  // Animated offset: starts at position showing initialIndex in center
  const offsetY = useRef(new Animated.Value(indexToOffset(initialIndex))).current;
  // Track current index for styling (non-animated)
  const currentIdx = useRef(initialIndex);
  // Force re-render when index changes
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  // Snap to nearest item with spring animation
  const snapToNearest = useCallback((currentOffset: number) => {
    const idx = offsetToIndex(currentOffset, count);
    const targetOffset = indexToOffset(idx);
    currentIdx.current = idx;
    forceUpdate();
    Animated.spring(offsetY, {
      toValue: targetOffset,
      tension: SNAP_TENSION,
      friction: SNAP_FRICTION,
      useNativeDriver: true,
    }).start();
    onSelect(idx);
  }, [count, offsetY, onSelect]);

  // PanResponder
  const startOffset = useRef(indexToOffset(initialIndex));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 2,
      onPanResponderGrant: () => {
        // Capture current animated value
        (offsetY as any).stopAnimation((val: number) => {
          startOffset.current = val;
        });
        // Also read synchronously for immediate response
        startOffset.current = (offsetY as any)._value ?? startOffset.current;
      },
      onPanResponderMove: (_, gs) => {
        const newOffset = startOffset.current + gs.dy;
        // Clamp with rubber-band feel at edges
        const minOffset = indexToOffset(count - 1);
        const maxOffset = 0;
        let clamped = newOffset;
        if (newOffset > maxOffset) {
          clamped = maxOffset + (newOffset - maxOffset) * 0.3;
        } else if (newOffset < minOffset) {
          clamped = minOffset + (newOffset - minOffset) * 0.3;
        }
        offsetY.setValue(clamped);
        // Update live index for styling
        const idx = offsetToIndex(clamped, count);
        if (idx !== currentIdx.current) {
          currentIdx.current = idx;
          forceUpdate();
        }
      },
      onPanResponderRelease: (_, gs) => {
        const currentOffset = startOffset.current + gs.dy;
        // Add velocity-based momentum
        const velocityBoost = gs.vy * 80;
        const momentumOffset = currentOffset + velocityBoost;
        snapToNearest(momentumOffset);
      },
      onPanResponderTerminate: (_, gs) => {
        const currentOffset = startOffset.current + gs.dy;
        snapToNearest(currentOffset);
      },
    })
  ).current;

  const liveIdx = currentIdx.current;

  return (
    <View
      style={{ width, height: PICKER_HEIGHT, overflow: 'hidden' }}
      {...panResponder.panHandlers}
    >
      {/* The animated list — translateY moves it up/down */}
      <Animated.View
        style={{
          transform: [{ translateY: Animated.add(offsetY, new Animated.Value(ITEM_HEIGHT)) }],
        }}
      >
        {items.map((label, i) => {
          const dist = i - liveIdx;
          const isSelected = dist === 0;
          const isAdjacent = Math.abs(dist) === 1;

          let textColor: string;
          let fontSize: number;
          let fontWeight: '700' | '300' | '400';
          let opacity: number;
          let rotateX: string;
          let scaleY: number;

          if (isSelected) {
            textColor = colors.foreground;
            fontSize = 28;
            fontWeight = '700';
            opacity = 1;
            rotateX = '0deg';
            scaleY = 1;
          } else if (isAdjacent) {
            textColor = colors.muted;
            fontSize = 17;
            fontWeight = '300';
            opacity = 0.45;
            rotateX = dist < 0 ? '-28deg' : '28deg';
            scaleY = 0.82;
          } else {
            textColor = 'transparent';
            fontSize = 17;
            fontWeight = '300';
            opacity = 0;
            rotateX = '0deg';
            scaleY = 1;
          }

          return (
            <View key={i} style={styles.item}>
              <Text
                style={[
                  styles.itemText,
                  {
                    color: textColor,
                    fontSize,
                    fontWeight,
                    opacity,
                    transform: [
                      { perspective: 300 },
                      { rotateX: rotateX as string },
                      { scaleY },
                    ],
                  },
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </Animated.View>
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

  const hourW   = 68;
  const minuteW = 68;
  const periodW = 64;
  const totalW  = hourW + minuteW + periodW;

  return (
    <View style={[styles.container, { width: totalW }]}>
      {/* Selection band — top/bottom border lines mark the center row */}
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
  },
});
