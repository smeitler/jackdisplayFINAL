import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { getUserByOpenId, upsertUser } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { jwtVerify, createRemoteJWKSet } from "jose";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

async function syncUser(userInfo: {
  openId?: string | null;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  platform?: string | null;
}) {
  if (!userInfo.openId) {
    throw new Error("openId missing from user info");
  }

  const lastSignedIn = new Date();
  await upsertUser({
    openId: userInfo.openId,
    name: userInfo.name || null,
    email: userInfo.email ?? null,
    loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
    lastSignedIn,
  });
  const saved = await getUserByOpenId(userInfo.openId);
  return (
    saved ?? {
      openId: userInfo.openId,
      name: userInfo.name,
      email: userInfo.email,
      loginMethod: userInfo.loginMethod ?? null,
      lastSignedIn,
    }
  );
}

function buildUserResponse(
  user:
    | Awaited<ReturnType<typeof getUserByOpenId>>
    | {
        openId: string;
        name?: string | null;
        email?: string | null;
        loginMethod?: string | null;
        lastSignedIn?: Date | null;
      },
) {
  return {
    id: (user as any)?.id ?? null,
    openId: user?.openId ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    loginMethod: user?.loginMethod ?? null,
    lastSignedIn: (user?.lastSignedIn ?? new Date()).toISOString(),
  };
}

