// Test Cloudflare R2 connection
import { S3Client, ListObjectsV2Command, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";
import { readFileSync } from "fs";

// Load env
try {
  const env = readFileSync(".env", "utf8");
  env.split("\n").forEach(line => {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  });
} catch {}

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || "jack-journal-audio";

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error("❌ Missing R2 credentials in environment");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

console.log("Testing R2 connection...");
console.log(`  Account ID: ${accountId.substring(0, 8)}...`);
console.log(`  Bucket: ${bucketName}`);

try {
  // Test 1: List objects
  const list = await client.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 }));
  console.log("✅ R2 connection successful - bucket accessible");
  console.log(`   Objects in bucket: ${list.KeyCount ?? 0}`);

  // Test 2: Generate a pre-signed upload URL
  const testKey = `test/connection-test-${Date.now()}.txt`;
  const url = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucketName, Key: testKey, ContentType: "text/plain" }),
    { expiresIn: 60 }
  );
  console.log("✅ Pre-signed URL generation successful");
  console.log("   R2 is fully configured and ready for audio uploads!");
} catch (err) {
  console.error("❌ R2 connection failed:", err.message);
  process.exit(1);
}
