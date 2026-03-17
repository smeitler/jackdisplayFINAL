# Journal Section — Complete Redesign

## Overview

The Journal tab becomes a full-featured journaling system with four sub-tabs: **Journal**, **Calendar**, **Media**, and **Map**. A persistent floating "+" button appears in the bottom-right corner across all sub-tabs, opening a full-screen entry editor.

---

## Screen Architecture

```
Journal Tab
├── Sub-Tab Bar: [Journal] [Calendar] [Media] [Map]
├── Content Area (switches by sub-tab)
│   ├── Journal → Chronological entry feed
│   ├── Calendar → Boxy scrollable month grids
│   ├── Media → Filterable media grid
│   └── Map → Location pins on a map
└── Floating "+" Button (always visible, bottom-right)
    └── Opens → Full-Screen Entry Editor
```

---

## Sub-Tab Bar Design

A compact pill-style segmented control at the top, just below the "Journal" header. Four equal-width segments. Active tab uses `primary` color fill with white text. Inactive tabs use `surface` background with `muted` text.

| Tab | Icon | Label |
|-----|------|-------|
| Journal | book | Journal |
| Calendar | calendar | Calendar |
| Media | photo | Media |
| Map | map.pin | Map |

---

## 1. Journal Sub-Tab (Entry Feed)

The default view. Shows all journal entries in reverse chronological order, grouped by date.

**Entry Card Layout:**
- **Date header** — "Today", "Yesterday", "March 14, 2026" etc.
- **Entry card** — rounded rectangle on `surface` background:
  - Top row: time (e.g. "2:30 PM") + location tag if present (e.g. "📍 Denver, CO")
  - Body: text preview (3 lines max, truncated)
  - Media row: horizontal scroll of thumbnail images/videos if attached
  - Audio indicator: small play button + duration if audio attached
  - Bottom row: template tag if used (e.g. "Gratitude" pill)

**Empty state:** Centered illustration + "Start your first journal entry" + arrow pointing to "+" button.

---

## 2. Full-Screen Entry Editor

Opens as a full-screen modal (slides up from bottom). This is the core creation/editing experience.

**Layout (top to bottom):**

```
┌─────────────────────────────────┐
│ ✕ Close          March 16, 2026 │  ← Date is tappable (opens date picker)
│                    ▼             │
├─────────────────────────────────┤
│ 📍 Add Location                 │  ← Auto-detects or manual entry
├─────────────────────────────────┤
│ Template: None  ▼               │  ← Template selector dropdown
├─────────────────────────────────┤
│                                 │
│  [Text area - full height]      │  ← Main writing area, auto-grows
│  Write your thoughts...         │
│                                 │
│                                 │
├─────────────────────────────────┤
│ [photo1] [photo2] [+Add]       │  ← Horizontal media thumbnails
├─────────────────────────────────┤
│ 🎙 0:12  ▶ ████░░░░  🗑       │  ← Audio recording (if recorded)
├─────────────────────────────────┤
│ 📷  📹  🎙  📎   [Save Entry] │  ← Action bar: photo, video, audio, file, save
└─────────────────────────────────┘
```

**Date Picker:** Tapping the date at top opens a date picker modal. Changing the date updates which day the entry is filed under.

**Location:** On first tap, requests location permission and auto-fills. Shows city/state. Can be edited or removed.

**Template Selector:** Dropdown with options:
- Free Write (default — blank)
- Gratitude (prompts: "3 things I'm grateful for today")
- Daily Reflection ("What went well? What could improve? What did I learn?")
- Goals Check-in ("Progress on goals today:")
- Mood Check ("How am I feeling? Why?")

**Audio Recording:** Tap the mic icon in the action bar to start recording. Shows waveform + timer while recording. Tap again to stop. Audio appears as a playable row above the action bar. Can delete and re-record.

**Media Attachments:** Tap camera icon to take photo, photo icon to pick from library, paperclip for files/PDFs. Thumbnails appear in a horizontal scroll row.

**Save:** "Save Entry" button at bottom. Validates that at least text, audio, or media exists.

---

## 3. Calendar Sub-Tab

A vertically scrollable view of months. Each month is a boxy grid.

**Month Grid Layout:**
```
┌─────────────────────────────────┐
│         March 2026              │
├────┬────┬────┬────┬────┬────┬────┤
│ Su │ Mo │ Tu │ We │ Th │ Fr │ Sa │
├────┼────┼────┼────┼────┼────┼────┤
│  1 │  2 │  3 │  4 │  5 │  6 │  7 │
│    │went│    │grat│    │    │road│
│    │to..│    │ful.│    │    │tri.│
├────┼────┼────┼────┼────┼────┼────┤
│  8 │  9 │ 10 │ 11 │ 12 │ 13 │ 14 │
│    │    │feel│    │    │    │    │
│    │    │ing.│    │    │    │    │
├────┼────┼────┼────┼────┼────┼────┤
│ 15 │ 16 │    │    │    │    │    │
│toda│    │    │    │    │    │    │
│y i.│    │    │    │    │    │    │
└────┴────┴────┴────┴────┴────┴────┘
```

