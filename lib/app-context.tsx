import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import {
  Habit, CheckInEntry, AlarmConfig, Rating, CategoryDef, LifeArea,
  loadHabits, saveHabits,
  loadCheckIns, saveCheckIns,
  deleteCheckInsForHabit as localDeleteCheckInsForHabit,
  loadAlarm, saveAlarm,
  loadCategories, saveCategories,
  getLastCheckInDate,
  yesterdayString,
  toDateString,
  ratingScore,
  Category,
  DEFAULT_CATEGORIES,
  DEFAULT_HABITS,
  DEFAULT_ALARM,
} from './storage';
import { applyAlarm } from './notifications';
import { trpc } from './trpc';
import * as Auth from './_core/auth';

// ─── State ────────────────────────────────────────────────────────────────────

type AppState = {
  habits: Habit[];
  categories: CategoryDef[];
  checkIns: CheckInEntry[];
  alarm: AlarmConfig;
  lastCheckInDate: string | null;
  isLoaded: boolean;
  isSyncing: boolean;
};

type Action =
  | { type: 'LOADED'; habits: Habit[]; categories: CategoryDef[]; checkIns: CheckInEntry[]; alarm: AlarmConfig; lastCheckInDate: string | null }
  | { type: 'SET_HABITS'; habits: Habit[] }
  | { type: 'SET_CATEGORIES'; categories: CategoryDef[] }
  | { type: 'SET_CHECKINS'; checkIns: CheckInEntry[] }
  | { type: 'SET_ALARM'; alarm: AlarmConfig }
  | { type: 'SET_LAST_CHECKIN'; date: string }
  | { type: 'SET_SYNCING'; syncing: boolean };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOADED':
      return { ...state, habits: action.habits, categories: action.categories, checkIns: action.checkIns, alarm: action.alarm, lastCheckInDate: action.lastCheckInDate, isLoaded: true };
    case 'SET_HABITS':
      return { ...state, habits: action.habits };
    case 'SET_CATEGORIES':
      return { ...state, categories: action.categories };
    case 'SET_CHECKINS':
      return { ...state, checkIns: action.checkIns };
    case 'SET_ALARM':
      return { ...state, alarm: action.alarm };
    case 'SET_LAST_CHECKIN':
      return { ...state, lastCheckInDate: action.date };
    case 'SET_SYNCING':
      return { ...state, isSyncing: action.syncing };
    default:
      return state;
  }
}

const initialState: AppState = {
  habits: [],
  categories: DEFAULT_CATEGORIES,
  checkIns: [],
  alarm: DEFAULT_ALARM,
  lastCheckInDate: null,
  isLoaded: false,
  isSyncing: false,
};

// ─── Helpers: convert server rows → app types ─────────────────────────────────

function serverCatToLocal(row: { clientId: string; label: string; emoji: string; order: number; lifeArea?: string | null; deadline?: string | null }): CategoryDef {
  return {
    id: row.clientId,
    label: row.label,
    emoji: row.emoji,
    order: row.order,
    lifeArea: (row.lifeArea ?? undefined) as LifeArea | undefined,
    deadline: row.deadline ?? undefined,
  };
}

