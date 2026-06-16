/**
 * Slack alerting helpers for PixelPulse.
 *
 * sendSlackAlert decrypts the stored webhook URL at call time (never at module
 * load) and POSTs the message payload to Slack. The decrypted URL is NEVER
 * logged or captured in any error message.
 *
 * buildSlackMessage converts a DiagnosisCode (or raw string) into human-readable
 * Slack copy that matches the product's alert voice.
 */

import { decrypt } from "@/lib/crypto";
import { DiagnosisCode } from "@/lib/runner/diagnosis";

// ---------------------------------------------------------------------------
// Human-readable copy for every DiagnosisCode
// ---------------------------------------------------------------------------

const DIAGNOSIS_COPY: Record<string, string> = {
  [DiagnosisCode.PurchaseFiredWithoutValue]: "Purchase fired without value",
  [DiagnosisCode.DuplicateViaGtagGtm]: "Duplicate via gtag + GTM",
  [DiagnosisCode.CapiSilentFail]: "CAPI silent fail",
  [DiagnosisCode.Ga4PropertyMismatch]: "GA4 property mismatch",
  [DiagnosisCode.EventMissing]: "Expected event missing",
};

/**
 * Build a human-readable Slack alert message for the given diagnosis code.
 *
 * @param diagnosisCode - A DiagnosisCode enum value or the string value of one.
 * @returns A formatted Slack message string.
 */
export function buildSlackMessage(diagnosisCode: DiagnosisCode | string): string {
  const copy = DIAGNOSIS_COPY[diagnosisCode] ?? diagnosisCode;
  return `🚨 PixelPulse Alert: ${copy}`;
}

/**
 * Decrypt the stored webhook URL and POST the message to Slack.
 *
 * The decrypted webhook URL is NEVER logged, stored, or included in any
 * thrown error. Errors from Slack only report the HTTP status code.
 *
 * @param webhookEncrypted - AES-256-GCM ciphertext produced by lib/crypto.ts encrypt().
 * @param message          - The plain-text message body to send.
 * @throws {Error} If the Slack request fails with a non-2xx status.
 */
export async function sendSlackAlert(
  webhookEncrypted: string,
  message: string,
): Promise<void> {
  // Decrypt INSIDE the function (never at module load) so an unset ENCRYPTION_KEY
  // only fails if this function is actually called.
  const webhookUrl = decrypt(webhookEncrypted);

  let status: number;
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    status = response.status;
  } catch (err) {
    // Re-throw network errors without leaking the URL.
    const message = err instanceof Error ? err.message : "Network error";
    throw new Error(`Slack delivery failed: ${message}`);
  }

  if (status < 200 || status >= 300) {
    throw new Error(`Slack webhook returned HTTP ${status.toString()}`);
  }
}
