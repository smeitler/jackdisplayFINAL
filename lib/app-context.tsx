import React, { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
import {
  Habit, CheckInEntry, AlarmConfig,
  loadHabits, saveHabits,
  loadCheckIns,
  loadAlarm,
  submitCheckIn as storageSubmitCheckIn,
  getLastCheckInDate,
  yesterdayString,
  toDateString,
  DEFAULT_HABITS,
  Category,
} from './storage';
import { applyAlarm } from './notifications';

// ─── State ────────────────────────────────────────────────────────────────────

type AppState = {
  habits: Habit[];
  checkIns: CheckInEntry[];
  alarm: AlarmConfig;
  lastCheckInDate: string | null;
  isLoaded: boolean;
};

type Action =
  | { type: 'LOADED'; habits: Habit[]; checkIns: CheckInEntry[]; alarm: AlarmConfig; lastCheckInDate: string | null }
  | { type: 'SET_HABITS'; habits: Habit[] }
  | { type: 'SET_CHECKINS'; checkIns: CheckInEntry[] }
  | { type: 'SET_ALARM'; alarm: AlarmConfig }
  | { type: 'SET_LAST_CHECKIN'; date: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOADED':
      return { ...state, habits: action.habits, checkIns: action.checkIns, alarm: action.alarm, lastCheckInDate: action.lastCheckInDate, isLoaded: true };
    case 'SET_HABITS':
      return { ...state, habits: action.habits };
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
  checkIns: [],
  alarm: { hour: 8, minute: 0, days: [0,1,2,3,4,5,6], isEnabled: false, notificationIds: [] },
  lastCheckInDate: null,
  isLoaded: false,
};

// ─── Context ──────────────────────────────────────────────────────────────────

type AppContextValue = AppState & {
  addHabit: (name: string, category: Category) => Promise<void>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  submitCheckIn: (date: string, completedIds: string[]) => Promise<void>;
  updateAlarm: (config: AlarmConfig) => Promise<void>;
  /** Returns true if today's check-in (for yesterday) is pending */
  isPendingCheckIn: boolean;
  /** Active habits only */
  activeHabits: Habit[];
  /** Get check-in entries for a specific date */
  getEntriesForDate: (date: string) => CheckInEntry[];
  /** Completion rate (0–1) for a category over last N days */
  getCategoryRate: (category: Category, days?: number) => number;
  /** Overall streak (consecutive days with at least one check-in) */
  streak: number;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Load all data on mount
  useEffect(() => {
    async function load() {
      const [habits, checkIns, alarm, lastCheckInDate] = await Promise.all([
        loadHabits(),
        loadCheckIns(),
        loadAlarm(),
        getLastCheckInDate(),
      ]);
      dispatch({ type: 'LOADED', habits, checkIns, alarm, lastCheckInDate });
    }
    load();
  }, []);

  const addHabit = useCallback(async (name: string, category: Category) => {
    const newHabit: Habit = {
      id: `${category[0]}${Date.now()}`,
      name,
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
    await saveHabits(updated);
    dispatch({ type: 'SET_HABITS', habits: updated });
  }, [state.habits]);

  const submitCheckIn = useCallback(async (date: string, completedIds: string[]) => {
    const activeIds = state.habits.filter((h) => h.isActive).map((h) => h.id);
    await storageSubmitCheckIn(date, completedIds, activeIds);
    const updated = await import('./storage').then((m) => m.loadCheckIns());
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

  const getCategoryRate = useCallback((category: Category, days = 7) => {
    const habits = activeHabits.filter((h) => h.category === category);
    if (habits.length === 0) return 0;
    const habitIds = new Set(habits.map((h) => h.id));

    let totalPossible = 0;
    let totalCompleted = 0;

    for (let i = 1; i <= days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      const entries = state.checkIns.filter((e) => e.date === dateStr && habitIds.has(e.habitId));
      if (entries.length > 0) {
        totalPossible += habits.length;
        totalCompleted += entries.filter((e) => e.completed).length;
      }
    }

    return totalPossible === 0 ? 0 : totalCompleted / totalPossible;
  }, [activeHabits, state.checkIns]);

  // Streak: consecutive days (going back from yesterday) where at least 1 habit was checked in
  const streak = React.useMemo(() => {
    let count = 0;
    let i = 1;
    while (true) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toDateString(d);
      const entries = state.checkIns.filter((e) => e.date === dateStr && e.completed);
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
      submitCheckIn,
      updateAlarm,
      isPendingCheckIn,
      activeHabits,
      getEntriesForDate,
      getCategoryRate,
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
