// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DesignMenu } from "@/components/design-menu";
import {
  DEFAULT_DESIGN,
  DESIGNS,
  ENABLE_DESIGN_SWITCHER,
  setDesign,
  useDesign,
} from "@/hooks/use-design";

function DesignProbe() {
  const design = useDesign();
  return <span data-testid="current-design">{design}</span>;
}

describe("useDesign and DesignMenu", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.design;
    setDesign(DEFAULT_DESIGN);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    delete document.documentElement.dataset.design;
  });

  it("defaults to Apple ('apple') and applies data-design='apple'", () => {
    render(<DesignProbe />);
    expect(DEFAULT_DESIGN).toBe("apple");
    expect(screen.getByTestId("current-design").textContent).toBe("apple");
    expect(document.documentElement.dataset.design).toBe("apple");
  });

  it("keeps all 11 registered themes and applies data-design attribute", () => {
    expect(DESIGNS).toEqual([
      "default",
      "perplexity",
      "cursor",
      "anthropic",
      "linear",
      "letters",
      "stripe",
      "discord",
      "apple",
      "railway",
      "posthog",
    ]);

    render(<DesignProbe />);
    for (const theme of DESIGNS) {
      setDesign(theme);
      if (theme === "default") {
        expect(document.documentElement.dataset.design).toBeUndefined();
      } else {
        expect(document.documentElement.dataset.design).toBe(theme);
      }
      expect(window.localStorage.getItem("design")).toBe(theme);
    }
  });

  it("hides DesignMenu switcher button while ENABLE_DESIGN_SWITCHER is false", () => {
    expect(ENABLE_DESIGN_SWITCHER).toBe(false);
    render(
      <>
        <DesignProbe />
        <DesignMenu />
      </>
    );

    expect(screen.queryByRole("button", { name: "Tùy chọn" })).toBeNull();
    expect(screen.getByTestId("current-design").textContent).toBe("apple");
    expect(document.documentElement.dataset.design).toBe("apple");
  });
});
