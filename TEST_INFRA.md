# E2E Test Infrastructure Specification

> **Project**: Crisne Website AI Assistant Refactoring & Generative UI  
> **Author**: E2E Test Architect  
> **Target Track**: E2E Testing Track (M4) & Final Verification (M5)  
> **Runner**: Vitest 5.x (`npx vitest run tests/e2e` / `npm test`)  
> **Runtime**: Node.js 22+ (Native `CustomEvent`, `EventTarget`, `ReadableStream`, `TransformStream`)

---

## 1. Test Philosophy & Design Principles

### 1.1 Requirement-Driven Opaque-Box Testing
The E2E testing track tests observable system behavior, interface contracts, and user interactions rather than private internal implementation details. Tests validate inputs and observable outputs against authoritative specifications defined in `ORIGINAL_REQUEST.md` and `PROJECT.md`.

### 1.2 Progressive Testability & Graceful Execution
The test suite is structured to support the incremental development lifecycle across milestones:
- **Baseline Passes**: Tests covering invariant project rules, type safety, entity catalogs, route contracts, and baseline API behavior execute and pass immediately.
- **Pending Milestones**: Tests covering components under active development by specific milestone workers (M1: SDK Refactor, M2: Anti-Slop Transformer, M3: Generative Action Chips) dynamically evaluate capability availability. When a module is pending, tests document the requirement and state cleanly (`test.skipIf(!isImplemented)`), ensuring the suite can run cleanly in CI (`npm test`) without breaking concurrent worker workflows.
- **Milestone Completion Activation**: As each worker completes their milestone files (`icons.tsx`, `anti-slop.ts`, `action-chips.ts`, `ChatMarkdown.tsx`), corresponding test suites automatically activate and assert 100% compliance.

### 1.3 Zero-Flakiness & Determinism
- No network dependencies: API keys (`GEMINI_API_KEY`, `LANGFUSE_PUBLIC_KEY`) are mocked to deterministic test stubs.
- No live browser/Selenium overhead: Tests execute in Vitest's lightning-fast Node environment while simulating modern Web APIs (`CustomEvent`, `ReadableStream`, `fetch`) natively.
- Non-deterministic fields (timestamps, trace IDs) use pattern matching rather than brittle literal matches.

---

## 2. Feature Inventory Coverage Matrix

| Feature | Requirement | Description | Target File(s) | Tier 1 Tests | Tier 2 Tests | Tier 3 & 4 | Milestone |
|---------|-------------|-------------|----------------|--------------|--------------|------------|-----------|
| **F01** | R1 | React 19 Ref Violations Fix | `useRoadmapAssistantChat.ts` | >=5 | >=5 | Pairwise & Flow | M1 |
| **F02** | R1 | Icon & Asset Isolation | `icons.tsx` | >=5 | >=5 | Cross-module | M1 |
| **F03** | R1 | Text Formatters Modularization | `utils/formatters.ts` | >=5 | >=5 | Cross-module | M1 |
| **F04** | R1 | Headless AI SDK Decoupling | `types.ts`, `index.ts` | >=5 | >=5 | SDK + Chips | M1 |
| **F05** | R2 | Anti-Slop System Prompt | `app/api/chat/route.ts` | >=5 | >=5 | Scenario 1-5 | M2 |
| **F06** | R2 | Deterministic Anti-Slop Transformer | `lib/ai/anti-slop.ts` | >=5 | >=5 | Anti-Slop + Chips | M2 |
| **F07** | R2 | Action Metadata & Entity Catalog | `lib/ai/action-chips.ts` | >=5 | >=5 | Chips + Markdown | M2 |
| **F08** | R2 | Chat Route Fallback & Tests | `app/api/chat/route.ts` | >=5 | >=5 | Error Flows | M2 |
| **F09** | R3 | Zero-Dependency ChatMarkdown | `ChatMarkdown.tsx` | >=5 | >=5 | Markdown + Chips | M3 |
| **F10** | R3 | Action Chips UI & Event Bus | `ChatActionChips.tsx` | >=5 | >=5 | Event Dispatch | M3 |
| **F11** | R3 | FloatingChatBot Integration | `FloatingChatBot.tsx` | >=5 | >=5 | Portfolio Flow | M3 |
| **F12** | R3 | RoadmapChatbot Integration | `RoadmapAssistantChatbot.tsx` | >=5 | >=5 | Roadmap Flow | M3 |
| **F13** | R4 | E2E Testing Suite (Tiers 1-4) | `tests/e2e/**` | >=20 | >=20 | Integrated | M4 |
| **F14** | R4 | Final E2E Pass & Verification | Entire Codebase | N/A | N/A | Hardening | M5 |

