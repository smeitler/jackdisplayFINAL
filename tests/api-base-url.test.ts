/**
 * Tests that the backend API server is reachable at the current sandbox URL.
 * This validates that the hardcoded NATIVE_API_BASE_URL in constants/oauth.ts
 * points to a live server — the same URL that native (Expo Go) clients use.
 *
 * Root cause of previous failures: EXPO_PUBLIC_API_BASE_URL env var was stale
 * from an old sandbox session, overriding the correct hardcoded fallback.
 * Fix: native clients now always use the hardcoded URL, ignoring the env var.
 */
import { describe, it, expect } from "vitest";

// This is the same URL hardcoded in constants/oauth.ts as NATIVE_API_BASE_URL
const NATIVE_API_BASE_URL = "https://3000-ipdzewvi1uvuqb695kcjx-7ec38a38.us1.manus.computer";

describe("Backend API reachability (validates NATIVE_API_BASE_URL in oauth.ts)", () => {
  it("health endpoint returns {ok: true}", async () => {
    const resp = await fetch(`${NATIVE_API_BASE_URL}/api/health`);
    expect(resp.ok).toBe(true);
    const data = await resp.json() as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it("Apple auth endpoint returns JSON (not HTML) for invalid token", async () => {
    const resp = await fetch(`${NATIVE_API_BASE_URL}/api/auth/apple`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityToken: "invalid", user: "test" }),
    });
    // Should return JSON error, not an HTML page
    const contentType = resp.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/json");
    const data = await resp.json() as { error: string };
    expect(typeof data.error).toBe("string");
    // Must NOT be an HTML fallback page
    expect(data.error).not.toContain("<html");
    expect(data.error).not.toContain("<!DOCTYPE");
  });

  it("dev-login returns a valid session token", async () => {
    const resp = await fetch(`${NATIVE_API_BASE_URL}/api/auth/dev-login`, { method: "POST" });
    expect(resp.ok).toBe(true);
    const data = await resp.json() as { app_session_id: string };
    expect(typeof data.app_session_id).toBe("string");
    expect(data.app_session_id.length).toBeGreaterThan(20);
  });
});
