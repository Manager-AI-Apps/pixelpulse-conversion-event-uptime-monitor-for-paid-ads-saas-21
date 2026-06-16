/**
 * Environment access with fail-fast validation.
 *
 * Read required env vars through `requireEnv` so a missing/empty value surfaces
 * a clear, named error at the call site instead of an `undefined` that fails
 * mysteriously downstream. Read inside the request/handler path (NOT at module
 * top-level) for values the Build Engine injects slightly after first boot
 * (e.g. `STRIPE_PRICE_*`), so a momentarily-unset var never throws at
 * render/build time.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in the deployment environment (see .env.example).`,
    );
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

export function envFlag(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}
