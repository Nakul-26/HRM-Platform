import { describe, expect, it } from "vitest";
import { buildOtpauthUri, generateBackupCodes, generateTotpSecret, hashBackupCode, totp, verifyTotp } from "./totp";

/** Independent RFC 4648 base32 encoder, kept separate from totp.ts's own
 * encode/decode so the RFC 6238 vector test below doesn't just check
 * self-consistency (encode/decode round-tripping) but actual correctness
 * against a known-good external value. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function independentBase32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

describe("totp", () => {
  it("matches the RFC 6238 Appendix B published test vector (T=59, SHA1)", async () => {
    // RFC 6238's own worked example: ASCII secret "12345678901234567890",
    // at Unix time 59 (counter = floor(59/30) = 1), the published 8-digit
    // TOTP is 94287082. Our implementation truncates to 6 digits, which is
    // the same dynamic-truncation value mod 10^6.
    const secretBase32 = independentBase32Encode(new TextEncoder().encode("12345678901234567890"));
    const code = await totp(secretBase32, 1);
    expect(code).toBe("287082");
  });

  it("verifyTotp accepts the code for the current time step", async () => {
    const secret = generateTotpSecret();
    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    const code = await totp(secret, currentCounter);
    await expect(verifyTotp(secret, code)).resolves.toBe(true);
  });

  it("verifyTotp rejects an incorrect code", async () => {
    const secret = generateTotpSecret();
    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    const wrongCode = await totp(secret, currentCounter + 5); // well outside the default window
    await expect(verifyTotp(secret, wrongCode)).resolves.toBe(false);
  });

  it("verifyTotp tolerates clock skew within the window", async () => {
    const secret = generateTotpSecret();
    const currentCounter = Math.floor(Date.now() / 1000 / 30);
    const nextStepCode = await totp(secret, currentCounter + 1);
    await expect(verifyTotp(secret, nextStepCode, { window: 1 })).resolves.toBe(true);
  });

  it("generateTotpSecret produces distinct secrets", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Z2-7]+$/);
  });

  it("buildOtpauthUri includes the secret, issuer, and account label", () => {
    const uri = buildOtpauthUri("ABCDEFGHIJKLMNOP", { issuer: "HRM", accountLabel: "user@example.com" });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=ABCDEFGHIJKLMNOP");
    expect(uri).toContain("issuer=HRM");
    expect(uri).toContain(encodeURIComponent("user@example.com"));
  });

  it("generateBackupCodes produces the requested count of distinct codes", () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
  });

  it("hashBackupCode is deterministic and case-insensitive, and differs per code", async () => {
    const codes = generateBackupCodes(2);
    const hashLower = await hashBackupCode(codes[0]!.toLowerCase());
    const hashUpper = await hashBackupCode(codes[0]!.toUpperCase());
    const hashOther = await hashBackupCode(codes[1]!);
    expect(hashLower).toBe(hashUpper);
    expect(hashLower).not.toBe(hashOther);
  });
});
