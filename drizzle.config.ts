import { defineConfig } from "drizzle-kit";

// Drizzle Kit config. `drizzle-kit push` (run at deploy time and at server
// startup — see server.js) applies this schema to the Render Postgres pointed
// at by DATABASE_URL.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
