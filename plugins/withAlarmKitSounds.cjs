/**
 * withAlarmKitSounds.js
 *
 * NOTE: This plugin is now a no-op.
 *
 * The expo-notifications plugin already bundles all .caf files listed in its
 * "sounds" array into the iOS main app bundle. AlarmKit can find them there
 * by filename (without extension) — no additional Xcode file references needed.
 *
 * Previously this plugin also added the .caf files to Xcode, which caused
 * "Multiple commands produce" build errors because expo-notifications had
 * already added them. Keeping the file as a no-op so app.config.ts doesn't
 * need to be changed.
 */

module.exports = function withAlarmKitSounds(config) {
  return config;
};
