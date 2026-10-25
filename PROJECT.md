# Project: Assistant UI Dual-Concept Upgrade

## Architecture
Cris Assistant is the AI digital twin of Cris Nguyen for `crisne-website`. This project upgrades the Assistant UI to support dual concepts:
- **Style 1 (Default)**: Existing bottom-right launcher button (Capsule default or 3D Mascot chibi) opening a floating modal window on desktop / fullscreen modal on mobile.
- **Style 2 (2-Phase Langfuse-inspired)**:
  - **Phase 1 (Floating Quick Input Bar)**: Centered at bottom (`bottom-4 left-1/2 -translate-x-1/2`) with global `A` key shortcut on desktop, `<kbd>A</kbd>` badge, smooth opacity transition on submit button, auto-hiding when Phase 2 activates.
  - **Phase 2 (Full-Height Slide-Right Drawer)**: Slides in from right edge (`100dvh`, `w-full sm:max-w-md md:max-w-[480px]`), seamless query handoff from Phase 1, empty state with Quick Prompts, utility toolbar (Retry, Share, Clear), auto-height textarea, and Stop button while streaming.
- **Shared Core Hook**: `useFloatingChat` (`hooks/use-floating-chat.ts`) hoisted at container level, augmented with `retry()` and `isStreaming`, shared across both styles to guarantee zero stream interruption or state duplication.
- **Mobile Ergonomics**: `useAssistantViewport` calculating dynamic offsets via `window.visualViewport` to prevent virtual keyboard occlusion, and font sizes `>= 16px` to prevent iOS Safari auto-zoom.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Dual-Style Configuration | Support `uiStyle?: "style1-popup" | "style2-drawer"` with `"style1-popup"` default, 100% backward compatible | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Enhanced useFloatingChat | Augment with `retry()` turn re-send and explicit `isStreaming` state | M1 | ORIGINAL_REQUEST §R1, §R3 |
| 3 | Style 1 Popup Extraction | Extract popup modal into `FloatingChatPopup.tsx` while preserving Capsule/Mascot triggers | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Floating Quick Bar UI | Bottom-center pinned bar (`bottom-4 left-1/2 -translate-x-1/2`) with placeholder "Hỏi Cris AI..." | M1 | ORIGINAL_REQUEST §R2 |
| 5 | Desktop Shortcut 'A' | Global keydown 'A' focuses Quick Bar; ignores input/textarea/select/modifiers/mobile | M1 | ORIGINAL_REQUEST §R2 |
| 6 | Kbd Badge & Arrow Button | Desktop `<kbd>A</kbd>` badge; action button opacity transition on input | M1 | ORIGINAL_REQUEST §R2 |
| 7 | Quick Bar Exit Animation | Quick Bar translates down (`translate-y-16 opacity-0`) when Drawer opens, reappears on close | M1 | ORIGINAL_REQUEST §R2 |
| 8 | Slide-Right Drawer UI | Full-height right drawer (`100dvh`), backdrop blur, spring/cubic slide-in from right | M1 | ORIGINAL_REQUEST §R3 |
| 9 | Seamless Query Handoff | Quick Bar submission opens Drawer and streams response immediately without state reset | M1 | ORIGINAL_REQUEST §R3 |
| 10 | Empty State & Quick Prompts | Opening Drawer without query displays helpful Quick Prompts chips | M1 | ORIGINAL_REQUEST §R3 |
| 11 | Utility Toolbar | Retry response, Share conversation link to clipboard, Clear chat history (`resetChat()`) | M1 | ORIGINAL_REQUEST §R3 |
| 12 | Auto-height Composer & Stop | Auto-expanding textarea in Drawer, Send button turns into Stop button while streaming | M1 | ORIGINAL_REQUEST §R3 |
| 13 | Dismiss Ergonomics | Close drawer via backdrop click, top-right 'X' button, or Escape key | M1 | ORIGINAL_REQUEST §R3, §R4 |
| 14 | visualViewport Keyboard Offset | Prevent mobile virtual keyboard from obscuring Quick Bar and Drawer composer | M1 | ORIGINAL_REQUEST §R4 |
| 15 | Mobile Auto-Zoom Prevention | Ensure inputs and textareas use font-size `>= 16px` (`text-[16px] md:text-sm`) | M1 | ORIGINAL_REQUEST §R4 |
| 16 | Comprehensive Test Suite | Vitest unit tests for Style 1 regression, Quick Bar, Drawer, and Viewport ergonomics | M1, M2 | ORIGINAL_REQUEST §Acceptance Criteria |
| 17 | Zero Regressions & Lint | Pass `npm test`, `npx eslint components/floating-bot`, typecheck | M2 | ORIGINAL_REQUEST §Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Assistant UI Dual-Concept Implementation | `useFloatingChat`, `FloatingChatBot`, `FloatingChatPopup`, `FloatingQuickBar`, `FloatingChatDrawer`, `use-assistant-viewport`, and 4 Vitest test suites | none | DONE |
| M2 | Verification, Hardening & Audit | Full test pass (75 suites, 941 tests), lint clean, adversarial reviews, forensic audit CLEAN | M1 | DONE |

## Interface Contracts

### FloatingChatBot Props
```tsx
export type AssistantUiStyle = "style1-popup" | "style2-drawer";

export interface FloatingChatBotProps {
  triggerVariant?: "capsule" | "mascot"; // Style 1 trigger variant (default: "capsule")
  uiStyle?: AssistantUiStyle;            // Default: "style1-popup"
  initialOpen?: boolean;
}
```

### useFloatingChat Extended API
```tsx
export interface UseFloatingChatReturn {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  isStreaming: boolean;
  conversationId: string;
  sendMessage: (contentToSend?: string) => Promise<void>;
  sendFeedback: (message: ChatMessage, value: 0 | 1) => Promise<void>;
  resetChat: () => void;
  stopResponse: () => void;
  retry: (targetMessageId?: string) => Promise<void>;
}
```

### FloatingQuickBar Contract
```tsx
export interface FloatingQuickBarProps {
  isVisible: boolean;
  input: string;
  onInputChange: (val: string) => void;
  onSubmit: (val: string) => void;
  onOpenDrawer: () => void;
}
```

### FloatingChatDrawer Contract
```tsx
export interface FloatingChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chat: UseFloatingChatReturn;
}
```

## Code Layout
- `hooks/use-floating-chat.ts` — Core portfolio chat hook (M1)
- `components/floating-bot/FloatingChatBot.tsx` — Main container & style switcher (M1)
- `components/floating-bot/FloatingChatPopup.tsx` — Style 1 popup window (M1)
- `components/floating-bot/ChatTriggerButton.tsx` — Style 1 capsule/mascot button (M1)
- `components/floating-bot/FloatingQuickBar.tsx` — Style 2 Phase 1 Quick Bar (M2)
- `hooks/use-quickbar-shortcut.ts` — Global desktop shortcut 'A' hook (M2)
- `components/floating-bot/FloatingChatDrawer.tsx` — Style 2 Phase 2 Drawer (M3)
- `hooks/use-assistant-viewport.ts` — Dynamic visualViewport calculation hook (M4)
- `tests/unit/assistant-style1.test.tsx` — Style 1 regression tests (M1)
- `tests/unit/assistant-style2-quickbar.test.tsx` — Quick Bar unit tests (M2)
- `tests/unit/assistant-style2-drawer.test.tsx` — Drawer unit tests (M3)
- `tests/unit/assistant-viewport-ergonomics.test.tsx` — Viewport & mobile tests (M4)
