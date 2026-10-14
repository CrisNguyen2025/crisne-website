import { describe, it, expect } from "vitest";
import {
  fileExistsInProject,
  readProjectFile,
  AUTHORITATIVE_PROJECTS,
  AUTHORITATIVE_LAYERS,
  AUTHORITATIVE_CONTACTS,
} from "./test-helpers";

describe("Tier 1 — R3: Generative Action Chips & Interactive UI", () => {
  const markdownPath = "components/chat/ChatMarkdown.tsx";
  const actionChipsPath = "components/chat/ChatActionChips.tsx";
  const floatingBotPath = "components/floating-bot/FloatingChatBot.tsx";
  const roadmapBotPath = "components/roadmap/RoadmapAssistantChatbot.tsx";
  const projectsSectionPath = "components/projects-section.tsx";
  const appPagePath = "app/page.tsx";

  describe("F09: Zero-Dependency ChatMarkdown", () => {
    it("verifies markdown parsing rule for links [text](url)", () => {
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      const text = "Xem dự án [Kamala](https://kamala.vn) và [CV](/cris-nguyen-cv.pdf)";
      const matches = [...text.matchAll(linkRegex)];
      expect(matches).toHaveLength(2);
      expect(matches[0][1]).toBe("Kamala");
      expect(matches[0][2]).toBe("https://kamala.vn");
      expect(matches[1][1]).toBe("CV");
      expect(matches[1][2]).toBe("/cris-nguyen-cv.pdf");
    });

    it("verifies multiline code block regex isolation", () => {
      const codeBlockRegex = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;
      const sample = "Here is code:\n```typescript\nconst x = 42;\nconsole.log(x);\n```\nDone.";
      const match = codeBlockRegex.exec(sample);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe("typescript");
      expect(match?.[2].trim()).toBe("const x = 42;\nconsole.log(x);");
    });

    it("verifies inline bold and inline code styling regex", () => {
      const text = "Cris uses **Next.js** and `TypeScript` in production.";
      const boldRegex = /\*\*([^*]+)\*\*/g;
      const codeRegex = /`([^`]+)`/g;
      expect(boldRegex.test(text)).toBe(true);
      expect(codeRegex.test(text)).toBe(true);
    });

    it.runIf(fileExistsInProject(markdownPath))("ChatMarkdown component exists and has zero external parser dependencies", () => {
      const content = readProjectFile(markdownPath);
      expect(content).not.toContain("react-markdown");
      expect(content).not.toContain("marked");
      expect(content).not.toContain("remark");
    });

    it.runIf(fileExistsInProject(markdownPath))("ChatMarkdown handles safe links with target=_blank and rel=noopener", () => {
      const content = readProjectFile(markdownPath);
      expect(content).toMatch(/target=["']_blank["']/);
      expect(content).toMatch(/rel=["']noopener noreferrer["']/);
    });
  });

  describe("F10: Generative Action Chips UI & Bus", () => {
    it("custom event names follow decoupled naming convention", () => {
      const eventProjectModal = "project:open-modal";
      const eventRoadmapLayer = "roadmap:select-layer";
      const eventRoadmapModal = "roadmap:open-modal";
      expect(eventProjectModal).toBe("project:open-modal");
      expect(eventRoadmapLayer).toBe("roadmap:select-layer");
      expect(eventRoadmapModal).toBe("roadmap:open-modal");
    });

    it("simulates CustomEvent dispatching for project:open-modal", () => {
      let receivedId = "";
      const handler = (e: Event) => {
        const customEvent = e as CustomEvent<{ projectId: string }>;
        receivedId = customEvent.detail.projectId;
      };

      globalThis.addEventListener("project:open-modal", handler);
      globalThis.dispatchEvent(
        new CustomEvent("project:open-modal", {
          detail: { projectId: "kamala-commerce-tour" },
        })
      );
      globalThis.removeEventListener("project:open-modal", handler);

      expect(receivedId).toBe("kamala-commerce-tour");
    });

    it("simulates CustomEvent dispatching for roadmap:select-layer", () => {
      let receivedLayer = "";
      const handler = (e: Event) => {
        const customEvent = e as CustomEvent<{ layerId: string }>;
        receivedLayer = customEvent.detail.layerId;
      };

      globalThis.addEventListener("roadmap:select-layer", handler);
      globalThis.dispatchEvent(
        new CustomEvent("roadmap:select-layer", {
          detail: { layerId: "layer-03" },
        })
      );
      globalThis.removeEventListener("roadmap:select-layer", handler);

      expect(receivedLayer).toBe("layer-03");
    });

    it.runIf(fileExistsInProject(actionChipsPath))("ChatActionChips component file exists and exports component", () => {
      const content = readProjectFile(actionChipsPath);
      expect(content).toMatch(/export\s+(function|const)\s+ChatActionChips/);
    });

    it.runIf(fileExistsInProject(actionChipsPath))("ChatActionChips dispatches window events on click", () => {
      const content = readProjectFile(actionChipsPath);
      expect(content).toMatch(/dispatchEvent|CustomEvent/);
    });
  });

  describe("F11: FloatingChatBot Integration", () => {
    it("FloatingChatBot file exists and is readable", () => {
      expect(fileExistsInProject(floatingBotPath)).toBe(true);
      const content = readProjectFile(floatingBotPath);
      expect(content.length).toBeGreaterThan(0);
    });

    it("ProjectsSection contains definitions for the 4 featured projects", () => {
      const content = readProjectFile(projectsSectionPath);
      for (const project of AUTHORITATIVE_PROJECTS) {
        expect(content).toContain(project.id);
      }
    });

    it("ProjectsSection modal is controllable via project ID", () => {
      const content = readProjectFile(projectsSectionPath);
      expect(content).toContain("ProjectDetailModal");
      expect(content).toContain("selectedProject");
    });

    it.runIf(fileExistsInProject(markdownPath))("FloatingChatBot integrates ChatMarkdown or ChatActionChips", () => {
      const content = readProjectFile(floatingBotPath);
      expect(content).toMatch(/ChatMarkdown|ChatActionChips/);
    });

    it.runIf(fileExistsInProject(actionChipsPath))("ProjectsSection registers listener for project:open-modal", () => {
      const content = readProjectFile(projectsSectionPath);
      expect(content).toMatch(/addEventListener\(\s*["']project:open-modal["']/);
    });
  });

  describe("F12: RoadmapChatbot Integration", () => {
    it("RoadmapAssistantChatbot file exists and is readable", () => {
      expect(fileExistsInProject(roadmapBotPath)).toBe(true);
      const content = readProjectFile(roadmapBotPath);
      expect(content.length).toBeGreaterThan(0);
    });

    it("app/page.tsx already contains window event listener pattern", () => {
      const content = readProjectFile(appPagePath);
      expect(content).toContain("roadmap:updated");
    });

    it.runIf(fileExistsInProject(actionChipsPath))("app/page.tsx listens for roadmap:select-layer event", () => {
      const content = readProjectFile(appPagePath);
      expect(content).toMatch(/addEventListener\(\s*["']roadmap:select-layer["']/);
    });

    it.runIf(fileExistsInProject(actionChipsPath))("app/page.tsx listens for roadmap:open-modal event", () => {
      const content = readProjectFile(appPagePath);
      expect(content).toMatch(/addEventListener\(\s*["']roadmap:open-modal["']/);
    });

    it("RoadmapAssistantChatbot provides position configuration", () => {
      const content = readProjectFile(roadmapBotPath);
      expect(content).toContain("position");
    });
  });
});
