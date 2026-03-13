/**
 * WheelTimePicker
 *
 * Compact iOS-style drum-roll: Hour | Minute | AM/PM
 * 3 visible rows: 1 above (faded+slanted), selected (large+bold), 1 below (faded+slanted)
 *
 * HOW CENTERING WORKS:
 * Content layout inside ScrollView:
 *   [padding row]  ← y=0
 *   [item 0]       ← y=ITEM_HEIGHT   → centered when scrolled to y=0? NO.
 *
 * Wait — with a top padding row, item[i] sits at content-y = (i+1)*ITEM_HEIGHT.
 * For item[i] to appear in the CENTER row of the 3-row window, the ScrollView's
 * contentOffset.y must equal i * ITEM_HEIGHT (the window top = one row above center).
 *
 * So: contentOffset.y = selectedIndex * ITEM_HEIGHT  ✓  (this is already correct)
 * And: the item that is visually centered = the item whose top edge is at
 *      contentOffset.y + ITEM_HEIGHT = (selectedIndex + 1) * ITEM_HEIGHT
 *      = item[selectedIndex]  ✓
 *
 * The bug in the previous version: liveSelectedIndex was computed as
 *   round(contentOffset.y / ITEM_HEIGHT)
 * but that gives the item whose TOP is at the TOP of the window (row 0),
 * which is the item ABOVE the selected one. We need the item in row 1 (center):
 *   liveSelectedIndex = round(contentOffset.y / ITEM_HEIGHT)
 * is actually correct IF we interpret it as "which item's top aligns with window top"
 * and the padding row means item[0] top = ITEM_HEIGHT, so:
 *   item index at window top = round(y / ITEM_HEIGHT) - 1  ... but that's the ABOVE item.
 *
 * SIMPLEST FIX: Remove the padding rows entirely.
 * Use contentInset={{ top: ITEM_HEIGHT, bottom: ITEM_HEIGHT }} instead.
 * With contentInset, item[0] starts at the very top of content (y=0),
 * and the inset pushes the visible window down by ITEM_HEIGHT,
 * so item[0] appears in the CENTER row when contentOffset.y = -ITEM_HEIGHT (the inset default).
 * Then: contentOffset.y = (selectedIndex - 1) * ITEM_HEIGHT ... still messy.
 *
 * CLEANEST FIX: Keep padding rows, fix the math.
 * With padding row at top:
 *   - item[i] top edge in content = (i + 1) * ITEM_HEIGHT
 *   - item[i] is in CENTER row when: content top of window = i * ITEM_HEIGHT
 *     (window shows rows at y, y+ITEM_HEIGHT, y+2*ITEM_HEIGHT;
 *      center row = y+ITEM_HEIGHT; item[i] center row when (i+1)*ITEM_HEIGHT = y+ITEM_HEIGHT → y = i*ITEM_HEIGHT) ✓
 *   - So contentOffset.y = selectedIndex * ITEM_HEIGHT is CORRECT for centering ✓
 *   - liveSelectedIndex from scroll: y = liveIdx * ITEM_HEIGHT → liveIdx = round(y / ITEM_HEIGHT) ✓
 *   - dist = i - liveIdx: when liveIdx=0, item[0] is centered, dist=0 for item[0] ✓
 *
 * So the math IS correct. The visual bug (item appears at top not center) means
 * the ScrollView is not respecting contentOffset on mount. This is a known React Native
 * bug: contentOffset prop is ignored on first render on Android.
 * FIX: Use a ref + scrollTo in useLayoutEffect after mount.
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
const PICKER_HEIGHT = ITEM_HEIGHT * 3;   // 3 visible rows: above + center + below

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
  const [liveIdx, setLiveIdx] = useState(selectedIndex);

  // On mount AND whenever selectedIndex changes: force scroll to correct position.
  // useLayoutEffect fires before paint, avoiding the flash of wrong position.
  useLayoutEffect(() => {
    if (!isDragging.current) {
      setLiveIdx(selectedIndex);
      // Small delay ensures the ScrollView has laid out before we scroll
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: selectedIndex * ITEM_HEIGHT,
          animated: false,
        });
      }, 0);
      return () => clearTimeout(t);
    }
  }, [selectedIndex]);

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
      // Snap to exact grid
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
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScrollBeginDrag={handleScrollBegin}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        // contentOffset is set here as a hint; useLayoutEffect enforces it
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
      >
        {/* Top padding row: pushes item[0] into center when y=0 */}
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

        {/* Bottom padding row */}
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
      {/* Highlight band at center row (row 1 of 3, i.e. ITEM_HEIGHT from top) */}
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
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 0,
  },
});
