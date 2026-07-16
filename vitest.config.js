import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node by default: the DSP, state and codec are all pure logic and a
    // DOM would only slow them down. The few view tests opt in per-file
    // with a `@vitest-environment jsdom` docblock.
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
