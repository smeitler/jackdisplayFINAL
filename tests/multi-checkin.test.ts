/**
 * Tests for multiple check-ins per day behavior:
 * 1. Habit ratings merge (new ratings overlay existing, unmentioned habits keep their rating)
 * 2. Journal entry append with timestamp separator
 */

import { describe, it, expect } from "vitest";

// ─── Habit merge logic (extracted from app-context.tsx submitCheckIn) ─────────

type Rating = "red" | "yellow" | "green";
interface CheckInEntry {
  date: string;
  habitId: string;
  rating: Rating;
  loggedAt: string;
}

function mergeCheckIns(
  existing: CheckInEntry[],
  date: string,
  ratingsMap: Record<string, Rating | "none">,
  activeIds: string[],
): CheckInEntry[] {
  const existingForDate = existing.filter((e) => e.date === date);
  const existingOtherDates = existing.filter((e) => e.date !== date);

  const mergedMap: Record<string, CheckInEntry> = {};
  for (const e of existingForDate) {
    mergedMap[e.habitId] = e;
  }
  for (const id of activeIds) {
    const r = ratingsMap[id];
    if (r && r !== "none") {
      mergedMap[id] = { date, habitId: id, rating: r as Rating, loggedAt: "now" };
    }
  }

  return [...existingOtherDates, ...Object.values(mergedMap)];
}

describe("Habit rating merge (multiple check-ins per day)", () => {
  const DATE = "2026-03-23";
  const HABITS = ["exercise", "water", "sleep", "meditate"];

  it("first check-in sets ratings normally", () => {
    const result = mergeCheckIns([], DATE, { exercise: "green", water: "yellow" }, HABITS);
    const forDate = result.filter((e) => e.date === DATE);
    expect(forDate).toHaveLength(2);
    expect(forDate.find((e) => e.habitId === "exercise")?.rating).toBe("green");
    expect(forDate.find((e) => e.habitId === "water")?.rating).toBe("yellow");
  });

  it("second check-in only overrides explicitly mentioned habits", () => {
    // First check-in: exercise=green, water=yellow
    const after1 = mergeCheckIns([], DATE, { exercise: "green", water: "yellow" }, HABITS);
    // Second check-in: only mentions sleep=green, should NOT wipe exercise or water
    const after2 = mergeCheckIns(after1, DATE, { sleep: "green" }, HABITS);
    const forDate = after2.filter((e) => e.date === DATE);
    expect(forDate).toHaveLength(3);
    expect(forDate.find((e) => e.habitId === "exercise")?.rating).toBe("green");
    expect(forDate.find((e) => e.habitId === "water")?.rating).toBe("yellow");
    expect(forDate.find((e) => e.habitId === "sleep")?.rating).toBe("green");
  });

  it("second check-in can update an already-rated habit", () => {
    const after1 = mergeCheckIns([], DATE, { exercise: "yellow" }, HABITS);
    // User corrects exercise to green in second check-in
    const after2 = mergeCheckIns(after1, DATE, { exercise: "green" }, HABITS);
    const forDate = after2.filter((e) => e.date === DATE);
    expect(forDate.find((e) => e.habitId === "exercise")?.rating).toBe("green");
  });

  it("does not affect other dates", () => {
    const OTHER_DATE = "2026-03-22";
    const initial: CheckInEntry[] = [
      { date: OTHER_DATE, habitId: "exercise", rating: "green", loggedAt: "t" },
    ];
    const result = mergeCheckIns(initial, DATE, { water: "yellow" }, HABITS);
    // Other date entry preserved
    expect(result.find((e) => e.date === OTHER_DATE && e.habitId === "exercise")?.rating).toBe("green");
    // New date entry added
    expect(result.find((e) => e.date === DATE && e.habitId === "water")?.rating).toBe("yellow");
  });

  it("skips 'none' ratings — does not create entries for unrated habits", () => {
    const result = mergeCheckIns([], DATE, { exercise: "none", water: "green" }, HABITS);
    const forDate = result.filter((e) => e.date === DATE);
    expect(forDate).toHaveLength(1);
    expect(forDate[0].habitId).toBe("water");
  });
});

// ─── Journal append logic ──────────────────────────────────────────────────────

function buildAppendedBody(existingBody: string, newBody: string, timeLabel: string): string {
  const separator = `\n\n── ${timeLabel} ──\n\n`;
  return existingBody + separator + newBody;
}

function mergeGratitudes(existing: string[], incoming: string[]): string[] {
  return Array.from(new Set([...existing, ...incoming]));
}

describe("Journal entry append (multiple entries per day)", () => {
  it("appends new text with timestamp separator", () => {
    const existing = "Morning thoughts.";
    const newText = "Afternoon update.";
    const result = buildAppendedBody(existing, newText, "2:34 PM");
    expect(result).toBe("Morning thoughts.\n\n── 2:34 PM ──\n\nAfternoon update.");
  });

  it("separator contains the provided time label", () => {
    const result = buildAppendedBody("a", "b", "11:00 AM");
    expect(result).toContain("── 11:00 AM ──");
  });

  it("merges gratitudes without duplicates", () => {
    const merged = mergeGratitudes(["sunshine", "family"], ["family", "health"]);
    expect(merged).toEqual(["sunshine", "family", "health"]);
  });

  it("merges gratitudes when existing is empty", () => {
    const merged = mergeGratitudes([], ["coffee", "sleep"]);
    expect(merged).toEqual(["coffee", "sleep"]);
  });

  it("merges gratitudes when incoming is empty", () => {
    const merged = mergeGratitudes(["coffee"], []);
    expect(merged).toEqual(["coffee"]);
  });
});
