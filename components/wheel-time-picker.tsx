/**
 * WheelTimePicker
 *
 * Compact iOS-style drum-roll: Hour | Minute | AM/PM
 * 3 visible rows: above (faded+slanted) | selected (large+bold) | below (faded+slanted)
 *
 * Platform strategy:
 * - iOS/Android: snapToInterval + decelerationRate="fast" handles native snapping.
 *   useLayoutEffect enforces initial scroll position (RN ignores contentOffset on mount).
 * - Web: inject CSS scroll-snap-type onto the ScrollView's underlying div so the
 *   browser handles snapping natively without blocking scroll events.
 *   After scroll settles, read scrollTop and emit the value.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
}

function WheelColumn({ items, selectedIndex, onSelect, width }: ColumnProps) {
  const colors = useColors();
  const scrollRef = useRef<ScrollView>(null);
  const isDragging = useRef(false);
  const webScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [liveIdx, setLiveIdx] = useState(selectedIndex);

  // Force scroll to correct position after mount and on external change
  useLayoutEffect(() => {
    if (!isDragging.current) {
      setLiveIdx(selectedIndex);
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: selectedIndex * ITEM_HEIGHT,
          animated: false,
        });
      }, 0);
      return () => clearTimeout(t);
    }
  }, [selectedIndex]);

  // Web: inject CSS scroll-snap onto the underlying div, and listen for scrollend
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Give RN Web a tick to render the DOM node
    const setup = setTimeout(() => {
      // RN Web ScrollView renders as a div; access it via the internal ref
      const node: HTMLElement | null =
        (scrollRef.current as any)?._nativeRef?.current ??
        (scrollRef.current as any)?.getScrollableNode?.() ??
        null;

      if (!node) return;

      // Apply CSS scroll snap — this lets the browser snap natively without blocking scroll
      node.style.overflowY = 'scroll';
      node.style.scrollSnapType = 'y mandatory';
      // Apply snap-align to each child item div
      const applySnapToChildren = () => {
        Array.from(node.children).forEach((child) => {
          (child as HTMLElement).style.scrollSnapAlign = 'center';
        });
      };
      applySnapToChildren();

      // Set initial scroll position
      node.scrollTop = selectedIndex * ITEM_HEIGHT;

      // After scroll settles, emit the value
      const handleScrollEnd = () => {
        if (webScrollTimer.current) clearTimeout(webScrollTimer.current);
        webScrollTimer.current = setTimeout(() => {
          const idx = clamp(Math.round(node.scrollTop / ITEM_HEIGHT), 0, items.length - 1);
          // Snap to exact position
          node.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
          setLiveIdx(idx);
          onSelect(idx);
        }, 100);
      };

      const handleScroll = () => {
        isDragging.current = true;
        const idx = clamp(Math.round(node.scrollTop / ITEM_HEIGHT), 0, items.length - 1);
        setLiveIdx(idx);
        if (webScrollTimer.current) clearTimeout(webScrollTimer.current);
        webScrollTimer.current = setTimeout(() => {
          isDragging.current = false;
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
  }, [items.length, onSelect]);

  // Mobile scroll handlers
  const handleScrollBegin = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const idx = clamp(Math.round(y / ITEM_HEIGHT), 0, items.length - 1);
      setLiveIdx(idx);
    },
    [items.length],
  );

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      isDragging.current = false;
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
        onScrollBeginDrag={handleScrollBegin}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
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

  const [hourIdx,   setHourIdx]   = useState(hour12 - 1);
  const [minuteIdx, setMinuteIdx] = useState(minute);
  const [periodIdx, setPeriodIdx] = useState(isPM ? 1 : 0);

  useEffect(() => {
    setHourIdx((hour % 12 === 0 ? 12 : hour % 12) - 1);
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
    borderRadius: 10,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    zIndex: 0,
  },
});
