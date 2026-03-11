/**
 * Moderation tests — Apple Guideline 1.2 compliance
 * Tests: report content, block user, unblock user, get blocked IDs
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://127.0.0.1:3000";

// Dev login always returns the same user; use a synthetic non-self ID for block tests
const BLOCK_TARGET_ID = 9999999;

async function loginAs(email: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json() as { app_session_id?: string };
  return data.app_session_id ?? "";
}

async function trpcQuery(token: string, path: string) {
  const res = await fetch(`${BASE}/api/trpc/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json() as { result?: { data?: { json?: unknown } }; error?: unknown };
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result?.data?.json;
}

async function trpcMutate(token: string, path: string, input: unknown) {
  const res = await fetch(`${BASE}/api/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ json: input }),
  });
  const json = await res.json() as { result?: { data?: { json?: unknown } }; error?: unknown };
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result?.data?.json;
}

let tokenA: string;

beforeAll(async () => {
  tokenA = await loginAs("mod-user-a@test.com");
});

describe("moderation — block/unblock", () => {
  it("can block a user (non-self id)", async () => {
    await expect(trpcMutate(tokenA, "moderation.blockUser", { userId: BLOCK_TARGET_ID })).resolves.not.toThrow();
  });

  it("blocked user appears in blockedIds list", async () => {
    const ids = await trpcQuery(tokenA, "moderation.blockedIds") as number[];
    expect(ids).toContain(BLOCK_TARGET_ID);
  });

  it("can unblock a user", async () => {
    await expect(trpcMutate(tokenA, "moderation.unblockUser", { userId: BLOCK_TARGET_ID })).resolves.not.toThrow();
  });

  it("unblocked user no longer in blockedIds list", async () => {
    const ids = await trpcQuery(tokenA, "moderation.blockedIds") as number[];
    expect(ids).not.toContain(BLOCK_TARGET_ID);
  });
});

describe("moderation — report content", () => {
  it("can report a message", async () => {
    await expect(
      trpcMutate(tokenA, "moderation.report", {
        contentType: "message",
        contentId: 999,
        reason: "spam",
      })
    ).resolves.not.toThrow();
  });

  it("can report a post with reason harassment", async () => {
    await expect(
      trpcMutate(tokenA, "moderation.report", {
        contentType: "post",
        contentId: 999,
        reason: "harassment",
        details: "Test report",
      })
    ).resolves.not.toThrow();
  });

  it("duplicate report is idempotent (no error)", async () => {
    await expect(
      trpcMutate(tokenA, "moderation.report", {
        contentType: "message",
        contentId: 999,
        reason: "spam",
      })
    ).resolves.not.toThrow();
  });
});
