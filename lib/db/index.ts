/**
 * Drizzle database client.
 *
 * A single shared `pg` Pool + Drizzle instance for the whole app. The Pool is
 * lazy — constructing it does not open a connection, so importing this module
 * at build time (or with `DATABASE_URL` unset) is safe; the first query is what
 * connects. `DATABASE_URL` is injected at deploy time by the Build Engine.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type Database = typeof db;
