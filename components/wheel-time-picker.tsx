/**
 * WheelTimePicker — Native ScrollView snap-based iOS drum roll
 *
 * Architecture:
 * - Uses native ScrollView with snapToInterval + decelerationRate="fast"
 * - Renders instantly (small list, no Animated overhead)
 * - nestedScrollEnabled so it works inside a parent ScrollView
 * - 3 repeats of items for infinite-feel without memory cost
 * - Starts scrolled to the middle repeat so user can scroll up or down
 * - onMomentumScrollEnd fires after snap to read the selected index
 * - Haptic tick on every item change
 * - LinearGradient fade masks + selection band for iOS look
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/use-colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_H   = 50;   // height of each row
const VISIBLE  = 5;    // rows visible at once (must be odd)
const PICKER_H = ITEM_H * VISIBLE;
const PAD      = ITEM_H * Math.floor(VISIBLE / 2); // top/bottom padding to center first/last item

// Number of list repetitions — 3 is enough for a smooth infinite feel
const N_REPEAT = 3;

// ─── WheelColumn ─────────────────────────────────────────────────────────────

interface ColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  width: number;
  accentColor?: string;
  /** Background color for gradient masks (must match parent bg) */
  bgColor: string;
}

export function WheelColumn({
  items,
  selectedIndex,
  onSelect,
  width,
  accentColor,
  bgColor,
}: ColumnProps) {
  const colors  = useColors();
  const count   = items.length;
  const accent  = accentColor ?? colors.foreground;
  const scrollRef = useRef<ScrollView>(null);
  const lastEmitted = useRef(selectedIndex);
  const [visibleIndex, setVisibleIndex] = useState(selectedIndex);

  // Build repeated list
  const repeated = useMemo(() => {
    const arr: string[] = [];
    for (let r = 0; r < N_REPEAT; r++) {
      for (let i = 0; i < count; i++) arr.push(items[i]);
    }
    return arr;
  }, [items, count]);

  // Offset for a given flat index (centers the item in the picker)
  const offsetFor = useCallback(
    (flatIdx: number) => flatIdx * ITEM_H,
    [],
  );

  // The flat index in the middle repeat for a given real index
  const midFlatIndex = useCallback(
    (realIdx: number) => Math.floor(N_REPEAT / 2) * count + realIdx,
    [count],
  );

  // Scroll to initial position on mount (no animation — instant)
  useEffect(() => {
    const flat = midFlatIndex(selectedIndex);
    const offset = offsetFor(flat);
    // Use a short timeout so the ScrollView has laid out before we scroll
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: offset, animated: false });
    }, 50);
    return () => clearTimeout(t);
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When selectedIndex prop changes externally, scroll to match
  const prevSelected = useRef(selectedIndex);
  useEffect(() => {
    if (selectedIndex === prevSelected.current) return;
    prevSelected.current = selectedIndex;
    const flat = midFlatIndex(selectedIndex);
    scrollRef.current?.scrollTo({ y: offsetFor(flat), animated: true });
  }, [selectedIndex, midFlatIndex, offsetFor]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const flatIdx = Math.round(y / ITEM_H);
      const realIdx = ((flatIdx % count) + count) % count;

      setVisibleIndex(realIdx);

      if (realIdx !== lastEmitted.current) {
        lastEmitted.current = realIdx;
        onSelect(realIdx);
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }

      // Re-center to middle repeat to keep scrolling room in both directions
      const targetFlat = midFlatIndex(realIdx);
      const targetOffset = offsetFor(targetFlat);
      if (Math.abs(y - targetOffset) > ITEM_H * 0.5) {
        scrollRef.current?.scrollTo({ y: targetOffset, animated: false });
      }
    },
    [count, onSelect, midFlatIndex, offsetFor],
  );

  // Track scroll position to update visual selection during drag
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const flatIdx = Math.round(y / ITEM_H);
      const realIdx = ((flatIdx % count) + count) % count;
      if (realIdx !== visibleIndex) setVisibleIndex(realIdx);
    },
    [count, visibleIndex],
  );

  return (
    <View style={{ width, height: PICKER_H, overflow: 'hidden' }}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        nestedScrollEnabled
        contentContainerStyle={{ paddingTop: PAD, paddingBottom: PAD }}
        // Disable bouncing so it doesn't fly past the ends
        bounces={false}
        overScrollMode="never"
      >
        {repeated.map((label, idx) => {
          const realIdx = idx % count;
          const isSelected = realIdx === visibleIndex;
          const dist = Math.abs(realIdx - visibleIndex);
          // Also check wrap-around distance
          const wrapDist = Math.min(dist, count - dist);

          let fontSize: number;
          let fontWeight: '700' | '500' | '400' | '300';
          let opacity: number;
          let color: string;

          if (isSelected) {
            fontSize   = 28;
            fontWeight = '700';
            opacity    = 1;
            color      = accent;
          } else if (wrapDist === 1) {
            fontSize   = 20;
            fontWeight = '400';
            opacity    = 0.5;
            color      = colors.muted;
          } else if (wrapDist === 2) {
            fontSize   = 15;
            fontWeight = '300';
            opacity    = 0.2;
            color      = colors.muted;
          } else {
            fontSize   = 12;
            fontWeight = '300';
            opacity    = 0.05;
            color      = colors.muted;
          }

          return (
            <View key={idx} style={[styles.item, { height: ITEM_H, width }]}>
              <Text
                style={{
                  fontSize,
                  fontWeight,
                  opacity,
                  color,
                  letterSpacing: 0.5,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Selection band — hairline rules around center row */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          {
            top:         PAD,
            height:      ITEM_H,
            borderColor: colors.border,
          },
        ]}
      />

      {/* Top fade */}
      <LinearGradient
        pointerEvents="none"
        colors={[bgColor, bgColor + 'E0', bgColor + '00']}
        style={[styles.fadeMask, { top: 0 }]}
      />
      {/* Bottom fade */}
      <LinearGradient
        pointerEvents="none"
        colors={[bgColor + '00', bgColor + 'E0', bgColor]}
        style={[styles.fadeMask, { bottom: 0 }]}
      />
    </View>
  );
}

// ─── WheelTimePicker ─────────────────────────────────────────────────────────

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

  // Emit whenever any column changes
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
    setHourIdx(idx);
    emit(idx, minuteIdx, periodIdx);
  }, [emit, minuteIdx, periodIdx]);

  const onMinuteSelect = useCallback((idx: number) => {
    setMinuteIdx(idx);
    emit(hourIdx, idx, periodIdx);
  }, [emit, hourIdx, periodIdx]);

  const onPeriodSelect = useCallback((idx: number) => {
    setPeriodIdx(idx);
    emit(hourIdx, minuteIdx, idx);
  }, [emit, hourIdx, minuteIdx]);

  // Use surface color as the bg for gradient masks (picker sits on surface card)
  const bgColor = colors.surface;

  const hourW   = 80;
  const minuteW = 80;
  const periodW = 72;
  const totalW  = hourW + minuteW + periodW;

  return (
    <View style={[styles.container, { width: totalW }]}>
      {/* Colon separator */}
      <View
        pointerEvents="none"
        style={[styles.colonWrap, { left: hourW - 8 }]}
      >
        <Text style={[styles.colon, { color: colors.foreground }]}>:</Text>
      </View>

      <View style={styles.columns}>
        <WheelColumn
          items={HOURS_12}
          selectedIndex={hourIdx}
          onSelect={onHourSelect}
          width={hourW}
          accentColor={colors.foreground}
          bgColor={bgColor}
        />
        <WheelColumn
          items={MINUTES}
          selectedIndex={minuteIdx}
          onSelect={onMinuteSelect}
          width={minuteW}
          accentColor={colors.foreground}
          bgColor={bgColor}
        />
        <WheelColumn
          items={PERIODS}
          selectedIndex={periodIdx}
          onSelect={onPeriodSelect}
          width={periodW}
          accentColor={colors.primary}
          bgColor={bgColor}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FADE_H = ITEM_H * 2;

const styles = StyleSheet.create({
  container: {
    height:    PICKER_H,
    alignSelf: 'center',
  },
  columns: {
    flexDirection: 'row',
    height:        PICKER_H,
  },
  item: {
    alignItems:     'center',
    justifyContent: 'center',
  },
  selectionBand: {
    position:          'absolute',
    left:              8,
    right:             8,
    borderTopWidth:    StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth:   0,
    borderRightWidth:  0,
  },
  fadeMask: {
    position: 'absolute',
    left:     0,
    right:    0,
    height:   FADE_H,
  },
  colonWrap: {
    position:       'absolute',
    width:          16,
    top:            0,
    bottom:         0,
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         10,
  },
  colon: {
    fontSize:   28,
    fontWeight: '700',
    marginTop:  -4,
  },
});
