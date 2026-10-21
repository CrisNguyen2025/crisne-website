import { describe, expect, it } from "vitest";
import {
  buildWelcomeMessage,
  getWelcomeSuggestions,
  WELCOME_MESSAGE_ID,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/welcome";

describe("welcome suggestions", () => {
  it("owner: targets the open topic when the page has one", () => {
    const [create] = getWelcomeSuggestions({ roadmapSlug: "backend" }, true);
    expect(create.prompt).toBe("Tạo 2 layer Mock 1 và Mock 2 trong topic backend");
  });

  it("owner: leaves the topic out when the page has none, so the server asks", () => {
    const [create] = getWelcomeSuggestions(undefined, true);
    expect(create.prompt).toBe("Tạo 2 layer Mock 1 và Mock 2");
  });

  it("reader: no write example at all, only read-only ones", () => {
    const suggestions = getWelcomeSuggestions({ roadmapSlug: "backend" }, false);
    for (const { prompt } of suggestions) {
      expect(prompt).not.toMatch(/^Tạo /);
    }
    expect(suggestions[0].prompt).toBe("Topic backend có những layer nào?");
  });

  it("reader is the default: a greeting built without access info shows no write example", () => {
    const message = buildWelcomeMessage();
    expect(message.suggestions?.some(({ prompt }) => prompt.startsWith("Tạo "))).toBe(false);
  });

  it("carries every suggestion as a one-line prompt the chip can send", () => {
    for (const canWrite of [true, false]) {
      const message = buildWelcomeMessage(undefined, canWrite);
      expect(message.id).toBe(WELCOME_MESSAGE_ID);
      expect(message.suggestions).toEqual(getWelcomeSuggestions(undefined, canWrite));
      for (const { prompt } of getWelcomeSuggestions(undefined, canWrite)) {
        expect(prompt).not.toContain("\n");
      }
    }
  });
});
