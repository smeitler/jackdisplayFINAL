/**
 * Tests for the device pairing token endpoint.
 * Verifies that:
 * 1. Dev login returns a session token
 * 2. The session token can be used as a Bearer token to call createPairingToken
 * 3. The pairing token has the correct format and expiry
 */
import { describe, it, expect } from "vitest";

const API_BASE = "http://127.0.0.1:3000";

async function devLogin(): Promise<string> {
  const resp = await fetch(`${API_BASE}/api/auth/dev-login`, { method: "POST" });
  if (!resp.ok) throw new Error(`Dev login failed: ${resp.status}`);
  const data = await resp.json();
  if (!data.app_session_id) throw new Error("No app_session_id in response");
  return data.app_session_id;
}

describe("Device Pairing Token", () => {
  it("dev login returns a session token", async () => {
    const token = await devLogin();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(20);
  });

  it("createPairingToken succeeds with Bearer auth", async () => {
    const sessionToken = await devLogin();

    const resp = await fetch(`${API_BASE}/api/trpc/devices.createPairingToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: "{}",
    });

    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data.result?.data?.json?.token).toBeDefined();
    expect(typeof data.result.data.json.token).toBe("string");
    expect(data.result.data.json.token.length).toBe(6); // 6-char uppercase alphanumeric PIN
    expect(data.result.data.json.token).toMatch(/^[A-Z2-9]{6}$/); // uppercase, no I/O/0/1
    expect(data.result?.data?.json?.expiresAt).toBeDefined();
  });

  it("createPairingToken fails without auth", async () => {
    const resp = await fetch(`${API_BASE}/api/trpc/devices.createPairingToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const data = await resp.json();
    // Should return an error (UNAUTHORIZED or FORBIDDEN)
    expect(data.error).toBeDefined();
  });

  it("calling createPairingToken twice only leaves one pending row", async () => {
    const sessionToken = await devLogin();

    // Call three times
    for (let i = 0; i < 3; i++) {
      await fetch(`${API_BASE}/api/trpc/devices.createPairingToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
        body: "{}",
      });
    }

    // List devices — should only have 1 pending entry
    const listResp = await fetch(`${API_BASE}/api/trpc/devices.list`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const listData = await listResp.json();
    const pendingDevices = listData.result.data.json.filter((d: any) =>
      d.macAddress.startsWith("PENDING-")
    );
    expect(pendingDevices.length).toBe(1);
  });

  it("pairing token expires in ~10 minutes", async () => {
    const sessionToken = await devLogin();

    const resp = await fetch(`${API_BASE}/api/trpc/devices.createPairingToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: "{}",
    });

    const data = await resp.json();
    const expiresAt = new Date(data.result.data.json.expiresAt);
    const now = new Date();
    const diffMinutes = (expiresAt.getTime() - now.getTime()) / 1000 / 60;

    // Should expire in roughly 10 minutes (allow 1 minute tolerance)
    expect(diffMinutes).toBeGreaterThan(9);
    expect(diffMinutes).toBeLessThan(11);
  });
});

describe("Device Registration", () => {
  it("registers a device with a valid pairing token", async () => {
    const sessionToken = await devLogin();

    // Generate a pairing token
    const pairResp = await fetch(`${API_BASE}/api/trpc/devices.createPairingToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: "{}",
    });
    const pairData = await pairResp.json();
    const pairingToken = pairData.result.data.json.token;

    // Register the device
    const regResp = await fetch(`${API_BASE}/api/device/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingToken, macAddress: "DE:AD:BE:EF:00:01", firmwareVersion: "1.0.0" }),
    });
    expect(regResp.ok).toBe(true);
    const regData = await regResp.json();
    expect(regData.deviceId).toBeDefined();
    expect(typeof regData.apiKey).toBe("string");
    expect(regData.apiKey.length).toBeGreaterThan(20);
  });

  it("re-registering same MAC does not 500 (replaces old entry)", async () => {
    const sessionToken = await devLogin();
    const MAC = "DE:AD:BE:EF:00:02";

    // First registration
    const pair1 = await fetch(`${API_BASE}/api/trpc/devices.createPairingToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: "{}",
    });
    const token1 = (await pair1.json()).result.data.json.token;
    await fetch(`${API_BASE}/api/device/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingToken: token1, macAddress: MAC, firmwareVersion: "1.0.0" }),
    });

    // Second registration with same MAC
    const pair2 = await fetch(`${API_BASE}/api/trpc/devices.createPairingToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: "{}",
    });
    const token2 = (await pair2.json()).result.data.json.token;
    const regResp = await fetch(`${API_BASE}/api/device/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingToken: token2, macAddress: MAC, firmwareVersion: "1.0.1" }),
    });
    expect(regResp.ok).toBe(true);
    const regData = await regResp.json();
    expect(regData.deviceId).toBeDefined();
  });
});

describe("Alarm Save", () => {
  it("alarm.upsert saves and alarm.get returns the saved value", async () => {
    const sessionToken = await devLogin();

    const upsertResp = await fetch(`${API_BASE}/api/trpc/alarm.upsert`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ json: { hour: 7, minute: 15, days: "1,2,3,4,5", enabled: true } }),
    });
    expect(upsertResp.ok).toBe(true);

    const getResp = await fetch(`${API_BASE}/api/trpc/alarm.get`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const getData = await getResp.json();
    const alarm = getData.result.data.json;
    expect(alarm.hour).toBe(7);
    expect(alarm.minute).toBe(15);
    expect(alarm.enabled).toBe(true);
  });
});
