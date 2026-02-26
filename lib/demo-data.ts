/**
 * Demo Mode data — rich pre-seeded goals, habits, and 30 days of check-in history.
 * Used by Apple App Store reviewers and curious users who don't want to create an account.
 */

import { CategoryDef, Habit, CheckInEntry, AlarmConfig, Rating } from './storage';

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

// ─── Demo Alarm ───────────────────────────────────────────────────────────────

export const DEMO_ALARM: AlarmConfig = {
  hour: 7,
  minute: 30,
  days: [1, 2, 3, 4, 5, 6, 0],
  isEnabled: true,
  notificationIds: [],
};
