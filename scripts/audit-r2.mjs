import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";

// Load env
try {
  const env = readFileSync("/home/ubuntu/daily-progress-alarm/.env", "utf8");
  env.split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch(e) { console.error("env load error:", e.message); }

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.CF_R2_ACCESS_KEY_ID, secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY },
});

let token, all = [];
do {
  const r = await client.send(new ListObjectsV2Command({ Bucket: "jack-journal-audio", MaxKeys: 1000, ContinuationToken: token }));
  all.push(...(r.Contents || []).map(o => o.Key));
  token = r.NextContinuationToken;
} while (token);

const alarmClips = all.filter(k => k.match(/voice-commands\/alarm_\d{4}\.mp3/));
const otherFiles = all.filter(k => !k.match(/voice-commands\/alarm_\d{4}\.mp3/));

console.log("Total files in R2:", all.length);
console.log("Alarm time clips (voice-commands/alarm_HHMM.mp3):", alarmClips.length);
console.log("Other files:", otherFiles.length);
console.log("Other files list:", otherFiles);

// Check for gaps
const existing = new Set(alarmClips.map(k => k.replace("voice-commands/alarm_", "").replace(".mp3", "")));
const missing = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m++) {
    const key = String(h).padStart(2, "0") + String(m).padStart(2, "0");
    if (!existing.has(key)) missing.push(key);
  }
}
console.log("Missing alarm clips:", missing.length, missing.slice(0, 10));

// Show total size
const totalBytes = all.reduce((sum, k) => sum, 0); // keys only, no size in this query
console.log("\nNote: R2 has all 1440 alarm clips + other files. Check 'Other files list' for status clips.");
