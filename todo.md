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
- [x] App UI: CrowPanel Device Pairing section in Settings (generate token, copy, pair)
- [x] App UI: connected devices list with online/offline status in Settings tab
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

## CrowPanel ESP32-S3 Firmware

- [x] PlatformIO project with ESP32-S3, LVGL 8.4, LovyanGFX, ArduinoJson, Preferences
- [x] Black background, white 12-hour clock UI (800x480)
- [x] AM/PM label, date label, WiFi status indicator
- [x] Alarm badge (pill) showing next alarm time
- [x] Alarm popup screen: large time, Dismiss (white pill) + Snooze (dark pill) buttons
- [x] Snooze logic: configurable minutes, reports snooze count to server
- [x] Check-in screen: habit grid with category colors, Done button
- [x] Pairing screen: on-screen keyboard, token input, Connect button
- [x] NVS API key persistence (survives reboot)
- [x] Device registration via POST /api/device/register with pairing token
- [x] Schedule polling every 5 minutes from server
- [x] Heartbeat every 5 minutes (uptime + RSSI)
- [x] Event reporting: alarm_fired, alarm_dismissed, snooze
- [x] NTP time sync (Mountain Time, auto DST)
- [x] Firmware compiles: RAM 38.8%, Flash 42.5%

- [x] Firmware: add WiFiManager captive portal (no reflashing to change WiFi)
- [x] Firmware: hold-button reset to re-enter WiFi setup mode

## Pairing Token Fix (Mar 06 2026)

- [x] Fix: pairing token generation failing in web preview — devices/deviceEvents tables were missing from DB (migration not applied), created them directly
- [x] Fix: web auth not sending session token as Bearer header — updated auth.ts to store/read session token in localStorage on web (was always returning null for web)

## Pairing UX Fixes (Mar 06 2026)

- [x] Fix: multiple pending CrowPanel entries appear — delete existing PENDING rows for the user before creating a new pairing token
- [x] Fix: pairing token is 48 chars (too long to type) — shorten to 6-character uppercase alphanumeric PIN

## Pairing Registration Debug (Mar 06 2026)

- [x] Debug: firmware sends token to /api/device/register but gets "failed" — root cause was duplicate MAC constraint; fixed in registerDevice

## Server Bug Fixes (Mar 06 2026)

- [x] Fix: alarm save failing in web preview (tRPC alarm upsert returning error)
- [x] Fix: /api/device/register returns 500 — duplicate MAC address unique constraint; now deletes old row before update so re-pairing works cleanly

## CrowPanel Display Fixes (Mar 06 2026)

- [x] Fix: multiple duplicate CrowPanel device entries in app UI — getUserDevices now filters to pairingToken IS NULL (registered only); test rows cleaned from DB
- [x] Fix: saved alarm not showing on CrowPanel display — root cause: firmware config.h points to non-existent Railway URL; need to publish app and update firmware to use deployed URL

## Device UI + Firmware (Mar 06 2026)

- [x] Fix: X button to remove/disconnect device not working in settings screen — now uses window.confirm on web
- [x] Firmware: update config.h API_BASE_URL to deployed server URL and rebuild — instructions written for Claude Code

## Railway Deployment (Mar 06 2026)

- [ ] Check Railway project config and existing railway.toml / Dockerfile
- [ ] Configure env vars on Railway (DB connection, etc.)
- [ ] Deploy server to Railway and verify /api/device/schedule is reachable
- [ ] Update firmware config.h API_BASE_URL to the Railway production URL

## Railway ESM Fix (Mar 06 2026)

- [x] Fix: Railway deploy crashes with "Cannot use import statement outside a module" — changed build output to dist/index.mjs and start script to node dist/index.mjs

## CrowPanel Clock Display (Mar 06 2026)

- [ ] Firmware: show next alarm time on clock face (currently only shows time, not alarm info)

## Device Revocation Flow (Mar 06 2026)

- [ ] Server: return HTTP 401 with {"revoked":true} when device key is not found (device was deleted in app)
- [ ] Firmware: on 401 from schedule/heartbeat, clear NVS API key and show pairing screen

## Alarm Popup Check-In Screen (Mar 06 2026)

- [x] Firmware: check-in screen implemented — red/yellow/green rating buttons per habit, fetched from /api/device/schedule habits array, ratings submitted via POST /api/device/checkin

## Device Checkin Endpoint (Mar 06 2026)

- [x] Server: update /api/device/schedule to include habits array in response
- [x] Server: add POST /api/device/checkin endpoint to save ratings from CrowPanel

## Immediate CrowPanel Sync (Mar 06 2026)

- [x] Server: add scheduleVersion column to devices table; bump it when user saves habits or alarms
- [x] Server: heartbeat response includes needsSync:true when scheduleVersion changed since last fetch
- [ ] Firmware: on needsSync:true in heartbeat response, immediately re-fetch schedule (instructions below)

## Alarm Popup + Check-In Screen Firmware (Mar 06 2026)

- [x] Firmware: implement alarm popup (full-screen overlay when alarm fires, Snooze + Dismiss buttons)
- [x] Firmware: implement check-in screen (habit rating buttons, Submit & Done to fully dismiss alarm)

## Required Goal Field for Habits (Mar 06 2026)

- [x] App: make goal field required when creating/editing a habit — disable Save until goal is filled, mark field as required

## API Audit + Firmware Fixes (Mar 06 2026)

- [x] Firmware: add daysOfWeek[7] + daysCount to AlarmEntry struct
- [x] Firmware: fetchSchedule() parses daysOfWeek array from server response
- [x] Firmware: checkAlarms() checks tm_wday against daysOfWeek before firing
- [x] Firmware: sendHeartbeat() now parses needsSync from response and calls pollSchedule() immediately
- [x] Write CROWPANEL_API_REFERENCE.md — definitive server contract, field names, timezone note, serial monitor checklist
- [ ] Firmware: fix reportEvent() firedAt/dismissedAt — multiply epoch by 1000 (server expects ms) or send ISO 8601 string

## TestFlight Login Fix (Mar 07 2026)

- [x] Fix: Apple Sign In fails on Railway — ReferenceError: crypto is not defined in jose/dist/webapi — polyfill globalThis.crypto at server entry point

## Data Sync Fix (Mar 08 2026)

- [x] Fix: after Apple Sign In, syncFromServer was not called with the new session token — data appeared empty on every login
- [x] Fix: syncFromServer not exposed from AppContext — added to context type and provider value
- [x] Fix: lifeArea type error in crowpanel-preview.tsx (string | undefined not assignable to string)

- [x] Fix Apple App Store rejection (Guideline 2.5.4): remove expo-audio and expo-video background mode plugins from app.config.ts to eliminate UIBackgroundModes audio declaration. Bumped to version 1.0.23 / build 10023.
- [x] Fix CrowPanel pairing PIN not connecting to server (token mismatch or expiry issue)

## App Store Compliance (Mar 11 2026)

- [x] UGC: Add long-press "Report" action on chat messages (Guideline 1.2)
- [x] UGC: Add Report flag button on team feed posts (Guideline 1.2)
- [x] UGC: Add "Block User" option in report flow (Guideline 1.2)
- [x] Server: Add contentReports and blockedUsers DB tables + migration
- [x] Server: Add moderation tRPC router (report, blockUser, unblockUser, blockedIds)
- [x] Tests: Add moderation.test.ts — 7 tests all passing

## Delete Post Fix (Mar 11 2026)

- [x] Fix: delete post button in team feed not working — replaced Alert.alert with action sheet modal
- [x] Audit all critical buttons for dead onPress handlers before App Store submission

## Deployment Fix (Mar 11 2026)

- [x] Fix deployment failure: added type:module to package.json and reverted build to ESM format (dist/index.mjs)

## Blocked Users Management (Mar 11 2026)

- [x] Add Blocked Users screen in Settings
- [x] Replace alarm time picker with iOS-style drum-roll wheel picker (hour/minute/AM-PM columns)
- [x] Add ElevenLabs voice picker in alarm settings with preview button per voice
- [x] Fetch user's saved ElevenLabs voices dynamically from the API (not hardcoded list)
- [x] Make voice preview play fast on-device by calling ElevenLabs TTS directly from the app
- [x] Filter voice picker to only show voices from the "Jack App Voices" ElevenLabs collection

## Panel Settings & Session Player (Mar 13 2026)

- [x] Build Panel Settings screen (4 sections: Audio, Voice, Low EMF Mode, About)
- [x] Wire Panel Settings into More/Settings tab (only show if device paired)
- [x] Build Post-Habit Session Player card (appears after check-in when meditationId is set)
- [x] Filter voice picker to only show voices from the "Jack App Voices" ElevenLabs collection
- [x] Rename "CrowPanel" to "Jack Alarm" in More/Settings tab; enforce single-device connection UI

## Voice System & Vision Tab (Mar 13 2026)

- [x] Move voice picker to global app setting (accessible from More tab, not inside alarm section)
- [x] Filter voice picker to only show voices from the user's Jack custom ElevenLabs collection
- [ ] Build habit pre-recording engine: call ElevenLabs per habit on voice selection, cache MP3s locally
- [ ] Re-record habit audio automatically when habit name changes
- [ ] Play pre-recorded habit audio offline when habits appear on screen (with toggle to enable/disable)
- [ ] Build personalized guided session scripts: Priming (Tony Robbins style), Guided Meditation, Breathwork — each with user name substitution
- [ ] Generate guided session audio via ElevenLabs TTS with selected voice
- [ ] Build voice journaling: mic recording screen, speech-to-text transcript saved as journal entry
- [x] Build Vision tab with three-way toggle: Vision Board / Journaling / Gratitudes