function serverHabitToLocal(row: { clientId: string; categoryClientId: string; name: string; emoji: string; description?: string | null; isActive: boolean; createdAt: Date }): Habit {
  return {
    id: row.clientId,
    name: row.name,
    emoji: row.emoji,
    description: row.description ?? undefined,
    category: row.categoryClientId,
    isActive: row.isActive,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

function serverCheckInToLocal(row: { habitClientId: string; date: string; rating: string; loggedAt: Date }): CheckInEntry {
  return {
    habitId: row.habitClientId,
    date: row.date,
    rating: row.rating as Rating,
    loggedAt: row.loggedAt instanceof Date ? row.loggedAt.toISOString() : String(row.loggedAt),
  };
}

function serverAlarmToLocal(row: { hour: number; minute: number; days: string; enabled: boolean }): AlarmConfig {
  return {
    hour: row.hour,
    minute: row.minute,
    days: row.days.split(',').map(Number),
    isEnabled: row.enabled,
    notificationIds: [],
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

type AppContextValue = AppState & {
  addHabit: (name: string, emoji: string, category: Category, description?: string) => Promise<void>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  addCategory: (label: string, emoji: string, lifeArea?: LifeArea) => Promise<void>;
  updateCategory: (id: string, updates: Partial<CategoryDef>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (cats: CategoryDef[]) => Promise<void>;
  submitCheckIn: (date: string, ratingsMap: Record<string, Rating>) => Promise<void>;
  updateAlarm: (config: AlarmConfig) => Promise<void>;
  isPendingCheckIn: boolean;
  activeHabits: Habit[];
  getEntriesForDate: (date: string) => CheckInEntry[];
  getRatingsForDate: (date: string) => Record<string, Rating>;
  getCategoryRate: (category: Category, days?: number) => number;
  getCategoryBreakdown: (category: Category, days?: number) => { green: number; yellow: number; red: number; none: number };
  streak: number;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const isAuthenticated = useRef(false);

  // tRPC utils for imperative calls
  const utils = trpc.useUtils();

  // ── Load data on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      // 1. Load from local cache immediately for fast startup
      const [localHabits, localCategories, localCheckIns, localAlarm, lastCheckInDate] = await Promise.all([
        loadHabits(),
        loadCategories(),
        loadCheckIns(),
        loadAlarm(),
        getLastCheckInDate(),
      ]);
      dispatch({ type: 'LOADED', habits: localHabits, categories: localCategories, checkIns: localCheckIns, alarm: localAlarm, lastCheckInDate });

      // 2. Check if user is authenticated; if so, sync with server
      const token = await Auth.getSessionToken();
      const user = await Auth.getUserInfo();
      if (!token && !user) return; // Not logged in — use local data only

      isAuthenticated.current = true;
      dispatch({ type: 'SET_SYNCING', syncing: true });

      try {
        // Fetch all user data from server in parallel
        const [serverCats, serverHabits, serverCheckIns, serverAlarm] = await Promise.all([
          utils.categories.list.fetch(),
          utils.habits.list.fetch(),
          utils.checkIns.list.fetch(),
          utils.alarm.get.fetch(),
        ]);

        const isFirstLogin = serverCats.length === 0 && serverHabits.length === 0;

        if (isFirstLogin) {
          // First time this user logs in — push local data to server
          await Promise.all([
            utils.client.categories.bulkSync.mutate(localCategories.map((c) => ({
              clientId: c.id,
              label: c.label,
              emoji: c.emoji,
              order: c.order,
              lifeArea: c.lifeArea ?? null,
              deadline: c.deadline ?? null,
            }))),
            utils.client.habits.bulkSync.mutate(localHabits.map((h) => ({
              clientId: h.id,
              categoryClientId: h.category,
              name: h.name,
              emoji: h.emoji,
              description: h.description ?? null,
              isActive: h.isActive,
            }))),
            utils.client.checkIns.bulkSync.mutate(localCheckIns.map((e) => ({
              habitClientId: e.habitId,
              date: e.date,
              rating: e.rating,
              loggedAt: e.loggedAt,
            }))),
          ]);
          // Alarm
          await utils.client.alarm.upsert.mutate({
            hour: localAlarm.hour,
            minute: localAlarm.minute,
            days: localAlarm.days.join(','),
            enabled: localAlarm.isEnabled,
          });
        } else {
          // Existing user — use server data as source of truth
          const cats = serverCats.map(serverCatToLocal);
          const habits = serverHabits.map(serverHabitToLocal);
          const checkIns = serverCheckIns.map(serverCheckInToLocal);
          const alarm = serverAlarm ? serverAlarmToLocal(serverAlarm) : localAlarm;

          // Compute lastCheckInDate from server check-ins
          const dates = checkIns.map((e) => e.date).sort();
          const lastDate = dates.length > 0 ? dates[dates.length - 1] : null;

          dispatch({ type: 'LOADED', habits, categories: cats, checkIns, alarm, lastCheckInDate: lastDate });

          // Update local cache
          await Promise.all([
            saveCategories(cats),
            saveHabits(habits),
            saveCheckIns(checkIns),
            saveAlarm(alarm),
          ]);
        }
      } catch (err) {
        console.warn('[AppContext] Server sync failed, using local data:', err);
      } finally {
        dispatch({ type: 'SET_SYNCING', syncing: false });
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addHabit = useCallback(async (name: string, emoji: string, category: Category, description?: string) => {
    const newHabit: Habit = {
      id: `${category[0]}${Date.now()}`,
      name,
      emoji,
      description,
      category,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const updated = [...state.habits, newHabit];
    await saveHabits(updated);
    dispatch({ type: 'SET_HABITS', habits: updated });

    if (isAuthenticated.current) {
      try {
        await utils.client.habits.upsert.mutate({
          clientId: newHabit.id,
          categoryClientId: newHabit.category,
          name: newHabit.name,
          emoji: newHabit.emoji,
          description: newHabit.description ?? null,
          isActive: newHabit.isActive,
        });
      } catch (err) {
        console.warn('[AppContext] Failed to sync new habit:', err);
      }
    }
  }, [state.habits, utils]);

  const updateHabit = useCallback(async (id: string, updates: Partial<Habit>) => {
    const updated = state.habits.map((h) => h.id === id ? { ...h, ...updates } : h);
    await saveHabits(updated);
    dispatch({ type: 'SET_HABITS', habits: updated });

    if (isAuthenticated.current) {
      const habit = updated.find((h) => h.id === id);
      if (habit) {
        try {
          await utils.client.habits.upsert.mutate({
            clientId: habit.id,
            categoryClientId: habit.category,
            name: habit.name,
            emoji: habit.emoji,
            description: habit.description ?? null,
            isActive: habit.isActive,
          });
        } catch (err) {
          console.warn('[AppContext] Failed to sync updated habit:', err);
        }
      }
    }
  }, [state.habits, utils]);

  const deleteHabit = useCallback(async (id: string) => {
    const updated = state.habits.filter((h) => h.id !== id);
    await Promise.all([saveHabits(updated), localDeleteCheckInsForHabit(id)]);
    const updatedCheckIns = state.checkIns.filter((e) => e.habitId !== id);
    await saveCheckIns(updatedCheckIns);
    dispatch({ type: 'SET_HABITS', habits: updated });
    dispatch({ type: 'SET_CHECKINS', checkIns: updatedCheckIns });

    if (isAuthenticated.current) {
      try {
        await Promise.all([
          utils.client.habits.delete.mutate({ clientId: id }),
          utils.client.checkIns.deleteForHabit.mutate({ habitClientId: id }),
        ]);
      } catch (err) {
        console.warn('[AppContext] Failed to sync habit deletion:', err);
      }
    }
  }, [state.habits, state.checkIns, utils]);

  const addCategory = useCallback(async (label: string, emoji: string, lifeArea?: LifeArea) => {
    const newCat: CategoryDef = {
      id: `custom_${Date.now()}`,
      label,
      emoji,
      order: state.categories.length,
      lifeArea,
    };
    const updated = [...state.categories, newCat];
    await saveCategories(updated);
    dispatch({ type: 'SET_CATEGORIES', categories: updated });

    if (isAuthenticated.current) {
      try {
        await utils.client.categories.upsert.mutate({
          clientId: newCat.id,
          label: newCat.label,
          emoji: newCat.emoji,
          order: newCat.order,
          lifeArea: newCat.lifeArea ?? null,
          deadline: newCat.deadline ?? null,
        });
      } catch (err) {
        console.warn('[AppContext] Failed to sync new category:', err);
      }
    }
  }, [state.categories, utils]);

  const updateCategory = useCallback(async (id: string, updates: Partial<CategoryDef>) => {
    const updated = state.categories.map((c) => c.id === id ? { ...c, ...updates } : c);
    await saveCategories(updated);
    dispatch({ type: 'SET_CATEGORIES', categories: updated });

    if (isAuthenticated.current) {
      const cat = updated.find((c) => c.id === id);
      if (cat) {
        try {
          await utils.client.categories.upsert.mutate({
            clientId: cat.id,
            label: cat.label,
            emoji: cat.emoji,
            order: cat.order,
            lifeArea: cat.lifeArea ?? null,
            deadline: cat.deadline ?? null,
          });
        } catch (err) {
          console.warn('[AppContext] Failed to sync updated category:', err);
        }
      }
    }
  }, [state.categories, utils]);

  const deleteCategory = useCallback(async (id: string) => {
    const updatedCats = state.categories.filter((c) => c.id !== id);
    const updatedHabits = state.habits.filter((h) => h.category !== id);
    await Promise.all([saveCategories(updatedCats), saveHabits(updatedHabits)]);
    dispatch({ type: 'SET_CATEGORIES', categories: updatedCats });
    dispatch({ type: 'SET_HABITS', habits: updatedHabits });

    if (isAuthenticated.current) {
      try {
        await utils.client.categories.delete.mutate({ clientId: id });
      } catch (err) {
        console.warn('[AppContext] Failed to sync category deletion:', err);
      }
    }
  }, [state.categories, state.habits, utils]);

  const reorderCategories = useCallback(async (cats: CategoryDef[]) => {
    const reordered = cats.map((c, i) => ({ ...c, order: i }));
    await saveCategories(reordered);
    dispatch({ type: 'SET_CATEGORIES', categories: reordered });

    if (isAuthenticated.current) {
      try {
        await utils.client.categories.bulkSync.mutate(reordered.map((c) => ({
          clientId: c.id,
          label: c.label,
          emoji: c.emoji,
          order: c.order,
          lifeArea: c.lifeArea ?? null,
          deadline: c.deadline ?? null,
        })));
      } catch (err) {
        console.warn('[AppContext] Failed to sync reordered categories:', err);
      }
    }
  }, [utils]);

  const submitCheckIn = useCallback(async (date: string, ratingsMap: Record<string, Rating>) => {
    const activeIds = state.habits.filter((h) => h.isActive).map((h) => h.id);
    const now = new Date().toISOString();

    // Build new entries (skip 'none')
    const newEntries: CheckInEntry[] = activeIds
      .filter((id) => ratingsMap[id] && ratingsMap[id] !== 'none')
      .map((id) => ({ date, habitId: id, rating: ratingsMap[id] as Rating, loggedAt: now }));

    // Merge with existing (remove old entries for this date)
    const existing = state.checkIns.filter((e) => e.date !== date);
    const updated = [...existing, ...newEntries];

    await saveCheckIns(updated);
    dispatch({ type: 'SET_CHECKINS', checkIns: updated });
    dispatch({ type: 'SET_LAST_CHECKIN', date });

    if (isAuthenticated.current) {
      try {
        await utils.client.checkIns.bulkSync.mutate(newEntries.map((e) => ({
          habitClientId: e.habitId,
          date: e.date,
          rating: e.rating,
          loggedAt: e.loggedAt,
        })));
      } catch (err) {
        console.warn('[AppContext] Failed to sync check-ins:', err);
      }
    }
  }, [state.habits, state.checkIns, utils]);

  const updateAlarm = useCallback(async (config: AlarmConfig) => {
    const applied = await applyAlarm(config);
    dispatch({ type: 'SET_ALARM', alarm: applied });

    if (isAuthenticated.current) {
      try {
        await utils.client.alarm.upsert.mutate({
          hour: applied.hour,
          minute: applied.minute,
          days: applied.days.join(','),
          enabled: applied.isEnabled,
        });
      } catch (err) {
        console.warn('[AppContext] Failed to sync alarm:', err);
      }
    }
  }, [utils]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const activeHabits = state.habits.filter((h) => h.isActive);
  const isPendingCheckIn = state.lastCheckInDate !== yesterdayString();

  const getEntriesForDate = useCallback((date: string) =>
    state.checkIns.filter((e) => e.date === date),
  [state.checkIns]);

  const getRatingsForDate = useCallback((date: string): Record<string, Rating> => {
    const map: Record<string, Rating> = {};
    for (const e of state.checkIns.filter((e) => e.date === date)) {
      map[e.habitId] = e.rating;
    }
    return map;
  }, [state.checkIns]);

  const getCategoryRate = useCallback((category: Category, days = 7) => {
    const habits = activeHabits.filter((h) => h.category === category);
    if (habits.length === 0) return 0;
    const habitIds = new Set(habits.map((h) => h.id));
    let totalWeight = 0, totalScore = 0;
    for (let i = 1; i <= days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      for (const entry of state.checkIns.filter((e) => e.date === dateStr && habitIds.has(e.habitId))) {
        const score = ratingScore(entry.rating);
        if (score !== null) { totalWeight++; totalScore += score; }
      }
    }
    return totalWeight === 0 ? 0 : totalScore / totalWeight;
  }, [activeHabits, state.checkIns]);

  const getCategoryBreakdown = useCallback((category: Category, days = 7) => {
    const habits = activeHabits.filter((h) => h.category === category);
    const habitIds = new Set(habits.map((h) => h.id));
    const counts = { green: 0, yellow: 0, red: 0, none: 0 };
    for (let i = 1; i <= days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      for (const entry of state.checkIns.filter((e) => e.date === dateStr && habitIds.has(e.habitId))) {
        counts[entry.rating] = (counts[entry.rating] ?? 0) + 1;
      }
    }
    return counts;
  }, [activeHabits, state.checkIns]);

  const streak = React.useMemo(() => {
    let count = 0, i = 1;
    while (true) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      if (state.checkIns.filter((e) => e.date === dateStr && e.rating !== 'none').length === 0) break;
      count++; i++;
      if (i > 365) break;
    }
    return count;
  }, [state.checkIns]);

  return (
    <AppContext.Provider value={{
      ...state,
      addHabit, updateHabit, deleteHabit,
      addCategory, updateCategory, deleteCategory, reorderCategories,
      submitCheckIn, updateAlarm,
      isPendingCheckIn, activeHabits,
      getEntriesForDate, getRatingsForDate,
      getCategoryRate, getCategoryBreakdown,
      streak,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
