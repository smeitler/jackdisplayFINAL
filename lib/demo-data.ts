/**
 * Demo Mode data — rich pre-seeded goals, habits, and 30 days of check-in history.
 * Used by Apple App Store reviewers and curious users who don't want to create an account.
 */

import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { CategoryDef, Habit, CheckInEntry, AlarmConfig, Rating, VisionBoard, VisionMotivations } from './storage';

// ─── Demo Categories ──────────────────────────────────────────────────────────

export const DEMO_CATEGORIES: CategoryDef[] = [
  { id: 'demo_body',         label: 'Get Fit',         emoji: '💪', order: 0, lifeArea: 'body' },
  { id: 'demo_mind',         label: 'Sharp Mind',      emoji: '🧠', order: 1, lifeArea: 'mind' },
  { id: 'demo_money',        label: 'Build Wealth',    emoji: '💰', order: 2, lifeArea: 'money' },
  { id: 'demo_relationships',label: 'Deep Connections',emoji: '❤️', order: 3, lifeArea: 'relationships' },
  { id: 'demo_focus',        label: 'Deep Work',       emoji: '🎯', order: 4, lifeArea: 'focus' },
];

// ─── Demo Habits ──────────────────────────────────────────────────────────────

export const DEMO_HABITS: Habit[] = [
  // Get Fit
  { id: 'dh1', name: 'Morning run or gym session', emoji: '💪', category: 'demo_body', isActive: true, order: 0, weeklyGoal: 5, createdAt: new Date().toISOString() },
  { id: 'dh2', name: 'Drink 2L of water',          emoji: '💧', category: 'demo_body', isActive: true, order: 1, weeklyGoal: 7, createdAt: new Date().toISOString() },
  { id: 'dh3', name: 'Sleep before 11pm',           emoji: '😴', category: 'demo_body', isActive: true, order: 2, weeklyGoal: 7, createdAt: new Date().toISOString() },
  // Sharp Mind
  { id: 'dm1', name: 'Meditate for 10 minutes',    emoji: '🧘', category: 'demo_mind', isActive: true, order: 0, weeklyGoal: 7, createdAt: new Date().toISOString() },
  { id: 'dm2', name: 'Read 30 pages',              emoji: '📖', category: 'demo_mind', isActive: true, order: 1, weeklyGoal: 5, createdAt: new Date().toISOString() },
  { id: 'dm3', name: 'Evening journal entry',      emoji: '✍️', category: 'demo_mind', isActive: true, order: 2, weeklyGoal: 5, createdAt: new Date().toISOString() },
  // Build Wealth
  { id: 'dmo1', name: 'Review budget & expenses',  emoji: '💰', category: 'demo_money', isActive: true, order: 0, weeklyGoal: 3, createdAt: new Date().toISOString() },
  { id: 'dmo2', name: 'Work on side project',      emoji: '🚀', category: 'demo_money', isActive: true, order: 1, weeklyGoal: 5, createdAt: new Date().toISOString() },
  // Deep Connections
  { id: 'dr1', name: 'Text or call a friend',      emoji: '📱', category: 'demo_relationships', isActive: true, order: 0, weeklyGoal: 3, createdAt: new Date().toISOString() },
  { id: 'dr2', name: 'Quality time with family',   emoji: '❤️', category: 'demo_relationships', isActive: true, order: 1, weeklyGoal: 5, createdAt: new Date().toISOString() },
  // Deep Work
  { id: 'df1', name: '2-hour deep work block',     emoji: '🎯', category: 'demo_focus', isActive: true, order: 0, weeklyGoal: 5, createdAt: new Date().toISOString() },
  { id: 'df2', name: 'No social media before noon',emoji: '📵', category: 'demo_focus', isActive: true, order: 1, weeklyGoal: 7, createdAt: new Date().toISOString() },
];

// ─── Demo Check-ins (30 days of history) ─────────────────────────────────────

