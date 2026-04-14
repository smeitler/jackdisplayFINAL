/**
 * File storage backed by Cloudflare R2 (S3-compatible).
 *
 * storagePut  — upload a file, returns a presigned GET URL (1-hour expiry)
 * storageGet  — generate a fresh presigned GET URL for an existing key
 *
 * Credentials are read from environment variables:
 *   CF_R2_ACCOUNT_ID        — Cloudflare account ID
 *   CF_R2_ACCESS_KEY_ID     — R2 API token access key
 *   CF_R2_SECRET_ACCESS_KEY — R2 API token secret key
 *   CF_R2_BUCKET_NAME       — bucket name (e.g. "jack-journal-audio")
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ─── Config ───────────────────────────────────────────────────────────────────

function getR2Config() {
  const accountId = process.env.CF_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CF_R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Cloudflare R2 credentials missing. Set CF_R2_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY, CF_R2_BUCKET_NAME.",
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function getClient() {
  const { endpoint, accessKeyId, secretAccessKey } = getR2Config();
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// Presigned URL expiry: 1 hour (3600 seconds)
const PRESIGNED_EXPIRY = 3600;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload a file to R2 and return a presigned GET URL valid for 1 hour.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const { bucket } = getR2Config();
  const key = normalizeKey(relKey);
  const client = getClient();

  const body = typeof data === "string" ? Buffer.from(data) : data;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: PRESIGNED_EXPIRY },
  );

  return { key, url };
}

/**
 * Generate a fresh presigned GET URL for an existing R2 object.
 * Valid for 1 hour.
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const { bucket } = getR2Config();
  const key = normalizeKey(relKey);
  const client = getClient();

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: PRESIGNED_EXPIRY },
  );

  return { key, url };
}
