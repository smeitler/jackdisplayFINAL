/**
 * Tests that the analyzeTranscript endpoint returns habit notes using
 * exact words from the transcript, NOT AI-generated summaries/paraphrases.
 *
 * The prompt now instructs the LLM to copy the user's exact words.
 * We verify by checking that key verbatim phrases from the transcript
 * appear in the returned notes.
 */
import { describe, it, expect } from "vitest";

const API_BASE = "http://127.0.0.1:3000";

async function devLogin(): Promise<string> {
  const resp = await fetch(`${API_BASE}/api/auth/dev-login`, { method: "POST" });
  if (!resp.ok) throw new Error(`Dev login failed: ${resp.status}`);
  const data = await resp.json() as { app_session_id: string };
  return data.app_session_id;
}

describe("Voice check-in habit notes — exact transcript words", () => {
  it("analyzeTranscript returns notes containing verbatim phrases from transcript", async () => {
    const token = await devLogin();

    const transcript = "I hit the gym for like 45 minutes today, did chest and arms. Also drank about 8 glasses of water throughout the day.";
    const habits = [
      { id: "workout", name: "Workout" },
      { id: "hydration", name: "Drink water" },
    ];

    const resp = await fetch(`${API_BASE}/api/trpc/voiceCheckin.analyzeTranscript`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ json: { transcript, habits } }),
    });

    expect(resp.ok).toBe(true);
    const data = await resp.json() as { result: { data: { json: { results: Record<string, { rating: string; note: string }> } } } };
    const results = data.result?.data?.json?.results ?? {};

    // Workout note should contain the user's actual words, not a paraphrase
    const workoutNote = results["workout"]?.note ?? "";
    console.log("Workout note:", workoutNote);
    // Should contain verbatim words from transcript (case-insensitive)
    const transcriptLower = transcript.toLowerCase();
    const noteLower = workoutNote.toLowerCase();
    // At least some key words from the transcript should appear in the note
    const hasGymWord = noteLower.includes("gym") || noteLower.includes("45 minutes") || noteLower.includes("chest") || noteLower.includes("arms");
    expect(hasGymWord).toBe(true);

    // The note should NOT be a generic AI summary with words like "productive session" or "strength training"
    expect(noteLower).not.toContain("productive session");
    expect(noteLower).not.toContain("strength training");
    expect(noteLower).not.toContain("upper body workout");

    // Hydration note should reference actual words used
    const hydrationNote = results["hydration"]?.note ?? "";
    console.log("Hydration note:", hydrationNote);
    const hydrationLower = hydrationNote.toLowerCase();
    const hasWaterWord = hydrationLower.includes("8 glasses") || hydrationLower.includes("water") || hydrationLower.includes("drank");
    expect(hasWaterWord).toBe(true);
  }, 30000);
});