function dateString(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// Realistic rating patterns — mostly green, some yellow, occasional red/skip
const PATTERNS: Record<string, Rating[]> = {
  dh1: ['green','green','yellow','green','red','green','green','green','yellow','green','green','green','red','green','green','yellow','green','green','green','yellow','green','green','red','green','green','green','yellow','green','green','green'],
  dh2: ['green','green','green','green','green','yellow','green','green','green','green','green','green','green','yellow','green','green','green','green','green','green','yellow','green','green','green','green','green','green','green','yellow','green'],
  dh3: ['green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','green','yellow','green'],
  dm1: ['green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','green','yellow','green','green','green','green'],
  dm2: ['green','green','yellow','green','green','red','green','green','yellow','green','green','green','yellow','green','green','green','green','yellow','green','green','green','yellow','green','green','green','green','yellow','green','green','green'],
  dm3: ['yellow','green','green','green','yellow','green','green','yellow','green','green','green','yellow','green','green','green','yellow','green','green','green','yellow','green','green','green','yellow','green','green','green','yellow','green','green'],
  dmo1:['green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green'],
  dmo2:['green','green','red','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green'],
  dr1: ['green','green','green','yellow','green','green','green','yellow','green','green','green','yellow','green','green','green','yellow','green','green','green','yellow','green','green','green','yellow','green','green','green','yellow','green','green'],
  dr2: ['green','green','green','green','green','yellow','green','green','green','green','green','yellow','green','green','green','green','green','yellow','green','green','green','green','green','yellow','green','green','green','green','green','yellow'],
  df1: ['green','green','yellow','green','green','green','red','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green'],
  df2: ['green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow','green','green','green','green','yellow'],
};

export function buildDemoCheckIns(): CheckInEntry[] {
  const entries: CheckInEntry[] = [];
  for (const [habitId, ratings] of Object.entries(PATTERNS)) {
    for (let i = 0; i < 30; i++) {
      entries.push({
        habitId,
        date: dateString(i),
        rating: ratings[i],
        loggedAt: new Date().toISOString(),
      });
    }
  }
  return entries;
}

// ─── Demo Vision Board ───────────────────────────────────────────────────────

/** Bundled demo images for each goal category */
const DEMO_VISION_ASSETS: Record<string, number[]> = {
  demo_body: [
    require('../assets/demo/body1.webp'),
    require('../assets/demo/body2.jpg'),
  ],
  demo_mind: [
    require('../assets/demo/mind1.jpg'),
    require('../assets/demo/mind2.jpg'),
  ],
  demo_money: [
    require('../assets/demo/money1.jpg'),
    require('../assets/demo/money2.jpg'),
  ],
  demo_relationships: [
    require('../assets/demo/relationships1.jpg'),
    require('../assets/demo/relationships2.jpg'),
  ],
  demo_focus: [
    require('../assets/demo/focus1.webp'),
    require('../assets/demo/focus2.jpg'),
  ],
};

/** Motivations ("why this matters") for each demo goal category */
export const DEMO_MOTIVATIONS: VisionMotivations = {
  demo_body: [
    'Energy to show up fully for the people I love',
    'Confidence that comes from keeping promises to myself',
    'A body that performs — not just looks — at its best',
    'Proving to myself that consistency beats motivation',
  ],
  demo_mind: [
    'Clarity of thought is my greatest competitive edge',
    'Reading 30 pages a day compounds into 20 books a year',
    'Journaling helps me process, decide, and grow faster',
    'A calm mind makes every other habit easier',
  ],
  demo_money: [
    'Financial freedom means options, not obligations',
    'Building wealth is how I protect my family\'s future',
    'Every dollar invested today is working while I sleep',
    'My side project could replace my salary in 3 years',
  ],
  demo_relationships: [
    'Deep connections are the only thing I\'ll never regret investing in',
    'The people around me are my greatest source of joy',
    'Showing up consistently builds trust that lasts a lifetime',
    'Quality time > quantity of contacts',
  ],
  demo_focus: [
    'Two focused hours beat eight distracted ones every time',
    'My best work happens in protected blocks of deep work',
    'Cutting social media before noon reclaims my mornings',
    'Focus is the skill that separates good from great',
  ],
};

/**
 * Web-compatible demo board: uses the bundled asset remote/data URIs directly.
 * On web, Image source can be a require() number, but VisionBoard stores strings.
 * We resolve each asset's uri (which is a data URL or CDN URL on web) synchronously.
 */
export function buildDemoVisionBoardWeb(): VisionBoard {
  const board: VisionBoard = {};
  for (const [catId, modules] of Object.entries(DEMO_VISION_ASSETS)) {
    board[catId] = modules.map((mod) => {
      try {
        return Asset.fromModule(mod).uri;
      } catch {
        return '';
      }
    }).filter(Boolean);
  }
  return board;
}

/**
 * Copies bundled demo images into the document directory so the vision board
 * URI validation (which requires file:// paths in documentDirectory) passes.
 * Returns a VisionBoard map of categoryId -> [file:// URIs].
 * On web, falls back to buildDemoVisionBoardWeb() which uses asset URIs directly.
 */
export async function buildDemoVisionBoard(): Promise<VisionBoard> {
  // Web: FileSystem is not available, use asset URIs directly
  if (!FileSystem.documentDirectory) {
    return buildDemoVisionBoardWeb();
  }
  const board: VisionBoard = {};
  for (const [catId, modules] of Object.entries(DEMO_VISION_ASSETS)) {
    const uris: string[] = [];
    for (let i = 0; i < modules.length; i++) {
      try {
        const asset = Asset.fromModule(modules[i]);
        await asset.downloadAsync();
        const src = asset.localUri;
        if (!src) continue;
        const ext = asset.type ?? 'jpg';
        const dest = `${FileSystem.documentDirectory}demo_vision_${catId}_${i}.${ext}`;
        await FileSystem.copyAsync({ from: src, to: dest });
        uris.push(dest);
      } catch {
        // skip this image if copy fails
      }
    }
    board[catId] = uris;
  }
  return board;
}

// ─── Demo Alarm ───────────────────────────────────────────────────────────────

export const DEMO_ALARM: AlarmConfig = {
  hour: 7,
  minute: 30,
  days: [1, 2, 3, 4, 5, 6, 0],
  isEnabled: true,
  notificationIds: [],
};
