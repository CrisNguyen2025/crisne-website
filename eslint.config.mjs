import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";
import sonarjs from "eslint-plugin-sonarjs";

const ACTIVE_SOURCE_FILES = [
  "{app,lib,components,hooks,logic,scripts}/**/*.{ts,tsx,js,mjs,cjs}",
  "middleware.ts",
  "auth.ts",
];

// Cris AI stays out of scope until Abot is complete (AGENTS.md "Phạm vi hiện tại")
const CRIS_AI_FILES = [
  "app/portfolio/**/*.{ts,tsx}",
  "app/api/chat/**/*.{ts,tsx}",
  "components/floating-bot/**/*.{ts,tsx}",
  "hooks/use-floating-chat.ts",
];

const SONAR_RECOMMENDED_DISABLED = Object.fromEntries(
  Object.keys(sonarjs.configs.recommended.rules ?? {}).map((rule) => [rule, "off"]),
);

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintConfigPrettier,
  {
    ...sonarjs.configs.recommended,
    files: ACTIVE_SOURCE_FILES,
  },
  {
    files: CRIS_AI_FILES,
    rules: SONAR_RECOMMENDED_DISABLED,
  },
  // Dev CLI scripts legitimately execute git/yarn via PATH
  {
    files: ["scripts/**/*.{ts,js,mjs,cjs}"],
    rules: { "sonarjs/no-os-command-from-path": "off" },
  },
  // CI lints only changed files, so existing console.log calls get cleaned up when their file is touched
  {
    files: ["{app,lib,components,hooks,logic}/**/*.{ts,tsx}"],
    rules: { "no-console": ["error", { allow: ["warn", "error"] }] },
  },
  // Node CommonJS scripts (e.g. git hooks) legitimately use require()
  {
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/worktrees/**",
    "roadmap-rag-assistant/**",
    "news-ingest-worker/**",
    "**/.venv/**",
  ]),
]);

export default eslintConfig;
