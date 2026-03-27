# Jack App — Session Startup Guide

Every new Manus session gets a new sandbox ID. Follow these steps **every time** to get the app running in Expo Go.

---

## Why it breaks

The `EXPO_PUBLIC_API_BASE_URL` env var gets stuck pointing to the old sandbox. Both the backend server and Metro bundler must be started with the **new** URL explicitly set.

---

## Step 1 — Find the new backend URL

Expose port 3000 using the Manus tool, or check what the current sandbox URL is:

```bash
printenv | grep EXPO_PUBLIC_API_BASE_URL
# This shows the OLD url — you need to replace the sandbox ID part
```

The URL pattern is: `https://3000-SANDBOXID-REGION.manus.computer`

---

## Step 2 — Start the backend server

```bash
cd /home/ubuntu/daily-progress-alarm
EXPO_PUBLIC_API_BASE_URL="https://3000-NEWID-REGION.manus.computer" \
NODE_ENV=development \
nohup npx tsx server/_core/index.ts > /tmp/server_correct.log 2>&1 &

# Wait 8 seconds, then verify:
sleep 8 && curl -s https://3000-NEWID-REGION.manus.computer/api/health
# Should return: {"ok":true,...}
```

---

## Step 3 — Start Metro bundler

```bash
cd /home/ubuntu/daily-progress-alarm
EXPO_PUBLIC_API_BASE_URL="https://3000-NEWID-REGION.manus.computer" \
EXPO_USE_METRO_WORKSPACE_ROOT=1 \
nohup npx expo start --clear --port 8081 --offline > /tmp/metro_correct.log 2>&1 &

# Wait 25 seconds, then verify:
sleep 25 && curl -s http://localhost:8081/status
# Should return: packager-status:running
```

---

## Step 4 — Generate QR code

```bash
cd /home/ubuntu/daily-progress-alarm
node scripts/generate_qr.mjs "exps://8081-NEWID-REGION.manus.computer"
# QR saved to expo-qr-code.png
```

---

## Step 5 — Connect Expo Go

1. Open Expo Go on your phone
2. Go to **Projects** tab → find "Jack" → **remove it** (long press or swipe)
3. Scan the new QR code
4. Wait for the bundle to build (~30–60 seconds first time)
5. Tap **Sign in with Apple** — it will work now

---

## Key rule

**Never use `webdev_restart_server` alone** — it does not override the stale `EXPO_PUBLIC_API_BASE_URL`. Always start both processes manually with the env var explicitly set in the command as shown above.
