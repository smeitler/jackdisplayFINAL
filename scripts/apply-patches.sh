#!/bin/bash
# Apply patches to node_modules after install
# This patches expo-alarm-kit to remove AppIntents symbols that cause App Store crashes

PATCH_FILE="patches/expo-alarm-kit/ExpoAlarmKitModule.swift"
TARGET="node_modules/expo-alarm-kit/ios/ExpoAlarmKitModule.swift"

if [ -f "$PATCH_FILE" ] && [ -f "$TARGET" ]; then
  cp "$PATCH_FILE" "$TARGET"
  echo "[patches] Applied expo-alarm-kit patch (removed AppIntents symbols)"
else
  echo "[patches] Warning: patch file or target not found, skipping"
fi
