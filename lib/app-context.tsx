import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import { AppState as RNAppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  clearLocalData,
  getLastUserId,
  setLastUserId,
  getIsDemoMode,
  setDemoMode,
  saveVisionBoard,
  saveVisionMotivations,
  saveRewards,
} from './storage';
import { DEMO_CATEGORIES, DEMO_HABITS, DEMO_ALARM, buildDemoCheckIns, buildDemoVisionBoard, DEMO_MOTIVATIONS, DEMO_REWARDS } from './demo-data';
import { applyAlarm } from './notifications';
import { trpc } from './trpc';

// ─── State ────────────────────────────────────────────────────────────────────

type AppState = {
  habits: Habit[];
  categories: CategoryDef[];
  checkIns: CheckInEntry[];
  alarm: AlarmConfig;
  lastCheckInDate: string | null;
  isLoaded: boolean;
  isSyncing: boolean;
  isDemoMode: boolean;
};

type Action =
  | { type: 'LOADED'; habits: Habit[]; categories: CategoryDef[]; checkIns: CheckInEntry[]; alarm: AlarmConfig; lastCheckInDate: string | null }
  | { type: 'SET_DEMO_MODE'; isDemoMode: boolean }
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
    case 'SET_DEMO_MODE':
      return { ...state, isDemoMode: action.isDemoMode };
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
  isDemoMode: false,
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

