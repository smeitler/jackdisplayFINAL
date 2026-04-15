import { describe, it, expect } from "vitest";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

describe("Cloudflare R2 storage credentials", () => {
  it("should upload a test file and generate a presigned URL", async () => {
    const accountId = process.env.CF_R2_ACCOUNT_ID;
    const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY;
    const bucket = process.env.CF_R2_BUCKET_NAME;

    expect(accountId, "CF_R2_ACCOUNT_ID missing").toBeTruthy();
    expect(accessKeyId, "CF_R2_ACCESS_KEY_ID missing").toBeTruthy();
    expect(secretAccessKey, "CF_R2_SECRET_ACCESS_KEY missing").toBeTruthy();
    expect(bucket, "CF_R2_BUCKET_NAME missing").toBeTruthy();

    const client = new S3Client({
      region: "auto",
      endpoint: "https://" + accountId + ".r2.cloudflarestorage.com",
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });

    const testKey = "_test/connectivity-check-" + Date.now() + ".txt";

    await client.send(new PutObjectCommand({
      Bucket: bucket!,
      Key: testKey,
      Body: Buffer.from("R2 connectivity check"),
      ContentType: "text/plain",
    }));

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket!, Key: testKey }),
      { expiresIn: 60 }
    );

    expect(url).toContain("r2.cloudflarestorage.com");
    expect(url).toContain("_test");

    await client.send(new DeleteObjectCommand({ Bucket: bucket!, Key: testKey }));
  }, 30000);
});
