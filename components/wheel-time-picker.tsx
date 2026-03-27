/**
 * WheelTimePicker — PanResponder + Animated iOS-style drum roll
 *
 * Architecture:
 * - NO ScrollView / FlatList — zero nesting conflicts with parent scroll
 * - PanResponder captures vertical touch directly on each column View
 * - Animated.Value drives the translateY of the item list
 * - On release: physics-based momentum decay → snap to nearest item
 * - Haptic tick on every item change (iOS only)
 * - LinearGradient fade masks top/bottom for authentic iOS look
 * - Cylindrical opacity/scale gradient (selected = large+opaque, outer = small+faded)
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  Platform,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/use-colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_H      = 52;   // height of each row
const VISIBLE     = 5;    // rows visible at once (must be odd)
const PICKER_H    = ITEM_H * VISIBLE;
const CENTER_ROW  = Math.floor(VISIBLE / 2); // index of the center row = 2

// How many times to repeat the list for "infinite" feel
const N_REPEAT    = 80;

// Friction for momentum: deceleration constant (px/ms²)
const FRICTION    = 0.0028;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function snapY(y: number): number {
  return -Math.round(-y / ITEM_H) * ITEM_H;
}

function initialY(initialIndex: number, count: number): number {
  const midRep = Math.floor(N_REPEAT / 2);
  const flatIndex = midRep * count + initialIndex;
  return -(flatIndex * ITEM_H) + CENTER_ROW * ITEM_H;
}

// ─── WheelColumn ─────────────────────────────────────────────────────────────

interface ColumnProps {
  items: string[];
  initialIndex: number;
  onSelect: (index: number) => void;
  width: number;
  accentColor?: string;
}

export function WheelColumn({
  items,
  initialIndex,
  onSelect,
  width,
  accentColor,
}: ColumnProps) {
  const colors   = useColors();
  const count    = items.length;
  const accent   = accentColor ?? colors.foreground;

  // Build repeated list once
  const repeated = useMemo(() => {
    const arr: string[] = [];
    for (let r = 0; r < N_REPEAT; r++) {
      for (let i = 0; i < count; i++) arr.push(items[i]);
    }
    return arr;
  }, [items, count]);

  const totalItems = repeated.length;

  // Animated Y position of the list
  const startY   = initialY(initialIndex, count);
  const animY    = useRef(new Animated.Value(startY)).current;
  const currentY = useRef(startY);

  // Track which real index is currently centered for visual rendering
  const lastEmitted = useRef(initialIndex);
  const [selectedFlat, setSelectedFlat] = useState(
    Math.floor(N_REPEAT / 2) * count + initialIndex,
  );

  // Keep currentY in sync with animY; fire haptic + callback on index change
  useEffect(() => {
    const id = animY.addListener(({ value }) => {
      currentY.current = value;
      const flatCenter = Math.round(-value / ITEM_H);
      const ri = ((flatCenter % count) + count) % count;
      setSelectedFlat(flatCenter);
      if (ri !== lastEmitted.current) {
        lastEmitted.current = ri;
        onSelect(ri);
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
      }
    });
    return () => animY.removeListener(id);
  }, [animY, count, onSelect]);

  // Bounds: keep the list from flying too far off screen
  const minY = -(totalItems * ITEM_H) + (CENTER_ROW + 1) * ITEM_H;
  const maxY = CENTER_ROW * ITEM_H;

  // Velocity tracking for momentum
  const lastTouchY    = useRef(0);
  const lastTouchTime = useRef(0);
  const velocityY     = useRef(0);
  const momentumAnim  = useRef<Animated.CompositeAnimation | null>(null);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claim the touch immediately — prevents parent ScrollView from stealing it
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 1,
        onMoveShouldSetPanResponderCapture: (_, gs) => Math.abs(gs.dy) > 1,

        onPanResponderGrant: (e) => {
          momentumAnim.current?.stop();
          momentumAnim.current = null;
          animY.stopAnimation();
          lastTouchY.current    = e.nativeEvent.pageY;
          lastTouchTime.current = Date.now();
          velocityY.current     = 0;
        },

        onPanResponderMove: (e) => {
          const now = Date.now();
          const dy  = e.nativeEvent.pageY - lastTouchY.current;
          const dt  = now - lastTouchTime.current;
          if (dt > 0) velocityY.current = dy / dt;
          lastTouchY.current    = e.nativeEvent.pageY;
          lastTouchTime.current = now;
          const next = clamp(currentY.current + dy, minY, maxY);
          animY.setValue(next);
        },

        onPanResponderRelease: () => {
          const vel  = velocityY.current; // px/ms
          const sign = vel >= 0 ? 1 : -1;
          // distance = v² / (2 * friction)
          const dist      = sign * (vel * vel) / (2 * FRICTION);
          const projected = clamp(currentY.current + dist, minY, maxY);
          const snapped   = snapY(projected);
          const duration  = clamp(Math.abs(dist) * 0.35, 80, 550);

          const anim = Animated.timing(animY, {
            toValue:         snapped,
            duration,
            easing:          Easing.out(Easing.cubic),
            useNativeDriver: true,
          });
          momentumAnim.current = anim;
          anim.start(() => { momentumAnim.current = null; });
        },

        onPanResponderTerminate: () => {
          const snapped = snapY(currentY.current);
          Animated.timing(animY, {
            toValue:         snapped,
            duration:        150,
            easing:          Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minY, maxY],
  );

  return (
    <View
      style={{ width, height: PICKER_H, overflow: 'hidden' }}
      {...panResponder.panHandlers}
    >
      {/* Animated list */}
      <Animated.View style={{ transform: [{ translateY: animY }] }}>
        {repeated.map((label, idx) => {
          const dist = idx - selectedFlat;

          const isSelected = dist === 0;
          const isAdj1     = Math.abs(dist) === 1;
          const isAdj2     = Math.abs(dist) === 2;

          let fontSize: number;
          let fontWeight: '700' | '500' | '400' | '300';
          let opacity: number;
          let color: string;
          let scale: number;

          if (isSelected) {
            fontSize   = 30;
            fontWeight = '700';
            opacity    = 1;
            color      = accent;
            scale      = 1;
          } else if (isAdj1) {
            fontSize   = 22;
            fontWeight = '400';
            opacity    = 0.45;
            color      = colors.muted;
            scale      = 0.9;
          } else if (isAdj2) {
            fontSize   = 16;
            fontWeight = '300';
            opacity    = 0.18;
            color      = colors.muted;
            scale      = 0.78;
          } else {
            fontSize   = 13;
            fontWeight = '300';
            opacity    = 0;
            color      = 'transparent';
            scale      = 0.65;
          }

          return (
            <View key={idx} style={[styles.item, { height: ITEM_H, width }]}>
              <Text
                style={{
                  fontSize,
                  fontWeight,
                  opacity,
                  color,
                  transform: [{ scale }],
                  letterSpacing: 0.5,
                  ...(Platform.OS === 'ios' ? { fontFamily: 'System' } : {}),
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </Animated.View>

      {/* Selection band — two hairline rules around center row */}
      <View
        pointerEvents="none"
        style={[
          styles.selectionBand,
          {
            top:         CENTER_ROW * ITEM_H,
            height:      ITEM_H,
            borderColor: colors.border,
          },
        ]}
      />

      {/* Top fade — LinearGradient from background to transparent */}
      <LinearGradient
        pointerEvents="none"
        colors={[colors.background, colors.background + 'CC', 'transparent']}
        style={[styles.fadeMask, { top: 0 }]}
      />
      {/* Bottom fade */}
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', colors.background + 'CC', colors.background]}
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

  const isPM    = hour >= 12;
  const hour12  = hour % 12 === 0 ? 12 : hour % 12;

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

  const hourW   = 84;
  const minuteW = 84;
  const periodW = 76;
  const totalW  = hourW + minuteW + periodW;

  return (
    <View style={[styles.container, { width: totalW }]}>
      {/* Colon separator — positioned between hour and minute columns */}
      <View
        pointerEvents="none"
        style={[styles.colonWrap, { left: hourW - 6, bottom: 0, top: 0 }]}
      >
        <Text style={[styles.colon, { color: colors.foreground }]}>:</Text>
      </View>

      <View style={styles.columns}>
        <WheelColumn
          items={HOURS_12}
          initialIndex={initialHourIdx}
          onSelect={onHourSelect}
          width={hourW}
          accentColor={colors.foreground}
        />
        <WheelColumn
          items={MINUTES}
          initialIndex={initialMinuteIdx}
          onSelect={onMinuteSelect}
          width={minuteW}
          accentColor={colors.foreground}
        />
        <WheelColumn
          items={PERIODS}
          initialIndex={initialPeriodIdx}
          onSelect={onPeriodSelect}
          width={periodW}
          accentColor={colors.primary}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FADE_H = ITEM_H * 2 + 4;

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
    left:              12,
    right:             12,
    borderTopWidth:    StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderLeftWidth:   0,
    borderRightWidth:  0,
    pointerEvents:     'none',
  },
  fadeMask: {
    position: 'absolute',
    left:     0,
    right:    0,
    height:   FADE_H,
    pointerEvents: 'none',
  },
  colonWrap: {
    position:       'absolute',
    width:          16,
    alignItems:     'center',
    justifyContent: 'center',
    zIndex:         10,
  },
  colon: {
    fontSize:   30,
    fontWeight: '700',
    marginTop:  -6,
  },
});
