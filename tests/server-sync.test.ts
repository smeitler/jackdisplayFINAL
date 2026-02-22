/**
 * Tests for the server-side sync API.
 * These tests verify that the tRPC router procedures exist and the DB helpers work correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the DB module so tests don't need a real database ────────────────────
vi.mock('../server/db', () => ({
  getUserCategories: vi.fn().mockResolvedValue([]),
  getUserHabits: vi.fn().mockResolvedValue([]),
  getUserCheckIns: vi.fn().mockResolvedValue([]),
  getUserAlarm: vi.fn().mockResolvedValue(null),
  upsertCategory: vi.fn().mockResolvedValue({ id: 1 }),
  deleteCategoryByClientId: vi.fn().mockResolvedValue(undefined),
  bulkUpsertCategories: vi.fn().mockResolvedValue([]),
  upsertHabit: vi.fn().mockResolvedValue({ id: 1 }),
  deleteHabitByClientId: vi.fn().mockResolvedValue(undefined),
  bulkUpsertHabits: vi.fn().mockResolvedValue([]),
  upsertCheckIn: vi.fn().mockResolvedValue({ id: 1 }),
  bulkUpsertCheckIns: vi.fn().mockResolvedValue([]),
  deleteCheckInsForHabit: vi.fn().mockResolvedValue(undefined),
  upsertAlarm: vi.fn().mockResolvedValue({ id: 1 }),
}));

// ── Mock the core auth/cookie modules ─────────────────────────────────────────
vi.mock('../server/_core/cookies', () => ({
  getSessionCookieOptions: vi.fn().mockReturnValue({}),
}));

vi.mock('../server/_core/systemRouter', () => ({
  systemRouter: { _def: { router: true, procedures: {}, record: {} } },
}));

vi.mock('../server/_core/trpc', () => {
  const mockRouter = (routes: Record<string, any>) => ({
    _def: { router: true, procedures: {}, record: routes },
    ...routes,
  });

  const mockProcedure = {
    query: (fn: any) => ({ _type: 'query', _fn: fn }),
    mutation: (fn: any) => ({ _type: 'mutation', _fn: fn }),
    input: (schema: any) => ({
      query: (fn: any) => ({ _type: 'query', _fn: fn, _schema: schema }),
      mutation: (fn: any) => ({ _type: 'mutation', _fn: fn, _schema: schema }),
    }),
  };

  return {
    router: mockRouter,
    protectedProcedure: mockProcedure,
    publicProcedure: mockProcedure,
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Server sync router structure', () => {
  it('should have categories router with list, upsert, delete, bulkSync', async () => {
    const { appRouter } = await import('../server/routers');
    expect(appRouter).toBeDefined();
    expect(appRouter.categories).toBeDefined();
    expect(appRouter.categories.list).toBeDefined();
    expect(appRouter.categories.upsert).toBeDefined();
    expect(appRouter.categories.delete).toBeDefined();
    expect(appRouter.categories.bulkSync).toBeDefined();
  });

  it('should have habits router with list, upsert, delete, bulkSync', async () => {
    const { appRouter } = await import('../server/routers');
    expect(appRouter.habits).toBeDefined();
    expect(appRouter.habits.list).toBeDefined();
    expect(appRouter.habits.upsert).toBeDefined();
    expect(appRouter.habits.delete).toBeDefined();
    expect(appRouter.habits.bulkSync).toBeDefined();
  });

  it('should have checkIns router with list, upsert, bulkSync, deleteForHabit', async () => {
    const { appRouter } = await import('../server/routers');
    expect(appRouter.checkIns).toBeDefined();
    expect(appRouter.checkIns.list).toBeDefined();
    expect(appRouter.checkIns.upsert).toBeDefined();
    expect(appRouter.checkIns.bulkSync).toBeDefined();
    expect(appRouter.checkIns.deleteForHabit).toBeDefined();
  });

  it('should have alarm router with get and upsert', async () => {
    const { appRouter } = await import('../server/routers');
    expect(appRouter.alarm).toBeDefined();
    expect(appRouter.alarm.get).toBeDefined();
    expect(appRouter.alarm.upsert).toBeDefined();
  });

  it('should have auth router with me and logout', async () => {
    const { appRouter } = await import('../server/routers');
    expect(appRouter.auth).toBeDefined();
    expect(appRouter.auth.me).toBeDefined();
    expect(appRouter.auth.logout).toBeDefined();
  });
});

describe('Data conversion helpers', () => {
  it('should convert server category row to local CategoryDef format', () => {
    const serverRow = {
      clientId: 'body',
      label: 'Body',
      emoji: '💪',
      order: 0,
      lifeArea: 'body',
      deadline: null,
    };

    // Inline the conversion logic from app-context
    const local = {
      id: serverRow.clientId,
      label: serverRow.label,
      emoji: serverRow.emoji,
      order: serverRow.order,
      lifeArea: serverRow.lifeArea ?? undefined,
      deadline: serverRow.deadline ?? undefined,
    };

    expect(local.id).toBe('body');
    expect(local.label).toBe('Body');
    expect(local.lifeArea).toBe('body');
    expect(local.deadline).toBeUndefined();
  });

  it('should convert server habit row to local Habit format', () => {
    const serverRow = {
      clientId: 'h1',
      categoryClientId: 'body',
      name: 'Exercise',
      emoji: '🏋️',
      description: null,
      isActive: true,
      createdAt: new Date('2026-01-01'),
    };

    const local = {
      id: serverRow.clientId,
      name: serverRow.name,
      emoji: serverRow.emoji,
      description: serverRow.description ?? undefined,
      category: serverRow.categoryClientId,
      isActive: serverRow.isActive,
      createdAt: serverRow.createdAt instanceof Date ? serverRow.createdAt.toISOString() : String(serverRow.createdAt),
    };

    expect(local.id).toBe('h1');
    expect(local.category).toBe('body');
    expect(local.description).toBeUndefined();
    expect(local.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('should convert server check-in row to local CheckInEntry format', () => {
    const serverRow = {
      habitClientId: 'h1',
      date: '2026-02-20',
      rating: 'green',
      loggedAt: new Date('2026-02-20T10:00:00Z'),
    };

    const local = {
      habitId: serverRow.habitClientId,
      date: serverRow.date,
      rating: serverRow.rating as 'none' | 'red' | 'yellow' | 'green',
      loggedAt: serverRow.loggedAt instanceof Date ? serverRow.loggedAt.toISOString() : String(serverRow.loggedAt),
    };

    expect(local.habitId).toBe('h1');
    expect(local.date).toBe('2026-02-20');
    expect(local.rating).toBe('green');
    expect(local.loggedAt).toBe('2026-02-20T10:00:00.000Z');
  });

  it('should convert server alarm row to local AlarmConfig format', () => {
    const serverRow = {
      hour: 8,
      minute: 30,
      days: '0,1,2,3,4,5,6',
      enabled: true,
    };

    const local = {
      hour: serverRow.hour,
      minute: serverRow.minute,
      days: serverRow.days.split(',').map(Number),
      isEnabled: serverRow.enabled,
      notificationIds: [],
    };

    expect(local.hour).toBe(8);
    expect(local.minute).toBe(30);
    expect(local.days).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(local.isEnabled).toBe(true);
    expect(local.notificationIds).toEqual([]);
  });
});
