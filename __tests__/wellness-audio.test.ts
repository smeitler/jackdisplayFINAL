import { describe, it, expect } from "vitest";

/**
 * Tests for the wellness audio feature:
 * 1. Audio catalog structure and data integrity
 * 2. Category metadata completeness
 * 3. Dashboard wellness grid data
 */

// ─── Replicated data from wellness-audio.tsx for pure logic testing ──────────

type WellnessCategory = "meditate" | "sleep" | "move" | "focus";

interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  duration: string;
  durationSec: number;
  url: string;
}

const AUDIO_CATALOG: Record<WellnessCategory, AudioTrack[]> = {
  meditate: [
    { id: "med-1", title: "Meditation", artist: "FreeMusicForVideo", duration: "1:27", durationSec: 87, url: "https://cdn.pixabay.com/download/audio/2026/03/05/audio_37d75d2b63.mp3?filename=freemusicforvideo-meditation-495611.mp3" },
    { id: "med-2", title: "Peaceful Zen Garden", artist: "Ambient Sounds", duration: "3:00", durationSec: 180, url: "https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=please-calm-my-mind-125566.mp3" },
    { id: "med-3", title: "Deep Calm", artist: "Relaxation Music", duration: "2:30", durationSec: 150, url: "https://cdn.pixabay.com/download/audio/2024/11/04/audio_4956b4edd1.mp3?filename=meditation-music-432hz-deep-calm-mind-relaxation-276988.mp3" },
  ],
  sleep: [
    { id: "slp-1", title: "Gentle Midday Rain", artist: "DRAGON-STUDIO", duration: "0:57", durationSec: 57, url: "https://cdn.pixabay.com/download/audio/2026/03/10/audio_feb4530766.mp3?filename=dragon-studio-gentle-midday-rain-499668.mp3" },
    { id: "slp-2", title: "Ocean Waves at Night", artist: "Nature Sounds", duration: "2:00", durationSec: 120, url: "https://cdn.pixabay.com/download/audio/2022/03/24/audio_1c85b2b1e1.mp3?filename=ocean-waves-112906.mp3" },
    { id: "slp-3", title: "White Noise", artist: "Sleep Aid", duration: "3:00", durationSec: 180, url: "https://cdn.pixabay.com/download/audio/2024/02/14/audio_8e8c0db72a.mp3?filename=white-noise-200408.mp3" },
  ],
  move: [
    { id: "mov-1", title: "Bouncy Workout", artist: "MomotMusic", duration: "1:44", durationSec: 104, url: "https://cdn.pixabay.com/download/audio/2023/10/22/audio_135339dfbf.mp3?filename=momotmusic-bouncy-workout-172772.mp3" },
    { id: "mov-2", title: "Energy Boost", artist: "Fitness Beats", duration: "2:10", durationSec: 130, url: "https://cdn.pixabay.com/download/audio/2022/10/25/audio_946bc3e303.mp3?filename=energetic-hip-hop-124775.mp3" },
    { id: "mov-3", title: "Power Run", artist: "Workout Mix", duration: "1:50", durationSec: 110, url: "https://cdn.pixabay.com/download/audio/2023/07/30/audio_e0908e4237.mp3?filename=powerful-beat-121791.mp3" },
  ],
  focus: [
    { id: "foc-1", title: "Chill Study Desk", artist: "DesiFreeMusic", duration: "2:24", durationSec: 144, url: "https://cdn.pixabay.com/download/audio/2025/12/14/audio_de38cecd46.mp3?filename=desifreemusic-chill-study-desk-focus-amp-concentration-lofi-451181.mp3" },
    { id: "foc-2", title: "Lo-fi Beats", artist: "Study Music", duration: "2:00", durationSec: 120, url: "https://cdn.pixabay.com/download/audio/2023/07/19/audio_d16137e570.mp3?filename=lofi-study-112191.mp3" },
    { id: "foc-3", title: "Deep Focus", artist: "Concentration", duration: "3:00", durationSec: 180, url: "https://cdn.pixabay.com/download/audio/2024/09/10/audio_6e5d7d1bab.mp3?filename=deep-meditation-192828.mp3" },
  ],
};

const CATEGORY_META: Record<WellnessCategory, { label: string; emoji: string; color: string; description: string }> = {
  meditate: { label: "Meditate", emoji: "🟠", color: "#FF8C42", description: "Guided meditation and calming music to center your mind." },
  sleep: { label: "Sleep", emoji: "🌙", color: "#B07FD0", description: "Ambient sounds and white noise for restful sleep." },
  move: { label: "Move", emoji: "⏩", color: "#22C55E", description: "High-energy tracks to power your workout." },
  focus: { label: "Focus", emoji: "🎵", color: "#3B82F6", description: "Lo-fi beats and ambient music for deep concentration." },
};

