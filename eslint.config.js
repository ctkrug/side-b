export default [
  // Build and coverage output is generated, not authored.
  { ignores: ["dist/", "coverage/"] },
  {
    files: ["src/**/*.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        localStorage: "readonly",
        AudioContext: "readonly",
        btoa: "readonly",
        atob: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        globalThis: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        Image: "readonly",
        FileReader: "readonly",
        navigator: "readonly",
        Node: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
    },
  },
];
