---
task_id: "TASK-visual-hierarchy-002"
branch: "feat/visual-hierarchy-002"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "DRAFT" # Khuyến nghị tách nhánh từ `main` SAU KHI `feat/rovo-owner-memory` merge (hoặc đồng bộ với UI phase của ADR-0020)
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/sdk/typescript/src/react/tokens.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ChatHeader.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/OwnerMemorySheet.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ThreadHistorySheet.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ContextUsageSheet.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/FeedbackReasonSheet.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ChangeReviewCard.tsx"
    - "tests/unit/sdk-widget.test.tsx"
    - "tests/unit/abot-preview-edit-titles.test.tsx"
    - "tests/unit/thread-history-sheet.test.tsx"
    - "tests/unit/owner-memory-sheet.test.tsx"
    - "tests/unit/sdk-widget-a11y-interaction.test.tsx"
  continues_dirty: []
  read_only_references:
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/design-system.md"
    - "docs/adr/0011-drop-knowledge-triage.md"
    - "docs/adr/0012-owner-thread-state-in-turso.md"
    - "docs/adr/0015-abot-owner-memory.md"
    - "docs/adr/0020-rovo-owner-memory-and-observations.md"
    - "app/styles/roadmap-theme.css"
    - "components/roadmap/RoadmapAssistantChatbot.tsx"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "roadmap-rag-assistant/sdk/typescript/package.json"
    - "components/floating-bot/**"
    - "components/roadmap/**"
    - "components/news/**"
    - "roadmap-rag-assistant/rag_service/**"
    - "prisma/**"
    - "app/api/**"

deploy_steps: []

