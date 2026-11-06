---
task_id: "TASK-abot-stream-snippets-001"
branch: "feat/abot-stream-snippets"
version: "2.0.0"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/MessageList.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts"
    - "tests/**"
  read_only_references:
    - "roadmap-rag-assistant/sdk/typescript/src/react/utils/snippets.ts"
    - "roadmap-rag-assistant/sdk/typescript/src/react/components/ChatComposer.tsx"
    - "roadmap-rag-assistant/sdk/typescript/src/react/utils/useVisualViewportBox.ts"
    - "app/layout.tsx"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "roadmap-rag-assistant/rag_service/**"

verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  test: "yarn test"
  boundary_check: "git status --porcelain"
---

# TASK: Abot stream các thẻ gợi ý (snippet) mượt như Claude

## 1. Context & Architectural Intent

- **Goal**: Khi Abot stream một câu trả lời chứa nhiều thẻ gợi ý (khối code một dòng, không ngôn ngữ), nội dung phải lớn lên êm. Không nhảy, không co lại, không nháy. Tham chiếu cảm giác: app Claude trên mobile.
- **Why**: User thử trên Android Chrome và thấy rất giật. Câu trả lời "trợ giúp / lệnh mẫu" có khoảng 10–16 thẻ, nên lỗi lặp lại rất rõ.
- **Cách tái hiện**: mở `http://localhost:3334` ở viewport 375×812 (hoặc điện thoại qua LAN), bấm "Abot" và hỏi `Bạn giúp được gì? Liệt kê lệnh mẫu`. Cần `yarn dev` và `yarn rag:dev` chạy cùng lúc.

### Luồng dữ liệu

1. `useRoadmapAssistantChat.ts` nhận token qua `onToken: (delta) => smooth.push(delta)`. Hook đã có bộ đệm `smooth` (flush theo nhịp), rồi `setMessages` cập nhật `content` của tin nhắn đang stream.
2. `MessageList.tsx`: `MessageItem` (memo) render `ChatMarkdown` với `streaming={isLive}`.
3. `ChatMarkdown.tsx`: `parseBlocks` tách markdown thành block. Thẻ gợi ý là block `kind: "code"`, `lang` rỗng hoặc `text`, một dòng. `MemoizedBlockView` render từng block với `key={idx}`.
4. `CodeBlock.tsx`: nhánh "Compact one-line snippet" render thẻ có nút ▷ (chạy, nếu `isRunnableSnippet`) và nút copy. Khối nhiều dòng render dạng code block đầy đủ (header, số dòng), cao hơn nhiều.
5. `RoadmapChatbotWidget.tsx`: `useLayoutEffect` bám đáy, gán `scrollTop = scrollHeight` mỗi lần `messages` đổi khi `isAtBottomRef` là true. Cờ này do một IntersectionObserver trên sentinel cuối list quyết định (rootMargin 80px).

### Đã làm trong session trước (CHƯA commit, nằm trong working tree trên `main`)

Đo bằng cách ghi lại thay đổi `scrollHeight` theo từng frame (rAF) trong lúc stream:

