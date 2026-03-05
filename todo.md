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
- [x] Rename themes: Blue→Purple, Light→White (pure white bg), Dark→Black
- [x] Add monthly frequency option to habit edit modal (weekly/monthly toggle with target number)
- [x] Update progress calculation to support monthly frequency targets
- [x] On-track habits: bold green glow, filled progress bar, celebratory feel on home screen goal cards
- [x] Build habit detail screen: calendar heatmap, streak stats, green/yellow/red breakdown, goal progress
- [x] Wire tap from analytics month view habit list to habit detail screen
- [x] Replace habit filter chips in analytics with direct single-tap navigation to habit detail screen
- [x] Fix weekly goal count not updating on home screen
- [x] Modernize habit number badge in analytics (remove big emoji style, use clean small number)
- [x] Fix number emoji (1️⃣ etc) still showing on habit detail and analytics — migrate stored habits and replace with clean display
- [x] Fix OAuth redirect URI: app scheme must use manus* pattern not jackalarm
- [x] Fix 7-day range dropdown rendering behind cards (z-index issue)
- [x] Remove habit name/progress bar from inside category goal card on home screen
- [x] Remove Past Reviews section from home screen
- [x] Fix habit detail streak: count consecutive days with any check-in (not just crushed)
- [x] Change Best Streak icon to green trophy on habit detail screen
- [x] Remove 1/5wk weekly goal count label from home screen goal cards
- [ ] Build category goal detail screen: all habits in category, stats, progress, breakdown
- [ ] Wire tap on home screen goal cards to navigate to category detail screen
- [ ] Wire tap on analytics category cards to navigate to category detail screen
- [ ] Remove purple bar from home screen goal cards
- [x] Build category goal detail screen with habits, stats, breakdown
- [x] Wire home screen card tap to category detail screen
- [x] Wire analytics category header tap to category detail screen
- [x] Remove purple stacked bar from home screen goal cards
- [x] Restore color progress bar on home screen goal cards (removed accidentally with purple bar fix)
- [x] Fix "Create or Join a Team" button to be full-width on Teams screen
- [x] Add proper close/exit button (X) to the Create/Join Team modal
- [ ] Team streak: fire counter showing consecutive days all members checked in
- [ ] Team streak: per-member check-in status today (green check or grey circle)
- [x] Weekly leaderboard: ranked list of members by weekly score %, current week only
- [ ] Team feed: social post cards (text, photo, or auto check-in summary)
- [ ] Team feed: "Share to team" toggle on check-in completion
- [ ] Team feed: emoji reactions on posts (fire, muscle, clap, heart)
- [ ] Team feed: text/emoji comments on posts
- [ ] Team feed: photo upload in post composer
- [ ] DB schema: team_posts, team_post_reactions, team_post_comments tables
- [ ] tRPC API: posts CRUD, reactions toggle, comments CRUD
- [ ] Create Team Goal button in More tab (owner only)
- [ ] team_goal_proposals DB table with votes
- [ ] Goal proposal card in Feed with Accept/Decline buttons
- [ ] Accept adds goal to user's personal habits list
- [x] Rename "Propose Team Goal" to "Propose Team Habit"
- [x] Remove category fields from proposal form — habit-only (name, emoji, description, frequency)
- [x] When accepting a proposal, show goal picker so member chooses which personal goal to file it under
- [ ] When a habit from a team proposal is deleted, reset the user's vote so the proposal card shows Accept/Decline again
- [ ] Store proposalId on habits so deletion can be linked back to the proposal
- [ ] Add tRPC route to reset a vote for a proposal
- [ ] Wire habit deletion in app-context to call vote reset if habit has a proposalId
- [x] Fix Vision Board photo display: remove dashed placeholder box, show photos large/full-width
- [x] Replace habit progress bars on Vision Board with editable motivations/why section per goal
- [x] Show team-shared badge on personal habit rows for habits accepted from a team proposal (display team name/icon on manage goals and check-in screens)

