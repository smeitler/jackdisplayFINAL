# DayCheck – Project TODO

- [x] Update theme colors (primary purple, category colors)
- [x] Add icon mappings for all tabs and UI icons
- [x] Create data models and AsyncStorage persistence layer (habits, check-ins, alarm config)
- [x] Create NotificationService (request permissions, schedule/cancel daily alarm)
- [x] Build Home screen (alarm status card, pending check-in banner, quick stats)
- [x] Build Check-In Sheet modal (category sections, habit checkboxes, submit)
- [x] Build Progress / Metrics screen (score cards, streak, weekly bar chart)
- [x] Build Alarm Settings screen (time picker, day toggles, enable/disable)
- [x] Build Manage Habits screen (list by category, add/edit/delete)
- [x] Wire tab navigation (Today, Progress, Settings)
- [x] Handle notification response → open Check-In Sheet
- [x] Seed default habits for each category
- [x] Generate and apply app icon/branding
- [x] End-to-end flow testing and polish

- [x] Update CheckInEntry to use rating: 'none' | 'red' | 'yellow' | 'green' instead of boolean completed
- [x] Update storage submitCheckIn to accept ratings map
- [x] Update getCategoryRate to use weighted scores (green=1, yellow=0.5, red=0)
- [x] Rebuild check-in screen with Red/Yellow/Green tap-to-rate buttons per habit
- [x] Add date navigation to check-in screen (back arrow to go to previous days)
- [x] Add "History" entry point on Today screen and Progress screen to browse past days
- [x] Update progress bar colors to reflect green/yellow/red distribution
- [x] Update 7-day bar chart to use weighted scores

- [x] Redesign rating buttons: replace emoji circles with modern pill/chip color selectors
- [x] Clean up check-in screen layout: tighter spacing, better typography, remove visual clutter
- [x] Update rating summary badges to match new design language
- [x] Polish Today screen category cards to match new rating style

- [x] Remove per-row rating labels, keep only top legend reference
- [x] Redesign 3 rating options as a single segmented color button (slightly separated segments)

- [x] Build CalendarHeatmap component (month grid, day cells colored by score)
- [x] Add month navigation (prev/next arrows) to calendar
- [x] Tap a day cell to open that day's check-in review
- [x] Integrate calendar into Progress/Analytics screen

- [x] Update Category type to support custom categories (id, label, emoji) stored in AsyncStorage
- [x] Seed default categories (Health 💪, Relationships ❤️, Wealth 💰, Mindset 🧠)
- [x] Build EmojiPicker component (grid of common emojis, searchable by group)
- [x] Rebuild Manage Habits screen: list categories, tap to expand habits, add/edit/delete habits
- [x] Add emoji picker to habit edit (swap emoji per habit)
- [x] Add category management: add new category, rename, change emoji, delete (with confirmation)
- [x] Update check-in screen to use dynamic categories
- [x] Update progress screen to use dynamic categories
- [x] Update home screen category grid to use dynamic categories

- [x] Calendar: show red for past days with no check-in, keep future days neutral/empty

- [x] Calendar: on logged days show a day-detail popover with each category emoji + colored dot (red/yellow/green)

- [x] Calendar: show per-category colored dots inside each logged day cell (2x2 grid, no tap required)

- [x] Revert calendar to clean month heatmap view (remove inline category dots from cells)

- [x] Build CategoryCalendar component: month grid where each day shows one dot per habit (green/yellow/red)
- [x] Rebuild Analytics screen: one CategoryCalendar per category, stacked vertically, scroll to browse
- [x] Keep summary stats (streak, days logged, overall %) at the top of Analytics

- [x] Analytics: show full habit names in the habit key (remove truncation, allow wrapping)

- [x] Calendar: only show red for days with ZERO entries; days with partial/full data use score-based color
- [x] Check-in: disable submit button until every active habit has been rated (no 'none' ratings remaining)

- [x] Fix calendar: completed days still showing red — debug entry lookup vs stored data
- [x] Calendar cells: show mini habit emoji + colored dot per habit (fallback to dots-only if too tight)

- [x] Analytics: fix category card to show full-size month calendar grid (not a tiny strip)
- [x] Analytics: fix habit emojis showing as ⭐ instead of their actual emoji
- [x] Analytics: remove the habit list from the card header — calendar IS the main content

- [x] Calendar: past days with no data = completely blank cell (no red, no fill)
- [x] Calendar: logged days = subtle blue/primary tinted background
- [x] Calendar: habit emoji+dot stack vertically one per row (not side by side)

- [x] Calendar: fix uniform cell height — logged day emoji+dot rows must not expand the cell

- [x] Analytics: remove habit chip list from card header (calendar is the main content)
- [x] Analytics: fix calendar width to fill the full card (no H_PAD miscalculation)
- [x] Analytics: fix logged day cell showing "1d" text instead of emoji+dot rows

- [x] Calendar: past days with no data = red cell (skipped indicator)
- [x] Calendar: taller cells so all habit emoji+dot rows are fully visible (no clipping)
- [x] Analytics: habit legend below each calendar — tap a habit to filter calendar to that habit only

- [x] Analytics legend: show full habit names (no numberOfLines truncation, allow wrap)
- [x] Default habit emoji to numbered sequence (1️⃣ 2️⃣ 3️⃣ ...) based on position in category

- [ ] Analytics: add Select All / Clear button to habit filter legend
- [ ] Analytics: calendar stays same fixed size when filtering to a single habit (no shrinking)

- [x] Vision Board tab with per-category image grids
- [x] Add photos from camera roll (multi-select)
- [x] Full-screen image preview with remove option
- [x] Tappable skipped (X) calendar cells navigate to check-in
- [x] Large full-cell red X for skipped days in calendar
