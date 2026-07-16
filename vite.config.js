import { defineConfig } from "vite";

export default defineConfig({
  // Relative, so the build runs from any subpath (it is served from one).
  base: "./",
  build: {
    // `site/` is what gets published, and it is committed: the deploy serves
    // the directory as it stands, so a build that only existed on a laptop
    // would put nothing at the URL.
    outDir: "site",
    emptyOutDir: true,
  },
});