**Design details:**
- Day number is small (10px), top-left of each cell
- Entry preview text fills the rest of the cell (8px, muted color, 2-3 lines max)
- Days with entries have a small colored dot indicator (primary color)
- Days without entries are plain
- Today's date has a subtle border highlight
- Tapping a day with an entry opens that entry for viewing/editing
- Tapping an empty day opens the entry editor pre-filled with that date
- Scroll starts at current month, can scroll up to see past months

---

## 4. Media Sub-Tab

A grid of all media attachments across all journal entries.

**Filter Bar:** Horizontal pill tabs below the sub-tab bar:
- **All** | **Photo** | **Video** | **Audio** | **PDF**

**Grid Layout:**
- 3-column grid for photos/videos (square thumbnails)
- Audio entries show as small cards with waveform icon + duration
- PDF entries show as document icon cards with filename
- Tapping any item navigates to the associated journal entry

**Empty state:** "No media yet — add photos, videos, or audio to your journal entries."

---

## 5. Map Sub-Tab

A full-height map showing pins for all journal entries that have a location.

**Map Features:**
- Pins clustered by proximity at zoom-out levels
- Each pin shows a small preview on tap (date + first line of text)
- Tapping the preview opens the full journal entry
- Map centers on user's current location by default
- Uses Expo Maps (works in Expo Go without API key)

**Empty state:** Map with no pins + "Add locations to your journal entries to see them here."

---

## Color Choices

| Element | Color |
|---------|-------|
| Active sub-tab | `primary` background, white text |
| Inactive sub-tab | `surface` background, `muted` text |
| Entry card | `surface` background, `border` border |
| Date header | `foreground` text, bold |
| Entry text preview | `muted` text |
| Calendar day with entry | small `primary` dot |
| Calendar today | `primary` border |
| Floating "+" button | `primary` background, white icon |
| Template pill | `primary` at 15% opacity, `primary` text |
| Location tag | `muted` text with pin icon |

---

## Key User Flows

**Create entry from Journal tab:**
1. User taps "+" floating button
2. Full-screen editor opens with today's date
3. User writes, records audio, adds photos
4. User taps "Save Entry"
5. Entry appears in Journal feed, Calendar, Media, Map

**Create entry from Calendar:**
1. User taps Calendar sub-tab
2. Scrolls to desired month
3. Taps on a specific day
4. If entry exists → opens for editing
5. If no entry → opens editor with that date pre-filled

**Browse media:**
1. User taps Media sub-tab
2. Sees grid of all photos/videos/audio
3. Taps filter (e.g. "Audio")
4. Grid filters to show only audio entries
5. Taps an audio card → navigates to the journal entry

**View locations:**
1. User taps Map sub-tab
2. Sees map with pins
3. Taps a pin → sees preview popup
4. Taps preview → opens the journal entry

---

## Data Model

```typescript
interface JournalEntry {
  id: string;
  userId: string;
  date: string;           // "2026-03-16"
  createdAt: string;      // ISO timestamp
  updatedAt: string;      // ISO timestamp
  text: string;           // Main journal text
  audioUri?: string;      // data: URI or file path
  audioDuration?: number; // seconds
  transcript?: string;    // Whisper transcript of audio
  media: JournalMedia[];  // Photos, videos, PDFs
  location?: {
    latitude: number;
    longitude: number;
    city?: string;
    state?: string;
    country?: string;
  };
  template?: string;      // Template name used
  mood?: string;          // Optional mood tag
}

interface JournalMedia {
  id: string;
  type: "photo" | "video" | "audio" | "pdf";
  uri: string;            // Local file path or data URI
  thumbnailUri?: string;  // For videos
  filename?: string;      // For PDFs
  width?: number;
  height?: number;
  duration?: number;      // For video/audio
}
```

---

## Implementation Notes

- Use AsyncStorage for local persistence (user-specific keys)
- Location uses `expo-location` with `requestForegroundPermissionsAsync`
- Image/video picker uses `expo-image-picker`
- Map uses `expo-maps` (MapView component, works in Expo Go)
- Audio recording reuses existing web MediaRecorder + native expo-audio paths
- Calendar is a custom component (not a library) for full control over the boxy layout
- Sub-tabs use local state (not Expo Router tabs) to keep everything within the Journal screen
- The floating "+" button uses `position: absolute` with `bottom` and `right` offsets