- [x] Hardware integration architecture document (ALARM_HARDWARE_INTEGRATION.md)
- [x] DB schema: devices and deviceEvents tables
- [x] Server DB functions: createDevicePairingToken, registerDevice, getDeviceByApiKey, getDeviceSchedule, recordDeviceEvent, deleteDevice
- [x] REST API endpoints for ESP32 firmware: POST /api/device/register, GET /api/device/schedule, POST /api/device/event, POST /api/device/heartbeat
- [x] tRPC routes for app: devices.createPairingToken, devices.list, devices.remove
- [ ] App UI: "Connect a Clock" setup wizard in More/Settings tab
- [ ] App UI: connected devices list with online/offline status in More tab
- [ ] Push notification trigger when alarm_dismissed event received from device
- [x] Fix home screen: Mindset category goal cards not showing target details like Financial goals do
- [x] Fix Vision Board: photos not persisting after app restart (save/load from AsyncStorage)
- [x] Fix DB schema: add frequencyType and monthlyGoal columns to habits table so server sync preserves them
- [x] Fix Vision Board: copy picked photos to documentDirectory for permanent persistence on iOS
- [x] Redesign Vision Board: swipeable photo carousel per goal (swipe left/right through photos)
- [x] Vision Board: tap goal section header to open full-screen goal detail view (motivations at top, all photos below with swipe)
- [x] Vision Board goal detail: motivations are fully editable (tap bullet to edit inline, swipe/tap X to delete)
- [x] Habit detail screen: tap any day in Recent History to add/edit a personal note for that day
- [x] Appearance settings: add "Punk" cyberpunk theme (neon magenta/cyan on deep black)
- [x] Fix Best Streak: count only consecutive green-rated days in a row (not all rated days)
- [ ] Appearance settings: add "Airy" theme (light, soft sky blue/white, clean minimal feel) after Momentum Valley
- [x] Fix day-note modal top cutoff: Cancel/Save bar hidden behind Dynamic Island/notch — add safe area top inset
- [x] Redesign Airy theme palette inspired by Monument Valley game: soft pastels, dreamy pinks, muted teals, lavender, warm sandy tones
- [x] Add "Nova" theme: aurora/galaxy aesthetic with animated gradient backgrounds, glowing buttons, shimmer cards, neon borders, and every visual effect possible
- [x] Vision Board main screen: show motivations/reasons under each goal section (not just in detail view)
- [x] Nova theme: replace jarring white shimmer bar with smooth atmospheric aurora glow effect
- [x] Fix "No procedure found on path goalProposals.create" error when proposing a team habit (teamGoalVotes table was missing from DB, created it; route itself was correct)
- [ ] Add Demo Mode login button on login screen: bypasses OAuth, creates a session for a pre-seeded test account so Apple reviewer can access the full app
- [x] CRITICAL: Signing in with a different account loads the previous account's local data — fix data isolation on account switch
- [ ] Profile picture: tap avatar in More/Settings to pick from photo library and upload
- [ ] Profile picture: display avatar in More/Settings account section
- [ ] Profile picture: server endpoint to upload and store avatar URL on user record
- [ ] Profile picture: tRPC route to update and fetch avatar URL
- [ ] Voice messages in team chat: hold-to-record audio message, upload to S3, play inline in chat
- [ ] Audio data privacy disclosure: add Audio Data to App Store privacy labels once voice messages are live
- [x] iPad Pro 13" layout: responsive layouts across all main screens for App Store screenshots
- [x] Fix: "On Track" green badge overflowing/too tight inside goal card
- [x] Fix: Appearance selector (purple/white/black themes) too crowded — needs more spacing (2-column grid layout)
- [x] Fix: Remove all habit icons/emojis from entire interface (no star or any icon on habits)
- [x] Fix: Propose habit error in TestFlight — removed emoji requirement, made habitEmoji optional with empty default
- [x] Fix: Community feed chat blocked by accepted habits section — proposals now in collapsible "Team Habit Proposals" row (collapsed by default)
- [x] More screen: move Daily Alarm section to the top (above Appearance)
- [x] More screen: make Appearance section collapsible with a chevron toggle (collapsed by default)
- [x] Home screen goal cards: when On Track, make the entire card background green (remove grey gap/inner badge look)
- [x] On Track card: replace garish solid green with subtle green tint + crisp border (polished look)
- [x] On Track card: restore dark green background + bright green border, fix badge padding so nothing is squished
- [x] Goal cards: add yellow "Doing Okay" state (50-79%) and red "Behind" state (<50%) with matching tint, border, badge
- [x] Fix: daily check-in summary card shows incorrect percentage — now filters ratings to active habits only before calculating score
- [x] Habits: replace all emoji/icon circles with clean numbered rank badges (1, 2, 3...) based on importance order
- [x] Habits: add reordering (up/down arrows) in habits management screen so users can set priority order
- [x] Habits: add `globalOrder` field to Habit type for cross-category importance ranking, persisted in storage
- [x] Fix: old habits still show emoji icons — stripped habit.emoji from all display surfaces (category-detail, habits modal), always show number badge only
- [x] Fix: Priority Order section redesigned — clean standalone collapsible section, clearly separate from goal rows, no trophy icon
- [x] Fix: Priority Order reorder changes reflected everywhere via globalOrder field (check-in, analytics, home screen all use activeHabits sorted by globalOrder)
- [x] Fix: category-detail habit numbering now starts at #1 within the category (not global rank)
- [x] Fix: Habit Priority Order section now has a TOOLS divider + blue-tinted border to clearly distinguish it from deleteable goal rows
- [ ] Fix: goal emoji should auto-set from selected Life Area (not a custom picker); Life Area is required when creating/editing a goal
- [x] Remove: Habit Priority Order section and TOOLS divider from Manage Goals screen entirely
- [x] Fix: goal emoji auto-sets from selected Life Area (no custom emoji picker on goals); Life Area is required to save a goal
- [x] Manage Goals: add up/down reorder arrows to goal rows so users can set goal priority order
- [x] Increase habit name character limit from 20 to 40 characters
- [x] Demo Mode: add "Try Demo" button on login screen
- [x] Demo Mode: seed rich sample data (goals, habits, check-ins, streaks) when demo is started
- [x] Demo Mode: show persistent "Demo Mode" banner so users know it's not real data
- [x] Demo Mode: "Exit Demo" button that clears demo data and returns to login screen
- [x] Demo Mode: skip server sync entirely (all data stays local)
- [x] Bug: habit name TextInput not accepting typed characters on iOS TestFlight (Add Habit / Edit Habit modal)
- [x] Bug: photos added in Vision Board disappear on TestFlight — fixed: resolve ph:// URIs via MediaLibrary.getAssetInfoAsync() before copying to documentDirectory

