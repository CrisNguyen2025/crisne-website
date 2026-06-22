# Architecture Rules

## Scope

Apply these rules to projects that use a `src/`-based frontend or full-stack application structure, especially React, Next.js, and TypeScript projects.

Use these rules to decide where new code belongs, which modules may depend on other modules, when code should stay feature-local, and when shared code should be extracted.

## Preferred Source Tree

```text
src/
├── app
├── components
├── configs
├── constants
├── features
├── hooks
├── i18n
├── icons
├── lib
├── models
├── services
├── store
├── styles
├── types
└── utils
```

## Core Layering

Preferred dependency direction:

```text
app
-> features
-> components / hooks / store
-> services
-> lib
-> models / utils / constants / configs / types
```

- Higher-level layers may depend on lower-level layers.
- Lower-level layers must not depend on higher-level layers.
- Keep feature-specific code inside the owning feature whenever possible.
- Avoid cross-feature imports unless the reused code is intentionally shared.
- Prefer extraction to a shared lower-level folder over importing another feature's internals.

## Folder Responsibilities

### `src/app`

Owns route entrypoints, layouts, page composition, and API route handlers.

- Allowed: `page.tsx`, `layout.tsx`, route groups, route-level loading and error handling, server route handlers.
- Should contain: minimal orchestration logic, route wiring, feature selection, page composition.
- Should not contain: reusable business logic, shared UI primitives, raw API call implementations.

### `src/features`

Owns product-facing feature modules by domain.

- Allowed: domain components, feature actions, feature hooks, validations, local constants, local utilities, feature-specific state helpers.
- Should contain: screen-level logic, domain workflows, feature-specific presentation and behavior.
- Should not contain: generic UI primitives reusable across domains, low-level HTTP or auth infrastructure, global data contracts that belong in `models`.
- Put product logic in the matching feature folder first.
- If code is reused by multiple features, move it to `components`, `hooks`, `lib`, `models`, or `utils` based on responsibility.
- Avoid importing another feature's internal files.
- If shared feature-level UI is needed, prefer an intentional shared area such as `features/shared` or a lower-level shared folder.

### `src/components`

Owns reusable UI building blocks outside a single feature.

- `layouts`: app shell and structural layout pieces.
- `providers`: top-level React providers.
- `shared`: reusable domain-agnostic composite components.
- `ui`: low-level UI primitives and design-system controls.
- Use `components/ui` for generic primitives such as buttons, inputs, dialogs, tables, and tabs.
- Use `components/shared` for reusable composites that are still domain-agnostic.
- Use `components/layouts` for app-wide structure.
- Keep components inside a feature if they are only used by that feature or carry feature-specific business meaning.
- Do not place direct service orchestration or tightly feature-specific workflows here.

### `src/services`

Owns API-facing and external data-access logic by domain.

- Allowed: request functions, service adapters, endpoint-specific payload handling, domain service types.
- Should contain: backend API calls, external service calls, request and response shaping near the transport boundary.
- Should not contain: UI logic, route rendering logic, generic HTTP primitives that belong in `lib/http`.
- Group services by business domain.
- Reuse `lib/http` and `lib/auth` instead of reimplementing transport logic.
- Keep services thin: fetch, shape, return.

### `src/lib`

Owns low-level infrastructure and framework-adjacent helpers.

- `api-client`: proxy and route-handler helpers.
- `auth`: token, cookie, and auth helper logic.
- `http`: client/server fetchers, request context, refresh behavior.
- `validations`: shared validation helpers.
- `lib` code should be reusable and independent of any single feature.
- `lib` may depend on `models`, `constants`, `configs`, `types`, and `utils`.
- `lib` must not depend on feature modules.

### `src/models`

Owns domain contracts and shared data shapes.

- Allowed: types, interfaces, enums, domain constants, base objects, shared data contracts.
- Put shared domain data definitions here when they are used across services, features, or components.
- Keep models free of rendering concerns.
- Avoid embedding transport logic in models.

### Other Folders

- `src/hooks`: reusable React hooks. Keep feature-specific hooks inside the owning feature unless reused broadly.
- `src/store`: cross-screen or shared client-side state. Do not use global store modules for local component state.
- `src/utils`: generic utility helpers with no strong domain ownership. Move domain-specific helpers to the owning area.
- `src/configs`: central application configuration and setup values.
- `src/constants`: truly global constants. Feature-specific constants belong in the owning feature or model.
- `src/i18n`: locale routing and translation plumbing.
- `src/icons`: shared icon components and icon exports.
- `src/styles`: global theme, palette, typography, resets, and shared CSS.
- `src/types`: ambient or global TypeScript declarations. Prefer `models` for domain data contracts.

## Placement Rules

- New route or page entrypoint: `src/app`
- Feature workflow or screen logic: `src/features/<domain>`
- Shared primitive UI element: `src/components/ui`
- Shared composite UI element: `src/components/shared`
- Shared app shell or layout piece: `src/components/layouts`
- Shared React hook: `src/hooks`
- Feature-only hook: `src/features/<domain>/hooks`
- API call or external data operation: `src/services/<domain>`
- Shared domain types or enums: `src/models/<domain>`
- HTTP, auth, or request plumbing: `src/lib/http` or `src/lib/auth`
- Generic utility helper: `src/utils`
- Shared client state: `src/store`
- App-wide configuration: `src/configs`
- Global constant: `src/constants`

## Dependency Rules

- `app` may import from `features`, `components`, `hooks`, `store`, `services`, `lib`, `models`, and `utils`.
- `features` may import from `components`, `hooks`, `store`, `services`, `lib`, `models`, and `utils`.
- `components` may import from `hooks`, `store`, `lib`, `models`, and `utils`.
- `services` may import from `lib`, `models`, `utils`, `configs`, and `constants`.
- `lib` may import from `models`, `utils`, `configs`, `constants`, and `types`.
- `store` may import from `services`, `lib`, `models`, and `utils`.
- `hooks` may import from `services`, `store`, `lib`, `models`, and `utils`.

Avoid or disallow:

- `lib` importing from `features`.
- `services` importing from `components`.
- `models` importing from `features`, `components`, or `services`.
- `utils` importing from `features`, `components`, or `services`.
- One feature directly depending on another feature's internal implementation.

## Shared Code Extraction Rules

- If code is reused by multiple screens in one feature, move it into that feature's `components`, `hooks`, `utils`, or `validations`.
- If code is reused by multiple features, move it into `components`, `hooks`, `lib`, `models`, or `utils` based on responsibility.
- If code is reused by both client and server request code, prefer `lib/http`, `lib/auth`, or `services`.
- If code starts generic but gains domain meaning, move it out of `utils` and into the owning feature, model, or service.

## Review Checklist

- Is the code in the narrowest folder that owns the responsibility?
- Is feature-specific logic leaking into shared layers?
- Are low-level layers free from UI and route concerns?
- Are domain contracts stored in `models` instead of duplicated?
- Are API calls concentrated in `services`?
- Is shared infrastructure implemented in `lib` instead of copied into features?
- Are cross-feature imports avoided unless intentionally shared?
