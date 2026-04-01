/**
 * ScriptureReadingPlayer
 *
 * A full-featured audio player for sequential scripture reading (Full BOM / Full Bible).
 * Features:
 *  - Persistent position: remembers which section + seek time across sessions
 *  - Playback controls: ±15s skip, pause/play, Done
 *  - Goal timer: optional target listening time with animated circular progress ring
 *  - Goal celebration: full-screen overlay when goal is reached
 *  - Auto-advance: moves to next section when current section finishes
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, Animated, Platform,
} from 'react-native';
import { createAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { useColors } from '@/hooks/use-colors';
import { saveScripturePosition, getScripturePosition } from '@/lib/scripture-position';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScriptureTrack {
  url: string;
  label: string;
}

interface Props {
  source: 'book-of-mormon' | 'bible';
  tracks: ScriptureTrack[];           // ordered list of sections to play
  initialSectionIndex?: number;       // 0-based index to start from (from saved position)
  initialSeekSeconds?: number;        // seek position within that section
  goalSeconds?: number;               // undefined = continuous mode
  onDone: () => void;                 // called when user taps Done or goal is finished
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const s = Math.floor(secs);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ScriptureReadingPlayer({
  source, tracks, initialSectionIndex = 0, initialSeekSeconds = 0, goalSeconds, onDone,
}: Props) {
  const colors = useColors();

  // ── State ──────────────────────────────────────────────────────────────────
  const [sectionIdx, setSectionIdx] = useState(initialSectionIndex);
  const [isReady, setIsReady] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [goalReached, setGoalReached] = useState(false);
  const [bonusSeconds, setBonusSeconds] = useState(0); // extra time after goal

  // Accumulated listening time across sections
  const totalListenedRef = useRef(0);
  const sectionStartTimeRef = useRef(0); // currentTime when we started tracking this section
  const lastSaveRef = useRef(0);

  // Celebration animation
  const celebScale = useRef(new Animated.Value(0)).current;
  const celebOpacity = useRef(new Animated.Value(0)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;

  // ── Audio player ───────────────────────────────────────────────────────────
  const currentTrack = tracks[sectionIdx];
  const playerRef = useRef(createAudioPlayer(currentTrack?.url ?? ''));
  const player = playerRef.current;
  const status = useAudioPlayerStatus(player);

  // ── Init: seek to saved position ───────────────────────────────────────────
  useEffect(() => {
    if (!isReady) return;
    if (sectionIdx === initialSectionIndex && initialSeekSeconds > 0) {
      player.seekTo(initialSeekSeconds);
    }
    player.play();
    sectionStartTimeRef.current = sectionIdx === initialSectionIndex ? initialSeekSeconds : 0;
  }, [isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mark ready once status fires
  useEffect(() => {
    if (!isReady && status.duration > 0) {
      setIsReady(true);
    }
  }, [status.duration, isReady]);

  // ── Auto-advance to next section ───────────────────────────────────────────
  useEffect(() => {
    if (!status.didJustFinish) return;
    const nextIdx = sectionIdx + 1;
    if (nextIdx >= tracks.length) {
      // Finished all sections — save position at start of first section (loop)
      saveScripturePosition(source, 0, 0);
      onDone();
      return;
    }
    // Advance
    setSectionIdx(nextIdx);
    saveScripturePosition(source, nextIdx, 0);
    sectionStartTimeRef.current = 0;
    player.replace({ uri: tracks[nextIdx].url });
    player.play();
  }, [status.didJustFinish]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Goal timer tracking ────────────────────────────────────────────────────
  useEffect(() => {
    if (!goalSeconds || goalReached) return;
    if (!status.playing) return;

    const currentTime = status.currentTime ?? 0;
    const elapsed = Math.max(0, currentTime - sectionStartTimeRef.current);
    const total = totalListenedRef.current + elapsed;

    // Save position every 5 seconds
    if (currentTime - lastSaveRef.current >= 5) {
      lastSaveRef.current = currentTime;
      saveScripturePosition(source, sectionIdx, currentTime);
    }

    if (total >= goalSeconds && !goalReached) {
      // Goal reached!
      totalListenedRef.current = total;
      setGoalReached(true);
      player.pause();
      saveScripturePosition(source, sectionIdx, currentTime);
      triggerCelebration();
    }
  }, [status.currentTime, status.playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // In continuous mode, just save position periodically
  useEffect(() => {
    if (goalSeconds || !status.playing) return;
    const currentTime = status.currentTime ?? 0;
    if (currentTime - lastSaveRef.current >= 5) {
      lastSaveRef.current = currentTime;
      saveScripturePosition(source, sectionIdx, currentTime);
    }
  }, [status.currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track bonus time after goal reached (if user keeps going)
  useEffect(() => {
    if (!goalReached || showCelebration || !status.playing) return;
    const currentTime = status.currentTime ?? 0;
    if (currentTime - lastSaveRef.current >= 5) {
      lastSaveRef.current = currentTime;
      saveScripturePosition(source, sectionIdx, currentTime);
      setBonusSeconds((prev) => prev + 5);
    }
  }, [status.currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Celebration animation ──────────────────────────────────────────────────
  const triggerCelebration = useCallback(() => {
    setShowCelebration(true);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    Animated.parallel([
      Animated.spring(celebScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 150 }),
      Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(confettiAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(confettiAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, [celebScale, celebOpacity, confettiAnim]);

  const dismissCelebration = useCallback(() => {
    Animated.parallel([
      Animated.timing(celebScale, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(celebOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setShowCelebration(false));
  }, [celebScale, celebOpacity]);

  const handleKeepGoing = useCallback(() => {
    dismissCelebration();
    sectionStartTimeRef.current = status.currentTime ?? 0;
    lastSaveRef.current = status.currentTime ?? 0;
    player.play();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [dismissCelebration, player, status.currentTime]);

  const handleFinishStep = useCallback(() => {
    dismissCelebration();
    saveScripturePosition(source, sectionIdx, status.currentTime ?? 0);
    onDone();
  }, [dismissCelebration, source, sectionIdx, status.currentTime, onDone]);

  // ── Playback controls ──────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (status.playing) {
      player.pause();
      saveScripturePosition(source, sectionIdx, status.currentTime ?? 0);
    } else {
      player.play();
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [status.playing, player, source, sectionIdx, status.currentTime]);

  const handleSkipBack = useCallback(() => {
    const newTime = Math.max(0, (status.currentTime ?? 0) - 15);
    player.seekTo(newTime);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [player, status.currentTime]);

  const handleSkipForward = useCallback(() => {
    const duration = status.duration ?? 0;
    const newTime = Math.min(duration, (status.currentTime ?? 0) + 15);
    player.seekTo(newTime);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [player, status.currentTime, status.duration]);

  const handleDone = useCallback(() => {
    player.pause();
    saveScripturePosition(source, sectionIdx, status.currentTime ?? 0);
    onDone();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [player, source, sectionIdx, status.currentTime, onDone]);

  // ── Goal progress ──────────────────────────────────────────────────────────
  const currentTime = status.currentTime ?? 0;
  const elapsed = Math.max(0, currentTime - sectionStartTimeRef.current);
  const totalListened = totalListenedRef.current + (status.playing ? elapsed : 0);
  const goalProgress = goalSeconds ? Math.min(1, totalListened / goalSeconds) : 0;
  const remainingGoalSecs = goalSeconds ? Math.max(0, goalSeconds - totalListened) : 0;

  // ── Progress bar (section) ─────────────────────────────────────────────────
  const sectionProgress = status.duration > 0 ? (currentTime / status.duration) : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!currentTrack) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Section info */}
      <View style={styles.sectionRow}>
        <View style={[styles.sourceBadge, { backgroundColor: '#7C3AED20' }]}>
          <Text style={[styles.sourceBadgeText, { color: '#7C3AED' }]}>
            {source === 'book-of-mormon' ? '📖 Book of Mormon' : '✝️ Bible (KJV)'}
          </Text>
        </View>
        <Text style={[styles.sectionCounter, { color: colors.muted }]}>
          {sectionIdx + 1} / {tracks.length}
        </Text>
      </View>

      <Text style={[styles.trackTitle, { color: colors.foreground }]} numberOfLines={2}>
        {currentTrack.label}
      </Text>

      {/* Section progress bar */}
      <View style={[styles.progressBarTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressBarFill, { width: `${sectionProgress * 100}%`, backgroundColor: '#7C3AED' }]} />
      </View>
      <View style={styles.timeRow}>
        <Text style={[styles.timeText, { color: colors.muted }]}>{formatTime(currentTime)}</Text>
        <Text style={[styles.timeText, { color: colors.muted }]}>{status.duration > 0 ? formatTime(status.duration) : '--:--'}</Text>
      </View>

      {/* Goal timer ring */}
      {goalSeconds != null && (
        <View style={styles.goalRow}>
          <GoalRing progress={goalProgress} goalSeconds={goalSeconds} remainingSeconds={remainingGoalSecs} reached={goalReached} />
        </View>
      )}

      {/* Playback controls */}
      <View style={styles.controls}>
        {/* Skip back 15s */}
        <Pressable
          onPress={handleSkipBack}
          style={({ pressed }) => [styles.controlBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.controlIcon, { color: colors.foreground }]}>↩</Text>
          <Text style={[styles.controlLabel, { color: colors.muted }]}>15s</Text>
        </Pressable>

        {/* Play/Pause */}
        <Pressable
          onPress={handlePlayPause}
          style={({ pressed }) => [styles.playBtn, { backgroundColor: '#7C3AED' }, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <Text style={styles.playIcon}>{status.playing ? '⏸' : '▶'}</Text>
        </Pressable>

        {/* Skip forward 15s */}
        <Pressable
          onPress={handleSkipForward}
          style={({ pressed }) => [styles.controlBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.controlIcon, { color: colors.foreground }]}>↪</Text>
          <Text style={[styles.controlLabel, { color: colors.muted }]}>15s</Text>
        </Pressable>
      </View>

      {/* Done button */}
      <Pressable
        onPress={handleDone}
        style={({ pressed }) => [styles.doneBtn, { borderColor: colors.border, backgroundColor: pressed ? colors.border : 'transparent' }]}
      >
        <Text style={[styles.doneBtnText, { color: colors.muted }]}>Done Reading</Text>
      </Pressable>

      {/* Goal Celebration Overlay */}
      {showCelebration && (
        <Animated.View
          style={[
            styles.celebrationOverlay,
            { opacity: celebOpacity },
          ]}
        >
          <Animated.View
            style={[
              styles.celebrationCard,
              { backgroundColor: colors.surface, transform: [{ scale: celebScale }] },
            ]}
          >
            {/* Confetti dots */}
            <ConfettiDots anim={confettiAnim} />

            <Text style={styles.celebEmoji}>🎉</Text>
            <Text style={[styles.celebTitle, { color: colors.foreground }]}>Goal Reached!</Text>
            <Text style={[styles.celebSubtitle, { color: colors.muted }]}>
              You listened for {formatTime(goalSeconds ?? 0)}
            </Text>
            <Text style={[styles.celebSection, { color: '#7C3AED' }]}>
              {currentTrack.label}
            </Text>

            <View style={styles.celebButtons}>
              <Pressable
                onPress={handleKeepGoing}
                style={({ pressed }) => [styles.celebKeepBtn, { backgroundColor: '#7C3AED', opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.celebKeepBtnText}>Keep Going ▶</Text>
              </Pressable>
              <Pressable
                onPress={handleFinishStep}
                style={({ pressed }) => [styles.celebFinishBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.celebFinishBtnText, { color: colors.muted }]}>Finish Step</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

// ── GoalRing ──────────────────────────────────────────────────────────────────

function GoalRing({ progress, goalSeconds, remainingSeconds, reached }: {
  progress: number;
  goalSeconds: number;
  remainingSeconds: number;
  reached: boolean;
}) {
  const colors = useColors();
  const size = 80;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  // Animated dash offset
  const animOffset = useRef(new Animated.Value(circumference)).current;
  useEffect(() => {
    Animated.timing(animOffset, {
      toValue: dashOffset,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [dashOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  const ringColor = reached ? '#22C55E' : '#7C3AED';

  return (
    <View style={styles.goalRingContainer}>
      <View style={{ width: size, height: size, position: 'relative' }}>
        {/* Background ring */}
        <View style={[styles.goalRingBg, {
          width: size, height: size, borderRadius: size / 2,
          borderWidth: stroke, borderColor: colors.border,
        }]} />
        {/* Progress arc — using a simple View-based approach */}
        <View style={[styles.goalRingFg, {
          width: size, height: size, borderRadius: size / 2,
          borderWidth: stroke,
          borderColor: ringColor,
          borderTopColor: progress > 0.25 ? ringColor : 'transparent',
          borderRightColor: progress > 0.5 ? ringColor : 'transparent',
          borderBottomColor: progress > 0.75 ? ringColor : 'transparent',
          borderLeftColor: progress > 0 ? ringColor : 'transparent',
          transform: [{ rotate: '-90deg' }],
          opacity: progress > 0 ? 1 : 0,
        }]} />
        {/* Center text */}
        <View style={styles.goalRingCenter}>
          {reached ? (
            <Text style={{ fontSize: 22 }}>✓</Text>
          ) : (
            <>
              <Text style={[styles.goalRingTime, { color: colors.foreground }]}>
                {formatTime(remainingSeconds)}
              </Text>
              <Text style={[styles.goalRingLabel, { color: colors.muted }]}>left</Text>
            </>
          )}
        </View>
      </View>
      <Text style={[styles.goalRingCaption, { color: colors.muted }]}>
        {reached ? 'Goal reached! 🎉' : `Goal: ${Math.round(goalSeconds / 60)} min`}
      </Text>
    </View>
  );
}

// ── ConfettiDots ──────────────────────────────────────────────────────────────

function ConfettiDots({ anim }: { anim: Animated.Value }) {
  const dots = ['#7C3AED', '#22C55E', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];
  return (
    <View style={styles.confettiContainer} pointerEvents="none">
      {dots.map((color, i) => {
        const angle = (i / dots.length) * 2 * Math.PI;
        const tx = anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 80] });
        const ty = anim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 80 - 40] });
        const op = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={[
              styles.confettiDot,
              { backgroundColor: color, opacity: op, transform: [{ translateX: tx }, { translateY: ty }] },
            ]}
          />
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
    overflow: 'hidden',
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  sourceBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionCounter: {
    fontSize: 12,
  },
  trackTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  timeText: {
    fontSize: 12,
  },
  goalRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  goalRingContainer: {
    alignItems: 'center',
    gap: 6,
  },
  goalRingBg: {
    position: 'absolute',
  },
  goalRingFg: {
    position: 'absolute',
  },
  goalRingCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalRingTime: {
    fontSize: 14,
    fontWeight: '700',
  },
  goalRingLabel: {
    fontSize: 10,
  },
  goalRingCaption: {
    fontSize: 12,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 4,
  },
  controlBtn: {
    alignItems: 'center',
    gap: 2,
    minWidth: 44,
  },
  controlIcon: {
    fontSize: 24,
  },
  controlLabel: {
    fontSize: 11,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  playIcon: {
    fontSize: 26,
    color: '#fff',
  },
  doneBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
  // Celebration overlay
  celebrationOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  celebrationCard: {
    width: '85%',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  celebEmoji: {
    fontSize: 52,
  },
  celebTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  celebSubtitle: {
    fontSize: 15,
    textAlign: 'center',
  },
  celebSection: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  celebButtons: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  celebKeepBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  celebKeepBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  celebFinishBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  celebFinishBtnText: {
    fontSize: 15,
    fontWeight: '500',
  },
  confettiContainer: {
    position: 'absolute',
    top: '30%',
    left: '50%',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
