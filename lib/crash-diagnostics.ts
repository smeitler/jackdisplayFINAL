/**
 * crash-diagnostics.ts
 *
 * Reads the crash_report.json written by the native crash handler (withCrashDiagnostics plugin).
 * Call readAndClearCrashReport() on app startup to retrieve the previous crash info.
 * The file is deleted after reading so it only shows once.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export interface CrashReport {
  name: string;
  reason: string;
  stack: string;
  time: number;
}

const CRASH_REPORT_PATH = `${FileSystem.documentDirectory}crash_report.json`;

/**
 * Reads the crash report written by the native handler, deletes it, and returns it.
 * Returns null if no crash report exists or on non-iOS platforms.
 */
export async function readAndClearCrashReport(): Promise<CrashReport | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const info = await FileSystem.getInfoAsync(CRASH_REPORT_PATH);
    if (!info.exists) return null;

    const json = await FileSystem.readAsStringAsync(CRASH_REPORT_PATH);
    // Delete immediately so it doesn't show again
    await FileSystem.deleteAsync(CRASH_REPORT_PATH, { idempotent: true });

    const report = JSON.parse(json) as CrashReport;
    return report;
  } catch {
    return null;
  }
}

/**
 * Formats a crash report for display.
 */
export function formatCrashReport(report: CrashReport): string {
  const date = new Date(report.time * 1000).toLocaleString();
  return [
    `Time: ${date}`,
    `Exception: ${report.name}`,
    `Reason: ${report.reason}`,
    '',
    'Stack Trace:',
    report.stack,
  ].join('\n');
}
