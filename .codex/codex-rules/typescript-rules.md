# TypeScript Rules

## Scope

Apply these rules across TypeScript projects, including frontend, backend, React, Next.js, and Node.js codebases.

## Required

- Keep TypeScript `strict` mode enabled.
- Use TypeScript for application code.
- Type all public function parameters.
- Use explicit return types for exported functions, shared utilities, public APIs, and complex async functions.
- Prefer `unknown` over `any` when a value is truly unknown.
- Narrow `unknown` values before use.
- Use the `satisfies` operator for object literals that must match a contract while preserving inference.
- Keep domain types centralized instead of duplicating them across features, services, and components.
- Respect generated types and schema-derived types when the project uses them.

## Type Inference

- Prefer type inference for obvious local variables and simple expressions.
- Avoid adding noisy annotations that duplicate clear inference.
- Add explicit types when they improve readability, document intent, or prevent unsafe inference.
- Add explicit return types when a function is exported, shared, async and non-trivial, or part of a public contract.

## `type` And `interface`

Prefer `type` or `interface` based on clarity and use case, not ideology.

Use `interface` for:

- Extendable object contracts.
- Public component props.
- Data models intended to be extended.

Use `type` for:

- Union types.
- Intersection types.
- Mapped types.
- Utility compositions.
- Function signatures.
- Complex aliases.
- Generic aliases.

## Unions And Enums

- Prefer string union types over enums when values are fixed and no runtime enum object is needed.
- Use enums only when a runtime object, reverse mapping behavior, or project convention makes them useful.
- Keep union values centralized when they are shared across layers.

## `unknown`, `any`, And Type Assertions

- Prefer `unknown` for external or uncertain values.
- Narrow `unknown` before reading properties, calling methods, or passing it into typed APIs.
- Avoid `any` unless there is a documented boundary that cannot be typed reasonably.
- If `any` is unavoidable, keep it as close to the boundary as possible.
- Avoid broad type assertions that bypass type safety.
- Prefer parsing, validation, narrowing, or helper functions over `as SomeType`.
- Use type assertions only when the developer knows something TypeScript cannot infer and the assertion is safe.

## Domain Types

- Avoid duplicating domain types across features and services.
- Place shared domain contracts in the project's model, schema, generated type, or shared contract area.
- Keep request and response types close to the service or API boundary unless they are reused broadly.
- Do not redefine backend contracts manually when generated or schema-derived types exist.

## Async Functions

- Use explicit return types for exported async functions and complex async functions.
- Prefer typed result shapes when error states are expected and recoverable.
- Avoid returning loosely typed `Promise<any>` values.
- Preserve meaningful error and data types across service boundaries.

## Review Checklist

- Is `strict` mode preserved?
- Are exported functions and public APIs explicitly typed?
- Is `unknown` narrowed before use?
- Is `any` avoided or documented at a boundary?
- Are type assertions narrow and justified?
- Are shared domain types centralized?
- Are generated or schema-derived types reused when available?
- Are local annotations helpful rather than noisy?
