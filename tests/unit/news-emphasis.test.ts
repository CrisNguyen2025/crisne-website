import { describe, expect, it } from "vitest";
import { splitEmphasis } from "@/lib/news/emphasis";

describe("splitEmphasis", () => {
  it("returns plain text unchanged when there are no markers", () => {
    expect(splitEmphasis("Turbopack nhanh hơn")).toEqual([
      { text: "Turbopack nhanh hơn", isEmphasis: false },
    ]);
  });

  it("splits one or more **keywords** into emphasized segments", () => {
    expect(
      splitEmphasis("**Cache Components** thành mặc định trong **create-next-app**.")
    ).toEqual([
      { text: "Cache Components", isEmphasis: true },
      { text: " thành mặc định trong ", isEmphasis: false },
      { text: "create-next-app", isEmphasis: true },
      { text: ".", isEmphasis: false },
    ]);
  });

  it("drops unpaired markers instead of showing literal asterisks", () => {
    expect(splitEmphasis("Giảm **20% dung lượng cache")).toEqual([
      { text: "Giảm 20% dung lượng cache", isEmphasis: false },
    ]);
  });
});