- [x] More tab alarm section: add alarm sound picker (list of built-in sounds with preview tap)
- [x] More tab alarm section: add optional guided meditation picker (plays after alarm is dismissed)
- [x] Persist selected alarm sound and meditation choice in AsyncStorage / alarm config
- [ ] Play selected alarm sound when alarm fires (replace default notification sound)
- [x] Play selected meditation audio after check-in is submitted (if meditation is enabled)
- [x] Bug: Add Habit modal — habit name TextInput is invisible/untappable on iOS TestFlight — fixed: removed pointerEvents box-none from KeyboardAvoidingView, added explicit nameInputWrapper with minHeight, changed nameInput to width:100%
- [x] More tab: rework alarm sound and meditation pickers as collapsible dropdown rows (tap row to expand/collapse options)
- [x] Replace tap-to-sort button with drag-and-drop reordering for goals in Manage Goals screen
- [x] Replace tap-to-sort button with drag-and-drop reordering for habits within each goal
- [x] Bug: Vision Board photos still disappearing on TestFlight after restart — fixed: persistUri now returns null on failure (never saves ph:// URIs), pickImage filters nulls, startup cleanup strips stale ph:// URIs from AsyncStorage
- [x] Update After Alarm options: Priming (first), Guided Meditation, Breathwork, Visualizations, Journaling, None
- [x] Build Mind Dump screen under More tab: capture one-off tasks/thoughts with timestamp and category
- [x] Mind Dump: ability to promote a task to today's check-in (adds as a one-off habit for today)
- [x] Bug: app crashes when tapping a meditation/breathwork option in the After Alarm dropdown — fixed: replaced useAudioPlayer (static source hook) with createAudioPlayer imperative approach; each preview creates a fresh player and releases it when done; null sources (Priming, Journaling) skip playback gracefully
- [x] Goal cards: change from 2-column grid to single full-width column so long titles never get cut off
- [x] Alarm check-in popup: add fixed header at top saying it dismisses the alarm
- [x] Home screen: only show Yesterday's Review prompt if yesterday's check-in has not been completed
- [x] Goal cards: slim down to emoji + name + days left + percentage only (remove progress bars, badges, habit counts)
- [x] Home screen stats: default range to 1d (yesterday) instead of 7d
- [ ] Goal cards: add color-coded status label (Needs Work / Getting There / On Track / Crushing It) based on percentage
- [x] Goal cards: replace with WHOOP-style circular progress rings, 2 per row, percentage inside ring, emoji + name below
- [x] Home screen: full visual polish pass — improved ring layout, header, streak display, section spacing, typography
- [x] Home screen: restore 2-column card layout with WHOOP-style SVG arc border indicating percentage
- [x] Alarm settings: add "Preview Check-in" button that opens the check-in popup so user can see/test it
- [x] Alarm settings: add toggle "Require check-in to unlock app" — blocks app access until yesterday's check-in is done
- [x] Implement app lockout gate on app open when requireCheckin is enabled and yesterday's check-in is incomplete
- [x] Fix: Nova theme home screen has large blank white/lavender area below goal cards — fill space or fix background color
- [x] Alarm check-in banner: when requireCheckin lockout is active, say "Complete your habits to turn off the alarm" instead of generic dismiss text
- [x] Fix: Nova theme white space below goal cards — set deep space background on ScreenContainer and tab bar
- [x] Fix Preview Check-in: show the real alarm banner experience (correct banner text, requireCheckin state) when tapped from settings
- [x] Add snooze button to check-in screen when opened from alarm (not lockout mode)
- [x] Add snooze interval picker in alarm settings (5, 10, 15, 20, 30 min options)
- [x] Persist snooze interval in AlarmConfig
- [x] Snooze: schedule a new notification for snoozeInterval minutes in the future and dismiss current screen

## Deep Audit Fixes (Feb 28 2026)
- [x] Bug: alarm-preview, category-detail, habit-detail, mind-dump, team screens not registered in Stack — caused navigation crashes
- [x] Bug: CheckinGate infinite redirect loop when opening alarm-preview — excluded alarm-preview from gate
- [x] Bug: isPendingCheckIn triggered even with 0 active habits — now gated on activeHabits.length > 0
- [x] Bug: submitCheckIn did not persist lastCheckIn to AsyncStorage — gate re-triggered after app restart even after check-in was done
- [x] Bug: serverAlarmToLocal discarded local-only alarm fields (soundId, meditationId, requireCheckin, snoozeMinutes) on every server sync
- [x] Bug: HabitModal and CategoryModal handleSave fired onSave without await — modal closed before save completed
- [x] Bug: handleSaveHabit and handleSaveCategory in habits.tsx not awaited — fire-and-forget
- [x] Fix: partial check-in now allowed — submit button enabled when at least 1 habit is rated (not all required)
- [x] Fix: progress.tsx had a duplicate local formatDisplayDate function — now imports from storage.ts
- [ ] Wire selected alarm sound to notification trigger (bundle .caf files, pass filename to scheduleAlarm)

## App Store Compliance (Feb 28 2026)
- [x] Wire selected alarm sound to notification trigger (.caf files for iOS)
- [x] App Store: verify all permission usage descriptions are present in app.config.ts (notifications, microphone, photo library, camera)
- [x] App Store: ensure no placeholder/test content visible to reviewers
- [x] App Store: Demo Mode must be accessible without account creation for Apple reviewer
- [x] App Store: verify no calls to private/undocumented APIs
- [x] App Store: verify app does not crash on first launch with no data
- [x] App Store: verify all external links open in in-app browser (not raw Safari)
- [x] App Store: verify no hardcoded test credentials or debug flags in production build
- [x] App Store CRITICAL: Add "Delete Account" option in More/Settings (Apple requires in-app account deletion since 2022)
- [x] App Store: Add server-side deleteUser function and tRPC route for account deletion
- [x] App Store: Add Privacy Policy link in the app (More/Settings footer)
- [x] App Store: Remove microphone permission (app never records audio, only plays it)
- [x] App Store: Remove console.log statements from OAuth callback (leaks token data to device logs)
- [x] Goal detail screen: add 6-month heatmap grid (columns=weeks, rows=days of week, red/yellow/green per day, X for untracked days)
- [x] Fix: heatmap should fit on screen without horizontal scrolling — auto-size cells to fill width
- [x] Fix: heatmap — remove month/day labels, oldest week left → newest week right
- [x] Fix: heatmap days should flow left-to-right across rows, not top-to-bottom in columns
- [x] Fix: heatmap cell size — keep left-to-right rows but fit 26 days per row (smaller cells) so full 6 months is compact
- [x] Heatmap: add year-range dropdown (1, 2, 3, 4, 5 years) — grid adjusts dynamically
- [x] Heatmap: add "6 Months" as first option in year-range dropdown (default selection)
- [x] Add SixMonthHeatmap to individual habit detail screen (per-habit daily score history)
- [x] Replace emoji icons on goal/category cards with clean vector icons (SF Symbols / Material Icons) throughout the app
- [x] Replace emojis in life area picker UI with matching vector icons
- [x] Home screen: add W/M goal progress chips to each habit row inside goal cards (current period progress + gold crown for last period hit)
- [x] Home screen: verify W/M goal calculations are correct and label chips as "This Week/Last Week" and "This Month/Last Month"
- [x] Home screen: replace range dropdown with period-comparison toggle that fits the new goal card format
- [x] Check-in screen: 15s countdown bar that re-fires alarm on timeout, resets on any touch/scroll, only dismisses on full completion
- [x] Home screen: show days remaining in current week/month on habit goal chips to motivate users
- [x] Home screen: remove Weekly/Monthly toggle; each habit auto-shows its own period chip based on its frequencyType setting
- [x] Home screen: circular progress ring around each habit showing current period fill (green=hit, yellow=on track, red=behind)
- [x] Fix Apple App Store rejection: replace external browser OAuth with in-app browser (SFSafariViewController / expo-web-browser)
- [x] Home screen: move habit rings to right side, show fraction (5/6) inside ring, label "This Wk / Last Wk" above each ring
- [x] Home screen: remove crown from last-week ring, show plain fraction number instead
- [x] Settings: fix "Failed to delete account" error — added missing cascade deletes for teamGoalVotes, teamGoalProposals, teams owned by user, and referrals as referrer
- [x] Apple review: expand demo account seed data to cover all features (habits, goals, check-ins history, community posts, team)
- [x] Apple review: ensure demo login is stable and prepare credentials for App Store Connect
- [x] Apple review: fix delete account still failing on device (iPad Air iPadOS 26.3) — clear session token before navigating away, cookie cleared before DB delete
- [x] Home screen: make all habit progress rings the same size (uniform width/height)
- [x] Apple compliance: add Sign in with Apple button on login screen
- [x] Apple compliance: ensure Privacy Policy URL opens in in-app browser
- [x] Apple compliance: verify delete account works end-to-end on device
- [x] Apple compliance: ensure demo mode shows all features (community, vision, progress, habits)
- [x] Apple compliance: add NSUserTrackingUsageDescription if any tracking is used (no tracking used — not required)
- [x] Apple compliance: verify no broken links or empty screens
- [x] Apple compliance: verify all buttons have working onPress handlers
- [x] Apple compliance: add Terms of Service link alongside Privacy Policy
- [x] Apple compliance: verify app works with no internet connection (graceful degradation — community/team screens show empty state, core habit tracking is fully local)

## Apple Rejection Round 2 + 3-Circles Feature (Mar 04 2026)
- [x] Home screen: show 3 circles per habit (This Wk, Last Wk, Week Before for weekly; This Mo, Last Mo, Month Before for monthly)
- [x] Apple Guideline 4: fix OAuth opening external browser — added WebBrowser.maybeCompleteAuthSession() to callback screen, removed Linking.openURL re-open
- [x] Apple Guideline 2.1(a) bug: delete account hardened — removed swallowed .catch(), added try/catch with real error propagation
- [x] Apple Guideline 2.1(a) info: demo team detail screen now shows 3 pre-populated posts, 3 members, reactions — Apple reviewer can explore full community feature

## Circle Order + Date Labels (Mar 04 2026)
- [x] Home screen: reverse 3-circle order so oldest is on the left and most recent is on the right
- [x] Home screen: add date range label under each ring (e.g. "Mar 3–9" or "Feb 1–28") for clarity

## Missing Plugin Fixes (Mar 04 2026)

- [x] Add expo-notifications plugin to app.config.ts with .caf sound files so alarm sounds bundle into iOS binary
- [x] Add expo-image-picker plugin to app.config.ts so NSPhotoLibraryUsageDescription is set correctly for photo picker

## Team Leaderboard Redesign (Mar 04 2026)

- [x] Team leaderboard: podium view for top 3 (gold/silver/bronze) with member name and score
- [x] Team leaderboard: ranked list below podium for remaining members with rank number, score %, and check-in status today
- [x] Team leaderboard: period selector (This Week / This Month / All Time)
- [x] Team leaderboard: show each member's current streak alongside their score (via check-in count per period)
- [x] Team leaderboard: highlight the current user's row (primary tint background)
- [x] Team leaderboard: show team average score at the top as a summary stat

## Demo Vision Board (Mar 04 2026)

- [x] Demo mode: seed vision board with bundled royalty-free photos per goal (Body, Mind, Money, Relationships, Focus)
- [x] Demo mode: seed vision board motivations/reasons per goal (4 motivations per goal)

## Demo Vision Board Fix (Mar 04 2026)

- [x] Fix: demo vision board photos not appearing in Vision Board screen after entering demo mode

## Team Stats Habit Rings (Mar 04 2026)

- [x] Team Stats tab: show shared team habit with 3 rolling-period rings matching home screen personal habit card style (2 Wks Ago / Last Wk / This Wk)

## Rewards Tab (Mar 04 2026)

- [ ] Rewards: data model (id, title, description, emoji, milestoneType: habit_count|streak|score, milestoneValue, habitId|null, status: locked|unlocked|claimed, claimedAt)
- [ ] Rewards: AsyncStorage persistence (saveRewards, loadRewards, claimReward)
- [ ] Rewards: tab screen with reward cards showing progress bar toward milestone
- [ ] Rewards: create/edit reward modal (title, description, emoji picker, milestone type + value, linked habit or any habit)
- [ ] Rewards: unlock animation when milestone is reached (confetti + haptic)
- [ ] Rewards: claim button on unlocked rewards (marks as claimed with timestamp)
- [ ] Rewards: claimed rewards section (history of earned rewards)
- [ ] Rewards: add tab to bottom navigation with gift/trophy icon
- [ ] Rewards: icon mapping added to icon-symbol.tsx before use in tabs
- [ ] Rewards: demo mode seeds 3 sample rewards with varying progress states

## UI Polish (Mar 05 2026)

- [x] Remove yellow DEMO badge overlaid on the More tab icon in the bottom tab bar
