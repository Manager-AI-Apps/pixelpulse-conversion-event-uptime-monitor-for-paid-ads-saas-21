/**
 * Better Auth server instance.
 *
 * Session-based auth (no RLS; authorization belongs in route handlers).
 * `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are read from the environment by
 * the library.
 *
 * Google sign-in is enabled ONLY when both `GOOGLE_CLIENT_ID` and
 * `GOOGLE_CLIENT_SECRET` are present at runtime. A build that does not provision
 * Google OAuth credentials ships a clean email+password app instead of
 * registering a provider with empty-string credentials -- the latter advertises
 * a broken provider and can make the auth routes (e.g. /sign-up) error in
 * production, which would fail the deploy's conformance gate. When the creds are
 * injected at deploy time, Google sign-in lights up automatically.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleEnabled = Boolean(googleClientId && googleClientSecret);

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  ...(googleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId as string,
            clientSecret: googleClientSecret as string,
          },
        },
      }
    : {}),
});
