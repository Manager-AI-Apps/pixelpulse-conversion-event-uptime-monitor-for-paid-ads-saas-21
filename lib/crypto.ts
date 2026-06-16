/**
 * AES-256-GCM encryption helpers for storing secrets (e.g. Slack webhook URLs)
 * at rest. The key must be a 32-byte hex string supplied via ENCRYPTION_KEY.
 *
 * Ciphertext format (all segments hex-encoded, colon-separated):
 *   <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * This format bundles the IV and authentication tag with the ciphertext so
 * a single stored string is self-contained for decryption.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes,
} from "node:crypto";

import { requireEnv } from "@/lib/env";

// GCM nonce / IV length. 12 bytes is the NIST-recommended size for AES-GCM.
const GCM_IV_BYTES = 12;
// AES-GCM auth tag length in bytes.
const GCM_AUTH_TAG_BYTES = 16;

/**
 * Derive the AES-256 key from the ENCRYPTION_KEY environment variable.
 * Called lazily (inside encrypt/decrypt), not at module load time, so a
 * missing env var only fails at the call site, not at startup.
 */
function getKey(): Buffer {
  const hex = requireEnv("ENCRYPTION_KEY");
  if (hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters).",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypt `plaintext` with AES-256-GCM.
 * Returns a colon-delimited string: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = nodeRandomBytes(GCM_IV_BYTES);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

/**
 * Decrypt a value produced by `encrypt`.
 * Throws if the ciphertext is malformed or the auth tag fails (tampered data).
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format: expected iv:authTag:data");
  }
  const [ivHex, authTagHex, encryptedHex] = parts;

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");

  if (iv.length !== GCM_IV_BYTES) {
    throw new Error("Invalid ciphertext format: IV length mismatch");
  }
  if (authTag.length !== GCM_AUTH_TAG_BYTES) {
    throw new Error("Invalid ciphertext format: auth tag length mismatch");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Generate `bytes` random bytes and return them as a lowercase hex string.
 * E.g. `randomHex(32)` → 64-character hex string (suitable as a snippet key).
 */
export function randomHex(bytes: number): string {
  return nodeRandomBytes(bytes).toString("hex");
}
