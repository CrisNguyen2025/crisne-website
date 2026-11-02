import { describe, expect, it } from "vitest";
import {
  buildWelcomeMessage,
  getWelcomeSuggestions,
  WELCOME_MESSAGE_ID,
} from "@/roadmap-rag-assistant/sdk/typescript/src/react/welcome";

describe("welcome suggestions", () => {
  it("no write example for anyone: a chip never writes mock data into the roadmap", () => {
    for (const canWrite of [true, false]) {
      const suggestions = getWelcomeSuggestions({ roadmapSlug: "backend" }, canWrite);
      for (const { prompt } of suggestions) {
        expect(prompt).not.toMatch(/^Tạo |Mock/);
      }
      expect(suggestions[0].prompt).toBe("Topic backend có những layer nào?");
    }
  });

  it("asks for the topic list when the page has no topic open", () => {
    expect(getWelcomeSuggestions(undefined, true)[0].prompt).toBe("Có những lộ trình nào trên website?");
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

describe("welcome suggestions name no subject", () => {
  it("never suggests a search for a lesson the roadmap may not have", () => {
    for (const canWrite of [true, false]) {
      for (const { prompt } of getWelcomeSuggestions(undefined, canWrite)) {
        expect(prompt).not.toMatch(/Docker|DevOps|Database/);
      }
      // The help reply carries searches built from the live roadmap
      expect(getWelcomeSuggestions(undefined, canWrite).map((s) => s.prompt)).toContain("Bạn làm được gì?");
    }
  });
});
