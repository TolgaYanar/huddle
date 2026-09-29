// eslint, globals and @repo/eslint-config resolve from the monorepo root
// install. They are deliberately not declared in this package.json: if the
// Railway service installs apps/server on its own, a workspace-only
// devDependency would fail that install and block the deploy.
import globals from "globals";
import { config as baseConfig } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      // Plain CommonJS: require() is the module system here.
      "@typescript-eslint/no-require-imports": "off",
      // `const crypto = require("crypto")` shadows Node's global on purpose.
      "no-redeclare": ["warn", { builtinGlobals: false }],
      // Server variables are runtime configuration, not build inputs, so they
      // do not belong in turbo's cache key. CLAUDE.md lists the set.
      "turbo/no-undeclared-env-vars": "off",
    },
  },
  {
    ignores: ["node_modules/**", "src/generated/**", "prisma/**"],
  },
];