---

## 3. Test Architecture & Directory Layout

```
tests/e2e/
├── test-helpers.ts                       # Shared test utilities, AST parsers, stream mocks, contract interfaces
├── tier1-r1-sdk-headless.test.ts         # Tier 1: Feature tests for R1 (F01 - F04)
├── tier1-r2-anti-slop.test.ts            # Tier 1: Feature tests for R2 (F05 - F08)
├── tier1-r3-action-chips.test.ts         # Tier 1: Feature tests for R3 (F09 - F12)
├── tier1-r4-integrity-pipeline.test.ts   # Tier 1: Feature tests for R4 (Strict rules, types, build)
├── tier2-boundary-corner-cases.test.ts   # Tier 2: Extreme inputs, empty buffers, invalid action tags, stress
├── tier3-cross-feature-interactions.test.ts # Tier 3: Pairwise combinations (Anti-slop + Chips, Markdown + Chips)
└── tier4-real-world-scenarios.test.ts    # Tier 4: Real visitor questions, recruiter flows, roadmap explorer
```

---

## 4. Test Tier Definitions

### Tier 1: Feature Coverage (>=5 test cases per feature)
- Validates the primary happy path and core specification of every feature.
- Verifies contract compliance: `ChatActionChip`, `ChatMessage`, `AntiSlopStreamTransformer`, `parseMessageContentAndActions`, CustomEvent schemas.

### Tier 2: Boundary & Corner Cases (>=5 test cases per feature)
- Empty strings, whitespace-only chunks, single-character streams.
- Extreme lengths: multi-megabyte payloads, deeply nested tags, 100+ action chips.
- Malformed inputs: unclosed markdown fences, broken action tags (`[[action:malformed`), invalid URLs (`javascript:alert(1)`).
- Rapid concurrency: multiple simulated requests, rate-limit boundary conditions.

### Tier 3: Cross-Feature Interactions
- **Anti-Slop + Action Chips**: Chat answers containing greetings and action chips ensure the greeting is pruned without corrupting the action tags.
- **Markdown + Action Chips**: Responses with code blocks, links, bold text, and action chips parse cleanly into formatted text and action pills.
- **Headless SDK + Action Chips**: The headless hook correctly accumulates action chips in `ChatMessage.actionChips`.
- **CustomEvent Bus Dispatch**: Action chips trigger decoupled events (`project:open-modal`, `roadmap:select-layer`, `roadmap:open-modal`) with payload verification.

### Tier 4: Real-World Workload Scenarios
- **Scenario 1**: Commercial Project Discovery (Kamala, Zelene Spa, Smartbit, JAVIS).
- **Scenario 2**: Recruiter / Hiring Flow (CV PDF download, Zalo contact, LinkedIn profile).
- **Scenario 3**: Roadmap Architecture Deep-Dive (Layers 01 to 05 explanations, layer navigation chips).
- **Scenario 4**: Off-Topic / Prompt Injection Guardrails (Redirection to Cris portfolio, zero AI slop).
- **Scenario 5**: Multi-Turn Progressive Dialogue (Preserving context across follow-up questions).

---

## 5. Execution & Verification Commands

```bash
# Run entire E2E test suite
npx vitest run tests/e2e

# Run all project tests (unit, route, e2e)
npm test

# Verify type safety
npx tsc --noEmit

# Verify Next.js production build
npm run build
```