function serverHabitToLocal(row: { clientId: string; categoryClientId: string; name: string; emoji: string; description?: string | null; isActive: boolean; order?: number | null; weeklyGoal?: number | null; frequencyType?: string | null; monthlyGoal?: number | null; createdAt: Date }): Habit {
  return {
    id: row.clientId,
    name: row.name,
    emoji: row.emoji,
    description: row.description ?? undefined,
    category: row.categoryClientId,
    isActive: row.isActive,
    order: row.order ?? 0,
    weeklyGoal: row.weeklyGoal ?? undefined,
    frequencyType: (row.frequencyType as import('@/lib/storage').FrequencyType | null) ?? undefined,
    monthlyGoal: row.monthlyGoal ?? undefined,
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

function serverAlarmToLocal(row: { hour: number; minute: number; days: string; enabled: boolean }, localAlarm?: AlarmConfig): AlarmConfig {
  // Preserve local-only fields (sound, meditation, requireCheckin, snooze) that are not synced to server
  return {
    hour: row.hour,
    minute: row.minute,
    days: row.days.split(',').map(Number),
    isEnabled: row.enabled,
    notificationIds: localAlarm?.notificationIds ?? [],
    soundId: localAlarm?.soundId,
    meditationId: localAlarm?.meditationId,
    requireCheckin: localAlarm?.requireCheckin,
    snoozeMinutes: localAlarm?.snoozeMinutes,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

type AppContextValue = AppState & {
  addHabit: (name: string, emoji: string, category: Category, description?: string, weeklyGoal?: number, frequencyType?: import('@/lib/storage').FrequencyType, monthlyGoal?: number, teamProposalId?: number, teamId?: number, rewardName?: string, rewardEmoji?: string, rewardDescription?: string, rewardImageUri?: string) => Promise<void>;
  updateHabit: (id: string, updates: Partial<Habit>) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  addCategory: (label: string, emoji: string, lifeArea?: LifeArea) => Promise<void>;
  updateCategory: (id: string, updates: Partial<CategoryDef>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (cats: CategoryDef[]) => Promise<void>;
  reorderHabits: (catId: string, habits: Habit[]) => Promise<void>;
  reorderAllHabits: (habits: Habit[]) => Promise<void>;
  submitCheckIn: (date: string, ratingsMap: Record<string, Rating>) => Promise<void>;
  updateAlarm: (config: AlarmConfig) => Promise<void>;
  isPendingCheckIn: boolean;
  activeHabits: Habit[];
  getEntriesForDate: (date: string) => CheckInEntry[];
  getRatingsForDate: (date: string) => Record<string, Rating>;
  getCategoryRate: (category: Category, days?: number) => number;
  getCategoryBreakdown: (category: Category, days?: number) => { green: number; yellow: number; red: number; none: number };
  getHabitWeeklyDone: (habitId: string) => number; // count of days this week (Mon-Sun) with green or yellow rating
  getHabitMonthlyDone: (habitId: string) => number; // count of days this calendar month with green or yellow rating
  getHabitLastWeekDone: (habitId: string) => number; // count of days last Mon-Sun week with green or yellow rating
  getHabitLastMonthDone: (habitId: string) => number; // count of days last calendar month with green or yellow rating
  getHabitWeekBeforeDone: (habitId: string) => number; // count of days 2 weeks ago (Mon-Sun) with green or yellow rating
  getHabitMonthBeforeDone: (habitId: string) => number; // count of days 2 months ago with green or yellow rating
  streak: number;
  startDemo: () => Promise<void>;
  exitDemo: () => Promise<void>;
  syncFromServer: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const isAuthenticated = useRef(false);

  // tRPC utils for imperative calls
  const utils = trpc.useUtils();

  // ── Load data on mount ─────────────────────────────────────────────────────
  const syncFromServer = useCallback(async () => {
    async function load() {
      // Reset auth state so we always re-validate with the current token.
      // This is critical when called after login — the previous session's
      // isAuthenticated.current value must not carry over.
      isAuthenticated.current = false;

      // 0. Check if demo mode is active — if so, skip server sync entirely
      const demoActive = await getIsDemoMode();
      if (demoActive) {
        const demoCheckIns = buildDemoCheckIns();
        const lastDate = demoCheckIns.map((e) => e.date).sort().pop() ?? null;
        dispatch({ type: 'LOADED', habits: DEMO_HABITS, categories: DEMO_CATEGORIES, checkIns: demoCheckIns, alarm: DEMO_ALARM, lastCheckInDate: lastDate });
        dispatch({ type: 'SET_DEMO_MODE', isDemoMode: true });
        return;
      }

      // 1. Load from local cache immediately for fast startup
      const [localHabits, localCategories, localCheckIns, localAlarm, lastCheckInDate] = await Promise.all([
        loadHabits(),
        loadCategories(),
        loadCheckIns(),
        loadAlarm(),
        getLastCheckInDate(),
      ]);
      dispatch({ type: 'LOADED', habits: localHabits, categories: localCategories, checkIns: localCheckIns, alarm: localAlarm, lastCheckInDate });

      // 2. Try to fetch server data — if it succeeds, user is authenticated
      dispatch({ type: 'SET_SYNCING', syncing: true });

      try {
        // Invalidate the tRPC cache so we always make fresh requests with the current token.
        // This is critical after login — without this, the cache may hold stale 401 errors.
        await utils.invalidate();

        // Fetch all user data from server in parallel.
        // staleTime: 0 forces a fresh network request, bypassing any cached results.
        // If the user is not authenticated, this will throw a 401/403 error.
        const [serverUser, serverCats, serverHabits, serverCheckIns, serverAlarm] = await Promise.all([
          utils.auth.me.fetch(),
          utils.categories.list.fetch(),
          utils.habits.list.fetch(),
          utils.checkIns.list.fetch(),
          utils.alarm.get.fetch(),
        ]);

        // If we reach here, the user is authenticated
        isAuthenticated.current = true;

        // ── Account-switch guard ────────────────────────────────────────────
        // If a different user logged in, wipe the previous user's local cache
        // so their data is never shown to the new account.
        let accountSwitched = false;
        if (serverUser) {
          const currentUserId = String(serverUser.id);
          const lastUserId = await getLastUserId();
          if (lastUserId !== null && lastUserId !== currentUserId) {
            console.log('[AppContext] Account switch detected — clearing local data for previous user');
            await clearLocalData();
            accountSwitched = true;
            // Reset in-memory state to empty defaults so the UI shows clean data
            // while we load the new user's server data below.
            dispatch({ type: 'LOADED', habits: [], categories: DEFAULT_CATEGORIES, checkIns: [], alarm: DEFAULT_ALARM, lastCheckInDate: null });
          }
          await setLastUserId(currentUserId);
        }

        // When an account switch occurred, localHabits/localCategories/localCheckIns
        // still hold the previous user's data in memory (loaded before the clear).
        // Use empty arrays so we never push stale data to the new account.
        const safeLocalCategories = accountSwitched ? DEFAULT_CATEGORIES : localCategories;
        const safeLocalHabits = accountSwitched ? [] : localHabits;
        const safeLocalCheckIns = accountSwitched ? [] : localCheckIns;
        const safeLocalAlarm = accountSwitched ? DEFAULT_ALARM : localAlarm;

        const isFirstLogin = serverCats.length === 0 && serverHabits.length === 0;

        if (isFirstLogin) {
          // First time this user logs in — push local data to server
          // Wrap in try/catch so a partial server failure doesn't prevent the UI from loading.
          try {
          await Promise.all([
            utils.client.categories.bulkSync.mutate(safeLocalCategories.map((c) => ({
              clientId: c.id,
              label: c.label,
              emoji: c.emoji,
              order: c.order,
              lifeArea: c.lifeArea ?? null,
              deadline: c.deadline ?? null,
            }))),
            utils.client.habits.bulkSync.mutate(safeLocalHabits.map((h) => ({
              clientId: h.id,
              categoryClientId: h.category,
              name: h.name,
              emoji: h.emoji,
              description: h.description ?? null,
              isActive: h.isActive,
              order: h.order,
              weeklyGoal: h.weeklyGoal ?? null,
            }))),
            utils.client.checkIns.bulkSync.mutate(safeLocalCheckIns.map((e) => ({
              habitClientId: e.habitId,
              date: e.date,
              rating: e.rating,
              loggedAt: e.loggedAt,
            }))),
          ]);
          // Alarm
          await utils.client.alarm.upsert.mutate({
            hour: safeLocalAlarm.hour,
            minute: safeLocalAlarm.minute,
            days: safeLocalAlarm.days.join(','),
            enabled: safeLocalAlarm.isEnabled,
          });
          // After pushing local data to server, dispatch LOADED so the UI
          // reflects the current data and isAuthenticated.current stays true
          // (it was set above at line 231 before reaching this branch).
          // Also persist to local cache so the next cold-start loads correctly.
          } catch (syncErr) {
            console.warn('[AppContext] First-login bulkSync failed (will retry on next sync):', syncErr);
          }
          const firstLoginDates = safeLocalCheckIns.map((e) => e.date).sort();
          const firstLoginLastDate = firstLoginDates.length > 0 ? firstLoginDates[firstLoginDates.length - 1] : null;
          dispatch({ type: 'LOADED', habits: safeLocalHabits, categories: safeLocalCategories, checkIns: safeLocalCheckIns, alarm: safeLocalAlarm, lastCheckInDate: firstLoginLastDate });
          await Promise.all([
            saveCategories(safeLocalCategories),
            saveHabits(safeLocalHabits),
            saveCheckIns(safeLocalCheckIns),
            saveAlarm(safeLocalAlarm),
          ]);
        } else {
          // Existing user — use server data as source of truth
          const cats = serverCats.map(serverCatToLocal);
          const habits = serverHabits.map(serverHabitToLocal);
          const serverCheckInsList = serverCheckIns.map(serverCheckInToLocal);
          const alarm = serverAlarm ? serverAlarmToLocal(serverAlarm, localAlarm) : localAlarm;

          // ── Push local-only check-ins to server ─────────────────────────────
          // If the user submitted check-ins while offline or before isAuthenticated
          // was set (e.g. immediately after sign-in), those entries are in local
          // storage but not on the server. Detect them and push the diff.
          const serverKeySet = new Set(
            serverCheckInsList.map((e) => `${e.habitId}|${e.date}`)
          );
          const safeLocalCheckIns = accountSwitched ? [] : localCheckIns;
          const localOnlyCheckIns = safeLocalCheckIns.filter(
            (e) => !serverKeySet.has(`${e.habitId}|${e.date}`)
          );
          if (localOnlyCheckIns.length > 0) {
            console.log(`[AppContext] Pushing ${localOnlyCheckIns.length} local-only check-ins to server`);
            try {
              await utils.client.checkIns.bulkSync.mutate(
                localOnlyCheckIns.map((e) => ({
                  habitClientId: e.habitId,
                  date: e.date,
                  rating: e.rating,
                  loggedAt: e.loggedAt,
                }))
              );
            } catch (err) {
              console.warn('[AppContext] Failed to push local-only check-ins:', err);
            }
          }

          // Merge: server is source of truth, but include local-only entries too
          const mergedCheckIns = [...serverCheckInsList, ...localOnlyCheckIns];

          // Compute lastCheckInDate from merged check-ins
          const dates = mergedCheckIns.map((e) => e.date).sort();
          const lastDate = dates.length > 0 ? dates[dates.length - 1] : null;

          dispatch({ type: 'LOADED', habits, categories: cats, checkIns: mergedCheckIns, alarm, lastCheckInDate: lastDate });

          // Update local cache
          await Promise.all([
            saveCategories(cats),
            saveHabits(habits),
            saveCheckIns(mergedCheckIns),
            saveAlarm(alarm),
          ]);
        }
      } catch (err: any) {
        // If the error is a 401/403 (not authenticated), silently fall back to local data
        const isAuthError = err?.data?.httpStatus === 401 || err?.data?.httpStatus === 403
          || err?.message?.includes('UNAUTHORIZED') || err?.message?.includes('FORBIDDEN');
        if (!isAuthError) {
          console.warn('[AppContext] Server sync failed, using local data:', err);
        }
        // isAuthenticated.current remains false — mutations will use local storage only
      } finally {
        dispatch({ type: 'SET_SYNCING', syncing: false });
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utils]);

  useEffect(() => {
    syncFromServer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Foreground resume sync ─────────────────────────────────────────────────
  // When the app comes back to the foreground, re-sync from the server so that
  // deletions/changes made on another device are reflected immediately.
  // A 5-second cooldown prevents hammering the server on quick app switches.
  const lastSyncTimeRef = useRef<number>(0);
  const SYNC_COOLDOWN_MS = 5_000;
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const now = Date.now();
        if (now - lastSyncTimeRef.current > SYNC_COOLDOWN_MS) {
          lastSyncTimeRef.current = now;
          syncFromServer();
        }
      }
    };
    const subscription = RNAppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncFromServer]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addHabit = useCallback(async (name: string, emoji: string, category: Category, description?: string, weeklyGoal?: number, frequencyType?: import('@/lib/storage').FrequencyType, monthlyGoal?: number, teamProposalId?: number, teamId?: number, rewardName?: string, rewardEmoji?: string, rewardDescription?: string, rewardImageUri?: string) => {
    const catHabits = state.habits.filter((h) => h.category === category);
    const newHabit: Habit = {
      id: `${category[0]}${Date.now()}`,
      name,
      emoji,
      description,
      category,
      isActive: true,
      order: catHabits.length,
      weeklyGoal,
      frequencyType,
      monthlyGoal,
      rewardName,
      rewardEmoji,
      rewardImageUri,
      rewardDescription,
      createdAt: new Date().toISOString(),
      ...(teamProposalId !== undefined ? { teamProposalId, teamId } : {}),
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
          order: newHabit.order,
          weeklyGoal: newHabit.weeklyGoal ?? null,
          frequencyType: newHabit.frequencyType ?? null,
          monthlyGoal: newHabit.monthlyGoal ?? null,
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
            order: habit.order,
            weeklyGoal: habit.weeklyGoal ?? null,
            frequencyType: habit.frequencyType ?? null,
            monthlyGoal: habit.monthlyGoal ?? null,
          });
        } catch (err) {
          console.warn('[AppContext] Failed to sync updated habit:', err);
        }
      }
    }
  }, [state.habits, utils]);

  const deleteHabit = useCallback(async (id: string) => {
    const habit = state.habits.find((h) => h.id === id);
    const updated = state.habits.filter((h) => h.id !== id);
    await Promise.all([saveHabits(updated), localDeleteCheckInsForHabit(id)]);
    const updatedCheckIns = state.checkIns.filter((e) => e.habitId !== id);
    await saveCheckIns(updatedCheckIns);
    dispatch({ type: 'SET_HABITS', habits: updated });
    dispatch({ type: 'SET_CHECKINS', checkIns: updatedCheckIns });

    if (isAuthenticated.current) {
      try {
        const deletions: Promise<any>[] = [
          utils.client.habits.delete.mutate({ clientId: id }),
          utils.client.checkIns.deleteForHabit.mutate({ habitClientId: id }),
        ];
        // If this habit came from a team proposal, reset the vote so the card shows Accept again
        if (habit?.teamProposalId && habit?.teamId) {
          deletions.push(
            utils.client.goalProposals.resetVote.mutate({
              proposalId: habit.teamProposalId,
              teamId: habit.teamId,
            })
          );
        }
        await Promise.all(deletions);
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
    // Find habits that belong to this category before filtering them out
    const habitsToDelete = state.habits.filter((h) => h.category === id);
    const updatedCats = state.categories.filter((c) => c.id !== id);
    const updatedHabits = state.habits.filter((h) => h.category !== id);
    await Promise.all([saveCategories(updatedCats), saveHabits(updatedHabits)]);
    dispatch({ type: 'SET_CATEGORIES', categories: updatedCats });
    dispatch({ type: 'SET_HABITS', habits: updatedHabits });

    if (isAuthenticated.current) {
      try {
        // Delete the category and all its habits from the server
        await Promise.all([
          utils.client.categories.delete.mutate({ clientId: id }),
          ...habitsToDelete.map((h) =>
            utils.client.habits.delete.mutate({ clientId: h.id })
          ),
        ]);
      } catch (err) {
        console.warn('[AppContext] Failed to sync category deletion:', err);
      }
    }
  }, [state.categories, state.habits, utils]);

  const reorderHabits = useCallback(async (catId: string, reorderedCatHabits: Habit[]) => {
    // Assign new order values within the category
    const reordered = reorderedCatHabits.map((h, i) => ({ ...h, order: i }));
    // Merge with habits from other categories
    const otherHabits = state.habits.filter((h) => h.category !== catId);
    const allHabits = [...otherHabits, ...reordered];
    await saveHabits(allHabits);
    dispatch({ type: 'SET_HABITS', habits: allHabits });

    if (isAuthenticated.current) {
      try {
        await utils.client.habits.reorder.mutate(
          reordered.map((h) => ({ clientId: h.id, order: h.order }))
        );
      } catch (err) {
        console.warn('[AppContext] Failed to sync reordered habits:', err);
      }
    }
  }, [state.habits, utils]);

  /** Reorder ALL active habits globally — assigns globalOrder 0, 1, 2... */
  const reorderAllHabits = useCallback(async (reorderedHabits: Habit[]) => {
    const idToGlobal: Record<string, number> = {};
    reorderedHabits.forEach((h, i) => { idToGlobal[h.id] = i; });
    const updated = state.habits.map((h) =>
      idToGlobal[h.id] !== undefined ? { ...h, globalOrder: idToGlobal[h.id] } : h
    );
    await saveHabits(updated);
    dispatch({ type: 'SET_HABITS', habits: updated });
  }, [state.habits]);

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

    // Keep existing ratings for this date that are NOT being overridden by the new submission.
    // This supports multiple check-ins per day: a second voice check-in only updates the habits
    // it explicitly mentions, leaving previously-rated habits untouched.
    const existingForDate = state.checkIns.filter((e) => e.date === date);
    const existingOtherDates = state.checkIns.filter((e) => e.date !== date);

    // Build a merged map: start with existing ratings for this date, then overlay new ones
    const mergedMap: Record<string, CheckInEntry> = {};
    for (const e of existingForDate) {
      mergedMap[e.habitId] = e;
    }
    // New ratings override existing ones for the same habit
    for (const id of activeIds) {
      const r = ratingsMap[id];
      if (r && r !== 'none') {
        mergedMap[id] = { date, habitId: id, rating: r as Rating, loggedAt: now };
      }
    }

    const newEntries = Object.values(mergedMap);
    const updated = [...existingOtherDates, ...newEntries];

    // Persist both check-ins and lastCheckIn date to AsyncStorage atomically
    await Promise.all([
      saveCheckIns(updated),
      AsyncStorage.setItem('daycheck:lastcheckin', date),
    ]);
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

  // Sort by globalOrder when set, otherwise fall back to per-category order
  const activeHabits = state.habits
    .filter((h) => h.isActive)
    .sort((a, b) => {
      const ag = a.globalOrder ?? 9999;
      const bg = b.globalOrder ?? 9999;
      if (ag !== bg) return ag - bg;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  // Only show pending check-in banner/gate if there are active habits to rate
  const isPendingCheckIn = activeHabits.length > 0 && !state.checkIns.some((e) => e.date === yesterdayString());

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

  // Count how many days in the current calendar month a habit was completed (green or yellow)
  const getHabitMonthlyDone = useCallback((habitId: string) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dateStr = toDateString(d);
      const entry = state.checkIns.find((e) => e.habitId === habitId && e.date === dateStr);
      if (entry && (entry.rating === 'green' || entry.rating === 'yellow')) count++;
    }
    return count;
  }, [state.checkIns]);

  // Count how many days in the current Mon-Sun week a habit was completed (green or yellow)
  const getHabitLastMonthDone = useCallback((habitId: string) => {
    const today = new Date();
    const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
    const month = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dateStr = toDateString(d);
      const entry = state.checkIns.find((e) => e.habitId === habitId && e.date === dateStr);
      if (entry && (entry.rating === 'green' || entry.rating === 'yellow')) count++;
    }
    return count;
  }, [state.checkIns]);

  const getHabitLastWeekDone = useCallback((habitId: string) => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + mondayOffset);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(thisMonday.getDate() - 7);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(lastMonday);
      d.setDate(lastMonday.getDate() + i);
      const dateStr = toDateString(d);
      const entry = state.checkIns.find((e) => e.habitId === habitId && e.date === dateStr);
      if (entry && (entry.rating === 'green' || entry.rating === 'yellow')) count++;
    }
    return count;
  }, [state.checkIns]);

  const getHabitWeeklyDone = useCallback((habitId: string) => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = toDateString(d);
      const entry = state.checkIns.find((e) => e.habitId === habitId && e.date === dateStr);
      if (entry && (entry.rating === 'green' || entry.rating === 'yellow')) count++;
    }
    return count;
  }, [state.checkIns]);

  const getHabitWeekBeforeDone = useCallback((habitId: string) => {
    // The week 2 weeks ago (Mon-Sun)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + mondayOffset);
    const weekBeforeMonday = new Date(thisMonday);
    weekBeforeMonday.setDate(thisMonday.getDate() - 14);
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekBeforeMonday);
      d.setDate(weekBeforeMonday.getDate() + i);
      const dateStr = toDateString(d);
      const entry = state.checkIns.find((e) => e.habitId === habitId && e.date === dateStr);
      if (entry && (entry.rating === 'green' || entry.rating === 'yellow')) count++;
    }
    return count;
  }, [state.checkIns]);

  const getHabitMonthBeforeDone = useCallback((habitId: string) => {
    // 2 calendar months ago
    const today = new Date();
    let year = today.getFullYear();
    let month = today.getMonth() - 2;
    if (month < 0) { month += 12; year -= 1; }
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dateStr = toDateString(d);
      const entry = state.checkIns.find((e) => e.habitId === habitId && e.date === dateStr);
      if (entry && (entry.rating === 'green' || entry.rating === 'yellow')) count++;
    }
    return count;
  }, [state.checkIns]);

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

  const startDemo = useCallback(async () => {
    await setDemoMode(true);
    const demoCheckIns = buildDemoCheckIns();
    const lastDate = demoCheckIns.map((e) => e.date).sort().pop() ?? null;
    dispatch({ type: 'LOADED', habits: DEMO_HABITS, categories: DEMO_CATEGORIES, checkIns: demoCheckIns, alarm: DEMO_ALARM, lastCheckInDate: lastDate });
    dispatch({ type: 'SET_DEMO_MODE', isDemoMode: true });
    // Seed vision board photos, motivations, and rewards for demo mode
    try {
      const [demoBoard] = await Promise.all([
        buildDemoVisionBoard(),
        saveVisionMotivations(DEMO_MOTIVATIONS),
        saveRewards(DEMO_REWARDS),
      ]);
      await saveVisionBoard(demoBoard);
    } catch {
      // non-critical — demo still works without vision board photos
    }
  }, []);

  const exitDemo = useCallback(async () => {
    await setDemoMode(false);
    // Reload real local data
    const [localHabits, localCategories, localCheckIns, localAlarm, lastCheckInDate] = await Promise.all([
      loadHabits(),
      loadCategories(),
      loadCheckIns(),
      loadAlarm(),
      getLastCheckInDate(),
    ]);
    dispatch({ type: 'LOADED', habits: localHabits, categories: localCategories, checkIns: localCheckIns, alarm: localAlarm, lastCheckInDate });
    dispatch({ type: 'SET_DEMO_MODE', isDemoMode: false });
  }, []);

  return (
    <AppContext.Provider value={{
      ...state,
      addHabit, updateHabit, deleteHabit,
      addCategory, updateCategory, deleteCategory, reorderCategories, reorderHabits, reorderAllHabits,
      submitCheckIn, updateAlarm,
      isPendingCheckIn, activeHabits,
      getEntriesForDate, getRatingsForDate,
      getCategoryRate, getCategoryBreakdown, getHabitWeeklyDone, getHabitMonthlyDone,
      getHabitLastWeekDone, getHabitLastMonthDone,
      getHabitWeekBeforeDone, getHabitMonthBeforeDone,
      streak,
      startDemo, exitDemo,
      syncFromServer,
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
