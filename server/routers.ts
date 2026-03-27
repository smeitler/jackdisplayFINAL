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

Return ONLY valid JSON: {"results": {"habit_id": {"rating": "green"|"yellow"|"red"|null, "note": "descriptive note with specific details"}, ...}}`,
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
          ? `\n4. "habitResults": object mapping habit IDs to {"rating": "green"|"yellow"|"red"|null, "note": "specific achievement with full details from transcript"}. Habits:\n${habitList}`
          : '';
        const habitJsonExample = habitList ? `, "habitResults": {"habit_id": {"rating": "green", "note": "climbed Mount Timpanogos with friends, 8-hour round trip"}}` : '';
        const llmResp = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a personal journal + habit coach assistant. Given a voice check-in transcript, extract:\n1. "journalEntries": array of reflective thoughts/observations (concise, preserve user voice)\n2. "gratitudeItems": array of specific things user is grateful for (3-10 words each)\n3. "transcript": the transcript lightly cleaned up — add punctuation, fix capitalization, and split run-on sentences, but DO NOT change, add, or remove any words. Keep the speaker's exact voice and meaning.${habitSection}\n\nHABIT EXTRACTION RULES (critical):\n- Be AGGRESSIVE and THOROUGH — scan every sentence for evidence of each habit\n- Match by meaning, not just keywords. Examples: "climbed a mountain" = exercise, "drank lots of water" = hydration, "read for an hour" = reading, "went to bed early" = sleep\n- If the user mentions ANY physical activity (hike, run, walk, gym, sport, climb, swim, bike, workout, exercise) → rate the exercise habit\n- If they mention doing it exceptionally well (5-hour workout, 30-mile run, climbed a mountain) → green (crushed)\n- If they mention doing it partially or okay → yellow\n- If they explicitly say they missed it → red\n- If not mentioned at all → omit (null)\n- The note MUST capture the SPECIFIC achievement from the transcript (e.g. "climbed Mount Timpanogos" not just "did exercise")\n- Include ALL habits that have ANY evidence in the transcript\n- Gratitude expressions → gratitudeItems; everything else → journalEntries\nReturn ONLY valid JSON: {"journalEntries": [...], "gratitudeItems": [...], "transcript": "..."${habitJsonExample}}`,
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
        try {
          const parsed = JSON.parse(llmResp.choices[0].message.content as string);
          journalEntries = Array.isArray(parsed.journalEntries)
            ? parsed.journalEntries.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
            : [];
          gratitudeItems = Array.isArray(parsed.gratitudeItems)
            ? parsed.gratitudeItems.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
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
        return { transcript, journalEntries, gratitudeItems, habitResults, audioUrl: storageResult.url };
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
          ? `\n4. "habitResults": object mapping habit IDs to {"rating": "green"|"yellow"|"red"|null, "note": "specific achievement with full details from transcript"}. Habits:\n${habitList}`
          : '';
        const habitJsonExample = habitList ? `, "habitResults": {"habit_id": {"rating": "green", "note": "climbed Mount Timpanogos with friends, 8-hour round trip"}}` : '';
        const llmResp = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a personal journal + habit coach assistant. Given a voice check-in transcript, extract:\n1. "journalEntries": array of reflective thoughts/observations (concise, preserve user voice)\n2. "gratitudeItems": array of specific things user is grateful for (3-10 words each)\n3. "transcript": the original transcript verbatim${habitSection}\n\nHABIT EXTRACTION RULES (critical):\n- Be AGGRESSIVE and THOROUGH — scan every sentence for evidence of each habit\n- Match by meaning, not just keywords. Examples: "climbed a mountain" = exercise, "drank lots of water" = hydration, "read for an hour" = reading, "went to bed early" = sleep\n- If the user mentions ANY physical activity (hike, run, walk, gym, sport, climb, swim, bike, workout, exercise) → rate the exercise habit\n- If they mention doing it exceptionally well (5-hour workout, 30-mile run, climbed a mountain) → green (crushed)\n- If they mention doing it partially or okay → yellow\n- If they explicitly say they missed it → red\n- If not mentioned at all → omit (null)\n- The note MUST capture the SPECIFIC achievement from the transcript (e.g. "climbed Mount Timpanogos" not just "did exercise")\n- Include ALL habits that have ANY evidence in the transcript\n- Gratitude expressions → gratitudeItems; everything else → journalEntries\nReturn ONLY valid JSON: {"journalEntries": [...], "gratitudeItems": [...], "transcript": "..."${habitJsonExample}}`,
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
        try {
          const parsed = JSON.parse(llmResp.choices[0].message.content as string);
          journalEntries = Array.isArray(parsed.journalEntries)
            ? parsed.journalEntries.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
            : [];
          gratitudeItems = Array.isArray(parsed.gratitudeItems)
            ? parsed.gratitudeItems.filter((s: unknown) => typeof s === 'string' && (s as string).trim())
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
        return { journalEntries, gratitudeItems, habitResults };
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

  // ─── AI Coach
  aiCoach: router({
    /**
     * Chat with the AI Coach. Accepts a user message and optional habit context.
     * Returns a coaching response grounded in the user's habit data.
     */
    chat: publicProcedure
      .input(z.object({
        message: z.string().min(1).max(2000),
        habitContext: z.object({
          habits: z.array(z.object({
            id: z.string(),
            name: z.string(),
            category: z.string().optional(),
          })),
          recentRatings: z.array(z.object({
            date: z.string(),
            ratings: z.record(z.string(), z.enum(['none', 'red', 'yellow', 'green'])),
          })).optional(),
          streak: z.number().optional(),
          totalDaysLogged: z.number().optional(),
          journalSummary: z.string().optional(),
          habitNotesSummary: z.string().optional(),
        }).optional(),
        history: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
        })).optional(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm.js');

        // Build context string from habit data
        let contextStr = '';
        if (input.habitContext) {
          const { habits, recentRatings, streak, totalDaysLogged, journalSummary, habitNotesSummary } = input.habitContext;
          if (habits.length > 0) {
            contextStr += `\nUser's habits (${habits.length} total):\n${habits.map((h) => `- ${h.name}${h.category ? ` (${h.category})` : ''}`).join('\n')}`;
          }
          if (streak !== undefined) contextStr += `\nCurrent check-in streak: ${streak} days`;
          if (totalDaysLogged !== undefined) contextStr += `\nTotal days logged: ${totalDaysLogged}`;
          if (recentRatings && recentRatings.length > 0) {
            // Compute per-habit success rates from recent data
            const habitScores: Record<string, { green: number; yellow: number; red: number; total: number }> = {};
            for (const day of recentRatings) {
              for (const [habitId, rating] of Object.entries(day.ratings)) {
                if (!habitScores[habitId]) habitScores[habitId] = { green: 0, yellow: 0, red: 0, total: 0 };
                if (rating === 'green') habitScores[habitId].green++;
                else if (rating === 'yellow') habitScores[habitId].yellow++;
                else if (rating === 'red') habitScores[habitId].red++;
                habitScores[habitId].total++;
              }
            }
            const habitMap = Object.fromEntries(habits.map((h) => [h.id, h.name]));
            const scoreLines = Object.entries(habitScores)
              .filter(([id]) => habitMap[id])
              .sort(([, a], [, b]) => {
                const pctA = a.total > 0 ? a.green / a.total : 0;
                const pctB = b.total > 0 ? b.green / b.total : 0;
                return pctA - pctB; // worst first so coach focuses on struggles
              })
              .map(([id, s]) => {
                const pct = s.total > 0 ? Math.round((s.green / s.total) * 100) : 0;
                const trend = pct >= 80 ? '✅' : pct >= 50 ? '⚠️' : '❌';
                return `${trend} ${habitMap[id]}: ${pct}% success (${s.green} green, ${s.yellow} yellow, ${s.red} red out of ${s.total} days)`;
              });
            if (scoreLines.length > 0) {
              contextStr += `\n\nHabit performance (last ${recentRatings.length} days, sorted worst→best):\n${scoreLines.join('\n')}`;
            }
          }
          if (habitNotesSummary) {
            contextStr += `\n\nHabit notes from voice check-ins (what the user actually said about each habit):\n${habitNotesSummary}`;
          }
          if (journalSummary) {
            contextStr += `\n\nJournal entries (last 30, chronological):\n${journalSummary}`;
          }
        }

        const systemPrompt = `You are a deeply insightful personal habit coach with full access to this user's habit history, check-in data, voice notes, and journal entries. Your job is to give genuinely personalized, research-backed coaching — not generic advice.

Core principles:
- ALWAYS ground your response in the user's actual data. Reference specific habits by name, specific dates, specific patterns you see.
- Take your time to think through the question carefully before answering. Quality over speed.
- When the user asks a complex question, reason through the data step by step before giving advice.
- Be honest: if you see a pattern of struggle, name it directly and compassionately. Don't sugarcoat.
- Be specific: "You've missed Exercise 4 of the last 7 days" is more useful than "you could work on consistency."
- Draw connections across data sources: if their journal says they were stressed and their habits dipped that week, point that out.
- Celebrate real wins with specifics: "You hit Sleep 7+ hours 6 out of 7 days this week — that's exceptional."
- Give actionable next steps, not just observations. What should they do differently tomorrow?
- Match the user's tone: if they're casual, be casual. If they want depth, go deep.
- Don't be preachy, don't lecture, don't repeat yourself.${contextStr ? `\n\n═══ USER DATA ═══${contextStr}` : ''}`;

        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: systemPrompt },
          ...(input.history ?? []).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user', content: input.message },
        ];

        const resp = await invokeLLM({ messages });
        const reply = (resp.choices[0].message.content as string)?.trim() ?? '';
        return { reply };
      }),
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

  // ─── Coach: AI Pitch Generation ─────────────────────────────────────────────
  coach: router({
    generatePitch: publicProcedure
      .input(z.object({
        firstName: z.string(),
        specificHabit: z.string(),
        habitDirection: z.string(),
        primaryGoals: z.array(z.string()),
        whyNow: z.string(),
        biggestChallenges: z.array(z.string()),
        whatStopped: z.string(),
        workSchedule: z.string(),
        hoursPerWeek: z.string(),
        coachingStyle: z.string(),
      }))
      .mutation(async ({ input }) => {
        const { invokeLLM } = await import('./_core/llm.js');

        const goalsList = input.primaryGoals.length > 0
          ? input.primaryGoals.join(', ')
          : 'personal growth';
        const challengesList = input.biggestChallenges.length > 0
          ? input.biggestChallenges.join(', ')
          : 'staying consistent';

        const userContext = [
          `Name: ${input.firstName || 'this person'}`,
          input.habitDirection ? `They want to: ${input.habitDirection}` : '',
          input.specificHabit ? `Exact habit: ${input.specificHabit}` : '',
          `Goals this unlocks: ${goalsList}`,
          input.whyNow ? `Why now: ${input.whyNow}` : '',
          `Biggest challenges: ${challengesList}`,
          input.whatStopped ? `What stopped them before: ${input.whatStopped}` : '',
          input.workSchedule ? `Work situation: ${input.workSchedule}` : '',
          input.hoursPerWeek ? `Available time: ${input.hoursPerWeek}` : '',
          input.coachingStyle ? `Preferred coaching style: ${input.coachingStyle}` : '',
        ].filter(Boolean).join('\n');

        const resp = await invokeLLM({
          messages: [
            {
              role: 'system',
              content: `You are a world-class accountability coach and direct-response copywriter trained on $100M Offers principles. Write a SHORT, DEEPLY PERSONAL pitch for someone who just applied for an 8-week accountability sprint ($297 one-time).

The Sprint delivers:
1. One live group kickoff workshop (60 min Zoom) — they leave with goals loaded into the app
2. Daily check-ins (2–3 min) — habits + 2 quick prompts, no homework
3. Personal voice feedback Mon–Fri — coach reviews data, sends 1–2 min voice memo with one concrete adjustment
4. Weekly strategy summary — patterns, what held them back, exact focus for next 7 days

Your pitch must follow this exact structure (4–6 sentences total, NO bullet points, NO headers):
1. PERSONAL OPEN: Address them by first name. Name their exact dream/outcome in one sentence (not the habit itself — the life it unlocks). Then say: "The real problem hasn't been knowledge or willpower. The real problem has been no one watching when you quietly fall off."
2. THE BRIDGE: One sentence explaining how the Sprint fixes exactly that — a coach watching their data and sending direct feedback so they don't drift.
3. THE PROMISE: "In 8 weeks, [first name], you will be the person who shows up for [their specific habit], not just plans to."
4. THE CLOSE: One powerful, specific sentence that creates urgency based on what stopped them before.

Tone: warm, direct, confident — like a mentor who believes in them more than they believe in themselves. Write in second person. No fluff. Pure conviction.`,
            },
            {
              role: 'user',
              content: `Here is what this person told us:\n\n${userContext}\n\nWrite their personalized pitch now. Remember: 4–6 sentences, no bullet points, follow the structure exactly.`,
            },
          ],
        });

        const pitch = ((resp.choices[0]?.message?.content as string) ?? '').trim();

        return { pitch };
      }),
  }),

  // ─── Community: Referrals ────────────────────────────────────────────────────────────────────────────────────
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
