import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { VOICES, generateAndStoreAudio } from "./audioService";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { markOpenIdAsDeleted } from "./_core/sdk";
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
    /**
     * Permanently delete the authenticated user's account and all associated data.
     * Required by Apple App Store guidelines (apps with user accounts must offer in-app deletion).
     */
    deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
      const userId = ctx.user.id;
      const openId = ctx.user.openId;
      // Mark openId as deleted FIRST — prevents auth middleware from
      // re-creating this user on any subsequent request with the same token
      markOpenIdAsDeleted(openId);
      // Clear the session cookie
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      // Delete all user data from the database
      await db.deleteUser(userId);
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
        order: z.number().int().min(0).default(0),
        weeklyGoal: z.number().int().min(1).max(7).optional().nullable(),
        frequencyType: z.string().max(16).optional().nullable(),
        monthlyGoal: z.number().int().min(1).max(31).optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.upsertHabit({
          userId: ctx.user.id,
          clientId: input.clientId,
          categoryClientId: input.categoryClientId,
          name: input.name,
          emoji: input.emoji,
          description: input.description ?? null,
          isActive: input.isActive,
          order: input.order,
          weeklyGoal: input.weeklyGoal ?? null,
          frequencyType: input.frequencyType ?? null,
          monthlyGoal: input.monthlyGoal ?? null,
        });
        await db.bumpScheduleVersionForUser(ctx.user.id).catch(() => {});
      }),

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
        order: z.number().int().min(0).default(0),
        weeklyGoal: z.number().int().min(1).max(7).optional().nullable(),
        frequencyType: z.string().max(16).optional().nullable(),
        monthlyGoal: z.number().int().min(1).max(31).optional().nullable(),
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
          order: h.order,
          weeklyGoal: h.weeklyGoal ?? null,
          frequencyType: h.frequencyType ?? null,
          monthlyGoal: h.monthlyGoal ?? null,
        })))
      ),

    reorder: protectedProcedure
      .input(z.array(z.object({ clientId: z.string(), order: z.number().int().min(0) })))
      .mutation(async ({ ctx, input }) => {
        for (const item of input) {
          await db.updateHabitOrder(ctx.user.id, item.clientId, item.order);
        }
      }),
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
      .mutation(async ({ ctx, input }) => {
        await db.upsertAlarm({
          userId: ctx.user.id,
          hour: input.hour,
          minute: input.minute,
          days: input.days,
          enabled: input.enabled,
        });
        await db.bumpScheduleVersionForUser(ctx.user.id).catch(() => {});
      }),
  }),

  // ─── Community: Teams ────────────────────────────────────────────────────────
  teams: router({
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserTeams(ctx.user.id)
    ),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.createTeam({ name: input.name, description: input.description, creatorId: ctx.user.id })
      ),
    join: protectedProcedure
      .input(z.object({ joinCode: z.string().min(1).max(12) }))
      .mutation(async ({ ctx, input }) => {
        const team = await db.getTeamByJoinCode(input.joinCode);
        if (!team) throw new Error("Team not found. Check the join code and try again.");
        await db.joinTeam(team.id, ctx.user.id);
        return team;
      }),
    leave: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .mutation(({ ctx, input }) =>
        db.leaveTeam(input.teamId, ctx.user.id)
      ),
    delete: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const team = await db.getTeamById(input.teamId);
        if (!team || team.creatorId !== ctx.user.id) throw new Error("Not authorized");
        await db.deleteTeam(input.teamId);
      }),
    members: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.getTeamMembers(input.teamId);
      }),
    memberStats: protectedProcedure
      .input(z.object({ teamId: z.number(), memberId: z.number() }))
      .query(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.getMemberStats(input.memberId, input.teamId);
      }),
    myRank: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(async ({ ctx, input }) => {
        const board = await db.getTeamLeaderboard(input.teamId);
        const idx = board.findIndex((m) => m.userId === ctx.user.id);
        if (idx === -1) return null;
        return {
          rank: idx + 1,
          total: board.length,
          weeklyScore: board[idx].score,
        };
      }),
  }),

  // ─── Community: Shared Goals ────────────────────────────────────────────────
  sharedGoals: router({
    get: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(({ ctx, input }) =>
        db.getSharedGoalsForUser(ctx.user.id, input.teamId)
      ),
    set: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        categoryClientIds: z.array(z.string()),
      }))
      .mutation(({ ctx, input }) =>
        db.setSharedGoals(ctx.user.id, input.teamId, input.categoryClientIds)
      ),
  }),

  // ─── Community: Messages ────────────────────────────────────────────────────
  messages: router({
    list: protectedProcedure
      .input(z.object({ teamId: z.number(), limit: z.number().int().min(1).max(100).optional() }))
      .query(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.getTeamMessages(input.teamId, input.limit ?? 50);
      }),
    send: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        message: z.string().min(1).max(2000),
      }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.sendTeamMessage(input.teamId, ctx.user.id, input.message);
      }),
  }),

  // ─── Community: Team Feed ────────────────────────────────────────────────────
  teamFeed: router({
    list: protectedProcedure
      .input(z.object({ teamId: z.number(), limit: z.number().int().min(1).max(50).optional() }))
      .query(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.getTeamFeed(input.teamId, input.limit ?? 30);
      }),

    createPost: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        type: z.enum(["text", "checkin", "photo"]),
        content: z.string().max(2000).optional(),
        imageUrl: z.string().url().optional(),
        checkinScore: z.number().int().min(0).max(100).optional(),
        checkinDate: z.string().max(10).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.createTeamPost({
          teamId: input.teamId,
          userId: ctx.user.id,
          type: input.type,
          content: input.content ?? null,
          imageUrl: input.imageUrl ?? null,
          checkinScore: input.checkinScore ?? null,
          checkinDate: input.checkinDate ?? null,
        });
      }),

    deletePost: protectedProcedure
      .input(z.object({ postId: z.number() }))
      .mutation(({ ctx, input }) => db.deleteTeamPost(input.postId, ctx.user.id)),

    toggleReaction: protectedProcedure
      .input(z.object({ postId: z.number(), emoji: z.string().max(8) }))
      .mutation(({ ctx, input }) => db.toggleTeamPostReaction(input.postId, ctx.user.id, input.emoji)),

    addComment: protectedProcedure
      .input(z.object({ postId: z.number(), content: z.string().min(1).max(500) }))
      .mutation(({ ctx, input }) => db.addTeamPostComment(input.postId, ctx.user.id, input.content)),

    deleteComment: protectedProcedure
      .input(z.object({ commentId: z.number() }))
      .mutation(({ ctx, input }) => db.deleteTeamPostComment(input.commentId, ctx.user.id)),

    streak: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.getTeamStreak(input.teamId);
      }),

    leaderboard: protectedProcedure
      .input(z.object({ teamId: z.number(), period: z.enum(["week", "month", "alltime"]).default("week") }))
      .query(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.getTeamLeaderboard(input.teamId, input.period);
      }),

    habitStats: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.getTeamHabitStats(input.teamId);
      }),
  }),

  // ─── Community: Goal Proposals ────────────────────────────────────────────
  goalProposals: router({
    list: protectedProcedure
      .input(z.object({ teamId: z.number() }))
      .query(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.getTeamGoalProposals(input.teamId, ctx.user.id);
      }),

    create: protectedProcedure
      .input(z.object({
        teamId: z.number(),
        habitName: z.string().min(1).max(100),
        habitEmoji: z.string().max(16).optional().default(""),
        habitDescription: z.string().max(500).optional(),
        lifeArea: z.string().max(32).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.createTeamGoalProposal({ ...input, creatorId: ctx.user.id });
      }),

    vote: protectedProcedure
      .input(z.object({
        proposalId: z.number(),
        teamId: z.number(),
        vote: z.enum(["accept", "decline"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.voteOnTeamGoalProposal(input.proposalId, ctx.user.id, input.vote);
      }),

    resetVote: protectedProcedure
      .input(z.object({
        proposalId: z.number(),
        teamId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const isMember = await db.isTeamMember(input.teamId, ctx.user.id);
        if (!isMember) throw new Error("Not a member of this team");
        return db.resetTeamGoalVote(input.proposalId, ctx.user.id);
      }),
  }),

  // ─── Physical Alarm Clock Devices ─────────────────────────────────────────────────────────
  devices: router({
    /** Generate a one-time pairing token — app calls this before showing the setup wizard */
    createPairingToken: protectedProcedure.mutation(({ ctx }) =>
      db.createDevicePairingToken(ctx.user.id)
    ),

    /** List all physical devices linked to the current user's account */
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserDevices(ctx.user.id)
    ),

    /** Unlink / remove a device from the account */
    remove: protectedProcedure
      .input(z.object({ deviceId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        db.deleteDevice(input.deviceId, ctx.user.id)
      ),

    /** Get panel settings for the user's device. Returns defaults if no device paired yet. */
    getSettings: protectedProcedure.query(({ ctx }) =>
      db.getDeviceSettings(ctx.user.id)
    ),

    /** Update one or more panel settings for the user's device. */
    updateSettings: protectedProcedure
      .input(z.object({
        voiceId: z.string().max(64).optional(),
        audioEnabled: z.boolean().optional(),
        voiceEnabled: z.boolean().optional(),
        lowEmfMode: z.boolean().optional(),
        wifiOffHour: z.number().int().min(0).max(23).optional(),
        wifiOnHour: z.number().int().min(0).max(23).optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.updateDeviceSettings(ctx.user.id, input)
      ),
  }),

  // ─── Moderation (Apple Guideline 1.2) ─────────────────────────────────────────
  moderation: router({
    /** Report a chat message or feed post as abusive. */
    report: protectedProcedure
      .input(z.object({
        contentType: z.enum(["message", "post"]),
        contentId: z.number().int().positive(),
        reason: z.enum(["spam", "harassment", "hate_speech", "inappropriate", "other"]),
        details: z.string().max(500).optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.reportContent(ctx.user.id, input.contentType, input.contentId, input.reason, input.details)
      ),
    /** Block a user — hides their content from the blocker. */
    blockUser: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        db.blockUser(ctx.user.id, input.userId)
      ),
    /** Unblock a previously blocked user. */
    unblockUser: protectedProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        db.unblockUser(ctx.user.id, input.userId)
      ),
    /** Get the list of user IDs the current user has blocked. */
    blockedIds: protectedProcedure.query(({ ctx }) =>
      db.getBlockedUserIds(ctx.user.id)
    ),
  }),

  // ─── Voice / TTS ──────────────────────────────────────────────────────────────────
  voice: router({
    /**
     * Fetch the user’s saved voices from ElevenLabs API dynamically.
     * Returns voice_id (ElevenLabs ID) and name for each voice.
     * Sorted: cloned voices first, then professional, then premade.
     */
    listVoices: protectedProcedure.query(async () => {
      const apiKey = ENV.elevenLabsApiKey;
      if (!apiKey) {
        // Fallback to hardcoded list if no API key configured
        return Object.entries(VOICES).map(([key, id]) => ({
          voice_id: id,
          name: key.charAt(0).toUpperCase() + key.slice(1),
          category: "premade" as string,
        }));
      }
      try {
        const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": apiKey },
        });
        if (!resp.ok) throw new Error(`ElevenLabs voices API error: ${resp.status}`);
        const data = await resp.json() as { voices: { voice_id: string; name: string; category: string }[] };
        return data.voices
          .map((v) => ({ voice_id: v.voice_id, name: v.name, category: v.category ?? "premade" }))
          .sort((a, b) => {
            const rank = (c: string) => c === "cloned" ? 0 : c === "professional" ? 1 : 2;
            return rank(a.category) - rank(b.category) || a.name.localeCompare(b.name);
          });
      } catch (err) {
        console.error("[voice.listVoices]", err);
        return Object.entries(VOICES).map(([key, id]) => ({
          voice_id: id,
          name: key.charAt(0).toUpperCase() + key.slice(1),
          category: "premade" as string,
        }));
      }
    }),

    /**
     * Return the ElevenLabs API key to authenticated users so the app
     * can call ElevenLabs TTS directly on-device for fast preview.
     * The key is never exposed to unauthenticated requests.
     */
    getApiKey: protectedProcedure.query(() => {
      return { apiKey: ENV.elevenLabsApiKey ?? "" };
    }),

    /** Server-side TTS generation (kept for alarm fire, not preview). */
    preview: protectedProcedure
      .input(z.object({
        voiceId: z.string(),
        text: z.string().max(200).default("Good morning! Time to rise and shine."),
      }))
      .mutation(async ({ input }) => {
        const url = await generateAndStoreAudio(input.text, "alarm", input.voiceId);
        return { url };
      }),

    /** Save the user’s preferred voice ID (stored in the alarm config). */
    setPreference: protectedProcedure
      .input(z.object({ voiceKey: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await db.upsertAlarm({ userId: ctx.user.id, hour: 9, minute: 0, days: "1,2,3,4,5,6,0", enabled: true, elevenLabsVoice: input.voiceKey });
        return { success: true };
      }),
  }),

  // ─── Community: Referrals ─────────────────────────────────────────────────────────
  referrals: router({
    stats: protectedProcedure.query(({ ctx }) =>
      db.getReferralStats(ctx.user.id)
    ),
    useCode: protectedProcedure
      .input(z.object({ referralCode: z.string().min(1).max(32) }))
      .mutation(({ ctx, input }) =>
        db.applyReferralCode(input.referralCode, ctx.user.id)
      ),
  }),
});

export type AppRouter = typeof appRouter;
