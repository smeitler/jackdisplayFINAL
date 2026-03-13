/**
 * WheelTimePicker
 *
 * Compact iOS-style drum-roll: Hour | Minute | AM/PM
 * 3 visible rows: above (faded+slanted) | selected (large+bold) | below (faded+slanted)
 *
 * CRITICAL FIX:
 * Previous versions used a dummy <View> padding row at the top of the scroll list.
 * On web, CSS scroll-snap treated that dummy row as a valid snap target at y=0,
 * so after every scroll the browser snapped back to the padding row (showing item[0]).
 *
 * Fix: use contentContainerStyle paddingTop/paddingBottom instead of dummy Views.
 * This means item[0] is at y=0 in the content, but the viewport is offset by ITEM_HEIGHT
 * so item[0] appears in the center row. Snap math: item[i] centers at y = i * ITEM_HEIGHT.
 *
 * Platform strategy:
 * - iOS/Android: snapToInterval + decelerationRate="fast" + contentInset
 * - Web: CSS scroll-snap-type injected onto the underlying div
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
const PICKER_HEIGHT = ITEM_HEIGHT * 3;   // 3 visible rows

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ─── WheelColumn ─────────────────────────────────────────────────────────────

interface ColumnProps {
  items: string[];
  initialIndex: number;
  onSelect: (index: number) => void;
  width: number;
}

function WheelColumn({ items, initialIndex, onSelect, width }: ColumnProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const webScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasMounted = useRef(false);
  const [liveIdx, setLiveIdx] = useState(initialIndex);

  // MOUNT ONLY: scroll to initial position
  // item[i] is at y = i * ITEM_HEIGHT (no padding row offset needed)
  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: initialIndex * ITEM_HEIGHT,
        animated: false,
      });
    }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web: inject CSS scroll-snap and listen for scroll settle
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const setup = setTimeout(() => {
      const node: HTMLElement | null =
        (scrollRef.current as any)?._nativeRef?.current ??
        (scrollRef.current as any)?.getScrollableNode?.() ??
        null;
      if (!node) return;

      // Apply scroll snap to the container
      node.style.overflowY = 'scroll';
      node.style.scrollSnapType = 'y mandatory';

      // Apply snap-align to REAL item children only (skip padding)
      // Since we use contentContainerStyle padding, all children are real items
      const applySnap = () => {
        Array.from(node.children).forEach((child) => {
          (child as HTMLElement).style.scrollSnapAlign = 'center';
        });
      };
      applySnap();

      // Set initial scroll position
      node.scrollTop = initialIndex * ITEM_HEIGHT;

      const handleScroll = () => {
        const idx = clamp(Math.round(node.scrollTop / ITEM_HEIGHT), 0, items.length - 1);
        setLiveIdx(idx);
        if (webScrollTimer.current) clearTimeout(webScrollTimer.current);
        webScrollTimer.current = setTimeout(() => {
          const finalIdx = clamp(Math.round(node.scrollTop / ITEM_HEIGHT), 0, items.length - 1);
          // Snap to exact grid position
          node.scrollTo({ top: finalIdx * ITEM_HEIGHT, behavior: 'smooth' });
          setLiveIdx(finalIdx);
          onSelect(finalIdx);
        }, 150);
      };

      node.addEventListener('scroll', handleScroll);
      return () => {
        node.removeEventListener('scroll', handleScroll);
        if (webScrollTimer.current) clearTimeout(webScrollTimer.current);
      };
    }, 50);

    return () => clearTimeout(setup);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mobile: track live position during drag
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const idx = clamp(Math.round(y / ITEM_HEIGHT), 0, items.length - 1);
      setLiveIdx(idx);
    },
    [items.length],
  );

  // Mobile: snap and emit on scroll end
  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const idx = clamp(Math.round(y / ITEM_HEIGHT), 0, items.length - 1);
      scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
      setLiveIdx(idx);
      onSelect(idx);
    },
    [items.length, onSelect],
  );

  return (
    <View style={{ width, height: PICKER_HEIGHT, overflow: 'hidden' }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={Platform.OS !== 'web' ? ITEM_HEIGHT : undefined}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
        // Use padding instead of dummy Views — avoids creating snap targets at y=0
        contentContainerStyle={{
          paddingTop: ITEM_HEIGHT,
          paddingBottom: ITEM_HEIGHT,
        }}
      >
        {items.map((label, i) => {
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

  // Use refs so parent state updates don't re-render columns and fight scroll
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
    borderRadius: 10,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    zIndex: 0,
  },
});
