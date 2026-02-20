# DayCheck – Design Document

## App Concept
A daily alarm-driven habit tracker. Each morning the alarm fires, the user opens the app and checks off what they accomplished the previous day across four life categories. The app accumulates a history and visualizes progress per category.

---

## Color Palette

| Token | Light | Dark | Purpose |
|-------|-------|------|---------|
| `primary` | `#6C63FF` | `#7B74FF` | Accent, CTAs, active states |
| `background` | `#F8F7FF` | `#0F0E1A` | Screen background |
| `surface` | `#FFFFFF` | `#1C1B2E` | Cards, sheets |
| `foreground` | `#1A1A2E` | `#EEEEFF` | Primary text |
| `muted` | `#7A7A9D` | `#9090B8` | Secondary text |
| `border` | `#E2E0F5` | `#2E2D45` | Dividers |
| `success` | `#22C55E` | `#4ADE80` | Completed checks |
| `warning` | `#F59E0B` | `#FBBF24` | Partial completion |
| `error` | `#EF4444` | `#F87171` | Missed / overdue |

### Category Colors
| Category | Color |
|----------|-------|
| Health | `#22C55E` (green) |
| Relationships | `#EC4899` (pink) |
| Wealth | `#F59E0B` (amber) |
| Mindset | `#6C63FF` (purple) |

---

## Screen List

1. **Home (Today)** – Alarm status card, today's check-in prompt if pending, quick stats
2. **Check-In Sheet** – Full-screen modal triggered by alarm or manual tap; shows yesterday's tasks by category to check off
3. **Progress / Metrics** – Per-category score cards, streak counter, weekly bar chart, monthly heatmap
4. **Alarm Settings** – Time picker, days of week toggle, alarm sound toggle
5. **Manage Habits** – CRUD list of habits per category (add, edit, delete, reorder)

---

## Key User Flows

### Flow 1 – Morning Check-In
1. Alarm fires → local notification appears
2. User taps notification → app opens to Check-In Sheet
3. User checks off completed habits from yesterday per category
4. User taps "Submit" → data saved, confetti/haptic success feedback
5. App returns to Home showing updated scores

### Flow 2 – Set Alarm
1. User taps Alarm tab → Alarm Settings screen
2. User picks time with time picker wheel
3. Toggles active days (Mon–Sun)
4. Taps "Save" → notification scheduled, confirmation shown

### Flow 3 – View Progress
1. User taps Progress tab
2. Sees category score cards (% completion last 7 days)
3. Scrolls to weekly bar chart per category
4. Taps a category card → drills into that category's history

### Flow 4 – Manage Habits
1. User taps "Habits" in Alarm or Home screen
2. Sees list of habits grouped by category
3. Taps "+" to add new habit, selects category, enters name
4. Long-press to reorder or swipe to delete

---

## Tab Bar (3 tabs)
| Tab | Icon | Screen |
|-----|------|--------|
| Today | `house.fill` | Home |
| Progress | `chart.bar.fill` | Metrics |
| Settings | `bell.fill` | Alarm + Habits |

---

## Data Model

```ts
// Habit definition
type Habit = {
  id: string;
  name: string;
  category: 'health' | 'relationships' | 'wealth' | 'mindset';
  isActive: boolean;
  createdAt: string; // ISO date
};

// Daily check-in log
type CheckInEntry = {
  date: string;       // "YYYY-MM-DD" (the day being reviewed)
  habitId: string;
  completed: boolean;
  loggedAt: string;   // ISO timestamp when user submitted
};

// Alarm config
type AlarmConfig = {
  hour: number;
  minute: number;
  days: number[];     // 0=Sun, 1=Mon, ... 6=Sat
  isEnabled: boolean;
  notificationId?: string;
};
```

All data persisted locally with AsyncStorage.
