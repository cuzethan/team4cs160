import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // These only run against a real Postgres or as command-line tools, so unit tests can't reach them.
      exclude: ["src/store.ts", "src/index.ts", "src/scripts/**"],
      reporter: ["text", "html"],
      thresholds: {
        // Express routes and everything else: at least 80%.
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
        // Core business logic (pricing, delivery fee, delivery range, cart limits, checkout, batching, routing): 100%.
        "src/{pricing,deliveryArea,cart,orders,batching,routeService}.ts": { lines: 100, functions: 100 },
      },
    },
  },
});
