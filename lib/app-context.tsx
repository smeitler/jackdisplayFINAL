import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import {
  Habit, CheckInEntry, AlarmConfig, Rating, CategoryDef,
  loadHabits, saveHabits,
  loadCheckIns, saveCheckIns,
  deleteCheckInsForHabit, countCheckInsForHabit,
  loadAlarm,
  loadCategories, saveCategories,
  submitCheckIn as storageSubmitCheckIn,
  getLastCheckInDate,
  yesterdayString,
  toDateString,
  ratingScore,
  Category,
  DEFAULT_CATEGORIES,
} from './storage';
import { applyAlarm } from './notifications';

// ─── State ────────────────────────────────────────────────────────────────────

type AppState = {
  habits: Habit[];
  categories: CategoryDef[];
  checkIns: CheckInEntry[];
  alarm: AlarmConfig;
  lastCheckInDate: string | null;
  isLoaded: boolean;
};

type Action =
  | { type: 'LOADED'; habits: Habit[]; categories: CategoryDef[]; checkIns: CheckInEntry[]; alarm: AlarmConfig; lastCheckInDate: string | null }
  | { type: 'SET_HABITS'; habits: Habit[] }
  | { type: 'SET_CATEGORIES'; categories: CategoryDef[] }
  | { type: 'SET_CHECKINS'; checkIns: CheckInEntry[] }
  | { type: 'SET_ALARM'; alarm: AlarmConfig }
  | { type: 'SET_LAST_CHECKIN'; date: string };

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
    default:
      return state;
  }
}

const initialState: AppState = {
  habits: [],
  categories: DEFAULT_CATEGORIES,
  checkIns: [],
  alarm: { hour: 8, minute: 0, days: [0,1,2,3,4,5,6], isEnabled: false, notificationIds: [] },
  lastCheckInDate: null,
  isLoaded: false,
};

// ─── Context ──────────────────────────────────────────────────────────────────

