import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror the "@/..." path alias from tsconfig.json
    alias: { "@": rootDir },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Creates prisma/test.db with the current schema before the run
    globalSetup: ["tests/setup/test-db.ts"],
    // Tests must never hit Gemini or Langfuse: no keys from .env.local leak in
    env: {
      // DB-backed tests use their own SQLite file, never prisma/dev.db
      DATABASE_URL: "file:./test.db",
      GEMINI_API_KEY: "test-gemini-key-not-real",
      // Route tests assert the Gemini model chain
      LLM_PROVIDER: "",
      LANGFUSE_PUBLIC_KEY: "",
      LANGFUSE_SECRET_KEY: "",
      LANGFUSE_RELEASE: "test-release",
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
    },
  },
});
