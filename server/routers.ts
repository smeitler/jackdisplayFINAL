import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";

const RatingEnum = z.enum(["none", "red", "yellow", "green"]);

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Categories / Goals ──────────────────────────────────────────────────────
  categories: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserCategories(ctx.user.id)
    ),

    upsert: protectedProcedure
      .input(z.object({
        clientId: z.string(),
        label: z.string().min(1).max(100),
        emoji: z.string().max(16),
        order: z.number().int(),
        lifeArea: z.string().max(32).optional().nullable(),
        deadline: z.string().max(10).optional().nullable(),
      }))
      .mutation(({ ctx, input }) =>
        db.upsertCategory({
          userId: ctx.user.id,
          clientId: input.clientId,
          label: input.label,
          emoji: input.emoji,
          order: input.order,
          lifeArea: input.lifeArea ?? null,
          deadline: input.deadline ?? null,
        })
      ),

    delete: protectedProcedure
      .input(z.object({ clientId: z.string() }))
      .mutation(({ ctx, input }) =>
        db.deleteCategoryByClientId(ctx.user.id, input.clientId)
      ),

    // Bulk sync: replace all categories for the user
    bulkSync: protectedProcedure
      .input(z.array(z.object({
        clientId: z.string(),
        label: z.string().min(1).max(100),
        emoji: z.string().max(16),
        order: z.number().int(),
        lifeArea: z.string().max(32).optional().nullable(),
        deadline: z.string().max(10).optional().nullable(),
      })))
      .mutation(({ ctx, input }) =>
        db.bulkUpsertCategories(ctx.user.id, input.map((c) => ({
          userId: ctx.user.id,
          clientId: c.clientId,
          label: c.label,
          emoji: c.emoji,
          order: c.order,
          lifeArea: c.lifeArea ?? null,
          deadline: c.deadline ?? null,
        })))
      ),
  }),

  // ─── Habits ──────────────────────────────────────────────────────────────────
  habits: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserHabits(ctx.user.id)
    ),

    upsert: protectedProcedure
      .input(z.object({
        clientId: z.string(),
        categoryClientId: z.string(),
        name: z.string().min(1).max(100),
        emoji: z.string().max(16).default("⭐"),
        description: z.string().max(500).optional().nullable(),
        isActive: z.boolean().default(true),
        weeklyGoal: z.number().int().min(1).max(7).optional().nullable(),
      }))
      .mutation(({ ctx, input }) =>
        db.upsertHabit({
          userId: ctx.user.id,
          clientId: input.clientId,
          categoryClientId: input.categoryClientId,
          name: input.name,
          emoji: input.emoji,
          description: input.description ?? null,
          isActive: input.isActive,
          weeklyGoal: input.weeklyGoal ?? null,
        })
      ),

    delete: protectedProcedure
      .input(z.object({ clientId: z.string() }))
      .mutation(({ ctx, input }) =>
        db.deleteHabitByClientId(ctx.user.id, input.clientId)
      ),

    bulkSync: protectedProcedure
      .input(z.array(z.object({
        clientId: z.string(),
        categoryClientId: z.string(),
        name: z.string().min(1).max(100),
        emoji: z.string().max(16).default("⭐"),
        description: z.string().max(500).optional().nullable(),
        isActive: z.boolean().default(true),
        weeklyGoal: z.number().int().min(1).max(7).optional().nullable(),
      })))
      .mutation(({ ctx, input }) =>
        db.bulkUpsertHabits(ctx.user.id, input.map((h) => ({
          userId: ctx.user.id,
          clientId: h.clientId,
          categoryClientId: h.categoryClientId,
          name: h.name,
          emoji: h.emoji,
          description: h.description ?? null,
          isActive: h.isActive,
          weeklyGoal: h.weeklyGoal ?? null,
        })))
      ),
  }),

  // ─── Check-ins ───────────────────────────────────────────────────────────────
  checkIns: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserCheckIns(ctx.user.id)
    ),

    upsert: protectedProcedure
      .input(z.object({
        habitClientId: z.string(),
        date: z.string().length(10), // YYYY-MM-DD
        rating: RatingEnum,
        loggedAt: z.string().optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.upsertCheckIn({
          userId: ctx.user.id,
          habitClientId: input.habitClientId,
          date: input.date,
          rating: input.rating,
          loggedAt: input.loggedAt ? new Date(input.loggedAt) : new Date(),
        })
      ),

    bulkSync: protectedProcedure
      .input(z.array(z.object({
        habitClientId: z.string(),
        date: z.string().length(10),
        rating: RatingEnum,
        loggedAt: z.string().optional(),
      })))
      .mutation(({ ctx, input }) =>
        db.bulkUpsertCheckIns(ctx.user.id, input.map((e) => ({
          userId: ctx.user.id,
          habitClientId: e.habitClientId,
          date: e.date,
          rating: e.rating,
          loggedAt: e.loggedAt ? new Date(e.loggedAt) : new Date(),
        })))
      ),

    deleteForHabit: protectedProcedure
      .input(z.object({ habitClientId: z.string() }))
      .mutation(({ ctx, input }) =>
        db.deleteCheckInsForHabit(ctx.user.id, input.habitClientId)
      ),
  }),

  // ─── Alarm ───────────────────────────────────────────────────────────────────
  alarm: router({
    get: protectedProcedure.query(({ ctx }) =>
      db.getUserAlarm(ctx.user.id)
    ),

    upsert: protectedProcedure
      .input(z.object({
        hour: z.number().int().min(0).max(23),
        minute: z.number().int().min(0).max(59),
        days: z.string().max(20), // comma-separated
        enabled: z.boolean(),
      }))
      .mutation(({ ctx, input }) =>
        db.upsertAlarm({
          userId: ctx.user.id,
          hour: input.hour,
          minute: input.minute,
          days: input.days,
          enabled: input.enabled,
        })
      ),
  }),
});

export type AppRouter = typeof appRouter;
