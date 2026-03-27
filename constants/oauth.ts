import * as ReactNative from "react-native";
import * as WebBrowser from "expo-web-browser";

// Deep link scheme matching app.config.ts — must be manus* for OAuth to work
const schemeFromBundleId = "manus20260220151145";

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: schemeFromBundleId,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 */
// CURRENT SANDBOX URL — update this whenever the sandbox session changes.
// This is the single source of truth for native (Expo Go) API calls.
// The EXPO_PUBLIC_API_BASE_URL env var is intentionally ignored on native
// because it can get stale across sandbox sessions and cause auth failures.
const NATIVE_API_BASE_URL = "https://3000-ipdzewvi1uvuqb695kcjx-7ec38a38.us1.manus.computer";

export function getApiBaseUrl(): string {
  // On native (iOS/Android), always use the hardcoded sandbox URL.
  // This prevents stale EXPO_PUBLIC_API_BASE_URL env vars from breaking auth.
  if (ReactNative.Platform.OS !== "web") {
    console.log('[getApiBaseUrl] Native: using hardcoded sandbox URL:', NATIVE_API_BASE_URL);
    return NATIVE_API_BASE_URL;
  }

  // On web, derive from current hostname by replacing port 8081 with 3000
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      console.log('[getApiBaseUrl] Web: derived from hostname:', `${protocol}//${apiHostname}`);
      return `${protocol}//${apiHostname}`;
    }
  }

  // Web fallback: use EXPO_PUBLIC_API_BASE_URL if set
  if (API_BASE_URL) {
    console.log('[getApiBaseUrl] Web: using EXPO_PUBLIC_API_BASE_URL:', API_BASE_URL);
    return API_BASE_URL.replace(/\/$/, "");
  }

  // Last resort fallback
  return "";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

const encodeState = (value: string) => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }
  const BufferImpl = (globalThis as Record<string, any>).Buffer;
  if (BufferImpl) {
    return BufferImpl.from(value, "utf-8").toString("base64");
  }
  return value;
};

/**
 * Get the redirect URI for OAuth callback.
 * - Web: uses API server callback endpoint
 * - Native: uses the manus* deep link scheme directly (NOT Linking.createURL which
 *   falls back to exp:// in Expo Go and is rejected by the OAuth server)
 */
export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    return `${getApiBaseUrl()}/api/oauth/callback`;
  } else {
    // Construct the deep link manually to ensure we always use the manus* scheme.
    // Linking.createURL() uses exp:// in Expo Go which is not allowed by the OAuth server.
    return `${env.deepLinkScheme}://oauth/callback`;
  }
};

export const getLoginUrl = () => {
  const redirectUri = getRedirectUri();
  const state = encodeState(redirectUri);

  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

/**
 * Start OAuth login flow.
 *
 * On native platforms (iOS/Android), uses WebBrowser.openAuthSessionAsync which
 * opens an in-app browser (ASWebAuthenticationSession on iOS, Chrome Custom Tabs on Android).
 * This satisfies Apple's requirement that authentication must happen within the app.
 *
 * On web, this simply redirects to the login URL.
 *
 * @returns Always null, the callback is handled via deep link.
 */
export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = getLoginUrl();
  const redirectUri = getRedirectUri();

  if (ReactNative.Platform.OS === "web") {
    // On web, just redirect
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  try {
    // openAuthSessionAsync uses ASWebAuthenticationSession on iOS (SFSafariViewController-based)
    // and Chrome Custom Tabs on Android — both keep the user inside the app.
    const result = await WebBrowser.openAuthSessionAsync(loginUrl, redirectUri, {
      dismissButtonStyle: "cancel",
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
    // If the user completed auth, the deep link callback in app/oauth/callback.tsx
    // will fire and handle the token exchange automatically via the deep link scheme.
    // NOTE: Do NOT call Linking.openURL here — that would open the system browser.
    // The deep link is already handled by Expo Router's linking configuration.
  } catch (error) {
    console.error("[OAuth] Failed to open in-app browser:", error);
  }

  return null;
}
