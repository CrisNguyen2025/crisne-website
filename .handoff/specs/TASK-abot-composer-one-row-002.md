---
task_id: "TASK-abot-composer-one-row-002"
branch: "feat/abot-composer-one-row"
version: "3.0.0"
type: "implement"
priority: "P2"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ChatComposer.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx"
    - "tests/unit/composer-smooth-transition.test.tsx"
  continues_dirty:
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ChatComposer.tsx"
    - "tests/unit/composer-smooth-transition.test.tsx"
  read_only_references:
    - "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx"
    - ".handoff/specs/TASK-abot-composer-one-row-001.md"
    - "AGENTS.md"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"

deploy_steps: []

fast_gate: ["type_check", "unit_composer", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  unit_composer: "yarn vitest run tests/unit/composer-smooth-transition.test.tsx tests/unit/sdk-widget.test.tsx"
  lint_task: "yarn eslint roadmap-rag-assistant/sdk/typescript/src/react/components/ChatComposer.tsx roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx tests/unit/composer-smooth-transition.test.tsx"
  test: "yarn test"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-abot-composer-one-row-002"
---

# TASK: Composer của Abot thành 2 cột (text | action), bỏ nút mic

> **Trạng thái hiện tại**: COMPLETED, Claude verify PASS: tsc, 18 unit test, eslint 3 file; browser localhost:3334 khi 1→2 dòng textarea giữ x=620 rộng 320px, card 50→74px, nút gửi đứng yên. OUT_OF_SCOPE duy nhất là `TASK-abot-general-gap-reply-001.md` do phiên khác sửa lúc 18:02:03. Chưa commit.

## 1. Context & Architectural Intent
- **Goal**: Thay layout 2 chế độ (compact/expanded) của `ChatComposer` bằng một hàng flex duy nhất gồm 2 cột:
  - **Cột text** (trái, `flex-1 min-w-0`): textarea tự cao theo nội dung, từ 1 dòng tới tối đa `MAX_TEXTAREA_HEIGHT` (160px) rồi cuộn.
  - **Cột action** (phải, `shrink-0`): counter (khi gần giới hạn) + nút gửi/dừng, neo ở đáy card (`items-end`), nên khi text lên nhiều dòng thì nút nằm ngang dòng cuối.
  - Text không bao giờ chạy vào vùng nút gửi, nên khi xuống dòng card chỉ cao thêm, không có gì đổi chỗ hay nhảy.
- **Why**: Dev thấy bản 001 vẫn giật layout khi text nhảy dòng (textarea đổi padding/độ rộng khi chuyển compact → expanded). Nút mic chưa dùng (disabled, "sắp có") nên bỏ.
- **Dependencies**: `ChatComposer.tsx#ChatComposer` (code hiện tại là kết quả TASK-001, chưa commit), caller duy nhất `RoadmapChatbotWidget.tsx` (impact LOW). `MicIcon` trong `icons.tsx` chỉ `ChatComposer` dùng.

## 2. Invariants & Rules
- Giữ nguyên `ChatComposerProps`, `MAX_INPUT_LENGTH`, placeholder (`Hỏi Abot…` / `Abot đang trả lời…`), aria-label nút gửi/dừng, logic `pb-2` khi bàn phím mở, effect blur khi bàn phím đóng mà input rỗng, các thuộc tính chặn autofill của textarea.
- Giữ `data-testid="composer-card"` trên card và `data-testid="composer-toolbar"` trên cột action. Bỏ `data-mode`, `composer-spacer`, toolbar `absolute`, state/logic compact-expanded (`isMultiline`, `isExpanded`, `isCompact`, các hằng `COMPACT_TEXTAREA_HEIGHT`, `EXPANDED_1LINE_HEIGHT`) và hook `useIsMobile` nếu không còn dùng.
- Kích thước 1 dòng giữ như cũ: card cao 48px, text dòng đầu căn giữa theo chiều dọc với nút gửi 36px. Gợi ý: card `flex items-end gap-1 p-1.5`, textarea `py-1.5 pl-2.5 leading-6` (24px + 12px = 36px, bằng nút), height tự tính lại theo `scrollHeight` trong `useLayoutEffect` (đặt `auto`, rồi `min(scrollHeight, MAX)`).
- Độ rộng textarea không được đổi theo số dòng hay trạng thái focus (không đổi padding, không toggle class theo nội dung).
- Giữ style hiện có: bo `rounded-[24px]`, border, shadow, `focus-within`, màu nút gửi, `text-base md:text-sm`.
- Ngoài phạm vi: nút "+" hay attachment, hành vi Enter/Shift+Enter, `RoadmapChatbotWidget.tsx`, Cris AI.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1** (`ChatComposer.tsx`): dựng lại JSX theo mục 1–2: card flex 2 cột, bỏ nút mic và import `MicIcon`, bỏ code compact/expanded. Comment ngắn mô tả layout mới.
- [x] **Step 2** (`icons.tsx`): xoá `MicIcon` nếu không còn chỗ nào dùng (`git grep MicIcon`).
- [x] **Step 3** (`tests/unit/composer-smooth-transition.test.tsx`): viết lại test theo layout mới:
  - Không có nút "Nhập bằng giọng nói".
  - Card chứa textarea và `composer-toolbar` là 2 con cùng cấp; toolbar chứa nút gửi.
  - Textarea không đổi `className` khi gõ text 1 dòng → nhiều dòng (`\n`) và khi focus/blur.
  - Auto-grow: mock `scrollHeight` (khôi phục sau test) → `style.height` = giá trị mock; vượt 160 → `160px`.
  - `isKeyboardOpen` → container `pb-2`.
  - Giữ test gửi/dừng và counter (`1.805/2.000`).
- [x] **Step 4**: chạy `verification_gate`, điền mục 4, ghi `result.json`. `yarn lint` toàn repo đang fail vì lỗi có sẵn ngoài task nên gate dùng `lint_task`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Unit Composer`: PASSED
- [x] `Lint Task`: PASSED
- [x] `Test`: PASSED
- [x] `Intel Status`: PASSED
- [ ] `Boundary Check`: FAILED (theo Rule 6: do file ngoài .handoff/specs/TASK-abot-general-gap-reply-001.md)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-abot-composer-one-row-002/result.json`
- **Modified Files**:
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/ChatComposer.tsx`
  - `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx`
  - `tests/unit/composer-smooth-transition.test.tsx`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): ...
