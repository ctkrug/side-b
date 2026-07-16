import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node by default: the DSP, state and codec are all pure logic and a
    // DOM would only slow them down. The few view tests opt in per-file
    // with a `@vitest-environment jsdom` docblock.
    environment: "node",
    include: ["test/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      // main.js is the composition root: it is wiring, and the only honest
      // way to judge it is to use the deck. Everything it wires is covered
      // here on its own.
      exclude: ["src/main.js"],
      reporter: ["text", "html"],
    },
  },
});
