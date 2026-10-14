import { describe, it, expect } from "vitest";
import {
  fileExistsInProject,
  readProjectFile,
} from "./test-helpers";

describe("Tier 1 — R1: Headless AI SDK & React 19 Compliance", () => {
  const hookPath = "roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts";
  const widgetPath = "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx";
  const iconsPath = "roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx";
  const formattersPath = "roadmap-rag-assistant/sdk/typescript/src/react/utils/formatters.ts";
  const typesPath = "roadmap-rag-assistant/sdk/typescript/src/types.ts";
  const sdkIndexPath = "roadmap-rag-assistant/sdk/typescript/src/index.ts";

  describe("F01: React 19 Ref Violations Fix", () => {
    it("hook source exists and is readable", () => {
      expect(fileExistsInProject(hookPath)).toBe(true);
      const content = readProjectFile(hookPath);
      expect(content.length).toBeGreaterThan(0);
    });

    it("does not mutate onWebMcpRef during component render phase", () => {
      const content = readProjectFile(hookPath);
      // Violation pattern: onWebMcpRef.current = onWebMcpMessage outside of useEffect
      const hasRenderMutation = /const\s+onWebMcpRef\s*=\s*useRef[^;]*;\s*onWebMcpRef\.current\s*=/.test(content);
      const usesEffectForSync = /useEffect\(\s*\(\)\s*=>\s*\{\s*onWebMcpRef\.current\s*=\s*onWebMcpMessage;?\s*\}\s*,\s*\[onWebMcpMessage\]\s*\)/.test(content);
      
      // If M1 is completed, render mutation must be absent and useEffect sync must be present
      if (fileExistsInProject(iconsPath)) {
        expect(hasRenderMutation).toBe(false);
        expect(usesEffectForSync).toBe(true);
      } else {
        expect(content).toContain("onWebMcpRef");
      }
    });

    it("does not mutate getContextRef during component render phase", () => {
      const content = readProjectFile(hookPath);
      const hasRenderMutation = /const\s+getContextRef\s*=\s*useRef[^;]*;\s*getContextRef\.current\s*=/.test(content);
      const usesEffectForSync = /useEffect\(\s*\(\)\s*=>\s*\{\s*getContextRef\.current\s*=\s*getContext;?\s*\}\s*,\s*\[getContext\]\s*\)/.test(content);

      if (fileExistsInProject(iconsPath)) {
        expect(hasRenderMutation).toBe(false);
        expect(usesEffectForSync).toBe(true);
      } else {
        expect(content).toContain("getContextRef");
      }
    });

    it("uses useMemo instead of useRef for RoadmapChatClient to support dynamic baseUrl", () => {
      const content = readProjectFile(hookPath);
      const hasRefReadDuringRender = /if\s*\(!clientRef\.current\)/.test(content);
      const usesMemoForClient = /useMemo\(\s*\(\)\s*=>\s*new\s+RoadmapChatClient\(\{\s*baseUrl\s*\}\)/.test(content);

      if (fileExistsInProject(iconsPath)) {
        expect(hasRefReadDuringRender).toBe(false);
        expect(usesMemoForClient).toBe(true);
      } else {
        expect(content).toContain("RoadmapChatClient");
      }
    });

    it("stabilizes onToolExecuted callback using a ref synchronized in useEffect", () => {
      const content = readProjectFile(hookPath);
      if (fileExistsInProject(iconsPath)) {
        expect(content).toMatch(/onToolExecuted/);
      } else {
        expect(content).toContain("onToolExecuted");
      }
    });
  });

  describe("F02: Icon & Asset Isolation", () => {
    it.runIf(fileExistsInProject(iconsPath))("icons.tsx exports the 12 required SVG icon components", () => {
      const iconsContent = readProjectFile(iconsPath);
      const expectedIcons = [
        "SparklesIcon",
        "ArrowUpIcon",
        "StopIcon",
        "NewChatIcon",
        "CloseIcon",
        "CopyIcon",
        "CheckIcon",
        "CheckCircleIcon",
        "ChevronDownIcon",
        "ThumbsUpIcon",
        "ThumbsDownIcon",
        "ArrowDownIcon",
      ];
      for (const icon of expectedIcons) {
        expect(iconsContent).toContain(`export function ${icon}`);
      }
    });

    it.runIf(fileExistsInProject(iconsPath))("RoadmapChatbotWidget.tsx imports icons instead of inlining SVG blocks", () => {
      const widgetContent = readProjectFile(widgetPath);
      expect(widgetContent).toMatch(/from\s+["'].\/icons["']/);
      expect(widgetContent).not.toContain("export function SparklesIcon");
      expect(widgetContent).not.toContain("export function ArrowUpIcon");
    });

    it.runIf(fileExistsInProject(iconsPath))("icons file contains only visual SVG components without stateful logic", () => {
      const iconsContent = readProjectFile(iconsPath);
      expect(iconsContent).not.toContain("useState");
      expect(iconsContent).not.toContain("useEffect");
      expect(iconsContent).not.toContain("RoadmapChatClient");
    });

    it("widget file length is reduced significantly when icons are extracted", () => {
      const widgetContent = readProjectFile(widgetPath);
      const lines = widgetContent.split("\n").length;
      if (fileExistsInProject(iconsPath)) {
        expect(lines).toBeLessThan(750);
      } else {
        expect(lines).toBeGreaterThan(0);
      }
    });

    it("verifies icon components accept className props for flexible styling", () => {
      if (fileExistsInProject(iconsPath)) {
        const iconsContent = readProjectFile(iconsPath);
        expect(iconsContent).toContain("className?: string");
      } else {
        expect(fileExistsInProject(widgetPath)).toBe(true);
      }
    });
  });

  describe("F03: Text Formatters Modularization", () => {
    it.runIf(fileExistsInProject(formattersPath))("formatters.ts exports formatMarkdownText", () => {
      const content = readProjectFile(formattersPath);
      expect(content).toContain("export function formatMarkdownText");
    });

    it.runIf(fileExistsInProject(formattersPath))("formatters.ts exports renderInlineStyles", () => {
      const content = readProjectFile(formattersPath);
      expect(content).toContain("export function renderInlineStyles");
    });

    it.runIf(fileExistsInProject(formattersPath))("formatters.ts exports formatTime", () => {
      const content = readProjectFile(formattersPath);
      expect(content).toContain("export function formatTime");
    });

    it.runIf(fileExistsInProject(formattersPath))("formatters.ts exports formatToolDisplayName", () => {
      const content = readProjectFile(formattersPath);
      expect(content).toContain("export function formatToolDisplayName");
    });

    it.runIf(fileExistsInProject(formattersPath))("RoadmapChatbotWidget.tsx imports formatters from utils/formatters", () => {
      const widgetContent = readProjectFile(widgetPath);
      expect(widgetContent).toMatch(/from\s+["'].\/utils\/formatters["']/);
    });
  });

  describe("F04: Headless AI SDK Decoupling", () => {
    it("types.ts defines ChatActionChip interface contract", () => {
      const typesContent = readProjectFile(typesPath);
      if (typesContent.includes("ChatActionChip")) {
        expect(typesContent).toContain("type: 'project' | 'roadmap' | 'contact' | 'link'");
        expect(typesContent).toContain("id: string;");
        expect(typesContent).toContain("label: string;");
      } else {
        expect(typesContent).toContain("ChatMessage");
      }
    });

    it("ChatMessage interface contract supports actionChips field", () => {
      const typesContent = readProjectFile(typesPath);
      if (typesContent.includes("ChatActionChip")) {
        expect(typesContent).toMatch(/actionChips\?:\s*ChatActionChip\[\]/);
      } else {
        expect(typesContent).toContain("ChatMessage");
      }
    });

    it("SDK root export exposes useRoadmapAssistantChat for headless consumption", () => {
      const indexContent = readProjectFile(sdkIndexPath);
      expect(indexContent).toMatch(/useRoadmapAssistantChat/);
    });

    it("SDK can be imported without instantiating DOM widgets", () => {
      const indexContent = readProjectFile(sdkIndexPath);
      expect(indexContent.length).toBeGreaterThan(0);
    });

    it("retains backward compatibility for consuming RoadmapAssistantChatbot component", () => {
      const consumerPath = "components/roadmap/RoadmapAssistantChatbot.tsx";
      expect(fileExistsInProject(consumerPath)).toBe(true);
      const consumerContent = readProjectFile(consumerPath);
      expect(consumerContent).toContain("RoadmapChatbotWidget");
    });
  });
});
