// eslint, globals and @repo/eslint-config resolve from the monorepo root
// install, the same way the server's config does.
import globals from "globals";
import { config as baseConfig } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.browser, chrome: "readonly" },
    },
  },
  {
    // background.ts drives Netflix's undocumented in-page player through
    // chrome.scripting in the page world; there is no type to give it.
    // Everything else in the package is held to no-explicit-any.
    files: ["src/background.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  { ignores: ["dist/**", "node_modules/**"] },
];