## Voice Picker Fixes (Mar 13 2026)

- [x] Fix voice preview not playing audio in the More tab voice picker
- [x] Fix voice list to only show user's saved professional voices (correct filtering)
- [x] Remove duplicate voice picker from Panel Settings screen
- [ ] Fix voice preview to use ElevenLabs built-in preview_url (instant CDN MP3, no live TTS call)

## Voice Journal (Mar 13 2026)

- [x] Fix voice preview to use ElevenLabs built-in preview_url (instant CDN MP3, no live TTS call)
- [x] Add server-side voiceJournal.transcribeAndCategorize endpoint (upload audio → Whisper → LLM categorize)
- [x] Build VoiceJournalSection component in More tab (record button, elapsed timer, processing states)
- [x] Auto-save AI-extracted journal entries to Journal tab storage on recording stop
- [x] Auto-save AI-extracted gratitude items to Gratitude tab storage on recording stop
- [x] Show recordings library in More tab with playback, date, duration, and entry count badges
- [x] Delete recording from library (removes local file + metadata)

## Time Picker UX (Mar 13 2026)

- [x] Compact wheel picker: 3 rows only (1 above, selected, 1 below), adjacent numbers slanted + faded

## Morning Practice Feature (Mar 13 2026)

- [x] Server-side script generator for Priming, Meditation, Breathwork, Visualization (personalized with name/goals/habits/gratitudes)
- [x] ElevenLabs TTS endpoint: generates audio chunks with pauses for each practice type
- [x] PracticePlayer screen: sequential chunk playback with background music, progress bar, pause/resume
- [x] Breathwork animation: expanding/contracting circle synced to Wim Hof / box breathing phases
- [x] MorningPracticeSection in More tab: pick practice type, length (5/10/20 min), breathwork style, enable post-alarm
- [x] Post-alarm auto-launch: after habit check-in, generates personalized practice and shows Begin card
- [x] Personalization: pulls name, goals, habits, yesterday's gratitudes into the script
- [x] Script regenerates when user data changes

## Permissions Onboarding (Mar 13 2026)

- [x] Build 3-step permissions setup screen (Notifications → Time-Sensitive → Focus guide)
- [x] Upgrade all alarm notifications to Time-Sensitive interruption level (breaks through Focus/DND)
- [x] Wire first-launch redirect: HomeScreen checks AsyncStorage and pushes to permissions-setup once
- [x] Permissions setup screen marks itself done in AsyncStorage so it never shows again
- [x] Step 3 opens iOS Settings so user can add Jack to Focus allowed apps list

## Rewards Restructure + Home Screen Redesign (Mar 16 2026)

### Rewards — per-habit, required
- [ ] Add required `reward` field to habit goal type in storage (name + description)
- [ ] Habit creation/edit form: show reward input fields when weekly or monthly goal is set (required to save)
- [ ] Rewards tab: remove "Create Reward" button and standalone reward creation
- [ ] Rewards tab: show rewards derived from habits (linked to habit goal completion)
- [ ] Rewards tab: allow claiming rewards only

### Home Screen Redesign
- [ ] Remove "Good morning" greeting and money display from header
- [ ] Add profile picture next to streak (tappable to change photo)
- [ ] Add CHECK-IN section showing days not yet checked in (tappable to open check-in)
- [ ] Remove Jack Alarm Preview from home screen (move to More tab only)
- [ ] Fix check-in habit numbers (should be 1,2,3 per goal group, not 1,3,5 / 2,4,6)
- [ ] Remove 30-day average from home screen stat card
- [ ] Display alarm time larger in alarm strip
- [ ] Add day chips (M T W T F S S) below alarm time showing active days
- [ ] Keep green/grey status dot, make it more visible
- [ ] Add Today's Focus Card: shows "X habits to review" or "All caught up ✓", taps to check-in
- [x] Remove always-visible goal legend; add "?" info button that shows tooltip
- [x] Reduce Goals section header size
- [x] Make THIS WEEK ring largest, LAST WEEK smaller, 2 WEEKS AGO smallest
- [x] Add rotating daily motivational quote at bottom of goals list (30+ quotes, rotates by day)

## Home Screen Redesign + Rewards Restructure (Mar 16 2026)

- [x] Contextual motivational sub-line in header (streak / check-in pending / on track states)
- [x] Alarm strip upgraded: large time display (32px), day chips (M T W T F S S)
- [x] Remove Jack Alarm Preview row from home screen
- [x] Collapse legend behind ? info button (modal on tap)
- [x] Daily motivational quote at bottom of goals list (rotates by day of year, 30 quotes)
- [x] Add reward fields to Habit type (rewardTitle, rewardDescription, rewardTarget, rewardPeriod)
- [x] Habit creation form: required reward section when weekly/monthly goal is set
- [x] Rewards tab rewritten: claim-only, shows habit-linked rewards, no create button

## Home Screen v2 + Check-in Fix (Mar 16 2026)

- [x] Remove "Good morning" greeting text from header
- [x] Remove "Money" stat card from home screen
- [x] Add profile picture next to streak (tappable to change photo)
- [x] Add persistent Today's Focus card (shows unchecked days, taps to check-in)
- [x] Remove Jack Alarm Preview from home screen (already done — verify)
- [x] Fix habit numbering in check-in: 1,2,3 per goal group (not global IDs)
- [x] Remove 30-day average stat card from home screen
- [x] Alarm strip: larger time display, day chips, visible green/grey dot
- [x] Replace generic quotes with user's curated 30-quote list

## Home Screen Polish (Mar 16 2026)

- [x] Make all 3 habit progress rings the same size (uniform, no hierarchy)
- [x] Replace streak sub-line text with today's date in the header
- [x] Redesign Today's Focus card "All caught up" state to look more polished/celebratory
- [x] Make current-period ring (This Wk/This Mo) larger than the two historical rings
- [x] Cap missed days lookback to 7 days (not 30)
- [x] Restore all 3 habit rings to same size (uniform)

## Navigation + Journal + AI Habit Mapping (Mar 16 2026)

### Navigation Redesign
- [x] Tab 1: Home — house icon with upward progress bar (keep existing)
- [x] Tab 2: Journal — book/journal icon (replaces Vision tab)
- [x] Tab 3: Rewards — diamond icon (replaces current Rewards tab icon)
- [x] Tab 4: Community — keep same icon
- [x] Tab 5: More — keep same icon
- [x] Remove Vision Board as a standalone tab

### Rewards Section Restructure
- [x] Move Vision Board into Rewards section (as a second top tab)
- [x] Rewards section: top tab bar with "Rewards" (first, default) and "Vision Board"
- [x] Wire Vision Board content into the new Rewards > Vision Board tab

### Journal Screen (new full screen)
- [x] Create app/(tabs)/journal.tsx screen
- [x] Chronological list of journal entries by day (collapsed rows: date + preview text)
- [x] Tap a day row to expand dropdown: full transcript, audio playback, AI habit mappings
- [x] Hold-to-record mic button pinned at bottom of journal screen
- [x] While holding mic: record audio via expo-audio
- [x] On release: show "Processing..." state, save recording locally
- [x] Server runs Whisper transcription via platform built-in service, returns transcript
- [x] Display transcript in new journal entry for that day
- [x] Save journal entry (date, transcript, audioUrl) to AsyncStorage

### Backend Infrastructure
- [x] Cloudflare R2 bucket created (jack-journal-audio) and credentials saved as secrets
- [x] Platform built-in storage proxy used for audio upload (storagePut)
- [x] Platform built-in Whisper service used for transcription (transcribeAudio)
- [x] voiceJournal.transcribeAndCategorize tRPC endpoint wired up and made public

### AI Habit Mapping
- [x] After transcription, server sends transcript + habit list to built-in LLM
- [x] LLM returns structured suggestions: [{habitId, habitName, suggestedNote, excerpt}]
- [x] App shows AI review screen: each suggestion as editable card (accept / edit / dismiss)
- [x] Confirmed suggestions saved as notes on the corresponding habit for that day
- [x] Expanded journal entry shows: audio player, full transcript, linked habit notes with edit/remove

## On-Device Transcription (superseded by server Whisper)

- [x] Replaced "transcription coming soon" placeholder with real server-side Whisper pipeline
- [x] Show Uploading → Transcribing → Analyzing habits progress states while processing

## Recording Visual Feedback (Mar 16 2026)
- [x] Pulsing ring animation around mic button while recording
- [x] Animated waveform bars (5 bars bouncing) while recording
- [x] Live recording timer (0:00 counting up) while recording
- [x] Mic button turns red while recording
- [x] Full recording overlay/card replaces the bottom bar while recording

## Audio Metering + Transcription Fix (Mar 16 2026)
- [x] Wire waveform bars to real microphone audio metering levels (isMeteringEnabled + dBFS mapping)
- [x] Replace "transcription unavailable" with friendlier web fallback message

## Bug: Server 500 Crash in Expo Go (Mar 16 2026)
- [x] Fix HTTP 500 server crash when submitting voice journal recordings
- [x] Root cause: transcribeAudio() downloaded audio from storage URL which lost the MIME type — Whisper rejected it as "Invalid file format"
- [x] Fix: added transcribeAudioBuffer() that sends audio buffer directly to Whisper (no URL round-trip)
- [x] Fix: storage upload and Whisper transcription now run in parallel for speed
- [x] Fix: empty transcript (silent audio) no longer throws an error
- [x] Fix: better error messages include HTTP status and Whisper error details

