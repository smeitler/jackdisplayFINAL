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
  version: "1.0.25",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    buildNumber: "10023",
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Bundle custom notification sounds (.caf format required by iOS)
      UISupportedExternalAccessoryProtocols: [],
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
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
    "expo-router",
    "expo-apple-authentication",
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
        // Bundle all custom alarm sounds (.caf for iOS, .wav for Android)
        // These are referenced by filename in scheduleNotificationAsync({ content: { sound: 'alarm_classic.caf' } })
        sounds: [
          "./assets/audio/alarm_classic.wav",
          "./assets/audio/alarm_buzzer.wav",
          "./assets/audio/alarm_digital.wav",
          "./assets/audio/alarm_gentle.wav",
          "./assets/audio/alarm_urgent.wav",
        ],
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow $(PRODUCT_NAME) to access your photos to add images to your Vision Board.",
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
    // expo-audio: no plugin entry needed (avoids UIBackgroundModes audio declaration)
    // expo-video: no background playback (avoids UIBackgroundModes audio declaration)
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
          deploymentTarget: "16.0",
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
