/**
 * Morning Practice Script Generator
 *
 * Generates personalized scripts for each practice type using the user's
 * name, goals, habits, rewards, and yesterday's gratitudes.
 *
 * Each script is broken into CHUNKS — short paragraphs that map to
 * individual ElevenLabs TTS calls. This keeps each call under the
 * ~2500 character limit and allows background music to play continuously
 * while voice chunks are stitched together.
 */

export type PracticeType = 'priming' | 'meditation' | 'breathwork' | 'visualization';
export type MeditationLength = 5 | 10 | 20;
export type BreathworkStyle = 'wim_hof' | 'box' | '4_7_8';

export interface PracticeContext {
  name: string;
  goals: string[];           // goal labels e.g. ["Run a marathon", "Launch my business"]
  rewards: string[];         // reward names e.g. ["New running shoes", "Weekend trip"]
  habits: string[];          // active habit names e.g. ["Exercise", "Meditate", "Read"]
  gratitudes: string[];      // yesterday's gratitude items (up to 3)
}

export interface PracticeScript {
  type: PracticeType;
  chunks: string[];          // Each chunk is one TTS call (~30-90 seconds of speech)
  pausesBetweenChunks: number[]; // Pause in ms after each chunk (length = chunks.length)
  totalDurationMinutes: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}

function listOr(items: string[], fallback: string): string {
  if (!items.length) return fallback;
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}

// ─── Priming (Tony Robbins style, ~15 min) ────────────────────────────────────

export function buildPrimingScript(ctx: PracticeContext): PracticeScript {
  const fn = firstName(ctx.name);
  const goalList = listOr(ctx.goals, 'your most important goals');
  const habitList = listOr(ctx.habits.slice(0, 5), 'your daily habits');
  const rewardList = listOr(ctx.rewards, 'the rewards you have set for yourself');
  const gratitudeSection = ctx.gratitudes.length
    ? `Yesterday, you were grateful for: ${ctx.gratitudes.join('. ')}. Let those feelings of gratitude fill you right now.`
    : `Take a moment to think of three things you are genuinely grateful for right now. Feel them deeply.`;

  const chunks: string[] = [
    // Chunk 1 — Opening breath activation (~45s)
    `Good morning, ${fn}. Welcome to your morning priming. Close your eyes, sit up tall, and take a deep breath in through your nose... and release. Again — breathe in... and let it go. One more time — breathe in all the way... and release completely. Good. You are here. You are alive. And today is going to be an extraordinary day.`,

    // Chunk 2 — Gratitude (60s)
    `Now let's begin with gratitude — the foundation of a powerful state. ${gratitudeSection} Gratitude is the antidote to fear, to anger, to frustration. When you are truly grateful, you cannot be stressed. Feel the warmth of appreciation spreading through your chest right now.`,

    // Chunk 3 — Gratitude deepening (45s)
    `Think of someone in your life who loves you unconditionally. Feel what it's like to be loved by them. Think of a moment in your life where everything just clicked — where you felt unstoppable. Anchor that feeling. That is who you are. That is what is available to you every single day.`,

    // Chunk 4 — Incantations / affirmations (60s)
    `Now repeat these after me — say them out loud, with conviction: I am strong. I am focused. I am grateful. I am unstoppable. Every day in every way I am getting better and better. I have everything I need to create the life I want. My habits are building my destiny. I commit fully to ${habitList} — because these are the actions that create the person I am becoming.`,

    // Chunk 5 — Goals visualization (60s)
    `Now let's focus on what you are building. Your goals are: ${goalList}. Close your eyes and see yourself having already achieved them. Not hoping — knowing. Feel the pride, the satisfaction, the joy of having done the work. See the version of you that has earned ${rewardList}. That person is not far away. That person is built one day at a time, starting with today.`,

    // Chunk 6 — Celebration and energy (45s)
    `Now let's raise your energy. Take three massive breaths and on each exhale make a sound — any sound — just let it out. Ready? Breathe in... and release! Again — breathe in... and release! One more — breathe in... and let it all out! YES! Feel that aliveness in your body. This is your natural state. This is who you are.`,

    // Chunk 7 — Commitment (45s)
    `Today, ${fn}, you will show up fully. You will do the work. You will honor your commitments to yourself. Not because you have to — but because you choose to. Because you know that the life you want is built in moments exactly like this one. Go out there and make today count. Let's go!`,
  ];

  const pausesBetweenChunks = [3000, 4000, 3000, 5000, 5000, 4000, 0];

  return { type: 'priming', chunks, pausesBetweenChunks, totalDurationMinutes: 15 };
}

// ─── Guided Meditation ────────────────────────────────────────────────────────

