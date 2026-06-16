import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pushSchema } from "drizzle-kit/api";

import type { Database } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Spin up an in-process Postgres (pglite) with the app's full Drizzle schema
 * applied, for integration tests that exercise real server actions / queries
 * against a real database — no Docker, no DATABASE_URL, no external service.
 *
 * Usage:
 *   let testDb: Awaited<ReturnType<typeof createTestDb>>;
 *   beforeEach(async () => { testDb = await createTestDb(); });
 *   afterEach(async () => { await testDb.close(); });
 *   it("persists a row scoped to the user", async () => {
 *     await createThing(testDb.db, { ... });   // pass the test db into the query
 *     const rows = await testDb.db.select().from(thing);
 *     expect(rows).toHaveLength(1);
 *   });
 *
 * Write data-access functions to accept a `db` argument (defaulting to the app
 * `db` from `@/lib/db`) so tests can pass this one, or `vi.mock("@/lib/db")` to
 * point the action's import at the test db.
 */
export async function createTestDb(): Promise<{
  db: Database;
  close: () => Promise<void>;
}> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  // Generate + apply the schema DDL straight from the Drizzle definitions
  // (no migration files needed for the test DB).
  const { apply } = await pushSchema(
    schema as Record<string, unknown>,
    db as never,
  );
  await apply();

  return {
    // pglite executes the same SQL as node-postgres at runtime; cast to the
    // app's `Database` type so tests can pass this db into data-access
    // functions typed against `@/lib/db` without a per-call cast.
    db: db as unknown as Database,
    async close() {
      await client.close();
    },
  };
}