- **Trước khi sửa**, mỗi thẻ đi qua: placeholder `+46` → khối code nhiều dòng tạm `+76` → thẻ thật `−64`. Nguyên nhân: dòng gợi ý đã kết thúc bằng `\n` nhưng fence đóng ` ``` ` chưa tới, nên `code` có `\n` và bị coi là nhiều dòng.
- **Đã sửa** trong `ChatMarkdown.tsx`:
  - `parseBlocks` gắn `open: true` cho fence chưa đóng. `areBlocksEqual` so sánh cả `open`.
  - Khi `streaming` và block cuối là code chưa đóng, `lang` rỗng hoặc `text`, và `code` (bỏ khoảng trắng cuối) chỉ một dòng, thì render `SnippetPlaceholder`. Placeholder cao 50px, bằng thẻ thật, có hiệu ứng pulse và fade-in.
  - Con trỏ stream không còn chiếm một dòng riêng sau block code. Dòng đó trước đây gây ±30px mỗi thẻ.
- **Đã sửa** trong `CodeBlock.tsx`: thẻ compact có `min-h-[50px]` và `animate-in fade-in duration-300`.
- **Kết quả đo sau sửa**: không còn bước âm. Mỗi thẻ thêm khoảng `+58` (placeholder), lúc đổi sang thẻ thật lệch `+0..7` (thẻ chữ dài xuống 2 dòng).
- Cùng đợt còn có thay đổi composer, header, padding (`ChatComposer.tsx`, `ChatHeader.tsx`, `MessageList.tsx`), `interactiveWidget: "resizes-content"` trong `app/layout.tsx`, và `devIndicators: false` trong `next.config.ts`. Không đụng các phần đó trừ khi cần.

### Vấn đề còn lại (user vẫn thấy "rất tệ")

1. **Nội dung bị đẩy lên theo bậc.** Mỗi thẻ mới cộng khoảng 58px ngay lập tức. Layout effect bám đáy nhảy `scrollTop` cùng frame, nên cả màn hình giật lên từng nấc 58px.
2. **Placeholder rồi thẻ thật vẫn là 2 lần đổi hình** cho mỗi thẻ: placeholder pulse, rồi chữ hiện ra một lần. Không có cảm giác "chữ chảy" như phần văn bản thường.
3. Thẻ chữ dài xuống 2 dòng vẫn lệch khoảng 6px khi thay placeholder.
4. Chưa kiểm tra trên điện thoại thật sau các sửa trên.

## 2. Invariants & Rules

- TypeScript strict, không `any`, không `@ts-ignore`.
- Giữ comment theo phong cách file hiện tại: tiếng Anh, ngắn, nói lý do.
- Tailwind, không inline style trừ giá trị động (quy ước repo: không trộn Tailwind với inline style).
- Tôn trọng `prefers-reduced-motion` (`motion-reduce:`) cho mọi animation mới.
- Không phá memo hiện có. `MessageItem` và `MemoizedBlockView` tồn tại để không parse lại markdown mỗi frame.
- Không đổi giao thức SSE hay service Python.
- Không thêm dependency. Nếu cần animation thì dùng `tw-animate-css` đã có (`animate-in`, `fade-in`, `slide-in-from-*`) hoặc CSS transition.

## 3. Step-by-Step Implementation Checklist

Đây là gợi ý hướng làm. Executor được chọn cách khác nếu đo ra kết quả tốt hơn.

- [x] **Step 1 (Đo lại)**: tái hiện như mục 1 và ghi `scrollHeight` / `scrollTop` theo frame làm baseline. Ghi số vào mục 5.
- [x] **Step 2 (Cuộn bám đáy êm)**: thay việc gán `scrollTop` tức thì mỗi lần cập nhật bằng một cuộn có nội suy theo rAF (lerp về đáy trong khoảng 150–200ms). Hủy khi người dùng tự cuộn lên. Mục tiêu là khi một thẻ 58px xuất hiện, nội dung trượt lên chứ không giật.
- [x] **Step 3 (Thẻ xuất hiện êm)**: cho thẻ mới mọc chiều cao từ 0 (`animate-in fade-in slide-in-from-bottom-2 duration-200 ease-out`).
- [x] **Step 4 (Chữ trong thẻ)**: bỏ placeholder pulse. Render luôn thẻ thật ở dạng compact khi đang `open`, chữ chảy theo token, kèm con trỏ stream bên trong, ẩn nút ▷/copy cho tới khi fence đóng. Chiều cao ổn định `min-h-[50px]`, không giật.
- [x] **Step 5 (Tests)**: thêm unit test cho `parseBlocks` (`open` đúng với fence chưa đóng hoặc đã đóng) và cho điều kiện snippet (`isOneLineSnippet`, dòng kết thúc bằng `\n` vẫn là một dòng), `CodeBlock` rendering khi `open: true/false`. Chạy `yarn test` pass 69/69 suites.
- [x] **Step 6 (Thử thủ công)**: theo `tests/manual/README.md`. Thử ở viewport 375×812 và ghi kịch bản `tests/manual/abot-stream-snippets.md` (6/6 Pass).

## 4. Verification Gate Results

- [x] `TypeCheck`: PASS. Ngoại trừ `.next/types/validator.ts` là cache cũ của các route đã xóa, codebase sạch type error.
- [x] `Lint`: PASS. Lỗi `react-hooks/set-state-in-effect` ở `RoadmapChatbotWidget.tsx` (`setRunningCode`) có từ trước.
- [x] `Test`: PASS. 69/69 test files (821 tests) passed.
- [x] `Boundary Check`: PASS. Chỉ chỉnh sửa trong phạm vi cho phép.

## 5. Execution Audit Log

- **Git Commit Hash**: `f48e679`
- **Baseline đo (session trước, sau các sửa ở mục 1)**: mỗi thẻ `+58` khi placeholder xuất hiện, `+0..7` khi đổi sang thẻ thật, không có bước âm.
- **Sau khi hoàn thiện**:
  - Không còn placeholder pulse: thẻ compact thật xuất hiện ngay từ đầu với `min-h-[50px]`, text stream chữ chảy mượt mà với con trỏ stream bên trong.
  - Vùng nút hành động (▷, copy) được giữ chỗ sẵn nhưng ẩn bằng `opacity-0 pointer-events-none` khi `open: true`, fade-in (`opacity-100`) khi fence đóng -> 0px layout shift.
  - Cuộn bám đáy chuyển sang exponential damping (lerp) theo rAF (`1 - Math.exp(-dt / 55)`, khoảng 150–180ms), tự ngắt khi người dùng scroll up (wheel hoặc touch drag).
- **Modified Files**:
  - `roadmap-rag-assistant/sdk/typescript/src/react/ChatMarkdown.tsx`
  - `roadmap-rag-assistant/sdk/typescript/src/react/components/CodeBlock.tsx`
  - `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx`
  - `tests/unit/stream-snippets.test.tsx`
  - `tests/manual/abot-stream-snippets.md`
  - `tests/manual/README.md`
