import { AwsClient } from "aws4fetch";
import type { Env } from "../env";

const DEFAULT_EXPIRY_SECONDS = 15 * 60;

function client(env: Env): AwsClient {
  // `aws4fetch` rather than an AWS SDK: the SDKs assume Node's `http`/crypto
  // internals that don't exist under Workers; this is a thin SigV4 signer
  // that works identically against R2 (prod) and MinIO (local dev/CI) since
  // both speak the same S3 API. Same instance/bucket as apps/document-service
  // (a `payslips/` key prefix keeps the two domains separate, see objectKey.ts).
  return new AwsClient({
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto",
  });
}

function objectUrl(env: Env, objectKey: string): URL {
  return new URL(`${env.S3_ENDPOINT}/${env.S3_BUCKET}/${objectKey}`);
}

/**
 * Unlike apps/document-service (which only ever presigns URLs for a browser
 * to PUT/GET directly), payslip PDFs are generated server-side — there's no
 * browser holding the bytes to hand a presigned URL to. This signs and
 * executes the PUT itself.
 */
export async function putObject(env: Env, objectKey: string, contentType: string, body: Uint8Array): Promise<void> {
  const url = objectUrl(env, objectKey);
  const signed = await client(env).sign(
    new Request(url, { method: "PUT", headers: { "content-type": contentType }, body }),
  );
  const res = await fetch(signed);
  if (!res.ok) {
    throw new Error(`Failed to store object ${objectKey}: ${res.status} ${await res.text()}`);
  }
}

export async function createPresignedGetUrl(
  env: Env,
  objectKey: string,
  expiresInSeconds = DEFAULT_EXPIRY_SECONDS,
): Promise<string> {
  const url = objectUrl(env, objectKey);
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await client(env).sign(new Request(url, { method: "GET" }), { aws: { signQuery: true } });
  return signed.url;
}
