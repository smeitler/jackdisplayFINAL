/**
 * withCrashDiagnostics.cjs
 *
 * Expo config plugin that injects a native crash reporter into the iOS AppDelegate.
 * 
 * On crash: writes exception reason + stack trace to Documents/crash_report.json
 * On next launch: the JS layer reads this file and shows a "Crash Report" screen
 * so the developer can see exactly what crashed without needing Xcode/Console.app.
 */

const { withAppDelegate } = require('@expo/config-plugins');

const CRASH_REPORTER_OBJC = `
// ─── Crash Diagnostics (injected by withCrashDiagnostics plugin) ─────────────
static void JackWriteCrashReport(NSException *exception) {
  @try {
    NSArray<NSString *> *stack = [exception callStackSymbols];
    NSString *stackStr = stack ? [stack componentsJoinedByString:@"\\n"] : @"(no stack)";
    NSDictionary *report = @{
      @"name":   exception.name   ?: @"(unknown)",
      @"reason": exception.reason ?: @"(unknown)",
      @"stack":  stackStr,
      @"time":   [NSString stringWithFormat:@"%f", [[NSDate date] timeIntervalSince1970]],
    };
    NSError *err = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:&err];
    if (data && !err) {
      NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
      NSString *docs = [paths firstObject];
      NSString *path = [docs stringByAppendingPathComponent:@"crash_report.json"];
      [data writeToFile:path atomically:YES];
      NSLog(@"[CrashDiagnostics] Wrote crash report to %@", path);
    }
  } @catch (...) {
    // Never throw from a crash handler
  }
}

static void JackUncaughtExceptionHandler(NSException *exception) {
  JackWriteCrashReport(exception);
}
// ─────────────────────────────────────────────────────────────────────────────
`;

const CRASH_REPORTER_SETUP = `
  // ─── Crash Diagnostics setup ─────────────────────────────────────────────
  NSSetUncaughtExceptionHandler(&JackUncaughtExceptionHandler);
  NSLog(@"[CrashDiagnostics] Crash reporter installed");
  // Check for previous crash report and log it
  NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
  NSString *docs = [paths firstObject];
  NSString *crashPath = [docs stringByAppendingPathComponent:@"crash_report.json"];
  if ([[NSFileManager defaultManager] fileExistsAtPath:crashPath]) {
    NSData *data = [NSData dataWithContentsOfFile:crashPath];
    if (data) {
      NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
      NSLog(@"[CrashDiagnostics] Previous crash report found: %@", json);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────
`;

module.exports = function withCrashDiagnostics(config) {
  return withAppDelegate(config, (mod) => {
    let contents = mod.modResults.contents;

    // Only modify Objective-C AppDelegate (not Swift)
    if (!contents.includes('@implementation AppDelegate')) {
      console.warn('[withCrashDiagnostics] AppDelegate is not ObjC — skipping injection');
      return mod;
    }

    // Inject the static crash handler functions before @implementation
    if (!contents.includes('JackWriteCrashReport')) {
      contents = contents.replace(
        '@implementation AppDelegate',
        CRASH_REPORTER_OBJC + '@implementation AppDelegate'
      );
    }

    // Inject the setup call at the start of application:didFinishLaunchingWithOptions:
    if (!contents.includes('[CrashDiagnostics] Crash reporter installed')) {
      // Find the opening of didFinishLaunchingWithOptions and inject after the first {
      contents = contents.replace(
        /- \(BOOL\)application:\(UIApplication \*\)application didFinishLaunchingWithOptions:\(NSDictionary \*\)launchOptions\s*\{/,
        (match) => match + '\n' + CRASH_REPORTER_SETUP
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
};