fast_gate: ["type_check", "sdk_typecheck", "sdk_ui_test", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  sdk_typecheck: "cd roadmap-rag-assistant/sdk/typescript && yarn typecheck"
  lint: "yarn eslint roadmap-rag-assistant/sdk/typescript/src/react tests/unit/sdk-widget.test.tsx tests/unit/abot-preview-edit-titles.test.tsx tests/unit/thread-history-sheet.test.tsx tests/unit/owner-memory-sheet.test.tsx tests/unit/sdk-widget-a11y-interaction.test.tsx"
  sdk_ui_test: "yarn test tests/unit/sdk-widget.test.tsx tests/unit/abot-preview-edit-titles.test.tsx tests/unit/thread-history-sheet.test.tsx tests/unit/owner-memory-sheet.test.tsx tests/unit/sdk-widget-a11y-interaction.test.tsx"
  test: "yarn test"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-visual-hierarchy-002"
---

# TASK: Đồng bộ Theme Abot, Đóng khung HITL Preview & Nâng cấp Hierarchy Header/Sheets

> **Trạng thái hiện tại**: DRAFT — đã chốt toàn bộ mục `0.` theo `Option (A)` (2026-11-26); chờ `feat/rovo-owner-memory` hợp nhất lên `main` rồi tách nhánh/worktree `feat/visual-hierarchy-002` và chạy `baseline.sh` để chuyển `READY`.

## 0. Quyết định đã chốt của Owner (2026-11-26)

| # | Câu hỏi | Quyết định đã chốt |
|---|---|---|
| Q1 | Chế độ màu cho `RoadmapChatbotWidget` (đặc biệt khi bật Sidebar Mode cạnh trang có `.dark`) | **Option (A):** Giữ `WIDGET_THEME_VARS` làm fallback chuẩn của SDK standalone, chuyển toàn bộ hex cứng trong JSX sang CSS vars của `tokens.ts` (khớp Terracotta `#c04a30` / warm surface), đồng thời hỗ trợ `.dark [data-abot-overlay-root]` để Sidebar Mode tự chuyển sang tông tối `#161513` / `#1f1e1b` / `#e3745b` khi host đang bật dark theme. |
| Q2 | Giao diện nút Launcher góc dưới phải (`RoadmapChatbotWidget.tsx:632`) | **Option (A):** Giữ tương phản nổi bật trên nền sáng (pill `bg-[#1F1E1C]` chữ sáng hoặc surface ấm viền rõ) nhưng **bỏ màu xanh `#8BB5D9` của Portfolio**, thay sparkle sang màu Terracotta ấm `#E3745B` / `#C04A30` để đồng nhất thương hiệu Abot với `.roadmap-theme`. |
| Q3 | Quan hệ với nhánh `feat/rovo-owner-memory` (`OwnerMemorySheet.tsx`) | Thực thi task này **sau khi** `feat/rovo-owner-memory` merge xong lên `main`, để tránh xung đột 2 chiều khi nâng cấp tab *Bạn chia sẻ trực tiếp* / *Abot quan sát* của `ADR-0020`. |

## 1. Context & Architectural Intent
- **Goal**: Làm rõ ranh giới an toàn HITL của thẻ `Preview` so với tin nhắn trả lời thường và `ChangeReviewCard`, giảm chật chội ở header `25rem`, đưa cảnh báo `pendingMemoryCount` ra ngoài menu ẩn, nâng thang chữ các Bottom Sheet và đồng bộ token Abot với `.roadmap-theme`.
- **Why**:
  - `ConfirmActions` (`MessageList.tsx:158-293, L543-555`) đang nằm trực tiếp dưới text markdown chỉ có một dòng `Đang chờ bạn xác nhận` không khung viền, yếu hơn `ChangeReviewCard` (`L68`) về phân cấp thị giác dù Preview là bước xác nhận trước khi ghi DB.
  - `ChatHeader.tsx` (L118–L303) dồn 5 nút icon trên chiều rộng `25rem`, trong khi `pendingMemoryCount` bị giấu trong dropdown `⋯` (`L255-259`), Owner không nhìn thấy số mục chờ duyệt từ ngoài.
  - `OwnerMemorySheet.tsx` (L713–L745) nhét tiêu đề và 3 tab chung 1 hàng ngang; tiêu đề của `OwnerMemorySheet`, `ThreadHistorySheet`, `ContextUsageSheet` đều dùng `text-xs` (`12px`, nhỏ hơn nội dung `14px`) kèm nhiều text `10px–11px`.
  - `RoadmapChatbotWidget.tsx`, `ChatHeader.tsx`, `ChatMarkdown.tsx` vẫn trộn hex cứng (`#FFFFFF`, `#1F1E1C`, `#C2410C`, `text-blue-600`, `text-rose-600`, `#8BB5D9`) thay vì dùng biến từ `tokens.ts`.
- **Dependencies**:
  - `roadmap-rag-assistant/sdk/typescript/src/react/tokens.ts#CHAT_COLORS`, `#WIDGET_THEME_VARS`.
  - `RoadmapChatbotWidget.tsx`, `ChatHeader.tsx`, `MessageList.tsx#ConfirmActions`, `#MessageItem`, `ChatMarkdown.tsx`, `OwnerMemorySheet.tsx`, `ThreadHistorySheet.tsx`, `ContextUsageSheet.tsx`, `FeedbackReasonSheet.tsx`, `ChangeReviewCard.tsx`.
  - Flows: `FLOW_ABOT_CUD_PREVIEW_CONFIRM`, `FLOW_ABOT_OWNER_MEMORY_MANAGE`, `FLOW_ABOT_THREAD_HISTORY`.

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Lưu ý `roadmap-rag-assistant/sdk/typescript` là package SDK độc lập (`roadmap-chat-sdk`), **không** import từ `@/components/ui/*` hay `@/lib/*` của Next.js; mọi styling dùng Tailwind utility + CSS custom properties từ `tokens.ts`.
- Giữ nguyên contract props và các `aria-label` / button role mà unit tests đang query (`"Mở Abot"`, `"Đóng Abot"`, `"Lịch sử chat"`, `"Cuộc trò chuyện mới"`, `"Switch to"`, `"Tùy chọn"`, `"Xác nhận thực hiện"`, `"Hủy bỏ"`, `"Sao chép trace ID của câu trả lời"`, v.v.).
- Giữ nguyên test mascot SVG selectors trong `tests/unit/sdk-widget.test.tsx#L322-L378` (`clipPath`, `ellipse`, `circle[stroke-dasharray="4 2.5"]`).
- Giữ nguyên hành vi ẩn 👍/👎 khi `onFeedback` omitted (`ADR-0011`, `TASK-abot-scale-003` Q3).
- Kiểm tra `expectNoA11yViolations` (`axe-core`) ở `thread-history-sheet.test.tsx` và `sdk-widget-a11y-interaction.test.tsx`: contrast chữ thường ≥ 4.5:1 trên mọi surface light (và dark nếu bật ở Q1).
- Ngoài phạm vi: `roadmap-rag-assistant/rag_service/**` (Python), logic stream/SSE, `components/floating-bot/**` (Cris AI).

## 3. Step-by-Step Implementation Checklist
- [ ] **Step 1: Đồng bộ Token & Semantic Variables (`tokens.ts`, `RoadmapChatbotWidget.tsx`, `ChatMarkdown.tsx`)**
  - Chuẩn hóa `CHAT_COLORS` và `WIDGET_THEME_VARS` trong `tokens.ts` (accent đồng nhất Terracotta `#C04A30` / hover `#9A3412` hoặc mapping biến `--chat-surface-hover`, `--chat-accent-soft`, `--chat-bg`, `--chat-card`), bổ sung biến cho highlight claim / code inline.
  - Thay hex cứng trong `RoadmapChatbotWidget.tsx`, `ChatHeader.tsx`, `ChangeReviewCard.tsx` bằng CSS vars (`var(--chat-*)` / `var(--bg)` / `var(--surface)`) có fallback để cả host Next.js và standalone SDK đều chạy chuẩn. Theo `Q1`, xử lý dark-mode override sạch sẽ cho `[data-abot-overlay-root]` khi host ở `.dark`.
  - Trong `ChatMarkdown.tsx`: đổi link (`text-blue-600`) sang `text-[var(--chat-accent,#C04A30)]` (hoặc token link rõ tương phản) và inline code (`text-rose-600`) sang `text-[var(--chat-text,#1F1E1C)]` trên nền `--chat-surface` viền mảnh.
  - Theo `Q2`, bỏ `#8BB5D9` ở Launcher button (`RoadmapChatbotWidget.tsx:643`), dùng accent Terracotta ấm.
- [ ] **Step 2: Đóng khung HITL `Preview` & sửa Heading Welcome (`MessageList.tsx`)**
  - Bọc khối `awaitingConfirm` (`MessageList.tsx:543-555`) vào một container Preview card rõ nét: viền nổi (`border border-[var(--chat-accent,#C04A30)]/30 bg-[#FAF9F7]` hoặc `bg-[var(--chat-surface)]`), header nhỏ có icon xác nhận + `"Xác nhận thay đổi (Preview)"` tách bạch hẳn với body câu trả lời ở trên và action bar Copy/ID ở dưới.
  - Giữ nguyên cấu trúc input `Tên`, `Topic đích`, `Mục đích` và hai nút `"Xác nhận thực hiện"` / `"Hủy bỏ"` (đảm bảo toàn bộ `abot-preview-edit-titles.test.tsx` pass).
  - Đổi `<h3 className="text-[22px] ...">` ở Welcome stage (`MessageList.tsx:817`) thành `<h2>` (giữ nguyên class kích thước hiển thị), đảm bảo thứ bậc heading hợp lệ bên trong `dialog`/region chat.
- [ ] **Step 3: Tối ưu Header & Hiển thị `pendingMemoryCount` (`ChatHeader.tsx`)**
  - Khi `canWrite && pendingMemoryCount > 0`, gắn dấu chấm/badge số đếm nhỏ ngay trên nút `"Tùy chọn"` (`⋯`) (kèm `aria-label` hoặc text sr-only rõ ràng) để Owner nhận biết ngay có gợi ý bộ nhớ đang chờ duyệt trước khi mở menu.
  - Rà khoảng cách nhóm nút phải (`gap-1`), kiểm tra chạm tối thiểu `32px` desktop / `44px` mobile (qua hit-area) và khi `hideBrand === true` cân đối cụm nút để header không bị trống trơ bất thường.
- [ ] **Step 4: Nâng cấp Typography & Cấu trúc 2 tầng cho Sheets (`OwnerMemorySheet.tsx`, `ThreadHistorySheet.tsx`, `ContextUsageSheet.tsx`, `FeedbackReasonSheet.tsx`)**
  - Nâng tiêu đề tất cả các sheet từ `text-xs` (`12px`) lên `text-sm font-semibold` (`14px`) để tạo mỏ neo cấp 1 rõ ràng so với nội dung bên dưới.
  - Trong `OwnerMemorySheet.tsx`: tách header `"Bộ nhớ Owner"` + nút đóng thành hàng 1, đẩy thanh tabs (`Đang nhớ`, `Chờ duyệt`, `Đã gỡ` — hoặc tab của `ADR-0020` nếu đã merge) xuống **hàng 2 full-width** (`grid-cols-3` hoặc `flex`), tránh bóp chữ trên khung `25rem` và mobile.
  - Trong `ThreadHistorySheet.tsx`: nâng `thread.title` lên `text-[0.8125rem]` hoặc `text-sm` (`13–14px`), metadata & snippet tối thiểu `text-xs` (`12px`), badge `Đang mở` và `activeTopicTitle` rõ ràng hơn (tránh `0.625rem` / `10px`).
  - Trong `ContextUsageSheet.tsx` & `FeedbackReasonSheet.tsx`: nâng các note/label từ `11px` lên `text-xs` (`12px`), đồng nhất bo góc và padding của header/body sheets.
- [ ] **Step 5: Kiểm tra Tests & A11y**
  - Cập nhật và chạy 5 test files SDK ở `sdk_ui_test`, kiểm tra không phát sinh lỗi `axe-core`, sau đó chạy full `verification_gate`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [ ] `TypeCheck`: PENDING
- [ ] `SDK TypeCheck`: PENDING
- [ ] `Lint`: PENDING
- [ ] `SDK UI Test`: PENDING
- [ ] `Test`: PENDING
- [ ] `Intel Status`: PENDING
- [ ] `Doctor Delta`: PENDING
- [ ] `Boundary Check`: PENDING

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-visual-hierarchy-002/result.json`
- **Modified Files**:
  - `...`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): ...
