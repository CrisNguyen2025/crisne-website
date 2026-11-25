import axe, { type AxeResults, type RunOptions } from "axe-core";
import { expect } from "vitest";

/**
 * Runs axe-core accessibility audit inside jsdom.
 * `color-contrast` is disabled by default because jsdom lacks layout/paint computation.
 */
export async function runA11yAudit(
  container: Element,
  options: RunOptions = {}
): Promise<AxeResults> {
  const hasCanvas = typeof HTMLCanvasElement !== "undefined";
  const originalGetContext = hasCanvas
    ? HTMLCanvasElement.prototype.getContext
    : undefined;
  if (hasCanvas) {
    HTMLCanvasElement.prototype.getContext = (() =>
      null) as typeof HTMLCanvasElement.prototype.getContext;
  }

  try {
    return await axe.run(container, {
      ...options,
      rules: {
        "color-contrast": { enabled: false },
        ...options.rules,
      },
    });
  } finally {
    if (hasCanvas && originalGetContext) {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  }
}

/** Asserts zero axe-core accessibility violations with formatted node selectors. */
export async function expectNoA11yViolations(
  container: Element,
  options: RunOptions = {}
): Promise<void> {
  const results = await runA11yAudit(container, options);
  if (results.violations.length === 0) return;

  const details = results.violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) =>
          `  - ${node.target.join(", ")}: ${node.failureSummary ?? ""}`.trimEnd()
        )
        .join("\n");
      return `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}\n${targets}`;
    })
    .join("\n\n");

  expect.fail(`Accessibility violations found:\n${details}`);
}
