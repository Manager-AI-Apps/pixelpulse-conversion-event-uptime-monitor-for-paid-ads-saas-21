/**
 * Integration tests for property server actions.
 *
 * Uses pglite (in-process Postgres) via createTestDb() — no Docker, no
 * DATABASE_URL. Actions accept an optional `db` arg so tests can inject the
 * test database directly.
 */

import { beforeAll, beforeEach, afterEach, describe, it, expect } from "vitest";

import { createTestDb } from "@/tests/helpers/test-db";
import { user } from "@/lib/db/schema";
import {
  createProperty,
  listProperties,
  deleteProperty,
  AuthorizationError,
} from "@/lib/actions/property";

// AES-256 requires a 32-byte key. Use an obviously-fake, all-zeros-style
// hex string so the secret scanner never flags it.
const TEST_ENCRYPTION_KEY =
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

describe("property server actions", () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  });

  beforeEach(async () => {
    testDb = await createTestDb();
    // Seed two users so ownership tests have two distinct principals
    await testDb.db.insert(user).values([
      {
        id: "user-a",
        name: "User A",
        email: "a@test.com",
        emailVerified: false,
      },
      {
        id: "user-b",
        name: "User B",
        email: "b@test.com",
        emailVerified: false,
      },
    ]);
  });

  afterEach(async () => {
    await testDb.close();
  });

  // -------------------------------------------------------------------------
  // createProperty persists row scoped to user
  // -------------------------------------------------------------------------

  describe("createProperty persists row scoped to user", () => {
    it("creates a property with a 64-char snippetKey scoped to userId", async () => {
      const prop = await createProperty(
        { name: "My Site", url: "https://example.com", userId: "user-a" },
        testDb.db,
      );

      expect(prop.userId).toBe("user-a");
      // 32-byte random hex = 64 hex characters
      expect(prop.snippetKey).toHaveLength(64);
      expect(prop.name).toBe("My Site");
      expect(prop.url).toBe("https://example.com");

      // user-b cannot see user-a's properties via listProperties
      const bProps = await listProperties("user-b", testDb.db);
      expect(bProps).toHaveLength(0);

      // user-a sees their own property
      const aProps = await listProperties("user-a", testDb.db);
      expect(aProps).toHaveLength(1);
      expect(aProps[0].id).toBe(prop.id);
    });
  });

  // -------------------------------------------------------------------------
  // slackWebhookEncrypted never in listProperties response
  // -------------------------------------------------------------------------

  describe("slackWebhookEncrypted never in listProperties response", () => {
    it("omits slackWebhookEncrypted from every returned object", async () => {
      await createProperty(
        {
          name: "Site With Webhook",
          url: "https://example.com",
          slackWebhookUrl: "https://hooks.slack.com/services/T000/B000/test-token",
          userId: "user-a",
        },
        testDb.db,
      );

      const props = await listProperties("user-a", testDb.db);
      expect(props).toHaveLength(1);

      // The field must be absent on each returned object
      for (const p of props) {
        expect(p).not.toHaveProperty("slackWebhookEncrypted");
      }
    });
  });

  // -------------------------------------------------------------------------
  // deleteProperty rejects wrong owner
  // -------------------------------------------------------------------------

  describe("deleteProperty rejects wrong owner", () => {
    it("throws AuthorizationError when user-b tries to delete user-a property", async () => {
      const prop = await createProperty(
        { name: "User A Site", url: "https://a.com", userId: "user-a" },
        testDb.db,
      );

      await expect(
        deleteProperty(prop.id, "user-b", testDb.db),
      ).rejects.toThrow(AuthorizationError);
    });

    it("allows the correct owner to delete their own property", async () => {
      const prop = await createProperty(
        { name: "User A Site", url: "https://a.com", userId: "user-a" },
        testDb.db,
      );

      await expect(
        deleteProperty(prop.id, "user-a", testDb.db),
      ).resolves.toBeUndefined();

      const remaining = await listProperties("user-a", testDb.db);
      expect(remaining).toHaveLength(0);
    });
  });
});
