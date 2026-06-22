# Error Handling Rules

## Scope

Apply these rules across frontend, backend, full-stack, React, Next.js, and TypeScript projects.

## Purpose

These rules define default standards for handling, surfacing, logging, and propagating errors.

Failures should be understandable to users, actionable for developers and operators, isolated to the smallest reasonable boundary, and safe from leaking sensitive implementation details.

## Required

- Handle expected failure states at the correct boundary.
- Show user-friendly error states for user-facing failures.
- Log operationally useful errors where the system can observe them.
- Use route or component error boundaries where failure isolation is needed.
- Avoid exposing raw internal errors, stack traces, secrets, tokens, or sensitive request details to users.
- Preserve useful debugging context in logs without leaking sensitive data.

## Error Boundaries

For React and Next.js projects:

- Use `error.tsx` route boundaries when route-level failure isolation is needed.
- Use component-level error boundaries for isolated interactive sections where a full route failure would be too broad.
- Keep error UI helpful, concise, and recoverable when possible.
- Provide retry, reset, or navigation actions when they are meaningful.

## Async Operations

- Use `try/catch` when the function can recover, transform, enrich, log, or intentionally convert the error.
- Do not wrap every async function in `try/catch` if the error should propagate to a higher boundary.
- Normalize error handling in services, server actions, API handlers, and shared data-fetching utilities when appropriate.
- Avoid swallowing errors silently.
- If an error is caught and not rethrown, the function must return a clear fallback, typed result, or handled state.

## Services And API Calls

- Keep service-layer errors consistent and predictable.
- Normalize transport, validation, authentication, authorization, timeout, and unknown failures where appropriate.
- Prefer typed result shapes or well-defined error classes when the project already uses them.
- Keep raw backend error details away from user-facing UI unless they are explicitly safe and intended.
- Include enough context in logs to debug the failing operation, such as operation name, status code, or safe identifiers.

## User-Facing Failures

- Translate technical failures into clear user-facing messages.
- Avoid showing raw exception messages directly to users.
- Give users a next step when possible, such as retrying, checking input, or returning to a safe screen.
- Use inline validation errors for field-level issues.
- Use page, section, toast, or modal errors based on the scope and severity of the failure.

## Loading, Error, And Empty States

Every data-driven user flow must define loading state, error state, empty state, and success state.

- Shared fetching patterns should centralize loading, error, and empty-state behavior when practical.
- Do not reimplement the same state handling inconsistently across screens.
- Empty state should be treated as a valid state, not as an error.
- Loading state should avoid layout jumps when possible.

## Logging And Observability

- Log errors where they can be observed by the system.
- Logs should be useful for debugging and operations.
- Include safe context, not sensitive data.
- Avoid duplicate noisy logs for the same error at multiple layers unless each log adds useful context.
- Use the project's existing logger, monitoring, tracing, or error reporting tools when available.

## Review Checklist

- Are expected failures handled at the right boundary?
- Is the user-facing message safe and understandable?
- Are sensitive details hidden from users and logs?
- Is the error logged where operators can observe it?
- Does the error propagate when the current layer cannot handle it meaningfully?
- Are loading, error, empty, and success states defined for data-driven flows?
- Are route or component boundaries used where failure isolation is needed?