export function buildMeditationScript(ctx: PracticeContext, lengthMinutes: MeditationLength): PracticeScript {
  const fn = firstName(ctx.name);
  const gratitudeSection = ctx.gratitudes.length
    ? `As you settle in, bring to mind something you were grateful for yesterday — ${ctx.gratitudes[0]}. Let that feeling of appreciation soften your body.`
    : `As you settle in, bring to mind one thing you are genuinely grateful for right now. Let that warmth soften your body.`;

  const shortChunks: string[] = [
    `Welcome, ${fn}. Find a comfortable position — either seated or lying down. Close your eyes gently. Take a slow breath in through your nose... and a long exhale through your mouth. Let your body begin to relax.`,
    `${gratitudeSection} With each breath, let go of any tension in your shoulders... your jaw... your hands. You have nowhere to be right now except here.`,
    `Bring your awareness to the natural rhythm of your breath. You don't need to control it — just observe. In... and out. In... and out. Each breath is a gift. Each moment of stillness is a reset for your nervous system.`,
    `As you breathe, silently say to yourself: I am calm. I am clear. I am ready. Let these words settle into your body like seeds taking root. When thoughts arise, simply notice them and return to your breath. No judgment. Just presence.`,
    `Take one final deep breath in... hold it gently... and release completely. Slowly begin to bring your awareness back to the room. Wiggle your fingers and toes. When you're ready, open your eyes. You are centered. You are ready. Have a beautiful day, ${fn}.`,
  ];

  if (lengthMinutes === 5) {
    return {
      type: 'meditation',
      chunks: shortChunks,
      pausesBetweenChunks: [4000, 8000, 8000, 8000, 0],
      totalDurationMinutes: 5,
    };
  }

  const mediumChunks: string[] = [
    ...shortChunks.slice(0, 3),
    `Now do a slow body scan from the top of your head down to your feet. Notice any areas of tension or tightness. As you exhale, imagine that tension dissolving — melting away like ice in warm water. Your forehead relaxes... your neck and shoulders drop... your chest opens... your belly softens... your hips release... your legs grow heavy and warm.`,
    `Bring to mind your most important goal right now: ${ctx.goals[0] || 'the vision you have for your life'}. See yourself living that reality — not as a wish, but as a memory of something that has already happened. Feel the emotions of that achievement. Let them fill your chest with warmth and certainty.`,
    shortChunks[3],
    shortChunks[4],
  ];

  if (lengthMinutes === 10) {
    return {
      type: 'meditation',
      chunks: mediumChunks,
      pausesBetweenChunks: [4000, 8000, 10000, 10000, 8000, 8000, 0],
      totalDurationMinutes: 10,
    };
  }

  // 20 minutes
  const longChunks: string[] = [
    ...mediumChunks.slice(0, 4),
    `Continue breathing slowly and deeply. With each inhale, imagine drawing in pure white light — clarity, energy, possibility. With each exhale, release anything that no longer serves you — doubt, worry, yesterday's stress. You are clearing space for something new.`,
    `Now visualize your ideal day unfolding from this moment forward. See yourself moving through the day with ease and focus. You complete ${ctx.habits[0] || 'your most important habit'}. You make progress on ${ctx.goals[0] || 'your biggest goal'}. You show up as the best version of yourself in every interaction.`,
    `Spend a few moments in pure silence. Just breathe. Just be. There is nothing you need to do right now except exist in this moment of peace. This stillness is always available to you — no matter how busy the day gets, you can return here with a single breath.`,
    mediumChunks[4],
    mediumChunks[5],
    shortChunks[4],
  ];

  return {
    type: 'meditation',
    chunks: longChunks,
    pausesBetweenChunks: [4000, 8000, 10000, 12000, 10000, 10000, 15000, 8000, 8000, 0],
    totalDurationMinutes: 20,
  };
}

// ─── Breathwork ───────────────────────────────────────────────────────────────

