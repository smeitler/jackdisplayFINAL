#!/bin/bash
# EAS Build post-install hook  
# This runs AFTER pnpm install during EAS Build
# Apply the expo-alarm-kit patch to remove AppIntents symbols that cause App Store crashes

echo "[eas-hook] Applying expo-alarm-kit patch..."
PATCH_FILE="patches/expo-alarm-kit/ExpoAlarmKitModule.swift"
TARGET="node_modules/expo-alarm-kit/ios/ExpoAlarmKitModule.swift"

if [ -f "$PATCH_FILE" ] && [ -f "$TARGET" ]; then
  cp "$PATCH_FILE" "$TARGET"
  echo "[eas-hook] Applied expo-alarm-kit patch (removed AppIntents symbols)"
else
  echo "[eas-hook] Warning: patch file or target not found"
  echo "  PATCH_FILE exists: $([ -f "$PATCH_FILE" ] && echo yes || echo no)"
  echo "  TARGET exists: $([ -f "$TARGET" ] && echo yes || echo no)"
fi
