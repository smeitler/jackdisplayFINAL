import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { VOICES, generateAndStoreAudio, generateSpeech } from "./audioService";
import { buildScript, type PracticeType, type MeditationLength, type BreathworkStyle } from "./practiceScripts";
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
      .mutation(async ({ ctx, input }) => {
        await db.bulkUpsertHabits(ctx.user.id, input.map((h) => ({
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
        })));
        // Bump schedule version so the panel re-fetches habits on next poll
        await db.bumpScheduleVersionForUser(ctx.user.id).catch(() => {});
      }),

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
        soundId: z.string().max(64).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.upsertAlarm({
          userId: ctx.user.id,
          hour: input.hour,
          minute: input.minute,
          days: input.days,
          enabled: input.enabled,
          soundId: input.soundId,
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
    /** Sync ritual stacks from the app to the paired device so the panel can display them. */
    syncStacks: protectedProcedure
      .input(z.object({
        stacks: z.array(z.any()),
      }))
      .mutation(({ ctx, input }) =>
        db.syncDeviceStacks(ctx.user.id, JSON.stringify(input.stacks))
      ),

    /** List audio recordings uploaded from the CrowPanel, newest first. */
    getRecordings: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).optional() }))
      .query(({ ctx, input }) =>
        db.getDeviceRecordings(ctx.user.id, input.limit ?? 50)
      ),

    /** Delete a single panel recording by id (must belong to the current user). */
    deleteRecording: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) =>
        db.deleteDeviceRecording(ctx.user.id, input.id)
      ),

    /** Rotate the API key for a paired device. The device must be re-paired or updated via NVS to use the new key. */
    rotateKey: protectedProcedure
      .input(z.object({ deviceId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const newKey = await db.rotateDeviceApiKey(input.deviceId, ctx.user.id);
        if (!newKey) throw new Error("Device not found or not owned by this account");
        return { newKey };
      }),
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
        const data = await resp.json() as { voices: { voice_id: string; name: string; category: string; preview_url?: string }[] };
        return data.voices
          .map((v) => ({ voice_id: v.voice_id, name: v.name, category: v.category ?? "premade", preview_url: v.preview_url ?? "" }))
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

  // ─── Voice Journal ─────────────────────────────────────────────────────────────────
  voiceJournal: router({
    /**
     * Accepts a base64-encoded audio blob, uploads to S3, transcribes via Whisper,
     * then uses the LLM to extract:
     *   - journalEntries: array of reflective/general thoughts
     *   - gratitudeItems: array of things the user is grateful for
     * Returns both arrays plus the raw transcript.
     */
    transcribeAndCategorize: publicProcedure
      .input(z.object({
        audioBase64: z.string(),          // base64-encoded audio data
        mimeType: z.string().default('audio/m4a'), // e.g. audio/m4a, audio/webm
        date: z.string().optional(),      // YYYY-MM-DD, defaults to today
        habits: z.array(z.object({ id: z.string(), name: z.string() })).optional(), // active habits for note extraction
      }))
        .mutation(async ({ ctx, input }) => {
        const { invokeLLM } = await import('./_core/llm.js');
        const { transcribeAudioBuffer } = await import('./_core/voiceTranscription.js');
        const { storagePut } = await import('./storage.js');

        // 1. Upload audio to S3 for storage (async, non-blocking for transcription)
        const ext = input.mimeType.split('/')[1]?.split(';')[0] ?? 'm4a';
        const userId = ctx.user?.id ?? 'anonymous';
        const fileKey = `voice-journal/${userId}/${Date.now()}.${ext}`;
        const audioBuffer = Buffer.from(input.audioBase64, 'base64');

        // Upload to storage and transcribe in parallel for speed
        const [storageResult, transcription] = await Promise.all([
          storagePut(fileKey, audioBuffer, input.mimeType).catch((err) => {
            console.warn('[voiceJournal] Storage upload failed (non-fatal):', err.message);
            return { key: fileKey, url: '' };
          }),
          transcribeAudioBuffer(audioBuffer, input.mimeType, {
            language: 'en',
            prompt: 'Personal journal entry, gratitude, reflections, daily thoughts',
          }),
        ]);
        const audioUrl = storageResult.url;

        // 2. Check transcription result
        if ('error' in transcription) {
          const details = (transcription as any).details ?? '';
          console.error('[voiceJournal] Transcription error:', transcription.error, details);
          throw new Error(`Transcription failed: ${transcription.error}${details ? ` (${details})` : ''}`);
        }
        const transcript = transcription.text?.trim() ?? '';
        if (!transcript) return { transcript: '', journalEntries: [], gratitudeItems: [], habitNotes: {} as Record<string, string>, audioUrl };

        // 3. AI categorization — extract journal thoughts, gratitude items, AND per-habit notes
        const habitList = (input.habits ?? []).map((h) => `- ${h.id}: ${h.name}`).join('\n');
        const habitSection = habitList ? `\n3. "habitNotes": an object mapping habit IDs to a descriptive phrase capturing the key fact about that habit. Be specific and include all relevant details from the transcript. Examples: "climbed Mount Timpanogos with friends, 8-hour round trip", "skipped — no time today", "drank 8 glasses, hit daily goal", "30 min yoga flow before work". Only include habits clearly mentioned. Habit list:\n${habitList}` : '';
        const habitJsonExample = habitList ? `, "habitNotes": {"habit_id": "descriptive note about the habit"}` : '';

        const llmResp = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a personal journal assistant. Given a voice journal transcript, extract:${habitSection ? `\n` : ''}1. "journalEntries": an array of reflective thoughts, observations, plans, or general statements (each a concise sentence or short paragraph, preserving the user's voice)\n2. "gratitudeItems": an array of specific things the user is grateful for (short phrases, 3-10 words each)${habitSection}

Rules:
- A sentence expressing gratitude ("I'm grateful for...", "I appreciate...", "thankful for...") → gratitudeItems
- Everything else → journalEntries
- Keep the user's natural language; don't rewrite or summarize
- For habitNotes: match by context (e.g. "gym" → Exercise/Workout habit). Only include habits clearly mentioned.
- If nothing fits a category, return an empty array/object for it
Return ONLY valid JSON: {"journalEntries": [...]${habitJsonExample}, "gratitudeItems": [...]}`,
            },
            {
              role: 'user',
              content: `Transcript:\n${transcript}`,
            },
          ],
          response_format: { type: 'json_object' },
        });

        let journalEntries: string[] = [];
        let gratitudeItems: string[] = [];
        let habitNotes: Record<string, string> = {};
        try {
          const parsed = JSON.parse(llmResp.choices[0].message.content as string);
          journalEntries = Array.isArray(parsed.journalEntries) ? parsed.journalEntries.filter((s: unknown) => typeof s === 'string' && s.trim()) : [];
          gratitudeItems = Array.isArray(parsed.gratitudeItems) ? parsed.gratitudeItems.filter((s: unknown) => typeof s === 'string' && s.trim()) : [];
          if (parsed.habitNotes && typeof parsed.habitNotes === 'object') {
            habitNotes = Object.fromEntries(
              Object.entries(parsed.habitNotes).filter(([, v]) => typeof v === 'string' && (v as string).trim())
            ) as Record<string, string>;
          }
        } catch {
          // If parsing fails, put everything in journal
          journalEntries = [transcript];
        }

        return { transcript, journalEntries, gratitudeItems, habitNotes, audioUrl };
      }),
  }),

  // ─── Voice Check-in ─────────────────────────────────────────────────────────────
  voiceCheckin: router({
    /**
     * STEP 1 — Whisper only (fast path).
     * Accepts a base64-encoded DELTA audio chunk (new audio only since last tick).
     * Returns the transcript of just that chunk so the client can append it immediately.
     * No LLM involved — this should return in ~300-600ms.
     */
    transcribeChunk: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.string().default('audio/webm'),
        previousTranscript: z.string().default(''), // context hint for Whisper
      }))
      .mutation(async ({ input }) => {
        const { transcribeAudioBuffer } = await import('./_core/voiceTranscription.js');
        const audioBuffer = Buffer.from(input.audioBase64, 'base64');
        const transcription = await transcribeAudioBuffer(audioBuffer, input.mimeType, {
          language: 'en',
          prompt: input.previousTranscript
            ? `${input.previousTranscript.slice(-200)} [continuing]`
            : 'Daily habit check-in, rating habits as crushed, okay, or missed',
        });
        if ('error' in transcription) {
          return { delta: '', error: transcription.error };
        }
        return { delta: transcription.text?.trim() ?? '', error: null };
      }),

    /**
     * STEP 2 — LLM only (analysis path).
     * Accepts the full accumulated text transcript (no audio).
     * Returns per-habit ratings and notes.
     * Runs in parallel with the next transcribeChunk call — no blocking.
     */
    analyzeTranscript: publicProcedure
      .input(z.object({
        transcript: z.string(),
        habits: z.array(z.object({ id: z.string(), name: z.string() })),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm.js');
        if (!input.transcript.trim()) return { results: {} as Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }> };

        const habitList = input.habits.map((h) => `- ${h.id}: ${h.name}`).join('\n');

        const llmResp = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a habit coach analyzing a user's voice check-in. Given their speech transcript and a list of habits, determine:
1. Which habits they mentioned (directly or indirectly)
2. How well they did on each mentioned habit: "green" (crushed it / did it / succeeded), "yellow" (partial / okay / tried), or "red" (missed / skipped / failed)
3. A descriptive note capturing the key fact and specific details from the transcript

Rating guidelines:
- GREEN: "crushed my workout", "hit the gym", "8 glasses of water", "called mom", "meditated", "read for an hour", "got 8 hours sleep", "finished the project"
- YELLOW: "kinda worked out", "only 20 min", "tried but cut it short", "half the goal", "not my best", "could be better"
- RED: "skipped", "didn't do it", "missed", "forgot", "no time", "zero", "nothing"

Be generous with inference — if they clearly describe doing something related to a habit, rate it.
Only include habits that were clearly mentioned or strongly implied.

Habits:
${habitList}

HABIT NOTE RULES (critical):
- The note MUST be built from the user's EXACT words from the transcript — do NOT paraphrase, summarize, or rewrite
- Quote or closely follow the actual phrases the user said that relate to this habit
- You may add a short clarifying phrase only if it directly connects what was said to the habit (e.g. "[about their workout]:")
- Do NOT invent details, emotions, or outcomes that the user did not say
- Keep it tight — 1-3 sentences using the user's own language
- Example: if user said "I hit the gym for like 45 minutes, did chest and arms", the note should be: "Hit the gym for about 45 minutes, did chest and arms."
- BAD example: "Completed a productive gym session focusing on upper body strength training for 45 minutes."

Return ONLY valid JSON: {"results": {"habit_id": {"rating": "green"|"yellow"|"red"|null, "note": "exact transcript words relevant to this habit"}, ...}}`,
            },
            {
              role: 'user',
              content: `Full transcript:\n${input.transcript}`,
            },
          ],
          response_format: { type: 'json_object' },
        });

        let results: Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }> = {};
        try {
          const parsed = JSON.parse(llmResp.choices[0].message.content as string);
          if (parsed.results && typeof parsed.results === 'object') {
            results = Object.fromEntries(
              Object.entries(parsed.results)
                .filter(([, v]: [string, any]) => v && typeof v === 'object' && v.rating)
                .map(([id, v]: [string, any]) => [id, { rating: v.rating, note: (v.note ?? '') }])
            ) as Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }>;
          }
        } catch {
          // parsing failed — return empty
        }

        return { results };
      }),

    /**
     * COMBINED — Transcribe audio + analyze habits + extract journal/gratitude in ONE LLM call.
     * Faster than calling transcribeAndCategorize + analyzeTranscript separately.
     */
    transcribeAndAnalyze: publicProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.string().default('audio/webm'),
        habits: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
      }))
      .mutation(async ({ ctx, input }) => {
        const { invokeLLM } = await import('./_core/llm.js');
        const { transcribeAudioBuffer } = await import('./_core/voiceTranscription.js');
        const { storagePut } = await import('./storage.js');
        const audioBuffer = Buffer.from(input.audioBase64, 'base64');
        const ext = input.mimeType.split('/')[1]?.split(';')[0] ?? 'm4a';
        const userId = ctx.user?.id ?? 'anonymous';
        const fileKey = `voice-checkin/${userId}/${Date.now()}.${ext}`;
        // Transcribe + upload in parallel
        const [storageResult, transcription] = await Promise.all([
          storagePut(fileKey, audioBuffer, input.mimeType).catch(() => ({ key: fileKey, url: '' })),
          transcribeAudioBuffer(audioBuffer, input.mimeType, {
            language: 'en',
            prompt: 'Daily habit check-in, gratitude, journal entry, reflections',
          }),
        ]);
        if ('error' in transcription) {
          throw new Error(`Transcription failed: ${transcription.error}`);
        }
        const transcript = transcription.text?.trim() ?? '';
        if (!transcript) {
          return {
            transcript: '',
            journalEntries: [] as string[],
            gratitudeItems: [] as string[],
            habitResults: {} as Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }>,
            audioUrl: storageResult.url,
          };
        }
        const habitList = input.habits.map((h) => `- ${h.id}: ${h.name}`).join('\n');
        const habitSection = habitList
          ? `\n4. "habitResults": object mapping habit IDs to {"rating": "green"|"yellow"|"red"|null, "note": "rich 2-3 sentence description"}. Habits:\n${habitList}`
          : '';
        const habitJsonExample = habitList ? `, "habitResults": {"habit_id": {"rating": "green", "note": "Hit the gym for about 45 minutes, did chest and arms."}}` : '';
        const llmResp = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a personal journal + habit coach assistant. Given a voice check-in transcript, extract:\n1. "journalEntries": array of reflective thoughts/observations (concise, preserve user voice)\n2. "gratitudeItems": array of specific things user is grateful for (3-10 words each)\n3. "transcript": the transcript lightly cleaned up — add punctuation, fix capitalization, and split run-on sentences, but DO NOT change, add, or remove any words. Keep the speaker's exact voice and meaning.\n4. "extractedTasks": array of task objects for anything the user wants to remember, do, or be reminded about. Look for phrases like "remind me to", "don't forget", "I need to", "make sure I", "I should", "I have to", "I want to", "I gotta", "put on my list", "add to my list", or any clear to-do intent. Each task: {"title": "short action phrase using user's exact words", "notes": "optional context from transcript", "priority": "medium"}.${habitSection}\n\nHABIT EXTRACTION RULES (critical):\n- Be AGGRESSIVE and THOROUGH — scan every sentence for evidence of each habit\n- Match by meaning, not just keywords\n- HABIT NOTE RULES: use the user's EXACT words, do NOT paraphrase\n- Include ALL habits that have ANY evidence in the transcript\n- Gratitude expressions → gratitudeItems; everything else → journalEntries\nReturn ONLY valid JSON: {"journalEntries": [...], "gratitudeItems": [...], "transcript": "...", "extractedTasks": [...]${habitJsonExample}}`,
            },
            {
              role: 'user',
              content: `Transcript:\n${transcript}`,
            },
          ],
          response_format: { type: 'json_object' },
        });
        let journalEntries: string[] = [];
        let gratitudeItems: string[] = [];
        let habitResults: Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }> = {};
        let extractedTasks: Array<{ title: string; notes: string; priority: string }> = [];
        try {
          const parsed = JSON.parse(llmResp.choices[0].message.content as string);
          journalEntries = Array.isArray(parsed.journalEntries)
            ? parsed.journalEntries.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
            : [];
          gratitudeItems = Array.isArray(parsed.gratitudeItems)
            ? parsed.gratitudeItems.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
            : [];
          extractedTasks = Array.isArray(parsed.extractedTasks)
            ? parsed.extractedTasks.filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
            : [];
          if (parsed.habitResults && typeof parsed.habitResults === 'object') {
            habitResults = Object.fromEntries(
              Object.entries(parsed.habitResults)
                .filter(([, v]: [string, any]) => v && typeof v === 'object' && v.rating)
                .map(([id, v]: [string, any]) => [id, { rating: v.rating, note: (v.note ?? '') }])
            ) as Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }>;
          }
        } catch {
          journalEntries = [transcript];
        }
        return { transcript, journalEntries, gratitudeItems, habitResults, extractedTasks, audioUrl: storageResult.url };
      }),

    /**
     * ANALYZE TEXT TRANSCRIPT — habits + journal + gratitude from plain text.
     * Used for large recordings that were chunked and transcribed separately.
     */
    analyzeTranscriptFull: publicProcedure
      .input(z.object({
        transcript: z.string(),
        habits: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm.js');
        if (!input.transcript.trim()) {
          return {
            journalEntries: [] as string[],
            gratitudeItems: [] as string[],
            habitResults: {} as Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }>,
          };
        }
        const habitList = input.habits.map((h) => `- ${h.id}: ${h.name}`).join('\n');
        const habitSection = habitList
          ? `\n4. "habitResults": object mapping habit IDs to {"rating": "green"|"yellow"|"red"|null, "note": "rich 2-3 sentence description"}. Habits:\n${habitList}`
          : '';
        const habitJsonExample = habitList ? `, "habitResults": {"habit_id": {"rating": "green", "note": "Hit the gym for about 45 minutes, did chest and arms."}}` : '';
        const llmResp = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a personal journal + habit coach assistant. Given a voice check-in transcript, extract:\n1. "journalEntries": array of reflective thoughts/observations (concise, preserve user voice)\n2. "gratitudeItems": array of specific things user is grateful for (3-10 words each)\n3. "transcript": the original transcript verbatim\n4. "extractedTasks": array of task objects for anything the user wants to remember, do, or be reminded about. Look for phrases like "remind me to", "don't forget", "I need to", "make sure I", "I should", "I have to", "I want to", "I gotta", "put on my list", "add to my list", or any clear to-do intent. Each task: {"title": "short action phrase using user's exact words", "notes": "optional context from transcript", "priority": "medium"}.${habitSection}\n\nHABIT EXTRACTION RULES (critical):\n- Be AGGRESSIVE and THOROUGH — scan every sentence for evidence of each habit\n- Match by meaning, not just keywords\n- HABIT NOTE RULES: use the user's EXACT words, do NOT paraphrase\n- Include ALL habits that have ANY evidence in the transcript\n- Gratitude expressions → gratitudeItems; everything else → journalEntries\nReturn ONLY valid JSON: {"journalEntries": [...], "gratitudeItems": [...], "transcript": "...", "extractedTasks": [...]${habitJsonExample}}`,
            },
            {
              role: 'user',
              content: `Transcript:\n${input.transcript}`,
            },
          ],
          response_format: { type: 'json_object' },
        });
        let journalEntries: string[] = [];
        let gratitudeItems: string[] = [];
        let habitResults: Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }> = {};
        let extractedTasks: Array<{ title: string; notes: string; priority: string }> = [];
        try {
          const parsed = JSON.parse(llmResp.choices[0].message.content as string);
          journalEntries = Array.isArray(parsed.journalEntries)
            ? parsed.journalEntries.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
            : [];
          gratitudeItems = Array.isArray(parsed.gratitudeItems)
            ? parsed.gratitudeItems.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
            : [];
          extractedTasks = Array.isArray(parsed.extractedTasks)
            ? parsed.extractedTasks.filter((t: any) => t && typeof t.title === 'string' && t.title.trim())
            : [];
          if (parsed.habitResults && typeof parsed.habitResults === 'object') {
            habitResults = Object.fromEntries(
              Object.entries(parsed.habitResults)
                .filter(([, v]: [string, any]) => v && typeof v === 'object' && v.rating)
                .map(([id, v]: [string, any]) => [id, { rating: v.rating, note: (v.note ?? '') }])
            ) as Record<string, { rating: 'green' | 'yellow' | 'red' | null; note: string }>;
          }
        } catch {
          journalEntries = [input.transcript];
        }
        return { journalEntries, gratitudeItems, habitResults, extractedTasks };
      }),
  }),

  // ─── Morning Practice ────────────────────────────────────────────────────────
  morningPractice: router({
    /**
     * Generate TTS audio for all chunks of a morning practice session.
     * Returns an array of S3 URLs (one per chunk) plus pause durations.
     * Audio is cached by a hash of the script content so re-runs are free.
     */
    generate: protectedProcedure
      .input(z.object({
        type: z.enum(['priming', 'meditation', 'breathwork', 'visualization']),
        voiceId: z.string(),
        lengthMinutes: z.number().optional(),
        breathworkStyle: z.enum(['wim_hof', 'box', '4_7_8']).optional(),
        // Personalization context
        name: z.string().default('Friend'),
        goals: z.array(z.string()).default([]),
        rewards: z.array(z.string()).default([]),
        habits: z.array(z.string()).default([]),
        gratitudes: z.array(z.string()).default([]),
      }))
      .mutation(async ({ input }) => {
        const { storagePut } = await import('./storage.js');
        const crypto = await import('crypto');

        const ctx = {
          name: input.name,
          goals: input.goals,
          rewards: input.rewards,
          habits: input.habits,
          gratitudes: input.gratitudes,
        };

        const script = buildScript(
          input.type as PracticeType,
          ctx,
          {
            lengthMinutes: input.lengthMinutes as MeditationLength | undefined,
            breathworkStyle: input.breathworkStyle as BreathworkStyle | undefined,
          },
        );

        // Generate TTS for each chunk in parallel (up to 8 chunks)
        const chunkUrls = await Promise.all(
          script.chunks.map(async (chunkText, i) => {
            // Cache key: hash of voice + text so same content isn't regenerated
            const hash = crypto.createHash('sha256')
              .update(`${input.voiceId}:${chunkText}`)
              .digest('hex')
              .slice(0, 16);
            const storageKey = `practice/${input.type}/chunk_${i}_${hash}.mp3`;

            const mp3Buffer = await generateSpeech(chunkText, input.voiceId);
            const { url } = await storagePut(storageKey, mp3Buffer, 'audio/mpeg');
            return url;
          }),
        );

        return {
          type: script.type,
          chunkUrls,
          pausesBetweenChunks: script.pausesBetweenChunks,
          totalDurationMinutes: script.totalDurationMinutes,
        };
      }),
  }),



  // ─── Journal Entries (server-backed) ──────────────────────────────────────────────────────────────────────────────────────
  journalEntries: router({
    /** Fetch all journal entries for the authenticated user. */
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserJournalEntries(ctx.user.id)
    ),

    /** Upsert a single journal entry (create or update by clientId). */
    upsert: protectedProcedure
      .input(z.object({
        clientId: z.string().min(1).max(64),
        date: z.string().max(10),
        title: z.string().max(255).default(''),
        body: z.string().default(''),
        template: z.string().max(32).default('blank'),
        mood: z.string().max(32).optional().nullable(),
        tagsJson: z.string().optional().nullable(),
        gratitudesJson: z.string().optional().nullable(),
        transcriptionStatus: z.string().max(16).optional().nullable(),
        transcriptionText: z.string().optional().nullable(),
        attachmentsJson: z.string().optional().nullable(),
        locationJson: z.string().optional().nullable(),
      }))
      .mutation(({ ctx, input }) =>
        db.upsertJournalEntry(ctx.user.id, input)
      ),

    /** Batch upsert multiple journal entries (used on initial sync). */
    batchUpsert: protectedProcedure
      .input(z.array(z.object({
        clientId: z.string().min(1).max(64),
        date: z.string().max(10),
        title: z.string().max(255).default(''),
        body: z.string().default(''),
        template: z.string().max(32).default('blank'),
        mood: z.string().max(32).optional().nullable(),
        tagsJson: z.string().optional().nullable(),
        gratitudesJson: z.string().optional().nullable(),
        transcriptionStatus: z.string().max(16).optional().nullable(),
        transcriptionText: z.string().optional().nullable(),
        attachmentsJson: z.string().optional().nullable(),
        locationJson: z.string().optional().nullable(),
      })))
      .mutation(async ({ ctx, input }) => {
        for (const entry of input) {
          await db.upsertJournalEntry(ctx.user.id, entry);
        }
        return { count: input.length };
      }),

    /** Soft-delete a journal entry by clientId. */
    delete: protectedProcedure
      .input(z.object({ clientId: z.string().min(1).max(64) }))
      .mutation(({ ctx, input }) =>
        db.softDeleteJournalEntry(ctx.user.id, input.clientId)
      ),
  }),

  // ─── Vision Board (server-backed) ────────────────────────────────────────────────────────────────────────────────────────
  visionBoard: router({
    /** Fetch all vision board images for the authenticated user. */
    getImages: protectedProcedure.query(({ ctx }) =>
      db.getUserVisionBoardImages(ctx.user.id)
    ),

    /** Replace all vision board images (full sync from client). */
    setImages: protectedProcedure
      .input(z.array(z.object({
        categoryClientId: z.string().max(64),
        imageUrl: z.string(),
        order: z.number().int().default(0),
      })))
      .mutation(({ ctx, input }) =>
        db.replaceUserVisionBoard(ctx.user.id, input)
      ),

    /** Fetch all vision motivations for the authenticated user. */
    getMotivations: protectedProcedure.query(({ ctx }) =>
      db.getUserVisionMotivations(ctx.user.id)
    ),

    /** Replace all vision motivations (full sync from client). */
    setMotivations: protectedProcedure
      .input(z.array(z.object({
        categoryClientId: z.string().max(64),
        text: z.string(),
        order: z.number().int().default(0),
      })))
      .mutation(({ ctx, input }) =>
        db.replaceUserVisionMotivations(ctx.user.id, input)
      ),
  }),

  // ─── Journal: Scan Text (OCR via LLM) ────────────────────────────────────────────────────────────────────────────────────
  journal: router({
    scanText: publicProcedure
      .input(z.object({
        imageBase64: z.string(),
        mimeType: z.string().default('image/jpeg'),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm.js');
        const resp = await invokeLLM({
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` },
                },
                {
                  type: 'text',
                  text: 'Please extract and transcribe all text visible in this image. Return only the extracted text, preserving line breaks and formatting as closely as possible. If there is no text, return an empty string.',
                },
              ],
            },
          ],
        });
        const text = (resp.choices[0]?.message?.content as string) ?? '';
        return { text: text.trim() };
      }),
  }),

  // ─── Rewards ─────────────────────────────────────────────────────────────
  rewards: router({
    /** Get all rewards for the authenticated user. */
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserRewards(ctx.user.id)
    ),
    /** Upsert a reward. */
    upsert: protectedProcedure
      .input(z.object({
        clientId: z.string().max(64),
        name: z.string().max(255),
        description: z.string().optional(),
        emoji: z.string().max(16).default(""),
        habitId: z.string().max(64).default("any"),
        milestoneCount: z.number().int().default(1),
        claimedAt: z.string().optional(),
        color: z.string().max(32).optional(),
        createdAt: z.string(),
      }))
      .mutation(({ ctx, input }) =>
        db.upsertReward(ctx.user.id, input)
      ),
    /** Soft-delete a reward. */
    delete: protectedProcedure
      .input(z.object({ clientId: z.string().max(64) }))
      .mutation(({ ctx, input }) =>
        db.deleteRewardByClientId(ctx.user.id, input.clientId)
      ),
  }),

  // ─── Reward Claims ──────────────────────────────────────────────────────────
  rewardClaims: router({
    /** Get all period-based reward claims for the authenticated user. */
    list: protectedProcedure.query(({ ctx }) =>
      db.getUserRewardClaims(ctx.user.id)
    ),
    /** Upsert a reward claim (claim or update a period reward). */
    upsert: protectedProcedure
      .input(z.object({
        habitId: z.string().max(64),
        periodKey: z.string().max(16),
        claimedAt: z.string(),
      }))
      .mutation(({ ctx, input }) =>
        db.upsertRewardClaim(ctx.user.id, input)
      ),
    /** Delete a reward claim (unclaim). */
    delete: protectedProcedure
      .input(z.object({ habitId: z.string().max(64), periodKey: z.string().max(16) }))
      .mutation(({ ctx, input }) =>
        db.deleteRewardClaim(ctx.user.id, input.habitId, input.periodKey)
      ),
    /** Bulk sync — replace all claims for this user (used on first login push). */
    bulkSync: protectedProcedure
      .input(z.array(z.object({ habitId: z.string().max(64), periodKey: z.string().max(16), claimedAt: z.string() })))
      .mutation(({ ctx, input }) =>
        db.replaceUserRewardClaims(ctx.user.id, input)
      ),
  }),

  // ─── Day Notes ──────────────────────────────────────────────────────────────
  dayNotes: router({
    list: protectedProcedure.query(({ ctx }) => db.getUserDayNotes(ctx.user.id)),
    upsert: protectedProcedure
      .input(z.object({ habitId: z.string().max(64), date: z.string().max(10), note: z.string() }))
      .mutation(({ ctx, input }) => db.upsertDayNote(ctx.user.id, input.habitId, input.date, input.note)),
    bulkSync: protectedProcedure
      .input(z.array(z.object({ habitId: z.string().max(64), date: z.string().max(10), note: z.string() })))
      .mutation(({ ctx, input }) => db.replaceUserDayNotes(ctx.user.id, input)),
  }),

  // ─── Gratitude Entries ────────────────────────────────────────────────────────
  gratitudeEntries: router({
    list: protectedProcedure.query(({ ctx }) => db.getUserGratitudeEntries(ctx.user.id)),
    upsert: protectedProcedure
      .input(z.object({ clientId: z.string().max(64), date: z.string().max(10), items: z.array(z.string()), createdAt: z.string() }))
      .mutation(({ ctx, input }) => db.upsertGratitudeEntry(ctx.user.id, { clientId: input.clientId, date: input.date, itemsJson: JSON.stringify(input.items), createdAt: input.createdAt })),
    delete: protectedProcedure
      .input(z.object({ clientId: z.string().max(64) }))
      .mutation(({ ctx, input }) => db.deleteGratitudeEntry(ctx.user.id, input.clientId)),
  }),

  // ─── Tasks ────────────────────────────────────────────────────────────────────
  tasks: router({
    list: protectedProcedure.query(({ ctx }) => db.getUserTasks(ctx.user.id)),
    upsert: protectedProcedure
      .input(z.object({ clientId: z.string().max(64), title: z.string().max(512), notes: z.string().default(''), priority: z.enum(['high', 'medium', 'low']).default('medium'), dueDate: z.string().max(10).optional().nullable(), completed: z.boolean().default(false), createdAt: z.string() }))
      .mutation(({ ctx, input }) => db.upsertTask(ctx.user.id, input)),
    delete: protectedProcedure
      .input(z.object({ clientId: z.string().max(64) }))
      .mutation(({ ctx, input }) => db.deleteTask(ctx.user.id, input.clientId)),
  }),

  // ─── Community: Referrals
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