export function buildBreathworkScript(ctx: PracticeContext, style: BreathworkStyle): PracticeScript {
  const fn = firstName(ctx.name);

  if (style === 'wim_hof') {
    const chunks: string[] = [
      `Welcome to your Wim Hof breathing session, ${fn}. Lie down or sit comfortably. This technique will energize your body, alkalize your blood, and activate your immune system. We'll do three rounds. Each round: 30 power breaths, then a breath hold, then a recovery breath. Let's begin.`,
      `Round one. Take 30 deep, powerful breaths — in through the nose, out through the mouth. Don't force the exhale — just let it go. Breathe in fully... let go. In... let go. Keep going at your own pace for 30 breaths. Breathe in... let go. In... let go. In... let go. Keep breathing — you're doing great. Almost there. Last few breaths now. Breathe in... let go. In... let go.`,
      `After your 30th breath, exhale completely and hold your breath. Hold... hold... hold. Your body has more oxygen than it needs right now. Stay calm. Hold as long as feels comfortable. When you feel the urge to breathe, take one massive inhale and hold it for 15 seconds. Then release. Well done — that was round one.`,
      `Round two. Take 30 deep power breaths again. In through the nose, out through the mouth. Breathe in... let go. In... let go. In... let go. Feel the tingling in your hands and face — that's normal. Keep going. In... let go. In... let go. Almost at 30. Last few now. Breathe in... let go. In... let go.`,
      `Exhale completely and hold. Hold... hold... hold. Notice how much calmer and more comfortable this hold feels compared to round one. Your body is adapting. Stay with it. When you're ready, take that big recovery breath in and hold for 15 seconds. Then release. Excellent — round two complete.`,
      `Round three — the final round. Take your 30 power breaths. In... let go. In... let go. In... let go. You may feel very light or tingly — that's perfect. Keep breathing. In... let go. In... let go. Last few breaths. In... let go. In... let go.`,
      `Final exhale and hold. This is your longest hold. Stay with it. Your mind is clear. Your body is charged. Hold... hold... hold. When you're ready, take your recovery breath, hold 15 seconds, and release. ${fn}, you just completed three rounds of Wim Hof breathing. Your body is alkaline, energized, and ready. Have an incredible day.`,
    ];
    return {
      type: 'breathwork',
      chunks,
      pausesBetweenChunks: [3000, 30000, 5000, 30000, 5000, 30000, 0],
      totalDurationMinutes: 15,
    };
  }

  if (style === 'box') {
    const chunks: string[] = [
      `Welcome to box breathing, ${fn}. This technique is used by Navy SEALs and elite performers to activate calm focus. The pattern is simple: inhale for 4 counts, hold for 4, exhale for 4, hold for 4. We'll do 8 rounds. Sit up straight, relax your shoulders, and let's begin.`,
      `Inhale... 2... 3... 4. Hold... 2... 3... 4. Exhale... 2... 3... 4. Hold... 2... 3... 4. Inhale... 2... 3... 4. Hold... 2... 3... 4. Exhale... 2... 3... 4. Hold... 2... 3... 4.`,
      `Inhale... 2... 3... 4. Hold... 2... 3... 4. Exhale... 2... 3... 4. Hold... 2... 3... 4. Inhale... 2... 3... 4. Hold... 2... 3... 4. Exhale... 2... 3... 4. Hold... 2... 3... 4.`,
      `Inhale... 2... 3... 4. Hold... 2... 3... 4. Exhale... 2... 3... 4. Hold... 2... 3... 4. Inhale... 2... 3... 4. Hold... 2... 3... 4. Exhale... 2... 3... 4. Hold... 2... 3... 4.`,
      `Beautiful, ${fn}. Let your breath return to normal. Notice the calm clarity in your mind. Your nervous system has shifted from reactive to responsive. You are centered. You are focused. Carry this feeling with you into your day.`,
    ];
    return {
      type: 'breathwork',
      chunks,
      pausesBetweenChunks: [3000, 2000, 2000, 2000, 0],
      totalDurationMinutes: 5,
    };
  }

  // 4-7-8
  const chunks: string[] = [
    `Welcome to 4-7-8 breathing, ${fn}. This technique activates your parasympathetic nervous system — your rest and digest mode. It's one of the most powerful tools for reducing anxiety and preparing for deep focus. Inhale for 4, hold for 7, exhale for 8. Let's do 6 rounds.`,
    `Inhale through your nose for 4... 2... 3... 4. Hold your breath for 7... 2... 3... 4... 5... 6... 7. Exhale through your mouth for 8... 2... 3... 4... 5... 6... 7... 8. Again — inhale 2... 3... 4. Hold 2... 3... 4... 5... 6... 7. Exhale 2... 3... 4... 5... 6... 7... 8.`,
    `Inhale 2... 3... 4. Hold 2... 3... 4... 5... 6... 7. Exhale 2... 3... 4... 5... 6... 7... 8. Inhale 2... 3... 4. Hold 2... 3... 4... 5... 6... 7. Exhale 2... 3... 4... 5... 6... 7... 8.`,
    `Last two rounds. Inhale 2... 3... 4. Hold 2... 3... 4... 5... 6... 7. Exhale 2... 3... 4... 5... 6... 7... 8. Final round — inhale 2... 3... 4. Hold 2... 3... 4... 5... 6... 7. Exhale all the way out 2... 3... 4... 5... 6... 7... 8.`,
    `${fn}, you've completed your 4-7-8 session. Your heart rate is lower, your mind is clearer, and your body is in a state of calm readiness. This is your optimal state for focus and performance. Let's make today extraordinary.`,
  ];
  return {
    type: 'breathwork',
    chunks,
    pausesBetweenChunks: [3000, 2000, 2000, 2000, 0],
    totalDurationMinutes: 8,
  };
}

