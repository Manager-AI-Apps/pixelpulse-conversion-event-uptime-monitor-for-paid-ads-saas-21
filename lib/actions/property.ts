/**
 * Server-side actions for property CRUD.
 *
 * Each function accepts an optional `db` argument (defaulting to the shared
 * app database) so integration tests can inject a pglite test database without
 * mocking the module.
 *
 * IMPORTANT: `slackWebhookEncrypted` is NEVER returned from listProperties.
 * Use `decrypt` from @/lib/crypto if you need to retrieve the raw webhook URL
 * for internal use (e.g. sending Slack alerts).
 */

import { eq } from "drizzle-orm";
import crypto from "node:crypto";

import { db as defaultDb } from "@/lib/db";
import type { Database } from "@/lib/db";
import { property } from "@/lib/db/schema";
import { encrypt, randomHex } from "@/lib/crypto";

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

/** Thrown when the caller does not own the targeted resource. */
export class AuthorizationError extends Error {
  constructor(message = "Forbidden: you do not own this resource.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Thrown when a requested resource does not exist. */
export class NotFoundError extends Error {
  constructor(message = "Resource not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The publicly-safe shape returned from createProperty and listProperties.
 * `slackWebhookEncrypted` is intentionally absent.
 */
export type PublicProperty = {
  id: string;
  userId: string;
  name: string;
  url: string;
  snippetKey: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePropertyInput = {
  name: string;
  url: string;
  /** Optional Slack incoming-webhook URL. Stored encrypted; never returned. */
  slackWebhookUrl?: string;
  userId: string;
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Create a new property for `userId`.
 *
 * - Generates a cryptographically random 32-byte hex `snippetKey`.
 * - If `slackWebhookUrl` is provided, encrypts it with AES-256-GCM before
 *   persisting (requires `ENCRYPTION_KEY` env var).
 *
 * Returns the PublicProperty (no `slackWebhookEncrypted`).
 */
export async function createProperty(
  input: CreatePropertyInput,
  db: Database = defaultDb,
): Promise<PublicProperty> {
  const { userId, slackWebhookUrl } = input;
  const name = input.name?.trim();
  const url = input.url?.trim();

  if (!name) throw new Error("Property name is required.");
  if (!url) throw new Error("Property URL is required.");
  if (!userId) throw new Error("userId is required.");

  const id = crypto.randomUUID();
  const snippetKey = randomHex(32);
  const slackWebhookEncrypted = slackWebhookUrl ? encrypt(slackWebhookUrl) : null;

  const rows = await db
    .insert(property)
    .values({ id, userId, name, url, snippetKey, slackWebhookEncrypted })
    .returning({
      id: property.id,
      userId: property.userId,
      name: property.name,
      url: property.url,
      snippetKey: property.snippetKey,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    });

  const row = rows[0];
  if (!row) throw new Error("Insert did not return a row.");
  return row;
}

/**
 * List all properties owned by `userId`.
 *
 * The returned objects NEVER contain `slackWebhookEncrypted`.
 */
export async function listProperties(
  userId: string,
  db: Database = defaultDb,
): Promise<PublicProperty[]> {
  if (!userId) return [];

  return db
    .select({
      id: property.id,
      userId: property.userId,
      name: property.name,
      url: property.url,
      snippetKey: property.snippetKey,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    })
    .from(property)
    .where(eq(property.userId, userId));
}

/**
 * Delete property `id`.
 *
 * Throws `NotFoundError` if the property does not exist.
 * Throws `AuthorizationError` if the property is owned by a different user.
 */
export async function deleteProperty(
  id: string,
  userId: string,
  db: Database = defaultDb,
): Promise<void> {
  const rows = await db
    .select({ userId: property.userId })
    .from(property)
    .where(eq(property.id, id));

  const existing = rows[0];
  if (!existing) throw new NotFoundError("Property not found.");
  if (existing.userId !== userId) {
    throw new AuthorizationError("You do not own this property.");
  }

  await db.delete(property).where(eq(property.id, id));
}
