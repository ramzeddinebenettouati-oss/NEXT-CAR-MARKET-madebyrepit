import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests call the running server via fetch — no DOM needed
    environment: "node",
    // Tests directory
    include: ["tests/**/*.test.ts"],
    // Allow slow network round-trips
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Run all tests in a single worker to avoid token/DB race conditions
    pool: "forks",
    singleFork: true,
    // Verbose output shows each it() pass/fail
    reporter: ["verbose"],
    // Show test duration
    logHeapUsage: false,
  },
});
