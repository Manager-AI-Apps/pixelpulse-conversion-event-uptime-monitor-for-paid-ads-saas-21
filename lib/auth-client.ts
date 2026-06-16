/**
 * Better Auth browser client.
 *
 * Use from client components for sign-in / sign-up / sign-out, e.g.:
 *   authClient.signIn.email({ email, password })
 *   authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" })
 *   authClient.signUp.email({ name, email, password })
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
