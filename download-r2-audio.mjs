/**
 * Download all voice-commands clips from R2 into /home/ubuntu/sd_audio/system/
 * Then zip them up for SD card use.
 */
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream, mkdirSync, existsSync } from "fs";
import { pipeline } from "stream/promises";
import https from "https";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from daily-progress-alarm/.env
import { config } from "dotenv";
config({ path: "/home/ubuntu/daily-progress-alarm/.env" });

const accountId = process.env.CF_R2_ACCOUNT_ID;
const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
const bucket = process.env.CF_R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("Missing R2 credentials");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const OUT_DIR = "/home/ubuntu/sd_audio/system";
mkdirSync(OUT_DIR, { recursive: true });

async function listAll() {
  const keys = [];
  let token;
  do {
    const res = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: "voice-commands/",
      ContinuationToken: token,
    }));
    for (const obj of res.Contents || []) {
      if (obj.Key && obj.Key.endsWith(".mp3")) keys.push(obj.Key);
    }
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, (res) => resolve(res)).on("error", reject);
  });
}

async function downloadKey(r2Key) {
  const filename = path.basename(r2Key); // e.g. "listening.mp3"
  const outPath = path.join(OUT_DIR, filename);
  if (existsSync(outPath)) return; // skip already downloaded

  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: r2Key }), { expiresIn: 3600 });
  const res = await fetchUrl(url);
  if (res.statusCode !== 200) {
    console.warn(`SKIP ${r2Key}: HTTP ${res.statusCode}`);
    return;
  }
  await pipeline(res, createWriteStream(outPath));
}

async function main() {
  console.log("Listing R2 objects...");
  const keys = await listAll();
  console.log(`Found ${keys.length} clips to download`);

  let done = 0;
  const CONCURRENCY = 20;
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const batch = keys.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(downloadKey));
    done += batch.length;
    process.stdout.write(`\r${done}/${keys.length}`);
  }
  console.log("\nAll downloads complete!");
  console.log(`Files saved to: ${OUT_DIR}`);
}

main().catch(console.error);
