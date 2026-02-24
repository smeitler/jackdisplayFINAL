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

- [x] Fix habit delete button not working
- [x] Add swipe-to-delete on habit rows
- [x] Move delete action inside edit modal (remove delete button from row)

- [x] Fix habit delete stale closure bug (delete not working from edit modal)
- [x] Add data-loss warning when deleting a habit with existing check-in history
- [x] Offer "Deactivate instead" option to preserve history without deleting

- [x] Fix habit delete still not working from edit modal
- [x] Move category delete button inside the category edit modal

- [x] Replace Alert.alert with inline confirm UI in HabitModal and CategoryModal (Alert blocked by web modal overlay)

- [x] Add character limit (20 chars) to habit name input with live counter
- [x] Add optional description field to habit edit modal
- [x] Persist habit description in storage

- [x] Redesign calendar cells: color-dominant blocks with habit number only (no emojis/labels)

- [x] Remove habit emojis from all UI surfaces (rows, check-in, filter chips, edit modal)

- [x] Add time range selector (7/14/30/60/90 days) to home screen progress averages

- [x] Redesign check-in screen: large tap targets, color-fill rating buttons, animated press feedback
- [x] Add satisfying completion animation when all habits in a category are rated

- [x] Add per-category bulk-rate buttons (red/yellow/green) and global rate-all row to check-in screen

- [x] Replace 5-button range selector with single tappable chip + dropdown on home screen

- [x] Rename "Categories" to "Goals" throughout the app
- [x] Expand category system to 8 life areas: Body, Mind, Relationships, Focus, Career, Money, Contribution, Spirituality
- [x] Show life area label under each goal card on home screen
- [x] Update seed data to use new 8 life areas

- [x] Add optional deadline date field to CategoryDef (goal)
- [x] Add date picker to goal edit modal for setting/clearing deadline
- [x] Show deadline countdown on home screen goal cards

- [x] Add user authentication (login screen with Manus OAuth)
- [x] Protect app routes — redirect to login if not authenticated
- [x] Add logout option in Settings
- [x] Sync user data to server per account (cross-device)

- [ ] Fix iOS/Expo Go OAuth login: redirect URI uses exp:// scheme instead of allowed manus* scheme

- [x] Fix goal (category) delete not working after server sync migration
- [x] Fix duplicate goals/habits appearing after server sync

- [x] Fix incorrect active habit count shown in Settings (orphaned habits from deleted categories cleaned up)
- [x] Add Select All / Clear buttons to Analytics habit filter legend (already implemented)

- [x] Show goal deadline on home screen goal cards and vision board
- [x] Add weekly frequency goal per habit (e.g. "3x/week") with progress indicator on home screen and vision board

- [x] Add drag-to-reorder habits within a goal in the Manage Goals screen
- [x] Ensure goals and habits are always displayed in priority order across all screens

- [x] Community tab: add to bottom navigation
- [x] Teams: create team, join by code, leave team
- [x] Teams: team detail screen showing members and their shared goal stats (yesterday, 7-day, monthly)
- [x] Shared goals: per-goal privacy toggle to allow sharing with teams
- [x] Team messaging: in-team chat screen
- [x] Refer-a-friend: referral link/code at top of Community tab, 6-month credit tracking
- [x] DB schema: teams, team_members, team_messages, shared_goals, referrals tables
- [x] tRPC API: team CRUD, join/leave, member stats, messaging, referrals

- [x] Rebrand all "DayCheck" references to "Jack" throughout the app
- [x] Update app.config.ts appName to "Jack"
- [x] Create eas.json with production API URL for EAS build
- [ ] Rebuild iOS app with correct env vars and submit to TestFlight
- [x] Change Settings tab label to "More" with hamburger (3-bar) icon
- [x] Add theme selector to More screen: Blue (default), Light, and Dark (black) options
- [x] Fix Blue theme to restore original dark purple/blue default palette
