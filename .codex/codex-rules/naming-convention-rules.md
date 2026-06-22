# Naming Convention Rules

## Scope

Apply these naming and formatting conventions across TypeScript, React, and JSX/TSX projects unless a project already has stricter existing conventions.

## Components And Files

- Use `PascalCase` for React component names.
- Use `PascalCase` for React component file names.
- Do not use `camelCase`, `kebab-case`, or `snake_case` for React component file names.

## TypeScript Interfaces And Types

- Use `PascalCase` for interfaces and type aliases.
- Use `interface` for component props, data models, and object shapes that may be extended.
- Use `type` for unions, intersections, utility types, complex aliases, and generic aliases.
- Suffix component props interfaces with `Props`.

## Variables, Functions, And Constants

- Use `camelCase` for variables, functions, and utility functions.
- Use `UPPER_SNAKE_CASE` for true constants.

## State Variables

- Use `camelCase` for state names.
- Prefix boolean state with `is`, `has`, or `should`.
- Always provide explicit types for `useState`.

## Event Handlers

- Use the `handle` prefix for internal event handlers.
- Use `handle + Object + Event` naming when practical.
- Use the `on` prefix for component callback props.
- Treat `handleX` as internal logic and `onX` as external component API.

## Enums

- Use `PascalCase` for enum names.
- Use singular enum names.
- Do not add an `Enum` suffix.
- Use `PascalCase` for enum members.
- Use lowercase string values for UI-facing enums.
- Use `UPPER_CASE` string values for backend-facing enums.

## Props

- Use `camelCase` for prop names.
- Omit explicit `={true}` for boolean props.
- Always include `alt` on `<img>` tags.
- Use `alt=""` for decorative images.
- Avoid words like `image`, `photo`, or `picture` in alt text unless necessary.
- Never use array index as a `key`; use a stable unique ID.

## JSX Formatting

- Keep props on one line when they fit cleanly.
- For multi-line props, put each prop on its own line with 2-space indentation.
- Put the closing bracket on a new line for multi-line props.
- Use exactly one space before the slash in self-closing tags.
- Do not pad JSX curly braces with spaces.
- Self-close tags with no children.