const ALL_CATEGORIES: WellnessCategory[] = ["meditate", "sleep", "move", "focus"];

// Dashboard wellness grid data
const WELLNESS_GRID = [
  { key: "meditate", label: "Meditate", emoji: "🟠", color: "#FF8C42" },
  { key: "sleep", label: "Sleep", emoji: "🌙", color: "#B07FD0" },
  { key: "move", label: "Move", emoji: "⏩", color: "#22C55E" },
  { key: "focus", label: "Focus", emoji: "🎵", color: "#3B82F6" },
];

// ─── Helper: format time (replicated from component) ─────────────────────────

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Audio Catalog", () => {
  it("has exactly 4 categories", () => {
    expect(Object.keys(AUDIO_CATALOG)).toHaveLength(4);
  });

  it("each category has at least 3 tracks", () => {
    for (const cat of ALL_CATEGORIES) {
      expect(AUDIO_CATALOG[cat].length).toBeGreaterThanOrEqual(3);
    }
  });

  it("all tracks have valid URLs starting with https", () => {
    for (const cat of ALL_CATEGORIES) {
      for (const track of AUDIO_CATALOG[cat]) {
        expect(track.url).toMatch(/^https:\/\//);
      }
    }
  });

  it("all tracks have unique IDs within their category", () => {
    for (const cat of ALL_CATEGORIES) {
      const ids = AUDIO_CATALOG[cat].map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("all track IDs are globally unique", () => {
    const allIds = ALL_CATEGORIES.flatMap((cat) => AUDIO_CATALOG[cat].map((t) => t.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("all tracks have positive duration in seconds", () => {
    for (const cat of ALL_CATEGORIES) {
      for (const track of AUDIO_CATALOG[cat]) {
        expect(track.durationSec).toBeGreaterThan(0);
      }
    }
  });

  it("all tracks have non-empty title and artist", () => {
    for (const cat of ALL_CATEGORIES) {
      for (const track of AUDIO_CATALOG[cat]) {
        expect(track.title.length).toBeGreaterThan(0);
        expect(track.artist.length).toBeGreaterThan(0);
      }
    }
  });

  it("duration string matches durationSec", () => {
    for (const cat of ALL_CATEGORIES) {
      for (const track of AUDIO_CATALOG[cat]) {
        const expected = formatTime(track.durationSec);
        expect(track.duration).toBe(expected);
      }
    }
  });
});

describe("Category Metadata", () => {
  it("has metadata for all 4 categories", () => {
    expect(Object.keys(CATEGORY_META)).toHaveLength(4);
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_META[cat]).toBeDefined();
    }
  });

  it("each category has label, emoji, color, and description", () => {
    for (const cat of ALL_CATEGORIES) {
      const meta = CATEGORY_META[cat];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.emoji.length).toBeGreaterThan(0);
      expect(meta.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(meta.description.length).toBeGreaterThan(10);
    }
  });
});

describe("Dashboard Wellness Grid", () => {
  it("has exactly 4 items", () => {
    expect(WELLNESS_GRID).toHaveLength(4);
  });

  it("grid items match category metadata", () => {
    for (const item of WELLNESS_GRID) {
      const cat = item.key as WellnessCategory;
      expect(CATEGORY_META[cat]).toBeDefined();
      expect(item.label).toBe(CATEGORY_META[cat].label);
      expect(item.emoji).toBe(CATEGORY_META[cat].emoji);
      expect(item.color).toBe(CATEGORY_META[cat].color);
    }
  });

  it("grid keys correspond to audio catalog categories", () => {
    for (const item of WELLNESS_GRID) {
      expect(AUDIO_CATALOG[item.key as WellnessCategory]).toBeDefined();
    }
  });
});

describe("formatTime utility", () => {
  it("formats 0 seconds as 0:00", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("formats 87 seconds as 1:27", () => {
    expect(formatTime(87)).toBe("1:27");
  });

  it("formats 180 seconds as 3:00", () => {
    expect(formatTime(180)).toBe("3:00");
  });

  it("formats 57 seconds as 0:57", () => {
    expect(formatTime(57)).toBe("0:57");
  });

  it("formats 144 seconds as 2:24", () => {
    expect(formatTime(144)).toBe("2:24");
  });
});
