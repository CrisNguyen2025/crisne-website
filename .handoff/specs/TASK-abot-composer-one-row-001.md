---
task_id: "TASK-abot-composer-one-row-001"
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
    - "tests/unit/composer-smooth-transition.test.tsx"
  continues_dirty: []
  read_only_references:
    - "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx"
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
  lint: "yarn lint"
  test: "yarn test"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-abot-composer-one-row-001"
---

# TASK: Composer của Abot mặc định 1 hàng, chỉ lên nhiều dòng khi nội dung dài

> **Trạng thái hiện tại**: COMPLETED, Claude verify gate PASS (tsc, 21 unit test, eslint 2 file). Layout compact/expanded bị TASK-abot-composer-one-row-002 thay theo yêu cầu Dev.

## 1. Context & Architectural Intent
- **Goal**: Ô nhập của Abot (`ChatComposer`) luôn ở dạng 1 hàng (pill: mic trái, textarea giữa, nút gửi phải). Chỉ chuyển sang dạng nhiều dòng (textarea full width ở trên, toolbar mic/gửi ở hàng dưới) khi nội dung không còn vừa 1 dòng: có ký tự xuống dòng, hoặc text tự wrap. Giống composer của Claude.
- **Why**: Hiện tại card nở ra 2 hàng ngay khi focus, khi bàn phím điện thoại bật, hoặc khi gõ 1 ký tự. Dev muốn giữ 1 hàng cho câu ngắn.
- **Dependencies**:
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/ChatComposer.tsx#ChatComposer` (biến `isExpanded`, layout effect auto-grow).
  - Caller duy nhất: `RoadmapChatbotWidget.tsx` (impact LOW, 1 caller trực tiếp). Props `ChatComposerProps` giữ nguyên.
  - Nhánh gốc: `chore/router-stress` (HEAD `e89476d`, chưa merge vào `main`), vì cần skill `/executor` ở commit đó.

## 2. Invariants & Rules
- Không đổi `ChatComposerProps`, `MAX_INPUT_LENGTH`, placeholder, aria-label, `data-testid` (`composer-card`, `composer-spacer`, `composer-toolbar`) và thuộc tính `data-mode` (`compact` | `expanded`): test và Playwright helper (`tests/manual/helpers/abot-send.js`) dựa vào chúng.
- Giữ cấu trúc DOM hiện tại (một textarea, toolbar absolute, spacer) để transition mượt không re-mount nút.
- Không được nhấp nháy qua lại giữa 2 chế độ: ở compact textarea hẹp hơn (`pl-12 pr-12`) so với expanded (`px-3.5`), nên text vừa đủ wrap ở compact có thể vừa 1 dòng ở expanded. Quy tắc: **đã expanded thì giữ expanded cho tới khi input rỗng** (sau `trim`). Không thu lại khi xoá bớt chữ.
- Đo overflow trong `useLayoutEffect` (trước paint) để không thấy frame sai. Không fetch, không `console.log`.
- Ngoài phạm vi: style/màu, nút mic (vẫn disabled), hành vi Enter/Shift+Enter (`handleKeyDown` ở widget), Cris AI.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 1** (`ChatComposer.tsx`): bỏ điều kiện `focused` và `isKeyboardOpen` khỏi `isExpanded`. Thêm state `isMultiline`:
  - `true` khi `input` chứa `\n`, hoặc khi đang compact mà nội dung tràn 1 dòng (đặt `height = "auto"`, so `scrollHeight > COMPACT_TEXTAREA_HEIGHT`, rồi trả lại `46px`).
  - Về `false` khi `input.trim()` rỗng.
  - Đã `true` thì không tự về `false` khi còn chữ (chống nhấp nháy, xem mục 2).
  - `isExpanded = isMultiline`. Phần auto-grow ở expanded giữ nguyên (38px → tối đa 160px).
  - Nếu state `focused` không còn dùng thì xoá cùng `onFocus`/`onBlur`. Giữ effect blur khi bàn phím đóng mà input rỗng.
  - Cập nhật comment đầu khối mô tả chế độ cho khớp hành vi mới.
- [x] **Step 2** (`tests/unit/composer-smooth-transition.test.tsx`): sửa và thêm test:
  - Focus khi rỗng → vẫn `compact`.
  - `isKeyboardOpen={true}` khi rỗng → vẫn `compact`, container vẫn `pb-2`.
  - Text ngắn 1 dòng (jsdom `scrollHeight` = 0) → `compact`.
  - Text có `\n` → `expanded`, textarea `px-3.5 pt-2.5 pb-1`, spacer `h-11`.
  - Tràn dòng: mock `scrollHeight` của textarea (ví dụ `Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", { configurable: true, get: () => 70 })`, nhớ khôi phục) → `expanded`.
  - Đã expanded, xoá còn text ngắn → vẫn `expanded`; xoá hết → `compact`, height `46px`.
  - Giữ test stop/send và counter (counter dùng text có `\n` hoặc mock overflow để thấy ở expanded).
- [x] **Step 3**: chạy toàn bộ `verification_gate`, điền mục 4, ghi `result.json`.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Unit Composer`: PASSED
- [ ] `Lint`: FAILED (repo-wide eslint báo lỗi pre-existing ở các file ngoài task; 2 file sửa của task eslint pass 0 lỗi 0 cảnh báo)
- [x] `Test`: PASSED
- [x] `Intel Status`: PASSED
- [ ] `Boundary Check`: FAILED (báo OUT_OF_SCOPE cho .handoff/specs/TASK-abot-general-gap-reply-001.md do Dev/Architect tạo lúc 17:53 sau baseline; 2 file sửa của task đều OK)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-abot-composer-one-row-001/result.json`
- **Modified Files**:
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/ChatComposer.tsx`
  - `tests/unit/composer-smooth-transition.test.tsx`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): ...
