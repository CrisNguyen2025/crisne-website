import { describe, it, expect } from "vitest";
import { closeOpenInline } from "../../roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown";

describe("closeOpenInline (streaming markdown tail)", () => {
  it("closes an unfinished bold on the last line", () => {
    expect(closeOpenInline("Đây là **quan trọng")).toBe("Đây là **quan trọng**");
  });

  it("holds back half of a closing pair", () => {
    expect(closeOpenInline("**bold*")).toBe("**bold**");
  });

  it("leaves balanced text alone", () => {
    expect(closeOpenInline("**a** và `b`")).toBe("**a** và `b`");
  });

  it("closes an unfinished inline code span", () => {
    expect(closeOpenInline("chạy `npm run")).toBe("chạy `npm run`");
  });

  it("only looks at the last line", () => {
    expect(closeOpenInline("**dòng trên\ndòng **dưới")).toBe("**dòng trên\ndòng **dưới**");
  });

  it("does not touch text inside an open code fence", () => {
    const text = "```ts\nconst a = `x";
    expect(closeOpenInline(text)).toBe(text);
  });
});