// ─── Visualization ────────────────────────────────────────────────────────────

export function buildVisualizationScript(ctx: PracticeContext, lengthMinutes: MeditationLength): PracticeScript {
  const fn = firstName(ctx.name);
  const goal1 = ctx.goals[0] || 'your most important goal';
  const goal2 = ctx.goals[1] || 'your second most important goal';
  const reward1 = ctx.rewards[0] || 'the reward you have set for yourself';
  const habitList = listOr(ctx.habits.slice(0, 3), 'your daily habits');

  const coreChunks: string[] = [
    `Welcome to your visualization practice, ${fn}. Close your eyes and take three deep breaths to settle in. With each exhale, let your body relax completely. You are about to visit the future version of yourself — the one who has done the work, kept the commitments, and achieved what you set out to achieve.`,

    `Imagine it is one year from today. You have been consistent with ${habitList}. You have made real, measurable progress on ${goal1}. See yourself in that future moment — where are you? What does your environment look like? What are you wearing? How does your body feel? Step into that version of you fully.`,

    `Now zoom in on your goal: ${goal1}. See it as a completed reality. Not a wish — a memory. You did it. Feel the pride in your chest. Feel the satisfaction of knowing you kept your word to yourself. The people around you can see the change. You can see it in the mirror. This is real. This is earned.`,

    `And your reward — ${reward1}. You have earned it. See yourself experiencing it fully. Feel the joy, the celebration, the sense of arrival. This is what the daily work was for. Every habit completed, every morning you showed up — it all led here. Let this feeling anchor in your body as a reference point for why you do what you do.`,

    `Now bring your awareness back to today. You are at the beginning of that journey — and that is exciting. Every great achievement starts exactly where you are right now. Take one deep breath in... and as you exhale, make a silent commitment to yourself: I will show up today. I will do the work. I will become the person I just visualized. When you're ready, open your eyes. Let's go, ${fn}.`,
  ];

  if (lengthMinutes === 5) {
    return {
      type: 'visualization',
      chunks: coreChunks,
      pausesBetweenChunks: [4000, 8000, 8000, 8000, 0],
      totalDurationMinutes: 5,
    };
  }

  const extendedChunks: string[] = [
    coreChunks[0],
    coreChunks[1],
    coreChunks[2],
    `Now let's explore your second goal: ${goal2}. See yourself having achieved this as well. What does that look like? Who are you with? What has changed in your life because of this achievement? Allow the image to become vivid and detailed. The more specific you can see it, the more powerfully your subconscious will work toward it.`,
    coreChunks[3],
    `Take a moment to feel gratitude for the version of you that showed up every day to make this possible. That person — the one who woke up early, did the habits, made the hard choices — that person is a hero. And that person is you. Honor them. Thank them. Be them today.`,
    coreChunks[4],
  ];

  if (lengthMinutes === 10) {
    return {
      type: 'visualization',
      chunks: extendedChunks,
      pausesBetweenChunks: [4000, 8000, 8000, 8000, 8000, 8000, 0],
      totalDurationMinutes: 10,
    };
  }

  // 20 minutes
  const deepChunks: string[] = [
    ...extendedChunks.slice(0, 5),
    `Now let's go even deeper. Imagine a typical morning in your future life — one year from now. You wake up naturally, feeling rested. You move through your morning routine with ease and joy — not as a chore, but as a celebration of who you've become. ${habitList} are no longer things you have to do. They are simply who you are.`,
    `See your relationships in this future. How have they improved because of the work you've done on yourself? Who in your life is proud of you? Who have you inspired? The ripple effect of your personal growth extends far beyond just you — it touches everyone around you.`,
    `Now sit in this future for a moment of pure silence. Just breathe. Just be the person you've become. There is no rush. No urgency. Just the deep satisfaction of a life well-lived, one day at a time.`,
    extendedChunks[5],
    coreChunks[4],
  ];

  return {
    type: 'visualization',
    chunks: deepChunks,
    pausesBetweenChunks: [4000, 8000, 8000, 8000, 8000, 8000, 8000, 15000, 8000, 0],
    totalDurationMinutes: 20,
  };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildScript(
  type: PracticeType,
  ctx: PracticeContext,
  options: { lengthMinutes?: MeditationLength; breathworkStyle?: BreathworkStyle } = {},
): PracticeScript {
  switch (type) {
    case 'priming':
      return buildPrimingScript(ctx);
    case 'meditation':
      return buildMeditationScript(ctx, options.lengthMinutes ?? 10);
    case 'breathwork':
      return buildBreathworkScript(ctx, options.breathworkStyle ?? 'wim_hof');
    case 'visualization':
      return buildVisualizationScript(ctx, options.lengthMinutes ?? 10);
  }
}