## Web Recording & Playback Fix (Mar 16 2026)
- [x] Fix web: recording now reads blob: URI via fetch + FileReader and sends base64 to Whisper for transcription
- [x] Fix web: audio playback now uses native HTML <audio> element on web (useAudioPlayer doesn't support blob: URIs on web)

## Journal UX Fix (Mar 16 2026)
- [x] Fix: audio entry saved immediately after recording stops — mic button is unblocked right away
- [x] Fix: "No speech detected" no longer shown as entry text — empty transcript leaves text blank
- [x] Fix: transcription runs in background; each entry shows a spinner while its transcript is loading

## Journal Bug Fixes (Mar 16 2026 - Round 2)
- [x] Fix: delete button now uses window.confirm on web (Alert.alert is a no-op in browsers)
- [x] Fix: mic button on web now uses browser MediaRecorder API directly — expo-audio recorder produces empty URI on web

## Journal + Login Bugs (Mar 16 2026 - Round 3)
- [x] Fix: web recording failure now shows a clear error message ("No microphone found. Open this link on your phone to record.") — sandbox VM has no mic hardware; recording works correctly on phone browser
- [x] Fix: Apple Sign In button is intentionally iOS-only (Apple SDK doesn't work in browsers); web login screen correctly shows "Sign in to get started" + Dev Login; clarified this is by design

## CRITICAL: Web Recording Broken on Phone (Mar 16 2026)
- [x] Fix: MicButton now uses raw onTouchStart/onTouchEnd events on web (Pressable onPressIn/onPressOut unreliable on mobile Safari/Chrome)
- [x] Fix: useWebRecorder.stop() returns Blob directly, converted to persistent data: URI via blobToDataUri()
- [x] Fix: recording indicator (timer + "Release to stop") shows correctly on web
- [x] Fix: WebAudioPlayer uses HTML <audio> with data: URI for reliable playback
- [x] Fix: server getFileExtension() now strips codec suffixes (audio/webm;codecs=opus → webm) so Whisper accepts the file
- [x] Fix: journal entries are now user-specific — storage key includes userId from getLastUserId()

## Live Debug: Recording Still Not Working (Mar 16 2026)
- [x] Confirmed: sandbox VM has no mic hardware — recording works correctly on user's phone browser
- [x] User confirmed recording AND transcription work on phone

## Journal Section Complete Redesign (Mar 16 2026)

### Sub-Tab Navigation
- [x] Add four sub-tabs within Journal: Journal, Calendar, Media, Map
- [x] Sub-tabs should be persistent across navigation

### Journal Sub-Tab (Entry List)
- [x] Show chronological list of journal entries
- [x] Each entry shows date, text preview, media thumbnails, audio indicator
- [x] Floating "+" button in bottom-right corner to create new entry (visible across all sub-tabs)

### Full-Screen Entry Editor
- [x] Full-screen modal when creating/editing an entry
- [x] Date shown at top — tappable to change the date
- [x] Audio recording button (hold to record)
- [x] Ability to add photos/videos/PDFs as attachments
- [x] Template selector for structured entries
- [x] Location field — auto-detect or manually add
- [x] Rich text area for writing

### Calendar Sub-Tab
- [x] Boxy grid calendar view — scrollable through all months
- [x] Day number is small
- [x] Shows preview text from entry if one exists for that day
- [x] Visual indicator for days with journal entries (green dot)
- [x] Tapping a day opens that day's entry or creates a new one

### Media Sub-Tab
- [x] Grid view of all media from journal entries
- [x] Filter tabs: All, Photo, Video, Audio, PDF
- [x] Tapping media opens the associated journal entry

### Map Sub-Tab
- [x] Map placeholder with location list (react-native-maps not available on web)
- [x] Each location shows entry date/preview
- [x] Location captured at time of journal submission
- [x] Data migration from old journal format to new format
- [x] JournalProvider wired in app _layout.tsx

## Journal Polish & Improvements (Mar 17 2026)

### Calendar Improvements
- [x] Infinite vertical scroll instead of left/right arrows — current month shown, scroll up for past months
- [x] Square cells (not rectangles) — fill the full screen width
- [x] Photos fill entire cell if entry has a photo (first photo takes priority)
- [x] Words preview only if no photo exists for that day
- [x] Remove month navigation arrows, replace with seamless scroll

### Entry Editor Improvements
- [x] Remove emoji mood bar from top of editor
- [x] Center the mic/record button (not on left side)
- [x] Improve templates — add habits-based template that pulls user's habits and creates note fields for each
- [x] Add more useful templates overall
- [x] Fix FAB (+) button position — needs to be lower in the journal section

### General Polish
- [x] Any additional visual improvements to make the journal look cleaner and more professional

- [x] Calendar: make day cells much larger full squares so photos and notes are clearly visible
- [x] Calendar: rebuild as true wall-calendar grid — large equal squares per day filling full screen width, like a physical monthly calendar
- [x] Calendar: extend scroll range to 10 years back and 5 years forward, auto-scroll to current month
- [x] Fix calendar: day cell borders disappeared after range expansion — restore visible grid boxes
- [x] Calendar: ensure photos always show in cells immediately after being added (fix reactivity)
- [x] Media tab: show each item with date, photo thumbnail preview, and entry context
- [x] Media tab: audio entries show text preview snippet alongside the audio player
- [x] Fix photo preview disappearing in journal list after saving
- [x] Fix templates not applying content when selected from dropdown
- [x] Show template prompts/questions as an overlay during recording so user can see what to talk about
- [x] Home screen: make habit rating circles much larger
- [x] Profile picture: save per-user so it persists correctly across sessions
- [x] Media tab: photos-only and audio-only filtered views; tap photo to expand and see which journal entry it belongs to
- [x] Journal editor: remove template pill from top, move template picker to bottom toolbar next to mic
- [x] Journal editor: merge title and body into one field — first line bold (title), Enter switches to normal body text
- [x] Journal record button: auto-show habit prompts (all habits + gratitude) when record is tapped, no template selection needed
- [x] Bug: journal transcription not filling into note/body section after recording — audio saves/plays but text doesn't appear
- [x] Journal: show AI-filled habit notes visibly in the journal editor after recording
- [x] Bug: applying a template after transcription wipes the transcribed text — template should append/merge, not replace
- [x] Journal habit notes: AI should produce short punchy phrases (e.g. "2-hour mountain workout") not full sentences
- [x] AI Coach on homepage: isolated server route reads habit data, chat UI for personalized tips/insights (no crossover with journal)
- [x] Habit voice check-in: mic button in check-in footer, tap to record/stop, AI fills ratings + notes

## Voice Check-in & AI Coach (Mar 17 2026)

- [x] Voice check-in: mic button in check-in footer, tap to record/stop, AI fills habit ratings + notes
- [x] Voice check-in: add dedicated analyzeCheckin server route (isolated from journal code)
- [x] Voice check-in: show recording status bar with pulsing animation while recording
- [x] Voice check-in: show "Analyzing..." state while AI processes
- [x] Voice check-in: AI fills green/yellow/red ratings and short description notes per habit
- [x] Voice check-in: habit description notes show inline below each habit name
- [x] AI Coach: brain icon button in home screen header opens coach chat screen
- [x] AI Coach: isolated server route reads habit history + check-in data for context
- [x] AI Coach: chat UI with suggested prompts on first open
- [x] AI Coach: personalized tips based on per-habit success rates and patterns
- [x] Fix mimeType normalization: strip codec suffix (audio/webm;codecs=opus → audio/webm) before Whisper

## Bug Fixes (Mar 17 2026 - session 2)

- [x] Fix calendar day tap not working on habit detail screen (tapping a date cell should open check-in for that date)
- [x] Fix "All caught up" banner on home screen — should be tappable to open check-in for today or yesterday
- [x] Real-time chunked voice check-in: 3-second chunks sent to Whisper+AI, ratings update live as you speak (habits only, no journal code)

## Reward & Voice Note Improvements (Mar 17 2026 - session 3)

- [x] Fix per-habit rewards: each habit stores its own reward text, emoji, and photo (not shared)
- [x] Add emoji picker popup to reward icon square in Edit Habit form
- [x] Add photo upload option to reward icon in Edit Habit form
- [x] Save voice check-in notes to habit history (shows in habit detail Recent History)

## Voice Check-in UX (Mar 17 2026 - session 4)

- [x] Make voice check-in notes editable inline on check-in screen (tap to edit, color-coded)
- [x] Reduce voice check-in chunk interval from 3s to 1s for near-real-time updates

## Delta Pipeline Architecture (Mar 17 2026 - session 5)

- [x] Server: add voiceCheckin.transcribeChunk endpoint (Whisper only, returns transcript delta)
- [x] Server: add voiceCheckin.analyzeTranscript endpoint (LLM only, takes full text transcript)
- [x] Client: send delta-only audio chunks (not cumulative blobs)
- [x] Client: update transcript display immediately on Whisper response
- [x] Client: run LLM analysis in parallel on accumulated transcript text

## Smart LLM Debounce + Final Analysis (Mar 17 2026 - session 6)

- [x] Silence detection: Web Audio AnalyserNode measures RMS every 100ms, fires LLM when 1.5s silence detected
- [x] Word delta debounce: only fire LLM if transcript grew by 8+ words since last analysis
- [x] Combine: trigger LLM on EITHER silence OR word delta (whichever comes first)
- [x] Final analysis on stop: mandatory analyzeTranscript call on complete transcript before done state

## Bug Fix (Mar 17 2026 - session 7)

- [x] Fix voice check-in: analyzing shows but ratings/notes not updating after pipeline refactor
- [x] Fix stale closure bugs: use refs for mutations, setVcNotes, and checkinRecorder in voice check-in callbacks
- [x] Lower WORD_DELTA_TRIGGER to 3 words and SILENCE_TRIGGER_MS to 1200ms for more responsive triggering
- [x] Fix only first habit getting rated: all habits now update via stable ref-based callbacks

## Bug Fix (Mar 17 2026 - session 8)

- [x] Fix day notes bleeding across all dates: reset vcNotes on date navigation + load existing notes on mount

## Voice Check-in Transcription Fix (Mar 17 2026 - session 9)

- [x] Redesign to sliding window: always send last 5s of audio to Whisper for reliable transcription
- [x] Deduplicate transcript: detect overlapping words between consecutive Whisper results
- [x] Keep LLM analysis on accumulated text (no change to analysis path)

## Voice Check-in Freeze Fix (Mar 17 2026 - session 10)

- [x] Fix: voice check-in stops recording after a short time regardless of audio level
- [x] Root cause: vcWhisperInFlightRef guard permanently locks if Whisper hangs or early-return skips finally
- [x] Add watchdog timeout (8s) to auto-clear the in-flight guard if Whisper takes too long
- [x] Remove early-return paths that bypass the finally block (move guard clear into finally always)

## Voice Check-in Stops After First Habit (Mar 17 2026 - session 11)

- [x] Fix: voice check-in stops transcribing after rating the first habit
- [x] Root cause: deduplicateTranscript over-matched after first habit, returning empty string for all subsequent windows
- [x] Root cause 2: rollingWindowRef not reset on new session, old audio poisoned first window
- [x] Fix: switched to cumulative audio approach — send ALL audio since start to Whisper each tick, replace transcript with full result (no deduplication)

## Voice Check-in Speed Improvements (Mar 17 2026 - session 12)

- [x] Reduce CHUNK_INTERVAL_MS from 3000ms to 1500ms for faster transcription ticks
- [x] Reduce SILENCE_TRIGGER_MS from 1200ms to 600ms so LLM fires sooner after speech ends
- [x] Reduce WORD_DELTA_TRIGGER from 3 to 2 words so LLM fires more eagerly
- [x] Overlap Whisper and LLM calls: fire LLM on previous transcript while Whisper processes new audio

## Voice Check-in Audio Cap Fix (Mar 17 2026 - session 13)

- [ ] Fix: Whisper slows down after several habits because cumulative blob grows unboundedly
- [ ] Implement rolling audio cap: keep only last ~15s of blobs for Whisper (drop older blobs)
- [ ] Pass full accumulated transcript as Whisper prompt so it knows what was already said
- [ ] Result: Whisper always processes a short fixed-length window regardless of session length

## Voice Check-in Segment-Based Processing (Mar 17 2026 - session 14)

- [ ] Redesign: process audio in segments — each silence boundary commits segment and resets audio buffer
- [ ] Whisper only ever sees new audio since last silence (not full growing session)
- [ ] LLM analyzes only the new segment transcript appended to the full accumulated transcript
- [ ] On silence: finalize current segment → commit its transcript → reset audio buffer for next segment
- [ ] On tick: send only current segment's audio (small, fast) to Whisper for live preview
- [ ] Result: Whisper always processes a short constant-size chunk regardless of session length

## Voice Check-in Incremental LLM Analysis (Mar 17 2026 - session 15)

- [x] Track vcConsumedTranscriptRef: character offset of transcript already analyzed by LLM
- [x] Track vcLockedHabitsRef: set of habit IDs already rated with confidence (never re-analyzed)
- [x] On each LLM call: only send transcript[consumedOffset..] (new unanalyzed portion) to LLM
- [x] LLM only receives unrated habits list (locked habits excluded from prompt)
- [x] On LLM result: lock any newly rated habits, advance consumedOffset to current transcript length
- [x] Result: LLM calls get faster and cheaper as more habits are locked in
- [x] Rolling audio cap at ~20s (200 chunks) to also bound Whisper cost

## Calendar Redesign (Mar 18 2026)

- [x] Remove text/labels from calendar day boxes
- [x] Remove bordered/lined box style — use solid filled squares instead
- [x] Darker filled color = entry exists for that day, dim/empty = no entry
- [x] Fix alignment so grid is straight and feels like a tight box grid

## Journal Calendar Redesign (Mar 18 2026)

- [x] Apply same clean square filled box style to journal calendar (no text, no borders, darker fill = entry)

## Journal Tab Calendar Redesign (Mar 18 2026)

- [x] Find the journal tab Calendar view (shows image thumbnails on month grid)
- [x] Replace image thumbnails and text with clean square filled boxes
- [x] Darker solid fill = journal entry exists that day, dim = no entry
- [x] No text, no borders, no thumbnails in boxes

## Goal Calendar Per-Habit Segments (Mar 18 2026)

- [x] Goal detail calendar: show one colored segment per habit per day cell (stacked strips)
- [x] Each strip colored by that habit's individual rating (green/amber/red)
- [x] No text in strips, just solid color fills
- [x] Empty/unrated habit strips shown as very dim

## Calendar Improvements (Mar 18 2026)

- [x] Goal/category calendar: add tiny date number top-left of each cell
- [x] Goal/category calendar: fix strip spacing so strips fill cell evenly
- [x] Journal calendar: show photo thumbnail if entry has one (photo takes priority)
- [x] Journal calendar: darker solid fill for text-only entries (no photo)
- [x] Journal calendar: add tiny date number top-left of each cell

## Journal & Homepage Improvements (Mar 18 2026)

- [x] Journal tab: reorder sub-tabs to Calendar → List → Media → Map
- [x] Journal tab: add sticky collapsing stats bar (Streak, Entries, Media count)
- [x] Journal tab: stats bar collapses on scroll down, reappears on scroll up
- [x] Journal entry: add gratitudes field ("What are you grateful for?")
- [x] Homepage: replace brain/head AI icon with pulsing gradient AI coach button
- [x] Priming screen: show photo highlights slideshow while audio plays
- [x] Priming screen: show recent gratitudes list while audio plays
- [x] Priming screen: show vision board goals while audio plays

## Journal Template Gratitude Auto-Populate (Mar 18 2026)

- [ ] When a journal template is selected, auto-populate the gratitudes field with the template's preset gratitude items

## Inline Gratitudes in Journal Body (Mar 18 2026)

- [x] Remove separate gratitudes chips UI from journal entry editor
- [x] Each template in applyTemplateByKey auto-inserts a "🙏 Grateful for:" section in the body
- [x] Add parseGratitudes(body) helper: extracts lines under "🙏 Grateful for:" section
- [x] Update priming screen to use parseGratitudes() from recent journal entries

## PDF Feedback Improvements (Mar 18 2026)

- [ ] Fix calendar day tap: go directly to habit editing, remove redundant "Body" bottom sheet step
- [ ] Make calendar date numbers more visible (lighter color, higher contrast)
- [ ] Reward claiming: play sound + show confetti/fireworks animation on claim
- [ ] Morning practice: integrate into alarm flow with duration options (5/10/15/20 min + pick at time)
- [ ] Morning practice alarm: Priming, Guided Meditation, Breathwork, Visualization each get duration picker
- [ ] On-demand session catalog: media player view to browse and play all sessions outside of alarm

## Features Implemented (Mar 18 2026)

- [x] Fix calendar day tap: go directly to habit editing, remove redundant "Body" bottom sheet step
- [x] Make calendar date numbers more visible (larger font, higher contrast)
- [x] Reward claiming: play sound + show confetti/fireworks animation on claim
- [x] Morning practice: integrate into alarm flow with duration options (5/10/15/20 min + custom, pick at time)
- [x] Morning practice alarm: Priming, Guided Meditation, Breathwork, Visualization each get duration picker
- [x] On-demand session catalog: MorningPracticeCatalog screen to browse and launch all 4 session types

## Alarm & Check-in Flow Improvements (Mar 18 2026 v2)

- [x] Alarm settings: add 5/10/15/20 min duration chips under each After Alarm option (Priming, Meditation, Breathwork, Visualizations)
- [x] Alarm settings: save selected duration per practice type (practiceDurations field per type)
- [x] Check-in submission: add fireworks/confetti celebration overlay after submitting
- [x] Morning practice card: green button = pre-selected time (default), yellow = pick custom time, red = skip
- [x] Morning practice card: show the pre-selected time prominently on the green button
- [x] Fix preview mode: show the after-alarm celebration and morning practice card in preview

## Preview Mode Fix (Mar 18 2026 v3)

- [x] Preview submit: show full celebration overlay after tapping "Save Review (Preview)"
- [x] Preview submit: show morning practice card (green/yellow/red) after preview submission
- [x] Preview: morning practice card uses alarm's saved type and duration as defaults

## Test Audio (Mar 18 2026 v4)

- [x] Bundle uploaded MP3 as test audio for Priming 5-min session
- [x] Wire it so tapping "Begin Priming · 5 min" in preview plays the bundled MP3 directly (no TTS generation needed)

## Preview Submit Fix (Mar 18 2026 v5)

- [x] Fix "Save Review (Preview)": stay on screen, show submitted UI (celebration + morning practice card) instead of navigating back immediately
- [x] Preview submit must NOT call submitCheckIn or router.back() — just set submitted=true

## Practice Player Visual Enhancements (Mar 18 2026 v6)

- [x] Practice player: load and display user's gratitude entries from journal entries
- [x] Practice player: load and display journal highlight photos (uploaded by user)
- [x] Practice player: show gratitude items as text cards while audio plays
- [x] Practice player: show journal photos as a slow-fade slideshow backdrop behind the player controls
- [x] Practice player: show vision board goals below gratitudes
- [x] Practice player: photo slideshow dots indicator
- [x] Practice player: scrollable layout so all content is accessible

## Practice Player Redesign (Mar 18 2026 v7)

- [x] Practice player: horizontal sliding photo carousel (top half of screen, continuous smooth scroll)
- [x] Practice player: tap a photo to expand it briefly then return to carousel flow
- [x] Practice player: gratitude text cycles one item at a time with fade-in animation (bottom section)
- [x] Practice player: tap a gratitude to highlight/pulse it
- [x] Practice player: fixed play/pause button at bottom center (always visible)
- [x] Practice player: X close button stays top-right
- [x] Practice player: remove breathwork circle animation (replaced by photo carousel)

## Practice Player Data Loading Fix (Mar 18 2026 v8)

- [ ] Fix journal photos not loading in practice player (check AsyncStorage key and loadEntries call)
- [ ] Fix gratitude entries not loading in practice player (check parseGratitudes and entry.gratitudes)
- [ ] Ensure data loads from the correct user ID / storage key

## Practice Player Fixes (Mar 18 2026 v9)

- [x] Fix journal photos not loading — use same pattern as checkin.tsx (getLastUserId + loadEntries)
- [x] Fix gratitudes not loading — parse from body text and entry.gratitudes field
- [x] Add real-time audio progress bar above play/pause button (shows elapsed/remaining time)
- [x] Update play/pause button color to match app theme (purple primary, not blue)

## Practice Player Photo Debug (Mar 18 2026 v10)

- [x] Add console.log to loadJournalData to show uid, entry count, photo count, gratitude count
- [x] Check if getLastUserId returns null (no logged-in user) and try fallback keys
- [x] Add fallback: scan ALL @journal_entries_v2_* AsyncStorage keys and merge entries from all of them
- [ ] Add sample/placeholder photos shown when no journal photos exist (so carousel is never blank)

## Practice Player Two-Carousel Redesign (Mar 18 2026 v11)

- [x] Practice player: Row 1 = journal photos sliding right-to-left (continuous carousel)
- [x] Practice player: Row 2 = vision board photos sliding right-to-left (slightly different speed)
- [x] Practice player: Row 3 = gratitude text chips scrolling right-to-left
- [x] Practice player: hold finger on any row to pause that row's animation
- [x] Practice player: swipe finger to scrub speed, release to resume normal speed
- [x] Practice player: load vision board images from AsyncStorage (VISION_BOARD_KEY)
- [x] Practice player: play/pause + progress bar fixed at bottom

## Practice Player Empty Rows Bug Fix (Mar 18 2026 v12)

- [ ] Fix: MEMORIES row shows blank even when journal photos exist
- [ ] Fix: VISION row shows blank even when vision board photos exist
- [ ] Fix: SlidingRow Animated.multiply approach may not work on web — switch to JS-driven animation
- [ ] Fix: empty-state placeholder for photos not showing (currently invisible)

## Bug Fixes (Mar 18)
- [x] Vision board photos not persisting on web (blob URLs now converted to base64 data URIs)
- [x] Practice player SlidingRow not rendering (children prop replaced with items prop)
- [x] Practice player gratitudes not loading from dedicated gratitude entries storage
- [x] Journal photo save error on iOS (ph:// URIs now copied to cache before base64 read)
- [x] Habit names no longer truncated — wrap to multiple lines in check-in, home, alarm preview, and analytics screens
- [x] Coach upsell card added to Community tab (glowing gold, above My Teams, Refer a Friend moved to bottom)
- [ ] Remove emojis and 'Async' from in-app coach card
- [ ] Build coaching landing page (8-Week Execution Sprint, $297)
- [x] Remove emojis and 'Async' from in-app coach card
- [x] Build coaching landing page (8-Week Execution Sprint, $297)
- [ ] Voice-to-text habit notes: record audio, Whisper transcription, submit on stop
- [x] Voice-to-text habit notes: record audio, stop, Whisper transcribes full audio, LLM rates all habits at once (simple reliable path)
- [ ] Calm theme: deep navy bg, amber/orange gradient headers, rounded cards (Appearance section)
- [ ] Calm theme: tab bar, headers, core navigation styling
- [ ] Calm theme: home screen, check-in screen, habit cards
- [ ] Calm theme: journal, vision board, community, settings screens
- [x] Calm theme: deep navy + amber gradient headers, registered in Appearance settings, applied to all screens
- [ ] Calm theme: remove all gradients, flat navy colors only
- [ ] Calm theme home: shrink header, no date, no icons
- [ ] Calm theme home: replace stats bar with 3-month pill bars (red/yellow/green fill)
- [ ] Calm theme home: remove percentage labels under category goal sections
- [x] Voice check-in full-screen modal: idle mic → listening waveform → analyzing spinner → results (habit cards + journal block + gratitude) → log/save
- [x] Fix voice-checkin: recording not working on web (needs MediaRecorder, not expo-audio) + Send button does nothing
- [x] Fix Log Habits button: should navigate to /checkin screen (not journal?action=checkin)
- [x] Voice check-in: spinner keeps spinning with cycling status text (Transcribing... → Analyzing habits... → Extracting journal...)
- [x] Voice check-in: show habit prompt card during recording (list all habits + gratitude suggestion + example phrase)
- [x] Voice check-in: optimize speed by merging two LLM calls into one combined call after Whisper transcription
- [x] Check-in screen: show habit description below habit name
- [x] Check-in screen: larger, more visible red/yellow/green square buttons
- [x] Voice check-in: auto-start recording on screen open (skip idle tap step)
- [ ] Fix voice-checkin: analyzing spinner stops spinning (must keep spinning until results arrive)
- [ ] Fix voice-checkin: results screen should use classic check-in UI (grouped categories + red/yellow/green squares)
- [x] Fix voice-checkin spinner: always mounted so Animated.loop never resets
- [x] Fix voice-checkin results: replace HabitResultCard with classic grouped-category layout (segmented red/yellow/green squares)
- [x] Fix transcription: raise 16MB limit to 100MB, increase body parser limit, set long server timeout
- [x] Fix transcription: chunk large audio files on client before sending to avoid payload limits
- [x] Voice check-in results: show editable habit description under each habit name
- [x] Voice check-in results: Journal Entry shows full transcript (editable TextInput)
- [x] Scrolling waveform visualizer (iOS Voice Memos style, bars scroll left, amplitude-driven)
- [x] AI auto-fills habit descriptions from transcript in results screen
- [ ] Journal tab redesign: day-view with < Today ▼ > header, date wheel picker, show all day's inputs (habits, voice, notes, gratitude) as cards
- [ ] Date wheel picker: add year column
- [ ] Journal day-view: make habits/transcript/gratitude editable inline
- [x] Journal day-view: match check-in review layout exactly (category icons, grouped rounded cards, compact segmented color buttons, Rate All row, no text labels on buttons)
- [x] Journal day-view: remove Rate All row
- [x] Journal day-view: always show habit descriptions on each row
- [x] Journal day-view: auto-save journal text and gratitude on keystroke (remove Save Entry button)
- [x] Journal header: add fire streak icon (top-left) with consecutive-day count
- [x] Journal header: add calendar icon (top-right) that opens the analytics calendar
- [x] Home screen: remove calendar section (moved to journal)
- [x] Journal calendar modal: use full InlineCalendar (photo thumbnails, scrollable months) same as home screen
- [x] Journal habit rows: editable TextInput for per-habit description (not status fallback text)
- [x] Voice transcription: lightly clean up with punctuation/capitalization (no word changes)
- [x] Journal day-view: show voice transcript in JOURNAL ENTRY section after saving voice check-in
- [x] Journal screen: remove the FAB (floating + button) from bottom-right
- [x] Journal screen: add photo button in the JOURNAL ENTRY section
- [x] Journal calendar modal: tapping a day navigates the day-view to that date and closes the modal
- [x] Tab bar: redesign to floating pill style (dark frosted background, active tab rounded rect highlight, no top border, large icons) with tabs: Dashboard, Journal, + center, Chat, More
- [x] Tab bar: revert floating pill, use standard full-width dark navy bar with large soft rounded icons and bold active label
- [x] Voice AI: recalibrate to aggressively extract all habit evidence from transcript, map fragments to correct habits with detailed descriptions and accurate ratings
- [x] Journal day-view: habit notes/descriptions from voice check-in not showing after save — fix sync between voice save and journal dvHabitNotes state
- [x] Remove character limits on habit note fields: TextInput maxLength and any AI prompt truncation that cuts off descriptions
- [x] Voice check-in review screen: "Try Again" button should navigate back to the voice recording screen (not a different screen)
- [x] Voice check-in review screen: gratitude items must be editable (TextInput, not static Text)
- [x] Rename "More" tab to "You" with clipboard+progress-bars icon
- [x] You screen: centered "You" title header with gear icon (Settings) top-right
- [x] You screen: three horizontal sub-tabs — Analytics, Vision Board, Rewards
- [x] Move analytics from home screen into the Analytics sub-tab of You screen
- [x] Dashboard: remove Vision Board/Rewards/Analytics tab bar
- [x] Dashboard: remove Goals section (analytics rings)
- [x] Dashboard: remove "All caught up" banner
- [x] Dashboard: keep only alarm card + streak + days-logged stats as default
- [x] Dashboard: add customizable widget system (add/remove/reorder widgets from a library)
- [x] Dashboard header: increase top padding so date/streak/profile row is not squished against status bar
- [x] Dashboard: change default widget set to empty (no Goals pre-loaded) so users start with a clean dashboard below the alarm
- [x] Fix screwy/squished top header on Journal, You, and Dashboard screens — replace hardcoded paddingTop with dynamic useSafeAreaInsets().top
- [x] Fix double safe-area padding on all tab screens — remove manual insets.top additions since ScreenContainer already handles the top edge
- [x] Fix all tab screens overlapping status bar — content starts at very top edge on every screen
- [x] Fix top safe area on all screens — SafeAreaView not applying top inset on device, need alternative approach
- [x] DEFINITIVE FIX: top safe area overlap on all screens — replaced SafeAreaView with useSafeAreaInsets() + 50px web minimum fallback in ScreenContainer
- [x] Abbreviate dashboard date format from "Friday, March 20" to "Fri, Mar 20" to prevent truncation
- [x] Add empty state message when no widgets on dashboard ("Tap Edit Dashboard to customize")
- [x] Dashboard layout reorder: Alarm → 4 wellness widgets → Streak & Days Logged
- [x] Build 2×2 wellness widget grid on dashboard: Meditate (orange circle), Sleep (purple moon), Move (green arrows), Focus (blue music note)
- [x] Each wellness widget taps through to a dedicated audio list screen
- [x] Build audio catalog screen with sections: Meditate, Sleep, Move, Focus
- [x] Meditate section: list of guided meditation audio tracks
- [x] Sleep section: list of sleep sounds / white noise / ambient audio
- [x] Move section: list of workout / movement audio tracks
- [x] Focus section: list of focus / concentration audio tracks
- [x] Source and integrate free audio content for each wellness category
- [x] Replace emoji icons on wellness cards with flat SVG icons (Meditate: lotus/person, Sleep: moon, Move: lightning/run, Focus: music note)
- [x] Wellness card icons: remove tinted background, show icon only at larger size with bold brand color
- [x] Meditate icon: replace with large peace symbol (circle + lines); Move icon: replace with dumbbell icon
- [x] Use uploaded PNG icons for wellness cards: zen.png (Meditate), fast-forward.png (Move), music.png (Focus), tinted to brand colors
- [x] Wellness audio screens: pill tab switcher (Explore / Favorites) at top of each category screen
- [x] Explore tab: shows all tracks; first favorited track pinned at top with a star/pin indicator
- [x] Favorites tab: shows all tracks the user has starred, persisted via AsyncStorage per category
- [x] Heart/star button on each track row to toggle favorite; haptic feedback on toggle
- [x] Full-screen audio player modal: opens when any wellness track is tapped
- [x] Full-screen player: large category icon, track title/artist, big play/pause button, progress bar with time, prev/next track controls
- [x] Track list rows show play indicator (waveform/dot) when that track is active; tapping again opens the full-screen player
- [x] Wellness audio screen redesign: 4-layer UX (contextual header, recommended, quick actions, explore library)
- [x] Layer 1: Contextual header strip — time-based cue (Morning/Afternoon/Night) + streak/last activity
- [x] Layer 2: Recommended cards — horizontal swipeable, 1 short + 1 medium + 1 long, shows title/duration/outcome
- [x] Layer 3: Quick Actions — pill buttons with outcome-based labels, tap = immediate full-screen player
- [x] Layer 4: Explore library — structured subcategory rows with horizontal scroll, outcome-based naming
- [x] All 4 categories (Meditate, Sleep, Move, Focus) get category-specific quick actions and subcategories
- [x] Pinned favorite appears above Recommended section in Explore tab (not at the bottom)
- [x] Fix alarm card tap on dashboard — navigate to you-settings (alarm config)
- [x] Journal screen reorder: journal entry (with photo attachment) appears above habit rating buttons (Missed/OK/Crushed It)
- [x] Journal entry section includes a photo attachment button (image picker)
- [x] Pinned favorite section header: replace "⭐ Pinned Favorite" text with a pin icon only
- [x] Favorites tab: add explicit pin button on each track row so user can choose which one is pinned to Explore
- [x] Journal entry bottom toolbar: keyboard dismiss (↓ chevron), photo library icon, paperclip attachment menu
- [x] Paperclip menu options: Tag, Audio (record), Camera (in-app photo), Video (in-app video)
- [x] Paperclip More submenu: Draw, Scan to PDF, Scan Text, Template
- [x] Journal day-view inline card: add toolbar (↓ dismiss keyboard, photo, paperclip with Tag/Audio/Camera/Video/More) matching the editor modal toolbar

- [x] Fix journal entry text cutoff (increase minHeight to 120, set textAlignVertical top)
- [x] Add Aa font style button to journal toolbar (opens Bold/Italic/Heading/Bullet formatting sheet)
- [x] Wire Audio button in attach sheet to open MicButton audio recorder modal
- [x] Wire Draw button in more sheet to open full-screen DrawCanvas with color/width picker
- [x] Wire Scan to PDF button to launch camera (capture document photo as attachment)
- [x] Wire Scan Text button to capture image via camera and extract text via AI OCR
- [x] Wire Template button to open EntryEditor with template selection
- [x] Add journal.scanText tRPC endpoint (LLM vision-based OCR)

- [x] Fix font style sheet icons (show Bold/Italic/Heading/Bullet icons, not question marks)
- [x] Make Bold/Italic/Heading/Bullet formatting actually apply to selected/current text in journal entry
- [x] Auto-format first line of journal entry as heading; pressing Enter reverts to paragraph style
- [x] Render formatted text visually in the journal entry (bold renders bold, heading renders large, etc.)

- [x] Fix raw # symbol showing in TextInput while typing (heading should style text, not show # prefix)
- [x] Fix Bold/Italic toggling — tapping Bold on already-bold text should remove the markers, not add more
- [x] Fix setNativeProps cursor crash — use selection prop state instead
- [x] Fix auto-heading: first line should visually appear large/bold without showing raw markdown syntax
- [x] Replace two-box journal editor with single seamless TextInput (no Title/Body split)

- [x] Keep keyboard open when Aa is tapped (don't blur TextInput before formatting runs)
- [x] Fix Bold/Italic to only wrap the actual selected text range, not the entire entry
- [x] Fix bold toggle detection — tapping Bold on bold text should remove ** not add more
- [x] Fix Heading to render correctly in preview (parseInlineMarkdown heading lines)
- [x] Remove hidden mounted TextInput that fires onChangeText with empty string on blur (wipes entry)
- [x] Fix parseInlineMarkdown to correctly render bold/italic segments visually
- [x] Reduce journal card minimum height so it fits content tightly (no excessive empty space)
- [x] Clean up font sheet — remove redundant right-side preview badges (B, I, T, ≡)

- [x] Fix selection lost when Aa tapped — use onPressIn + dvPreFontSheetSelection snapshot before blur
- [x] Add keepFocused prop to RichTextEditor — TextInput stays in edit mode while font sheet is open
- [x] Always persist selection in onSelectionChange (remove guard that could skip valid positions)

- [x] Replace complex journal entry card with simple inline preview card (text preview + photo thumbnail + expand button)
- [x] Build full-screen Apple Notes-style journal editor modal (black bg, top bar with back/undo/share/.../checkmark)
- [x] Add keyboard accessory toolbar to full-screen editor (Aa | checklist | paperclip | compass | magic | more)
- [x] Add Format sheet to full-screen editor (Title/Heading/Subheading/Body pills + B/I/U/S + list/align)
- [x] Wire expand button in inline card to open full-screen editor
- [x] Wire back button and checkmark to save note and close editor

- [x] Fix blue focus outline on TextInput in full-screen editor (web: add outlineWidth: 0 / outlineStyle: none)
- [x] Fix format sheet not applying formatting — moved sheet inside KeyboardAvoidingView above toolbar, changed Aa to onPress toggle
- [x] Fix top bar buttons overlapping with device status bar / notch in full-screen editor (read insets inside modal, min 44pt)

- [x] Fix bold/italic/heading rendering in full-screen editor — visual rich-text renderer (rendered Text overlay + transparent TextInput for input capture)

- [x] Rebuild journal editor with proper block+inline document model (blocks with text runs and marks)
- [x] Selection-aware inline formatting (bold/italic/underline/strikethrough on selected range with run splitting/merging)
- [x] Pending typing marks (when no selection, tapping Bold makes next typed chars bold)
- [x] Toolbar state derivation (active block type and mixed-state inline marks reflect current selection)
- [x] Block-level paragraph styles (Title/Heading/Subheading/Body change block.type, not just font size)
- [x] Autosave with debounce (persist 500ms after typing stops, save immediately on close)

- [x] Fix top bar overlapping status bar in full-screen editor on web (48pt min spacer)
- [x] Fix format sheet B/I/U/S buttons not firing on web (saved lastKnownSelection on blur, zIndex on sheet)
- [x] Fix text not rendering bold/italic visually after applying format (simplified overlay renderer, markdown wrapSelection)

- [x] Fix cursor misalignment in journal editor — removed transparent overlay, single visible TextInput with correct cursor position

- [x] Simplify full-screen journal editor: remove Aa button, format sheet, bold/italic/heading/list toolbar buttons
- [x] Keep only the photo (camera/library) buttons in the keyboard toolbar
- [x] Make editor scroll fluidly as user types (ScrollView wrapping TextInput with scrollEnabled=false)
- [x] Remove RichTextEditorView import (no longer needed in journal.tsx)

- [x] Replace AI chat tab with accountability coach sign-up landing page (promo/encourage sign-up, no actual chat)

- [x] Build multi-step accountability coach application form (goals, challenges, lifestyle, commitment, contact)
- [x] Wire "Apply for a Coach" CTA button to open the form modal

- [x] Rebuild coach application form as Typeform-style one-question-per-screen flow with smooth transitions

- [x] After last form question, generate AI-powered personalized pitch based on user's answers (short, compelling, specific to their goals/obstacles)
- [x] Add pitch loading screen while AI generates the response
- [x] Show pitch screen before success screen, with "Claim Your Spot" CTA

- [x] Generate personalized ElevenLabs TTS audio in parallel with AI pitch (starts during loading screen, ready by pitch screen)
- [x] Add audio player to pitch/checkout screen ("We made this for you, [Name]")
- [x] Add payment CTA to pitch/checkout screen (pricing card + "Start My Coaching Journey" CTA)

- [x] Remove ElevenLabs TTS audio from coach form (no more audio generation, just text pitch — faster)
- [x] Add specific habit question to coach form: exactly what habit are they starting or stopping (narrow/specific)
- [x] Rewrite pitch/checkout page using 8-week Sprint framework: kickoff workshop + daily check-ins + coach voice feedback + weekly strategy memo, $297 for 8 weeks, fully customized to their answers
- [x] Update server AI prompt to generate pitch based on Sprint framework (not generic coaching pitch)

- [x] Rewrite coach landing page (chat tab) using $100M Offers framework: personalized headline, dream hook, 4 deliverables, guarantee, concrete testimonial, CTA with tagline
- [x] Update AI pitch prompt to follow framework structure: personal open → bridge → promise → close (4–6 sentences)
- [x] Update pitch/checkout screen: personalized promise with user name, guarantee card inside pricing block

- [ ] Journal card on Today screen: make it taller so user can type directly from that view
- [ ] Journal card on Today screen: add photo library icon (not camera) to upload photos; show thumbnail on right if photo attached
- [ ] Full-screen editor: replace paperclip with photo library icon; replace camera icon with photo library icon; remove paperclip
- [ ] Full-screen editor: fix yellow checkmark button — change to app primary color (purple/blue)
- [x] Calendar shows first photo in the ordered list for each day (not necessarily the first uploaded)
- [x] Journal card photo thumbnails support drag-to-reorder (long press + drag) to set which photo shows on calendar
- [x] Reordering persists to storage so calendar always reflects the chosen first photo
- [x] Fix photo URI persistence: copy picked images to permanent documentDirectory so they survive app restarts and always show in journal card, full-screen editor, and calendar
- [x] Journal card: photo strip moved above text area (not below)
- [x] Journal card: per-photo × delete button on each thumbnail
- [x] Journal card: auto-save "✓ Saved" indicator fades in after text is persisted
- [x] Journal card: character count shown in footer when text is present
- [x] Journal card: removed "Drag ★ to set cover" clutter text
- [x] Expand button: full-screen editor replaced with slide-up bottom sheet (pageSheet presentation)
- [x] Bottom sheet editor: drag handle at top, character count in toolbar, swipe-down to dismiss
- [x] Fix X delete buttons cut off: moved X outside overflow:hidden container into outer wrapper View
- [x] Fix photos not showing in journal card and calendar: replaced all RN Image with ExpoImage (memory-disk cache, contentFit)
- [x] Move photo strip back below the text area (user preference)
- [x] Bottom sheet editor: fix top content cut off (safe area / drag handle spacing)
- [x] Bottom sheet editor: add photo strip (drag-to-reorder + × delete) at bottom above toolbar
- [x] Bottom sheet editor: wire photos prop so it shows current entry's photos
- [x] Voice check-in: fixed habit ratings not showing on journal day-view — was using raw storage submitCheckIn (bypassed app context), now uses useApp().submitCheckIn which dispatches SET_CHECKINS to update in-memory state immediately
- [x] Multiple journal entries per day: new habit ratings merge with existing (only override unset habits, don't wipe already-rated ones)
- [x] Multiple journal entries per day: append new text to existing day entry with a clean timestamp separator (e.g. ── 2:34 PM ──) instead of creating a separate entry
- [x] Journal card on Today screen: show voice log entries for today — fixed by adding useFocusEffect to refresh entries from AsyncStorage when screen regains focus after voice check-in saves
- [x] Journal card: timestamp separators now use 🎙/✏️ emoji + time headers and ─── dividers; visible as styled text
- [x] Journal card: now shows ALL day entries combined with timestamp headers; read-only when multiple entries (tap to expand)
- [x] Calendar photos: fixed overflow:hidden on Pressable causing black images — ExpoImage wrapped in its own View with borderRadius+overflow:hidden

- [x] Multi-alarm support: upgrade storage to AlarmEntry array (max 4), migrate legacy single alarm
- [x] Home screen: replace single alarm strip with AlarmsSection showing up to 4 alarm cards
- [x] Alarm cards: show label, time, day chips, and inline toggle switch
- [x] Enforce 4-alarm limit: show "Max 4 — disable one to add" when full
- [x] Build dedicated full-screen Alarms panel (modal, like Meditate/Sleep/Move/Focus panels)
- [x] Alarms panel: list all alarms with toggle, time, day chips, edit and delete per alarm
- [x] Alarms panel: Add Alarm bottom sheet with time picker (hour/minute scroll wheels) and day toggles
- [x] Alarms panel: Edit existing alarm (same sheet pre-filled)
- [x] Alarms panel: Delete alarm with confirmation
- [x] Home screen Alarms section: "+  Add" and alarm card taps open the new Alarms panel (not Settings)

- [x] Alarms panel: fix scroll picker snap-to-number (copy calibration from you-settings)
- [x] Alarms panel: add per-alarm ritual setup settings (same fields as existing alarm settings)
- [x] Home screen alarms: 1-2 alarms = full-width stacked cards; 3-4 alarms = 2x2 grid (square widget layout, half-width each)
- [x] Home screen alarm grid cards: show compact day chips below the time (same as full-width cards)
- [x] Skip morning pending check-in banner/prompt if the previous day's journal/check-in is already complete
- [x] Alarm edit modal: move snooze duration selector above label field; remove 30-min option; default to 5 min
- [x] Alarm edit modal: rewrite ritual setup as a clear numbered sequence (Step 1 Alarm → Step 2 Journal → Step 3 Ritual) with plain-English explanations
- [x] Alarm screen: snooze button adds incremental time (tap again to add more snooze time)
- [x] Home screen alarm cards: redesign to match Meditate/Sleep/Move/Focus card aesthetic (dark rounded, clean icon, softer typography)
- [x] Alarm cards: replace emoji icons with a green (on) / red (off) status circle
- [x] Alarm cards: remove status dot/badge, make time very large at top, keep only toggle + label + day chips
- [x] Home screen: move Meditate/Sleep/Move/Focus wellness grid to the top, above the alarms section
- [x] Home screen: remove Streak and Days Logged stat cards
- [x] Community/Chat screen: 3 action options (Create Family Plan, Refer a Friend, Hire a Coach) + My Teams section + large Hire an Accountability Coach CTA banner
- [x] Community/Chat screen: move large coach CTA to top, make Refer a Friend and Hire a Coach compact tappable rows
- [x] Coach CTA: open coach survey/apply modal (not external URL), add Apple In-App Purchase at end of survey flow
- [x] Full-width alarm card: compact layout — time smaller, label+toggle on same row, day chips below, no wasted vertical space
- [x] After daily check-in: show shareable celebration cards (streak milestone, perfect day, goal progress wins) with native share sheet
- [x] Update primary accent color to indigo-blue (#6366F1) and apply consistently to all submit buttons, action buttons, icons, and interactive elements
- [x] Fix submit/action buttons still showing old purple — ensure all buttons use colors.primary from useColors() hook
- [x] Fix all purple colors to indigo-blue #6366F1 (deep audit of all color sources)
- [x] Remove Punk, Nova, Calm themes from theme picker and AppTheme type
- [x] Redesign plus button sheet: 2 large side-by-side tiles (Voice Log red, Log Habits yellow)
- [x] Fix voice log flow: show journal entry popup after recording (not missing journal option)

- [x] Move Journal Entry section to top of Log Habits scroll list
- [x] Add inline editable description/note TextInput per habit row in Log Habits screen
- [x] Make date label tappable to open drum-roll date picker modal (month/day/year WheelColumn)
- [x] Replace drum-roll date picker with month calendar grid view in Log Habits screen
- [x] Polish Log Habits layout: lower legend row, reduce segmented button size for better visual balance
- [x] Add required field validation for first name, last name, email, phone in accountability coach setup (all 4 on step 1, block Continue until filled)
- [x] Add habit index number (1, 2, 3…) inside each colored habit box in the calendar view

- [x] iOS compatibility audit: add typeof guards for navigator.mediaDevices in all useWebRecorder hooks (checkin.tsx, journal.tsx, voice-checkin.tsx)
- [x] iOS compatibility audit: add typeof guards for MediaRecorder before instantiation in all web recorder hooks
- [x] iOS compatibility audit: add FileReader availability check in blobToBase64/blobToDataUri helpers
- [x] iOS compatibility audit: replace web-only type annotations (AnalyserNode, AudioContext, HTMLAudioElement) with 'any' to avoid TS errors on native
- [x] iOS compatibility audit: add Platform guard for cursor CSS property in journal.tsx recording button
- [x] iOS compatibility audit: verify all window.confirm usages have Platform.OS === 'web' guards
- [x] iOS compatibility audit: verify document references have typeof document check
- [x] iOS compatibility audit: verify window.localStorage usages have Platform.OS === 'web' guards
- [x] iOS compatibility audit: TypeScript check passes with 0 errors after all fixes

- [x] Fix: "No procedure found on path voiceCheckin.transcribeAndAnalyze" error on voice check-in (route exists server-side; production server needs re-deploy via Publish)
- [x] Fix: Permissions not properly requested on app launch (microphone, notifications, etc.)
- [x] Fix: Voice check-in habit names truncated/cut off (e.g. "Drink 8 glasses o...", "Reach out to a fri...")
- [x] Fix: Journal Entry modal has excessive blank space above the sheet
- [x] Fix: Edit Alarm screen has blank space above the title
- [x] Fix: Journal calendar Saturday column cut off on right side

- [x] Audit and fix iOS alarm system: scheduling, sound playback, snooze, wake-up flow for TestFlight
- [x] Simplify journal entry: replace modal/sheet with direct navigation to full journal screen on tap

- [x] Audit and fix photo saving pipeline for iOS TestFlight (pick, copy to app dir, persist URI)
- [x] Audit and fix calendar view photo display (retrieve stored URI, show thumbnail in cell)

- [x] Fix: Voice recording waveform bars are random animation, not real microphone levels - use expo-audio metering API

- [x] Fix: Blank space at top of Check-In screen (opened via + button)
- [x] Fix: Blank space at top of Journal screen
- [x] Fix: Blank space at top of Manage Goals screen
- [x] Fix: Swipe-down-to-dismiss not working on Edit Goal sheet
- [x] Fix: Swipe-down-to-dismiss not working on Edit Habit sheet
- [x] Fix: Swipe-down-to-dismiss not working on Add Widget sheet
- [x] Add visible drag handle indicator to all bottom sheets
- [x] Fix: Add Widget sheet cannot scroll — Rewards widget cut off, no way to reach Save
- [x] Fix: Rewards field is required in Edit Habit — make it optional, rename section to "Advanced"
- [x] Fix: You tab icon was already mapped correctly (clipboard.data.fill → assignment)
- [x] Add: Manage Goals shortcut button in Dashboard header (list icon)
- [x] Fix: Manage Goals — all categories auto-expanded by default (already implemented, verified)
- [x] Add: Persist expand/collapse state per category in Manage Goals
- [x] Fix: Keyboard hides Cancel/Save buttons in Edit Habit sheet (ScrollView inside sheet)

- [ ] Fix: Manage Goals screen cannot scroll down to see all habits
- [ ] Fix: Manage Goals drag handle pill indicator missing at top of sheet
- [ ] Fix: Add Widget sheet corner shows grey/white background — should be transparent
- [ ] Fix: Dashboard AI recommendations button has too much blank space/buffer around it
- [ ] Fix: Journal tab icon (position 2) not showing in tab bar
- [ ] Fix: Chat/You tab icon (position 3) not showing in tab bar
- [ ] Fix: Tab bar selected icon invisible in light mode — make selected icon blue or darker
- [ ] Fix: You tab icon invisible in dark mode — replace with progress/analytics/arrow icon
- [ ] Fix: Voice Check-In "Done — Analyze" button not sticky — make it fixed at bottom with gradient fade above
- [ ] Fix: Review Check-In — keyboard blocks submit, move journal entry to top, tap to open full-screen editor
- [ ] Fix: Meditation Now Playing — swipe-to-dismiss not working
- [ ] Fix: Meditation Now Playing — audio does not play in background when leaving app
- [ ] Fix: Meditation Now Playing — progress bar dot not scrubbable, add drag-to-seek
- [ ] Feature: Meditation duration selector — 5/10/15/30 min segmented pill selector before play
- [ ] Fix: Sleep audio — continuous loop up to 15 hours, user controls duration
- [ ] Fix: Focus audio — same continuous loop behavior as Sleep
- [ ] Feature: Sleep/Focus — add auto-fade out option for last 5 minutes
- [ ] Fix: Community screen — remove redundant small "Hire a Coach" list row (keep big card)
- [ ] Fix: Community screen — remove "Family Plan" row entirely
- [ ] Feature: Community screen — add Leaderboard/Streak Wall section
- [ ] Fix: Home screen — remove "Move" widget, keep row of 3 widgets (Meditate, Sleep, Focus)
- [ ] Feature: iOS app.config.ts — add Alarms, Live Activities, Background App Refresh permissions

- [x] Fix: All sheets missing drag handle pill — create shared SheetHandle component and apply everywhere
- [x] Fix: Edit Habit sheet has broken emoji/placeholder icon in top-left — remove it
- [x] Fix: Voice Check-In "Done — Analyze" button still misaligned — habit chips show below/behind it
- [x] Fix: Voice Check-In Review — journal entry appears at bottom, should be at top
- [x] Fix: Log Habits screen has massive blank space at top
- [x] Fix: Edit Alarm — saved meditation practice selection not loading back when reopening
- [x] Feature: Edit Alarm — wire meditation audio tracks from Meditate library (default track auto-selected, custom picker to choose specific track, duration selector)
- [x] Fix: Journal screen — photo/camera icon restored to journal entry card (top-right)
- [x] Fix: Journal full-screen editor — photo icon above keyboard toolbar (already present)
- [x] Feature: Journal entry card — photo thumbnail strip shown when photos attached
- [x] Fix: Community screen — Family Plan row confirmed removed from code (only in empty-state subtitle text)

- [x] Fix: Voice Check-In — Done-Analyze button overlaps last habit chip; make it a true sticky footer with proper bottom inset
- [x] Feature: Voice Check-In — waveform header collapses to mini bar on scroll down, expands back on scroll up
- [x] Fix: Community screen — permanently deleted Hire a Coach and Family Plan rows from chat.tsx (that was the actual source, not community.tsx)
- [x] Fix: Voice Check-In — Done-Analyze button — root cause was double safe area inset (ScreenContainer had bottom edge + footer also added insets.bottom). Fixed: removed bottom from ScreenContainer edges, footer now uses insets.bottom+8 only when home indicator present, button uses alignSelf:stretch instead of width:100% to avoid overflow
- [x] Fix: Journal calendar modal — X close button moved to right side
- [x] Fix: Journal calendar modal — now full-screen (presentationStyle=fullScreen, no transparent overlay)
- [x] Fix: Edit Alarm time picker — scroll locked on parent ScrollView when touching picker (onTouchStart/End)
- [x] Feature: Edit Alarm meditation picker — Priming now shows amber RECOMMENDED badge

- [x] Fix WheelTimePicker — dials frozen/unresponsive to scroll, rebuild with native ScrollView snapToInterval (fast, instant load, no JS overhead)
- [x] Fix journal entry keyboard avoidance — photo attachments hidden under keyboard when typing
- [x] Fix journal editor — photos now embed inline at cursor position (not in bottom strip)
- [x] Fix journal editor — photo button moved to right side of keyboard toolbar
- [x] Fix journal editor — no auto-focus on open; user sees full view with photos before typing

- [x] Fix: AM/PM wheel column overflows below hour/minute — reduce visible rows or match heights
- [x] Fix: Journal calendar modal X button too high (behind status bar) — move inside safe area with explicit insets.top
- [x] Fix: Journal calendar modal slow to open — converted to FlatList with getItemLayout + initialScrollIndex
- [x] Fix: Journal top bar — replaced fire icon (left) with "List" text button opening all-entries sheet
- [x] Fix: Journal top bar — replaced calendar widget icon (right) with "Calendar" text button
- [x] Feature: Home screen — added fire streak icon + journal entry count badge next to profile picture

- [x] Fix: Backend server restart so Apple login works (upstream_connect_failed on port 3000)
- [x] Fix: Home screen header — remove "manage goals" list icon and second crossed-out icon
- [x] Fix: Home screen header — date text wrapping vertically, now single line with adjustsFontSizeToFit
- [x] Fix: Home screen header — clean redesign: date left, streak pill + journal badge + AI coach + avatar right

- [x] Fix: AI chat send button hidden behind keyboard — always visible above keyboard
- [x] Fix: AI coach context — enriched with journal entries, habit notes, full check-in history for deep personalized answers
- [x] Fix: Voice summary edited text not saving — editedDescriptions now used in handleLog
- [x] Feature: Voice check-in review — tappable date header (defaults to today, opens bottom sheet picker for past 30 days)

- [x] Fix: Apple Sign-In backend connection (upstream_connect_failed recurring issue)
- [x] Improve: Voice check-in AI habit descriptions — now requires 2-3 full sentences with specifics, context, and outcome per habit

- [ ] Fix: Backend server keeps dying — Apple login fails with HTML response every session restart

- [x] Fix Apple Sign-In failure: native clients now ignore stale EXPO_PUBLIC_API_BASE_URL env var and always use hardcoded current sandbox URL in constants/oauth.ts
- [x] Add backend API reachability tests (api-base-url.test.ts) verifying health, Apple auth JSON response, and dev-login

- [x] Fix voice check-in habit notes: use exact words from transcript relevant to the habit, not AI summaries. AI may only add context that is directly relevant to the habit.

- [x] Alarm: full-screen Wake Up / Snooze screen when alarm fires (sound plays, two buttons only)
- [x] Alarm: after Wake Up tapped, show journal entry screen (manual text or voice, same as check-in options)
- [x] Alarm: after journal entry, show meditation player with selected duration from alarm settings
- [x] Meditation player: display gratitudes, vision board photos, and journal photos during playback (existing practice-player already does this)
- [x] Alarm: fix alarm sound not playing in Expo Go (alarm-ring screen plays sound directly via expo-audio on wake-up)

- [x] Add Tasks tab to the right of Rewards in the You/Profile section

- [x] Auto-extract tasks from voice journal transcripts ("remind me to...", "don't forget...", "I need to...") and add them to the Tasks list
