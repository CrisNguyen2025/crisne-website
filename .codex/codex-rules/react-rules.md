# React Rules

## Scope

Apply these rules across React and React-based projects, including Next.js applications.

## Components

- Use functional components.
- Define explicit prop types for exported components.
- Destructure props in the function parameter when it improves readability.
- Keep render logic simple and easy to scan.
- Extract helper functions or child components when JSX becomes difficult to read.
- Prefer composition over deep prop drilling.
- Keep feature-specific components close to the feature that owns them.
- Move components to shared folders only when they are genuinely reusable.

## Props

- Keep component APIs small and intentional.
- Prefer clear prop names over vague names such as `data`, `item`, or `config` when the domain is known.
- Avoid passing large unrelated prop bundles through multiple layers.
- Prefer `children` or composition slots when it makes the component easier to extend.
- Use callback props for component events, not hidden shared-state side effects.

## State

- Keep state as close as possible to where it is used.
- Use shared state only when multiple branches of the tree genuinely need it.
- Prefer local component state for local UI concerns.
- Prefer Context for stable cross-tree concerns such as theme, auth context, user session, or locale.
- Prefer Zustand or the project's existing store pattern for shared client state with meaningful cross-screen usage.
- Do not move state into global stores just to avoid prop passing in a small component tree.

## Hooks

- Keep hooks focused on one responsibility.
- Always clean up subscriptions, timers, observers, and event listeners in `useEffect`.
- Do not move side effects into render paths.
- Avoid custom hooks that hide too much control flow unless they clearly improve reuse, testing, or readability.
- Keep feature-specific hooks inside the owning feature unless they are reused broadly.
- Name custom hooks with the `use` prefix.

## Effects

- Use `useEffect` for synchronization with external systems, not for ordinary render-time derivation.
- Prefer deriving values during render when no side effect is needed.
- Avoid effects that only copy props into state unless there is a clear reason.
- Keep effect dependency arrays correct and intentional.
- Split unrelated effects instead of combining multiple responsibilities into one effect.

## Memoization

- Do not add `React.memo`, `useMemo`, or `useCallback` by default.
- Use memoization only when there is a demonstrated render-cost or identity-stability problem.

Add memoization when one of these is true:

- An expensive computation runs repeatedly during render.
- A child component is measurably re-rendering because of unstable props.
- A dependency requires stable callback identity.
- A context value or provider value needs stable identity to prevent broad re-renders.

When memoization is added:

- Keep the reason obvious in code, comments, review notes, or the PR description.
- Keep dependency arrays correct.
- Remove memoization if it no longer solves a real problem.

## Review Checklist

- Is state kept at the narrowest useful scope?
- Are component props explicit and easy to understand?
- Is render logic simple enough to scan?
- Are side effects kept out of render paths?
- Are effects cleaned up where needed?
- Is Context or global state used only when justified?
- Is memoization solving a real performance or identity problem?
