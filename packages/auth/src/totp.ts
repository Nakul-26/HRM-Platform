/**
 * TOTP (RFC 6238) over HMAC-SHA1 (RFC 4226's default), the algorithm every
 * mainstream authenticator app (Google Authenticator, Authy, 1Password,
 * etc.) assumes when it sees a plain `otpauth://totp/...` URI with no
 * `algorithm` param. Hand-rolled rather than a dependency: the algorithm is
 * small, precisely specified, and verifiable against the RFC's own test
 * vectors (see totp.test.ts) — matching this codebase's preference for
 * explicit logic over a library for something this contained. Uses Web
 * Crypto (`crypto.subtle`) so it runs unmodified in the Workers runtime and
 * plain Node.
 */

const TIME_STEP_SECONDS = 30;
const CODE_DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return base32Encode(bytes);
}

export function buildOtpauthUri(secretBase32: string, options: { issuer: string; accountLabel: string }): string {
  const label = encodeURIComponent(`${options.issuer}:${options.accountLabel}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer: options.issuer,
    algorithm: "SHA1",
    digits: String(CODE_DIGITS),
    period: String(TIME_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export async function totp(secretBase32: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", base32Decode(secretBase32), { name: "HMAC", hash: "SHA-1" }, false, [
    "sign",
  ]);

  const counterBytes = new ArrayBuffer(8);
  new DataView(counterBytes).setBigUint64(0, BigInt(counter), false);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes));

  // HMAC-SHA1 output is always 20 bytes; offset is 0-15 (low nibble of the
  // last byte), so offset+3 <= 18 — always in range.
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binCode =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);

  return String(binCode % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, "0");
}

/** Checks the current time step plus/minus `window` steps, to tolerate clock skew. */
export async function verifyTotp(secretBase32: string, code: string, options: { window?: number } = {}): Promise<boolean> {
  const window = options.window ?? 1;
  const currentCounter = Math.floor(Date.now() / 1000 / TIME_STEP_SECONDS);

  for (let delta = -window; delta <= window; delta++) {
    if ((await totp(secretBase32, currentCounter + delta)) === code) return true;
  }
  return false;
}

export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    codes.push(base32Encode(bytes).slice(0, 10));
  }
  return codes;
}

export async function hashBackupCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.toUpperCase()));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function base32Decode(encoded: string): Uint8Array {
  const clean = encoded.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}
