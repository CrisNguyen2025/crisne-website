// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DesignMenu } from "@/components/design-menu";
import { setDesign } from "@/hooks/use-design";
import { TYPOGRAPHIES, setTypography, useTypography } from "@/hooks/use-typography";

function TypographyProbe() {
  const typography = useTypography();
  return <span data-testid="current-typography">{typography}</span>;
}

function resetSettings() {
  window.localStorage.clear();
  delete document.documentElement.dataset.design;
  delete document.documentElement.dataset.typography;
}

describe("useTypography and the typography items of DesignMenu", () => {
  beforeEach(() => {
    resetSettings();
    setDesign("default");
    setTypography("default");
  });

  afterEach(() => {
    cleanup();
    resetSettings();
  });

  it("defaults to 'default' with no data-typography attribute", () => {
    render(<TypographyProbe />);
    expect(TYPOGRAPHIES).toEqual(["default", "docs"]);
    expect(screen.getByTestId("current-typography").textContent).toBe("default");
    expect(document.documentElement.dataset.typography).toBeUndefined();
  });

  it("applies and stores 'docs', and removes the attribute when back to default", () => {
    render(<TypographyProbe />);

    setTypography("docs");
    expect(document.documentElement.dataset.typography).toBe("docs");
    expect(window.localStorage.getItem("typography")).toBe("docs");

    setTypography("default");
    expect(document.documentElement.dataset.typography).toBeUndefined();
    expect(window.localStorage.getItem("typography")).toBe("default");
  });

  it("is independent of the color theme", () => {
    setDesign("discord");
    setTypography("docs");
    expect(document.documentElement.dataset.design).toBe("discord");
    expect(document.documentElement.dataset.typography).toBe("docs");

    setDesign("apple");
    expect(document.documentElement.dataset.typography).toBe("docs");

    setTypography("default");
    expect(document.documentElement.dataset.design).toBe("apple");
  });

  it("switches typography from DesignMenu", () => {
    render(
      <>
        <TypographyProbe />
        <DesignMenu />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Tùy chọn" }));
    expect(screen.getByRole("menuitem", { name: "Chữ: Mặc định" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Chữ: Docs gọn" }));

    expect(screen.getByTestId("current-typography").textContent).toBe("docs");
    expect(document.documentElement.dataset.typography).toBe("docs");
    expect(document.documentElement.dataset.design).toBeUndefined();
  });

  it("styles both .font-display and article h1 headings when data-typography='docs' is active", () => {
    const css = fs.readFileSync(
      path.resolve(process.cwd(), "app/styles/docs-typography.css"),
      "utf8"
    );
    expect(css).toContain('html[data-typography="docs"] .roadmap-theme :is(h1.font-display, article h1:not(.font-mono))');
  });
});
