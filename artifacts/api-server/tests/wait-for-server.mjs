/**
 * Polls BASE_URL until the server responds (or times out).
 * Used by `pnpm test:ci` to ensure the server is up before running tests.
 *
 * Usage: node tests/wait-for-server.mjs
 */
const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8080";
const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

const start = Date.now();
process.stdout.write(`Waiting for server at ${BASE_URL} `);

while (true) {
  try {
    const res = await fetch(`${BASE_URL}/api`);
    // Any response (even 404) means the server is up
    process.stdout.write(` OK (${res.status})\n`);
    process.exit(0);
  } catch {
    // Connection refused — keep polling
    process.stdout.write(".");
  }

  if (Date.now() - start > MAX_WAIT_MS) {
    process.stdout.write("\nTimed out waiting for server\n");
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
}
