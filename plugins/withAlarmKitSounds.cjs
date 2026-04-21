/**
 * withAlarmKitSounds.js
 *
 * Custom Expo config plugin that copies .caf alarm sound files into the iOS
 * main bundle so AlarmKit can find them by filename (without extension).
 *
 * AlarmKit looks for sound files in the main app bundle, not in the
 * expo-notifications sounds bundle. This plugin ensures the .caf files
 * are copied to the iOS project root and included in the Xcode target.
 *
 * Uses createRequire so it works in projects with "type": "module".
 */

const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const ALARM_SOUNDS = [
  'alarm_classic.caf',
  'alarm_buzzer.caf',
  'alarm_digital.caf',
  'alarm_gentle.caf',
  'alarm_urgent.caf',
];

/**
 * Copy .caf files from assets/audio/ to the iOS project directory
 * so Xcode can include them in the bundle.
 */
function withAlarmKitSoundFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appName = config.modRequest.projectName;
      const targetDir = path.join(projectRoot, 'ios', appName);

      for (const soundFile of ALARM_SOUNDS) {
        const src = path.join(projectRoot, 'assets', 'audio', soundFile);
        const dest = path.join(targetDir, soundFile);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          console.log(`[withAlarmKitSounds] Copied ${soundFile} to iOS bundle`);
        }
      }

      return config;
    },
  ]);
}

/**
 * Add the .caf files to the Xcode project so they are included in the build.
 */
function withAlarmKitXcodeFiles(config) {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const appName = config.modRequest.projectName;

    for (const soundFile of ALARM_SOUNDS) {
      const existingFile = xcodeProject.pbxFileReferenceSection();
      const alreadyAdded = Object.values(existingFile).some(
        (ref) => typeof ref === 'object' && ref.path === `"${soundFile}"`
      );

      if (!alreadyAdded) {
        try {
          xcodeProject.addResourceFile(soundFile, { target: xcodeProject.getFirstTarget().uuid }, appName);
          console.log(`[withAlarmKitSounds] Added ${soundFile} to Xcode project`);
        } catch (e) {
          console.warn(`[withAlarmKitSounds] Could not add ${soundFile}: ${e.message}`);
        }
      }
    }

    return config;
  });
}

module.exports = function withAlarmKitSounds(config) {
  config = withAlarmKitSoundFiles(config);
  config = withAlarmKitXcodeFiles(config);
  return config;
};
