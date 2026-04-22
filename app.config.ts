// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const bundleId = "com.jackalarm.app";
// OAuth requires a manus* scheme — restore the original one from project creation timestamp
const manusScheme = "manus20260220151145";
// jackalarm is kept as the primary app scheme for deep links; manus scheme is used only for OAuth
const schemeFromBundleId = manusScheme;
// jackalarm scheme is registered as a secondary scheme so Live Activity
// tap URLs (jackalarm://alarm-ring) open the app correctly from the lock screen
const jackalarmScheme = 'jackalarm';

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "Jack",
  appSlug: "daily-progress-alarm",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "https://private-us-east-1.manuscdn.com/sessionFile/bxaBGTIaIiBRhmtNWFSdiZ/sandbox/PrQxSf9wSwTj5O79R9jMm3-img-1_1771618705000_na1fn_ZGF5Y2hlY2staWNvbg.png?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvYnhhQkdUSWFJaUJSaG10TldGU2RpWi9zYW5kYm94L1ByUXhTZjl3U3dUajVPNzlSOWpNbTMtaW1nLTFfMTc3MTYxODcwNTAwMF9uYTFmbl9aR0Y1WTJobFkyc3RhV052YmcucG5nP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=ie803W4jZ4sEkfXbiiPXtdxjuecMnIE1V62pOkY1vsIL7OkpqDp1XKzjZ3DuqfWWFHHKcEjX~nbb260ive6VclUM3hucn9JPnAwbqrRB5~HHRrTtzAS3Ixgq5jRz-HzjUYQqoNCSCpngm3dtwMsESXypoQo5fu6b8Hb9oGU1mBBZgs7~z7PyEpsSc6AyK3S9g-gmsNhJ7-6UGRZoC6-xFWFVgLm9IJK2PdChrVlmloFqg7TF02O~9gtsOstOCrasWt9uezkvONqm-WhhJCuVjEJ98Yzh2GNjNRyDZvlejl1ZbzcxKMGXGdVAcIGPU5FDP6jw-~PcZyTjeZ~7pZGvCw__",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.27",
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: "https://u.expo.dev/eae8d203-f1dc-4c5a-942d-eda83c2201ef",
  },
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Single scheme for web/Android compatibility; jackalarm:// registered via ios.infoPlist below
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    buildNumber: "10041",
    usesAppleSignIn: true,
    // Time Sensitive Notifications entitlement — required for the "Alarms" toggle
    // to appear in iOS Settings → Jack → Notifications.
    // EAS Build will automatically enable this capability on Apple Developer Console.
    entitlements: {
      "com.apple.developer.usernotifications.time-sensitive": true,
      // AlarmKit entitlement — required for LiveActivityIntent types (AlarmDismissIntent,
      // AlarmSnoozeIntent etc.) to register with AppIntents framework at startup.
      // Without this, AppIntents throws NSException on a background queue ~11s after launch.
      "com.apple.developer.alarm": true,
      // App Group — required for AlarmKit to share state between the main app
      // and the alarm system. Without this, configure() silently fails and
      // AlarmKit throws an NSException on expo.controller.errorRecoveryQueue at startup.
      "com.apple.security.application-groups": [`group.${bundleId}`],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UISupportedExternalAccessoryProtocols: [],
      // Required for Live Activities — expo-widgets plugin also sets this,
      // but we set it here explicitly as a safety net
      NSSupportsLiveActivities: true,
      NSSupportsLiveActivitiesFrequentUpdates: true,
      // Background modes: audio keeps alarm playing when app is backgrounded;
      // remote-notification enables silent push for background data sync
      UIBackgroundModes: ["audio", "remote-notification"],
      // Required for AlarmKit (iOS 26+) — explains why the app schedules system alarms
      NSAlarmKitUsageDescription: "Jack uses AlarmKit to schedule reliable wake-up alarms that bypass the mute switch and appear in the Clock app.",
      NSMicrophoneUsageDescription: "Jack uses your microphone to record voice check-ins and analyze your daily progress.",
      NSCameraUsageDescription: "Jack uses your camera to add photos to your journal entries and to scan the panel QR code for pairing.",
      NSPhotoLibraryUsageDescription: "Jack accesses your photo library to attach images to journal entries.",
      NSPhotoLibraryAddUsageDescription: "Jack saves photos to your library from journal entries.",
      // Register jackalarm:// as a secondary URL scheme so Live Activity tap URLs
      // (jackalarm://alarm-ring) open the app correctly from the lock screen.
      // This is iOS-only and doesn't affect web or Android.
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: [jackalarmScheme],
          CFBundleURLName: 'com.jackalarm.app.deeplink',
        },
      ],
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: ["POST_NOTIFICATIONS"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    // expo-dev-client is development-only — NEVER include in production builds
    // it crashes on startup in TestFlight/App Store because there is no dev server
    // Copy .caf alarm sound files into the iOS bundle root for AlarmKit
    "./plugins/withAlarmKitSounds.cjs",
    "expo-router",
    [
      "expo-widgets",
      {
        bundleIdentifier: `${bundleId}.ExpoWidgetsTarget`,
        groupIdentifier: `group.${bundleId}`,
        // frequentUpdates: true allows the Live Activity to update more than
        // once per minute so the snooze countdown stays accurate
        frequentUpdates: true,
        // appGroups must be listed here so EAS syncs the App Group capability
        // to com.jackalarm.app.ExpoWidgetsTarget on Apple Developer Portal
        // before generating the ad-hoc provisioning profile.
        // Without this, the profile is created without the entitlement and the
        // Xcode build fails with "doesn't support the group.com.jackalarm.app App Group".
        appGroups: [`group.${bundleId}`],
      },
    ],
    "expo-apple-authentication",
    [
      "expo-camera",
      {
        "cameraPermission": "Allow $(PRODUCT_NAME) to access your camera to scan the panel QR code for pairing."
      }
    ],
    [
      "expo-asset",
      {
        // Bundle demo vision board images so they are available offline
        assets: ["./assets/demo"],
      },
    ],
    [
      "expo-notifications",
      {
        // Bundle all custom alarm sounds.
        // .wav files are used on Android; .caf files are used on iOS (native format, better quality).
        // Both are referenced by base filename in scheduleNotificationAsync({ content: { sound: 'alarm_classic.wav' } }).
        // iOS will automatically prefer .caf if both are present in the bundle.
        sounds: [
          "./assets/audio/alarm_classic.wav",
          "./assets/audio/alarm_buzzer.wav",
          "./assets/audio/alarm_digital.wav",
          "./assets/audio/alarm_gentle.wav",
          "./assets/audio/alarm_urgent.wav",
          "./assets/audio/alarm_classic.caf",
          "./assets/audio/alarm_buzzer.caf",
          "./assets/audio/alarm_digital.caf",
          "./assets/audio/alarm_gentle.caf",
          "./assets/audio/alarm_urgent.caf",
          "./assets/audio/alarm_edm.caf",
          "./assets/audio/alarm_fulltrack.caf",
          "./assets/audio/alarm_prisonbell.caf",
          "./assets/audio/alarm_stomp4k.caf",
          "./assets/audio/alarm_stomp5k.caf",
          "./assets/audio/alarm_stomp4k.mp3",
        ],
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to access your photos to add images to your journal and Vision Board.",
        cameraPermission: "Allow $(PRODUCT_NAME) to use the camera to capture photos and videos for your journal.",
      },
    ],
    [
      "expo-media-library",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to access your photos to add them to your Vision Board.",
        savePhotosPermission: "Allow $(PRODUCT_NAME) to save photos.",
        isAccessMediaLocationEnabled: true,
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission: "Allow $(PRODUCT_NAME) to use your location to tag journal entries.",
      },
    ],
    [
      "expo-audio",
      {
        microphonePermission: "Allow $(PRODUCT_NAME) to access your microphone for voice check-ins and journal recordings.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        ios: {
          // AlarmKit requires iOS 26.0+
          deploymentTarget: "26.0",
        },
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "eae8d203-f1dc-4c5a-942d-eda83c2201ef",
    },
  },
};

export default config;