type AppContextValue = AppState & {
  addHabit: (name: string, emoji: string, category: Category, description?: string) => Promise<void>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  addCategory: (label: string, emoji: string) => Promise<void>;
  updateCategory: (id: string, updates: Partial<CategoryDef>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (cats: CategoryDef[]) => Promise<void>;
  /** Submit ratings for a date. ratingsMap: { habitId -> Rating } */
  submitCheckIn: (date: string, ratingsMap: Record<string, Rating>) => Promise<void>;
  updateAlarm: (config: AlarmConfig) => Promise<void>;
  /** Returns true if yesterday's check-in is still pending */
  isPendingCheckIn: boolean;
  /** Active habits only */
  activeHabits: Habit[];
  /** Get check-in entries for a specific date */
  getEntriesForDate: (date: string) => CheckInEntry[];
  /** Get ratings map for a date: { habitId -> Rating } */
  getRatingsForDate: (date: string) => Record<string, Rating>;
  /** Weighted completion rate (0–1) for a category over last N days */
  getCategoryRate: (category: Category, days?: number) => number;
  /** Per-rating breakdown for a category over last N days */
  getCategoryBreakdown: (category: Category, days?: number) => { green: number; yellow: number; red: number; none: number };
  /** Overall streak (consecutive days with at least one rated habit) */
  streak: number;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    async function load() {
      const [habits, categories, checkIns, alarm, lastCheckInDate] = await Promise.all([
        loadHabits(),
        loadCategories(),
        loadCheckIns(),
        loadAlarm(),
        getLastCheckInDate(),
      ]);
      dispatch({ type: 'LOADED', habits, categories, checkIns, alarm, lastCheckInDate });
    }
    load();
  }, []);

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
  }, [state.habits]);

  const updateHabit = useCallback(async (id: string, updates: Partial<Habit>) => {
    const updated = state.habits.map((h) => h.id === id ? { ...h, ...updates } : h);
    await saveHabits(updated);
    dispatch({ type: 'SET_HABITS', habits: updated });
  }, [state.habits]);

  const deleteHabit = useCallback(async (id: string) => {
    const updated = state.habits.filter((h) => h.id !== id);
    // Also purge all check-in history for this habit
    await Promise.all([saveHabits(updated), deleteCheckInsForHabit(id)]);
    const updatedCheckIns = await loadCheckIns();
    dispatch({ type: 'SET_HABITS', habits: updated });
    dispatch({ type: 'SET_CHECKINS', checkIns: updatedCheckIns });
  }, [state.habits]);

  const addCategory = useCallback(async (label: string, emoji: string) => {
    const newCat: CategoryDef = {
      id: `custom_${Date.now()}`,
      label,
      emoji,
      order: state.categories.length,
    };
    const updated = [...state.categories, newCat];
    await saveCategories(updated);
    dispatch({ type: 'SET_CATEGORIES', categories: updated });
  }, [state.categories]);

  const updateCategory = useCallback(async (id: string, updates: Partial<CategoryDef>) => {
    const updated = state.categories.map((c) => c.id === id ? { ...c, ...updates } : c);
    await saveCategories(updated);
    dispatch({ type: 'SET_CATEGORIES', categories: updated });
  }, [state.categories]);

  const deleteCategory = useCallback(async (id: string) => {
    // Remove category and all its habits
    const updatedCats = state.categories.filter((c) => c.id !== id);
    const updatedHabits = state.habits.filter((h) => h.category !== id);
    await Promise.all([saveCategories(updatedCats), saveHabits(updatedHabits)]);
    dispatch({ type: 'SET_CATEGORIES', categories: updatedCats });
    dispatch({ type: 'SET_HABITS', habits: updatedHabits });
  }, [state.categories, state.habits]);

  const reorderCategories = useCallback(async (cats: CategoryDef[]) => {
    const reordered = cats.map((c, i) => ({ ...c, order: i }));
    await saveCategories(reordered);
    dispatch({ type: 'SET_CATEGORIES', categories: reordered });
  }, []);

  const submitCheckIn = useCallback(async (date: string, ratingsMap: Record<string, Rating>) => {
    const activeIds = state.habits.filter((h) => h.isActive).map((h) => h.id);
    await storageSubmitCheckIn(date, ratingsMap, activeIds);
    const updated = await loadCheckIns();
    dispatch({ type: 'SET_CHECKINS', checkIns: updated });
    dispatch({ type: 'SET_LAST_CHECKIN', date });
  }, [state.habits]);

  const updateAlarm = useCallback(async (config: AlarmConfig) => {
    const applied = await applyAlarm(config);
    dispatch({ type: 'SET_ALARM', alarm: applied });
  }, []);

  const activeHabits = state.habits.filter((h) => h.isActive);

  const isPendingCheckIn = state.lastCheckInDate !== yesterdayString();

  const getEntriesForDate = useCallback((date: string) => {
    return state.checkIns.filter((e) => e.date === date);
  }, [state.checkIns]);

  const getRatingsForDate = useCallback((date: string): Record<string, Rating> => {
    const entries = state.checkIns.filter((e) => e.date === date);
    const map: Record<string, Rating> = {};
    for (const e of entries) {
      map[e.habitId] = e.rating;
    }
    return map;
  }, [state.checkIns]);

  const getCategoryRate = useCallback((category: Category, days = 7) => {
    const habits = activeHabits.filter((h) => h.category === category);
    if (habits.length === 0) return 0;
    const habitIds = new Set(habits.map((h) => h.id));

    let totalWeight = 0;
    let totalScore = 0;

    for (let i = 1; i <= days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      const entries = state.checkIns.filter((e) => e.date === dateStr && habitIds.has(e.habitId));
      for (const entry of entries) {
        const score = ratingScore(entry.rating);
        if (score !== null) {
          totalWeight += 1;
          totalScore += score;
        }
      }
    }

    return totalWeight === 0 ? 0 : totalScore / totalWeight;
  }, [activeHabits, state.checkIns]);

  const getCategoryBreakdown = useCallback((category: Category, days = 7) => {
    const habits = activeHabits.filter((h) => h.category === category);
    const habitIds = new Set(habits.map((h) => h.id));
    const counts = { green: 0, yellow: 0, red: 0, none: 0 };

    for (let i = 1; i <= days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      const entries = state.checkIns.filter((e) => e.date === dateStr && habitIds.has(e.habitId));
      for (const entry of entries) {
        counts[entry.rating] = (counts[entry.rating] ?? 0) + 1;
      }
    }
    return counts;
  }, [activeHabits, state.checkIns]);

  const streak = React.useMemo(() => {
    let count = 0;
    let i = 1;
    while (true) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      const entries = state.checkIns.filter((e) => e.date === dateStr && e.rating !== 'none');
      if (entries.length === 0) break;
      count++;
      i++;
      if (i > 365) break;
    }
    return count;
  }, [state.checkIns]);

  return (
    <AppContext.Provider value={{
      ...state,
      addHabit,
      updateHabit,
      deleteHabit,
      addCategory,
      updateCategory,
      deleteCategory,
      reorderCategories,
      submitCheckIn,
      updateAlarm,
      isPendingCheckIn,
      activeHabits,
      getEntriesForDate,
      getRatingsForDate,
      getCategoryRate,
      getCategoryBreakdown,
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
