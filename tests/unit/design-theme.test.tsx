// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DesignMenu } from "@/components/design-menu";
import { DESIGNS, setDesign, useDesign } from "@/hooks/use-design";

function DesignProbe() {
  const design = useDesign();
  return <span data-testid="current-design">{design}</span>;
}

describe("useDesign and DesignMenu", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.design;
    setDesign("default");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    delete document.documentElement.dataset.design;
  });

  it("defaults to Figma ('default') with no data-design attribute", () => {
    render(<DesignProbe />);
    expect(screen.getByTestId("current-design").textContent).toBe("default");
    expect(document.documentElement.dataset.design).toBeUndefined();
  });

  it("supports all 11 registered themes and applies data-design attribute", () => {
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

  it("renders DesignMenu with Figma default and switches theme on click", () => {
    render(
      <>
        <DesignProbe />
        <DesignMenu />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Tùy chọn" }));
    expect(screen.getByRole("menuitem", { name: "Theme: Figma (Mặc định)" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Theme: Perplexity" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Theme: Cursor" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Theme: Stripe" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Theme: Discord" })).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "Theme: Perplexity" }));
    expect(screen.getByTestId("current-design").textContent).toBe("perplexity");
    expect(document.documentElement.dataset.design).toBe("perplexity");

    fireEvent.click(screen.getByRole("button", { name: "Tùy chọn" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Theme: Figma (Mặc định)" }));
    expect(screen.getByTestId("current-design").textContent).toBe("default");
    expect(document.documentElement.dataset.design).toBeUndefined();
  });
});
