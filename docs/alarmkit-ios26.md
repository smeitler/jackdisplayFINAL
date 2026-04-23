---
name: alarmkit-ios26
description: Reference guide for Apple AlarmKit integration on iOS 26, including correct AppIntents setup, AlarmConfiguration API, entitlements, expo-alarm-kit patching, and common crash fixes. Use when working with AlarmKit, expo-alarm-kit, scheduling alarms/timers on iOS 26, or debugging "Cannot find native module 'ExpoAlarmKit'" crashes.
---

# AlarmKit iOS 26 Integration Guide

Based on the [ItsukiAlarm SwiftUI reference implementation](https://github.com/0Itsuki0/ItsukiAlarm_SwiftUI). Full source files are in `references/`.

## Key Facts

- **AlarmKit requires iOS 26.0+** — framework is `AlarmKit`, not available on older OS
- **AppIntents are required** — do NOT remove `import AppIntents` or `LiveActivityIntent` structs; they are mandatory for `stopIntent`/`secondaryIntent` in `AlarmConfiguration`
- **`stopIntent` is required** in `AlarmConfiguration` — omitting it uses the wrong initializer overload and breaks the module
- **Only entitlement needed**: `com.apple.security.application-groups` (one app group shared between main app and widget extension)
- **No `AlarmManager.configure()` call needed** — just use `AlarmManager.shared` directly

## AlarmConfiguration API

```swift
// CORRECT — always pass stopIntent
let configuration = AlarmConfiguration(
    countdownDuration: countdownDuration,  // nil for alarm, non-nil for timer
    schedule: schedule,                     // nil for timer, non-nil for alarm
    attributes: attributes,
    stopIntent: StopIntent(alarmID: alarmID),
    secondaryIntent: snoozeEnabled ? RepeatIntent(alarmID: alarmID) : nil,
    sound: .default
)
```

`AlarmConfiguration` generic type `<Meta>` requires `Meta: AlarmAttributes.ContentState` — use `AlarmAttributes<YourMetadata>`.

## AppIntents Pattern

Each intent must conform to `LiveActivityIntent` (from `AppIntents` + `AlarmKit`):

```swift
import AppIntents
import AlarmKit

struct StopIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop"
    @Parameter(title: "alarmID") var alarmID: String
    init(alarmID: UUID) { self.alarmID = alarmID.uuidString }
    init() { self.alarmID = "" }
    func perform() throws -> some IntentResult {
        Task { @MainActor in try AlarmManager.shared.stop(UUID(uuidString: alarmID)!) }
        return .result()
    }
}
// Also define: RepeatIntent, PauseIntent, ResumeIntent (same pattern)
```

See `references/AppIntents.swift` for the full working implementation.

## AlarmPresentation Pattern

```swift
let alert = AlarmPresentation.Alert(
    title: LocalizedStringResource(stringLiteral: title),
    stopButton: .stopButton,
    secondaryButton: snoozeEnabled ? .snoozeButton : nil,
    secondaryButtonBehavior: snoozeEnabled ? .countdown : nil
)
// For alarm-only (no countdown): AlarmPresentation(alert: alert)
// For timer/snooze (with countdown): AlarmPresentation(alert: alert, countdown: countdown, paused: paused)
```

## Authorization

```swift
switch AlarmManager.shared.authorizationState {
case .notDetermined:
    let state = try await AlarmManager.shared.requestAuthorization()
case .authorized: break
case .denied: throw error
}
// Also observe: for await _ in AlarmManager.shared.authorizationUpdates { ... }
```

## Alarm Types (countdownDuration vs schedule)

| Type | `countdownDuration` | `schedule` |
|------|---------------------|------------|
| Traditional alarm | `nil` | non-nil |
| Traditional timer | non-nil | `nil` |
| Custom (both) | non-nil | non-nil |

## expo-alarm-kit Patching (React Native / Expo)

### Critical: Do NOT remove `@available` from module class

The `ExpoAlarmKitModule` class uses `@available(iOS 26.0, *)`. The Expo Modules autolinking generates `ExpoModulesProvider.swift` which references `ExpoAlarmKitModule.self` **without** an `if #available` guard. This causes Swift to silently exclude the module, resulting in:

```
RCTFatalException: Cannot find native module 'ExpoAlarmKit'
```

**Fix**: Remove all `@available(iOS 26.0, *)` annotations from `ExpoAlarmKitModule.swift` via a postinstall patch. The podspec minimum deployment target already enforces iOS 26.0+.

### Patch Script (`scripts/apply-patches.sh`)

```bash
#!/bin/bash
DEST="node_modules/expo-alarm-kit/ios/ExpoAlarmKitModule.swift"
PATCH="patches/expo-alarm-kit/ExpoAlarmKitModule.swift"
if [ -f "$PATCH" ]; then
  cp "$PATCH" "$DEST"
  echo "[patch] Applied expo-alarm-kit patch"
fi
```

Register in `package.json`:
```json
"scripts": {
  "postinstall": "bash scripts/apply-patches.sh"
}
```

### What to change in the patch

1. Remove `@available(iOS 26.0, *)` from the class declaration and all function definitions
2. Keep `import AppIntents` — removing it breaks `LiveActivityIntent` type resolution
3. Keep all `LiveActivityIntent` struct definitions (`AlarmDismissIntent`, `AlarmSnoozeIntent`, etc.)
4. Keep `stopIntent` and `secondaryIntent` parameters in `AlarmConfiguration` calls

## Entitlements

Main app `.entitlements`:
```xml
<key>com.apple.security.application-groups</key>
<array><string>group.YOUR_APP_GROUP</string></array>
```

Widget extension `.entitlements` — same app group key required.

## Live Activity Widget Extension

The widget extension must:
1. Import `AlarmKit` and `WidgetKit`
2. Conform to `Widget` using `AlarmAttributes<YourMetadata>` as the `ActivityAttributes`
3. Be in a separate target with its own entitlements (same app group)
4. Use `Button(intent: StopIntent(...))` for alarm control buttons

See `references/CountdownLiveActivity.swift` for the full widget implementation.

## Common Crashes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find native module 'ExpoAlarmKit'` | `@available` on module class blocks autolinking | Remove `@available` from `ExpoAlarmKitModule` |
| App crashes 0.28s after launch | expo-updates error recovery re-throwing original exception | Check console logs for `RCTFatalException` — root cause is above |
| `AlarmConfiguration` compile error | Missing `stopIntent` (required parameter) | Always pass `stopIntent: YourStopIntent(...)` |
| Alarm sound not playing | `sound: .default` has a bug | Use `sound: .named("")` as workaround |
