#!/bin/bash
# Apply patches to node_modules after install
# This patches expo-alarm-kit to:
# 1. Remove @available(iOS 26.0, *) annotations from ExpoAlarmKitModule so it
#    registers correctly with the Expo Modules autolinking system
# 2. Lower the podspec minimum iOS version from 26.1 to 26.0 to match app deployment target

PATCH_SWIFT="patches/expo-alarm-kit/ExpoAlarmKitModule.swift"
TARGET_SWIFT="node_modules/expo-alarm-kit/ios/ExpoAlarmKitModule.swift"

PATCH_PODSPEC="patches/expo-alarm-kit/ExpoAlarmKit.podspec"
TARGET_PODSPEC="node_modules/expo-alarm-kit/ios/ExpoAlarmKit.podspec"

if [ -f "$PATCH_SWIFT" ] && [ -f "$TARGET_SWIFT" ]; then
  cp "$PATCH_SWIFT" "$TARGET_SWIFT"
  echo "[patches] Applied expo-alarm-kit Swift patch (removed @available annotations)"
else
  echo "[patches] Warning: Swift patch file or target not found, skipping"
fi

if [ -f "$PATCH_PODSPEC" ] && [ -f "$TARGET_PODSPEC" ]; then
  cp "$PATCH_PODSPEC" "$TARGET_PODSPEC"
  echo "[patches] Applied expo-alarm-kit podspec patch (iOS 26.1 -> 26.0)"
else
  echo "[patches] Warning: podspec patch file or target not found, skipping"
fi