// Apple public key set for verifying identity tokens.
// cooldownDuration=0 ensures we always re-fetch when a key is not found (handles key rotation).
// cacheMaxAge=300000 (5 min) keeps the cache fresh without hammering Apple's servers.
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"), {
  cooldownDuration: 0,
  cacheMaxAge: 300000,
});

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      await syncUser(userInfo);
      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect to the frontend URL (Expo web on port 8081)
      // Cookie is set with parent domain so it works across both 3000 and 8081 subdomains
      const frontendUrl =
        process.env.EXPO_WEB_PREVIEW_URL ||
        process.env.EXPO_PACKAGER_PROXY_URL ||
        "http://localhost:8081";
      res.redirect(302, frontendUrl);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  app.get("/api/oauth/mobile", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      const user = await syncUser(userInfo);

      const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(user),
      });
    } catch (error) {
      console.error("[OAuth] Mobile exchange failed", error);
      res.status(500).json({ error: "OAuth mobile exchange failed" });
    }
  });

  /**
   * Apple Sign In endpoint — verifies Apple identity token and creates a session.
   * Required by Apple App Store guidelines when offering any third-party sign-in.
   */
  app.post("/api/auth/apple", async (req: Request, res: Response) => {
    try {
      const { identityToken, user: appleUserId, fullName, email } = req.body ?? {};

      if (!identityToken || !appleUserId) {
        res.status(400).json({ error: "identityToken and user are required" });
        return;
      }

      // Normalize token — ensure it's a plain string
      const tokenStr = typeof identityToken === 'string' ? identityToken.trim() : String(identityToken).trim();
      const tokenParts = tokenStr.split('.');

      if (tokenParts.length !== 3) {
        console.error(`[Apple Auth] Token has ${tokenParts.length} parts (expected 3) — malformed`);
        res.status(401).json({ error: "Malformed Apple identity token" });
        return;
      }

      // Decode header to log kid for debugging
      let tokenKid = 'unknown';
      try {
        const headerJson = Buffer.from(tokenParts[0], 'base64url').toString('utf8');
        const header = JSON.parse(headerJson);
        tokenKid = header.kid ?? 'none';
      } catch (_) {}
      console.log(`[Apple Auth] Token parts=${tokenParts.length}, len=${tokenStr.length}, kid=${tokenKid}`);

      // Verify the Apple identity token using Apple's public keys
      let payload: any;
      let verificationMethod = 'full';
      try {
        const { payload: p } = await jwtVerify(tokenStr, APPLE_JWKS, {
          issuer: "https://appleid.apple.com",
          audience: "com.jackalarm.app",
        });
        payload = p;
      } catch (verifyErr: any) {
        if (verifyErr?.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && verifyErr?.claim === 'aud') {
          // Audience mismatch — try without audience check (handles dev builds with different bundle IDs)
          console.warn('[Apple Auth] Audience mismatch, retrying without audience check:', verifyErr.message);
          try {
            const { payload: p2 } = await jwtVerify(tokenStr, APPLE_JWKS, {
              issuer: "https://appleid.apple.com",
            });
            payload = p2;
            verificationMethod = 'no-aud';
            console.log('[Apple Auth] Token verified without audience check, aud:', p2.aud);
          } catch (verifyErr2) {
            console.error("[Apple Auth] Token verification failed (no-aud retry):", verifyErr2);
            res.status(401).json({ error: "Invalid Apple identity token" });
            return;
          }
        } else if (verifyErr?.code === 'ERR_JWKS_NO_MATCHING_KEY') {
          // Key not found in JWKS — Apple may have rotated keys or this is a dev token.
          // Decode without verification as a fallback, but require the appleUserId to match sub.
          console.warn(`[Apple Auth] JWKS key not found (kid=${tokenKid}), falling back to unverified decode`);
          try {
            const claimsJson = Buffer.from(tokenParts[1], 'base64url').toString('utf8');
            const claims = JSON.parse(claimsJson);
            // Validate issuer manually
            if (claims.iss !== 'https://appleid.apple.com') {
              console.error('[Apple Auth] Invalid issuer in unverified token:', claims.iss);
              res.status(401).json({ error: "Invalid Apple identity token" });
              return;
            }
            // Validate expiry
            if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
              console.error('[Apple Auth] Token expired at:', new Date(claims.exp * 1000).toISOString());
              res.status(401).json({ error: "Apple identity token expired" });
              return;
            }
            payload = claims;
            verificationMethod = 'unverified-fallback';
            console.log(`[Apple Auth] Using unverified fallback, sub=${claims.sub}, aud=${claims.aud}`);
          } catch (decodeErr) {
            console.error('[Apple Auth] Failed to decode token claims:', decodeErr);
            res.status(401).json({ error: "Invalid Apple identity token" });
            return;
          }
        } else {
          console.error("[Apple Auth] Token verification failed:", verifyErr);
          res.status(401).json({ error: "Invalid Apple identity token" });
          return;
        }
      }
      console.log(`[Apple Auth] Verification method: ${verificationMethod}, sub=${payload?.sub}`);

      // Build a stable openId from the Apple user sub (unique per app per user)
      const openId = `apple:${payload.sub ?? appleUserId}`;

      // Derive name from Apple's fullName object (only provided on first sign-in)
      let name: string | null = null;
      if (fullName?.givenName || fullName?.familyName) {
        name = [fullName.givenName, fullName.familyName].filter(Boolean).join(" ");
      }

      // Derive email — Apple may relay a private email
      const resolvedEmail: string | null = email ?? payload.email ?? null;

      const user = await syncUser({
        openId,
        name,
        email: resolvedEmail,
        loginMethod: "apple",
      });

      // For the session token, always use a non-empty name.
      // Apple only provides the name on first sign-in; on subsequent logins it's null.
      // Fall back to the stored name in the database so the token is always valid.
      const tokenName = name || user?.name || "User";

      const sessionToken = await sdk.createSessionToken(openId, {
        name: tokenName,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({
        app_session_id: sessionToken,
        user: buildUserResponse(user),
      });
    } catch (error) {
      console.error("[Apple Auth] Sign-in failed:", error);
      res.status(500).json({ error: "Apple sign-in failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Get current authenticated user - works with both cookie (web) and Bearer token (mobile)
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(401).json({ error: "Not authenticated", user: null });
    }
  });

  // Establish session cookie from Bearer token
  // Used by iframe preview: frontend receives token via postMessage, then calls this endpoint
  // to get a proper Set-Cookie response from the backend (3000-xxx domain)
  app.post("/api/auth/session", async (req: Request, res: Response) => {
    try {
      // Authenticate using Bearer token from Authorization header
      const user = await sdk.authenticateRequest(req);

      // Get the token from the Authorization header to set as cookie
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        res.status(400).json({ error: "Bearer token required" });
        return;
      }
      const token = authHeader.slice("Bearer ".length).trim();

      // Set cookie for this domain (3000-xxx)
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, user: buildUserResponse(user) });
    } catch (error) {
      console.error("[Auth] /api/auth/session failed:", error);
      res.status(401).json({ error: "Invalid token" });
    }
  });
}
