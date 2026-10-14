import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getProjectRoot,
  readProjectFile,
  fileExistsInProject,
} from "./test-helpers";

describe("Tier 1 — R4: Integrity & Verification Pipeline", () => {
  const tsconfigPath = "tsconfig.json";
  const packageJsonPath = "package.json";

  it("tsconfig.json enforces strict mode and isolated modules", () => {
    expect(fileExistsInProject(tsconfigPath)).toBe(true);
    const content = JSON.parse(readProjectFile(tsconfigPath));
    expect(content.compilerOptions.strict).toBe(true);
    expect(content.compilerOptions.isolatedModules).toBe(true);
    expect(content.compilerOptions.noEmit).toBe(true);
  });

  it("package.json defines vitest as the test runner script", () => {
    expect(fileExistsInProject(packageJsonPath)).toBe(true);
    const content = JSON.parse(readProjectFile(packageJsonPath));
    expect(content.scripts.test).toContain("vitest run");
  });

  it("client components with 'use client' do not import server-only libraries", () => {
    const rootDir = getProjectRoot();
    const clientFilesToCheck = [
      "components/floating-bot/FloatingChatBot.tsx",
      "components/roadmap/RoadmapAssistantChatbot.tsx",
      "components/projects-section.tsx",
      "roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts",
      "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx",
    ];

    for (const relPath of clientFilesToCheck) {
      if (fileExistsInProject(relPath)) {
        const content = readProjectFile(relPath);
        expect(content).not.toMatch(/from\s+["']@prisma\/client["']/);
        expect(content).not.toMatch(/from\s+["']node:fs["']/);
        expect(content).not.toMatch(/from\s+["']fs["']/);
      }
    }
  });

  it("client components do not expose un-prefixed private server environment variables", () => {
    const clientFilesToCheck = [
      "components/floating-bot/FloatingChatBot.tsx",
      "components/roadmap/RoadmapAssistantChatbot.tsx",
      "components/site-chatbot.tsx",
    ];

    for (const relPath of clientFilesToCheck) {
      if (fileExistsInProject(relPath)) {
        const content = readProjectFile(relPath);
        // Should not directly access GEMINI_API_KEY or LANGFUSE_SECRET_KEY
        expect(content).not.toContain("process.env.GEMINI_API_KEY");
        expect(content).not.toContain("process.env.LANGFUSE_SECRET_KEY");
      }
    }
  });

  it("pre-commit AI review rules exist in AGENTS.md or project memory", () => {
    const agentsPath = "AGENTS.md";
    expect(fileExistsInProject(agentsPath)).toBe(true);
    const content = readProjectFile(agentsPath);
    expect(content).toContain("AI Pre-commit Review Rules");
    expect(content).toContain("[R01][error]");
    expect(content).toContain("[R02][error]");
  });
});
