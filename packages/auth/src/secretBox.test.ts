import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secretBox";

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

describe("secretBox", () => {
  it("round-trips a plaintext secret", async () => {
    const key = randomKey();
    const ciphertext = await encryptSecret("super-secret-client-secret", key);
    expect(ciphertext).not.toContain("super-secret-client-secret");
    await expect(decryptSecret(ciphertext, key)).resolves.toBe("super-secret-client-secret");
  });

  it("produces different ciphertext for the same plaintext on each call (random IV)", async () => {
    const key = randomKey();
    const a = await encryptSecret("same plaintext", key);
    const b = await encryptSecret("same plaintext", key);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt with the wrong key", async () => {
    const ciphertext = await encryptSecret("secret", randomKey());
    await expect(decryptSecret(ciphertext, randomKey())).rejects.toThrow();
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const key = randomKey();
    const ciphertext = await encryptSecret("secret", key);
    const bytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    bytes[bytes.length - 1]! ^= 0xff; // flip a byte in the auth tag
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decryptSecret(tampered, key)).rejects.toThrow();
  });

  it("rejects a key that isn't 32 bytes", async () => {
    const shortKey = btoa("too-short");
    await expect(encryptSecret("secret", shortKey)).rejects.toThrow(/32 bytes/);
  });
});
