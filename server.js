// Custom Next.js production server.
//
// Why this file exists:
//
//   1. `next start -H 0.0.0.0` does not actually bind on 0.0.0.0 in Next.js 16 /
//      turbopack production mode -- Next reports `Network: 0.0.0.0:PORT` in the
//      log but the socket isn't reachable, so Render's port scanner can't see
//      the open port and the deploy times out. Using Next's programmatic API
//      with an explicit `server.listen(port, '0.0.0.0', ...)` bypasses the
//      broken default and binds reliably.
//
//   2. Render free-tier services skip preDeployCommand, so `drizzle-kit push`
//      never runs and the database has no tables -- the first HTTP request
//      crashes the app. We push the schema at startup instead (best-effort,
//      tolerates "no drizzle config" so non-DB apps still boot).
//
// Spawn order: drizzle push (best-effort) -> Next prepare() -> http.listen().
// The whole thing typically completes in ~3-5s.

const { createServer } = require('http');
const { existsSync } = require('fs');
const { spawnSync } = require('child_process');
const path = require('path');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production';

// Boot-time schema push tuning. The usual reason an early attempt fails is the
// database still warming up after a cold start, so a few spaced retries clear
// it without operator involvement.
const PUSH_MAX_ATTEMPTS = 5;
const PUSH_RETRY_BASE_MS = 3000;

// Synchronous sleep that doesn't busy-wait: parks the boot thread for `ms`
// using a timed Atomics.wait on a throwaway shared buffer (allowed on Node's
// main thread). Keeps the push retry loop synchronous so the schema is in
// place before next().prepare() runs.
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runDrizzlePushIfConfigured() {
  const drizzleConfigCandidates = ['drizzle.config.ts', 'drizzle.config.js', 'drizzle.config.mjs'];
  const hasConfig = drizzleConfigCandidates.some((name) =>
    existsSync(path.join(process.cwd(), name)),
  );
  if (!hasConfig) {
    console.log('[server.js] no drizzle config; skipping schema push');
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.warn('[server.js] DATABASE_URL not set; skipping schema push');
    return;
  }
  for (let attempt = 1; attempt <= PUSH_MAX_ATTEMPTS; attempt += 1) {
    console.log(
      `[server.js] running drizzle-kit push --force (attempt ${attempt}/${PUSH_MAX_ATTEMPTS})...`,
    );
    const result = spawnSync('pnpm', ['exec', 'drizzle-kit', 'push', '--force'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.status === 0) {
      console.log('[server.js] drizzle-kit push complete');
      return;
    }
    console.error(
      `[server.js] drizzle-kit push failed (exit ${result.status}) on attempt ` +
        `${attempt}/${PUSH_MAX_ATTEMPTS}`,
    );
    if (attempt < PUSH_MAX_ATTEMPTS) {
      const backoffMs = PUSH_RETRY_BASE_MS * attempt;
      console.error(`[server.js] retrying schema push in ${backoffMs}ms...`);
      sleepSync(backoffMs);
    }
  }

  // Every attempt failed. Boot anyway rather than crashing the boot process.
  //
  // We used to exit non-zero here so Render would keep the last-good version
  // live. But on the free tier there is no other version to fall back to: a
  // crash just strands the URL on Render's "waking up" screen indefinitely,
  // with no recovery until the next deploy. The most common persistent failure
  // is a database that has gone away -- e.g. a free-tier Postgres slot
  // reclaimed by a newer build -- where crash-looping helps no one.
  //
  // Booting lets Next.js serve the app: static and non-DB routes render, and
  // DB-backed routes fall through to the app's error boundary (a themed error
  // page) instead of an endless spinner. Transient "database still warming up"
  // failures are absorbed by the retry loop above, so reaching here means a
  // real, operator-level problem -- surfaced loudly in the logs, not silently.
  console.error(
    `[server.js] drizzle-kit push did not succeed after ${PUSH_MAX_ATTEMPTS} attempts; ` +
      'booting anyway so the app stays reachable (DB-backed routes will error) ' +
      'instead of stranding the URL on an endless boot screen',
  );
}

runDrizzlePushIfConfigured();

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      handle(req, res);
    }).listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error('[server.js] prepare failed:', err);
    process.exit(1);
  });
