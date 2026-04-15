import { describe, it, expect } from "vitest";

// ── Inline the time parser (same logic as voice-command-panel.tsx) ──────────
const HOUR_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function parseTimeFromText(text: string): { hour: number; minute: number } | null {
  const t = text.toLowerCase().trim();
  const numericMatch = t.match(/(\d{1,2})[:\s](\d{2})\s*(am|pm)?/);
  if (numericMatch) {
    let h = parseInt(numericMatch[1], 10);
    const m = parseInt(numericMatch[2], 10);
    const period = numericMatch[3];
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return { hour: h, minute: m };
  }
  const hourOnlyMatch = t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (hourOnlyMatch) {
    let h = parseInt(hourOnlyMatch[1], 10);
    const period = hourOnlyMatch[2];
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24) return { hour: h, minute: 0 };
  }
  const wordMatch = t.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(thirty|forty|fifty|fifteen|twenty|ten|five|oh\s+\w+))?\s+(am|pm)\b/
  );
  if (wordMatch) {
    let h = HOUR_WORDS[wordMatch[1]] ?? 0;
    const period = wordMatch[3];
    const minPhrase = (wordMatch[2] ?? "").trim();
    let m = 0;
    if (minPhrase === "thirty") m = 30;
    else if (minPhrase === "forty") m = 40;
    else if (minPhrase === "fifteen") m = 15;
    else if (minPhrase === "twenty") m = 20;
    else if (minPhrase === "ten") m = 10;
    else if (minPhrase === "five") m = 5;
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    return { hour: h, minute: m };
  }
  return null;
}

describe("parseTimeFromText", () => {
  it("parses numeric time with colon and am/pm", () => {
    expect(parseTimeFromText("set alarm for 6:30 am")).toEqual({ hour: 6, minute: 30 });
    expect(parseTimeFromText("alarm at 9:00 pm")).toEqual({ hour: 21, minute: 0 });
    expect(parseTimeFromText("wake me at 12:00 pm")).toEqual({ hour: 12, minute: 0 });
    expect(parseTimeFromText("12:00 am")).toEqual({ hour: 0, minute: 0 });
  });

  it("parses hour-only numeric with am/pm", () => {
    expect(parseTimeFromText("set alarm for 7 am")).toEqual({ hour: 7, minute: 0 });
    expect(parseTimeFromText("alarm 9pm")).toEqual({ hour: 21, minute: 0 });
  });

  it("parses word-based times", () => {
    expect(parseTimeFromText("set alarm for six am")).toEqual({ hour: 6, minute: 0 });
    expect(parseTimeFromText("wake me at six thirty am")).toEqual({ hour: 6, minute: 30 });
    expect(parseTimeFromText("seven fifteen pm")).toEqual({ hour: 19, minute: 15 });
  });

  it("returns null for unparseable text", () => {
    expect(parseTimeFromText("set alarm for tomorrow")).toBeNull();
    expect(parseTimeFromText("turn off all alarms")).toBeNull();
  });
});

describe("command intent detection", () => {
  const isAlarmOff = (t: string) =>
    /turn off all|disable all|cancel all|clear all/.test(t) && /alarm/.test(t);
  const isSetAlarm = (t: string) =>
    /(set|add|create|schedule|wake me up at|wake me at)\s.*(alarm|up|wake)|(alarm|wake).*(set|to|for|at)/.test(t);

  it("detects turn-off-all-alarms intent", () => {
    expect(isAlarmOff("turn off all alarms")).toBe(true);
    expect(isAlarmOff("disable all alarms")).toBe(true);
    expect(isAlarmOff("cancel all alarms")).toBe(true);
  });

  it("detects set-alarm intent", () => {
    expect(isSetAlarm("set alarm to 7am")).toBe(true);
    expect(isSetAlarm("set alarm for 6:30 am")).toBe(true);
    expect(isSetAlarm("wake me up at 8am")).toBe(true);
    expect(isSetAlarm("alarm set for nine am")).toBe(true);
  });

  it("does not false-positive set-alarm on turn-off", () => {
    // "turn off all alarms" should NOT match set-alarm
    expect(isSetAlarm("turn off all alarms")).toBe(false);
  });
});
