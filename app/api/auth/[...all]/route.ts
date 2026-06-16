import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

// Better Auth's catch-all handler: serves sign-up, sign-in, session, sign-out,
// and OAuth callbacks (including /api/auth/callback/google) under /api/auth/*.
export const { GET, POST } = toNextJsHandler(auth);
