/**
 * WheelTimePicker
 *
 * Compact iOS-style drum-roll: Hour | Minute | AM/PM
 * 3 visible rows: above (faded+slanted) | selected (large+bold) | below (faded+slanted)
 *
 * KEY DESIGN DECISION:
 * Each WheelColumn owns its own scroll state internally.
 * - selectedIndex is only used on MOUNT to set the initial scroll position.
 * - After mount, the column tracks its own liveIdx from scroll events.
 * - We NEVER call scrollTo() in response to selectedIndex changes after mount,
 *   because that fights the user's drag and snaps back to the original value.
 * - onSelect is called when the scroll settles, which updates the parent state.
 *   The parent state change re-renders but does NOT trigger a scrollTo.
 *
 * Web: CSS scroll-snap-type injected onto the underlying div for native browser snapping.
 * Mobile: snapToInterval + decelerationRate="fast" for native iOS/Android snapping.
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
  initialIndex: number;           // only used on mount
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
  }, []); // empty deps = mount only

  // Web: inject CSS scroll-snap and listen for scroll settle
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const setup = setTimeout(() => {
      const node: HTMLElement | null =
        (scrollRef.current as any)?._nativeRef?.current ??
        (scrollRef.current as any)?.getScrollableNode?.() ??
        null;
      if (!node) return;

      node.style.overflowY = 'scroll';
      node.style.scrollSnapType = 'y mandatory';

      // Set initial scroll position on web too
      node.scrollTop = initialIndex * ITEM_HEIGHT;

      const handleScroll = () => {
        const idx = clamp(Math.round(node.scrollTop / ITEM_HEIGHT), 0, items.length - 1);
        setLiveIdx(idx);
        if (webScrollTimer.current) clearTimeout(webScrollTimer.current);
        webScrollTimer.current = setTimeout(() => {
          const finalIdx = clamp(Math.round(node.scrollTop / ITEM_HEIGHT), 0, items.length - 1);
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
  }, []); // mount only — onSelect is stable via useCallback in parent

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
      >
        {/* Top padding: lets item[0] sit in center row */}
        <View style={styles.item} />

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

        {/* Bottom padding */}
        <View style={styles.item} />
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

  // These are only used as initialIndex — columns own their state after mount
  const initialHourIdx   = hour12 - 1;
  const initialMinuteIdx = minute;
  const initialPeriodIdx = isPM ? 1 : 0;

  // Parent tracks current values to pass to emit
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
      {/* Selection band with visible top/bottom border lines */}
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
