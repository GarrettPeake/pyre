import { defineConfig } from "vitest/config";

// Everything runs in Node: the worker against an in-memory KV and SQLite standing in
// for D1 (test/d1.ts), the simulation code as is.
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts", "worker/**/__tests__/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
