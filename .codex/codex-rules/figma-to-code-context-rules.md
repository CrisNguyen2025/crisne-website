# Figma To Code Context Rules

## Memory Frame

Use **FRAME before code** when implementing from Figma.

`FRAME` means:

- `F`: Frame structure
- `R`: Resources
- `A`: Annotations
- `M`: Minimize context
- `E`: Existing code

## Scope

Apply these rules whenever implementing, reviewing, or planning UI from Figma, Framelink, design links, screenshots, or design handoff context.

These rules are based on the Framelink best-practice principle that better Figma-to-code results come from clean design structure and precise agent context.

## Required Before Implementation

Before writing code from a Figma design, gather or infer the `FRAME` context.

If important context is missing and cannot be safely inferred, ask a concise clarification question before implementing.

If the missing context is low-risk, state the assumption and proceed.

## F: Frame Structure

Prefer designs that are easy to translate into code.

Check for:

- Clear frame, group, and layer names.
- Auto Layout usage where layout relationships matter.
- Predictable spacing, alignment, and hierarchy.
- Reusable design components.
- Clear responsive behavior where relevant.

Avoid blindly copying messy absolute positioning when a semantic layout is more appropriate.

## R: Resources

Identify the implementation resources before coding.

Look for:

- Framework: React, Next.js, or another framework.
- Styling system: Tailwind CSS, CSS modules, global CSS, design tokens, or component library.
- UI system: shadcn/ui, Radix, MUI, custom components, or existing `components/ui`.
- Icon system: lucide-react or the project's existing icon library.
- Existing layout, theme, typography, and spacing conventions.

Use the project's existing resources before adding new dependencies or patterns.

## A: Annotations

Use written design intent to supplement raw visual data.

Capture or ask for:

- What the frame represents.
- Primary user action.
- Interaction behavior.
- Loading, error, empty, disabled, hover, focus, and selected states.
- Responsive behavior.
- Data assumptions.
- Accessibility expectations.

Do not rely only on raw Figma structure when behavior or state is unclear.

## M: Minimize Context

Use the smallest useful design scope.

Prefer:

- A specific frame.
- A specific component.
- A focused flow.
- A small set of related variants.

Avoid pulling or reasoning over an entire Figma file unless the task genuinely requires global design-system context.

## E: Existing Code

Before implementing, identify relevant existing code patterns.

Look for:

- Similar screens or components.
- Existing primitives in `components/ui`.
- Shared composites in `components/shared`.
- Feature-local components.
- Existing layout patterns.
- Existing styling and token usage.

Implement in the style of the existing codebase. Avoid creating duplicate components when a suitable one already exists.

## Implementation Rules

- Start from the smallest reusable component or screen area that matches the requested Figma scope.
- Preserve the project's architecture and naming conventions.
- Prefer semantic HTML and accessible UI behavior over pixel-only translation.
- Use visual values from Figma as guidance, but adapt them to project tokens and responsive constraints when available.
- Implement expected states, not only the default visual state, when the design implies them.
- Avoid adding new UI libraries, icon sets, fonts, or styling systems unless the project already uses them or the user explicitly asks.

## Output Expectation

When using this rule, briefly state:

- The `FRAME` context used.
- Any missing assumptions.
- The existing files or components that guided the implementation.

Keep the summary short unless the user asks for detailed reasoning.
