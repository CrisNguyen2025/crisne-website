# BRIEF: Bối cảnh UI/UX của Abot trên điện thoại (bàn giao cho agent UI/UX)

Trong một buổi làm việc, Abot (trợ lý roadmap, widget React trong `roadmap-rag-assistant/sdk/typescript/src/react/`) đã được chỉnh nhiều lần để giống app Claude trên điện thoại. File này ghi lại trạng thái hiện tại, các số đo, và những việc còn dở, để agent tiếp theo làm tiếp mà không phải dò lại từ đầu.

## Mục tiêu
Abot trên điện thoại (ưu tiên Android Chrome, sau đó iOS Safari) phải có cảm giác dùng như app Claude: ô nhập, header, cử chỉ, stream câu trả lời, chữ dễ đọc.

## Cách chạy và xem
- `yarn dev` (cổng 3334) và `yarn rag:dev` (cổng 8000) phải chạy cùng lúc.
- Trên máy tính: viewport 375×812, mở `http://localhost:3334`, bấm "Abot" ở thanh điều hướng dưới.
- Trên điện thoại cùng Wi-Fi: `http://<IP LAN của Mac>:3334`. `next.config.ts` đã cho phép `192.168.1.*`.
- Câu thử có nhiều thẻ gợi ý: `Bạn giúp được gì? Liệt kê lệnh mẫu`.
- Nếu trình duyệt báo lỗi biên dịch lạ (ví dụ `isKeyboardOpen is not defined`) trong khi `yarn tsc` vẫn pass: dừng dev server, xoá `.next`, chạy lại. Lỗi này là do cache Turbopack, đã gặp một lần.

## Trạng thái hiện tại theo từng phần

### Ô nhập — `components/ChatComposer.tsx`
- Chưa focus và còn trống thì ô ở dạng gọn, một hàng: `[mic] Hỏi Abot… [gửi]`.
- Khi focus hoặc đã có chữ, ô mở thành thẻ: chữ ở trên, hàng dưới có mic bên trái và gửi/dừng bên phải. Bộ đếm ký tự chỉ hiện khi gần tới giới hạn 2000.
- Cách làm: state `focused`, `compact = !focused && input === ""`. Khi gọn, hàng nút được đặt `display: contents`, rồi dùng `order-[-1]` và `order-[99]` để xếp mic và nút gửi. Trong project này `order-first` / `order-last` không sinh ra CSS.
- Thẻ: `rounded-[28px]`, bóng `0 1px 2px /4% + 0 6px 20px /8%`, đậm thêm khi focus. Phía trên ô có lớp chuyển màu mờ thay cho đường kẻ ngăn.
- Mic: nền tròn `#F4F3F0`, đang tắt, tooltip "Nhập bằng giọng nói (sắp có)". Chưa có tính năng giọng nói.
- Nút gửi: tròn, nền `#C2410C`, mờ khi chưa có chữ. Khi Abot đang stream, nút đổi thành nút dừng màu đen. `onMouseDown preventDefault` để bàn phím không đóng khi bấm.
- Cỡ chữ: 16px trên điện thoại để iOS không tự zoom, 14px từ `md`. Placeholder `#75716A`.
- Khi bàn phím mở thì bỏ khoảng đệm safe-area dưới (`isKeyboardOpen`, tính trong widget từ `useVisualViewportBox`).
- Nút "+" (context window) đã bị bỏ theo yêu cầu user. Tính năng context window sẽ làm sau.

### Header — `components/ChatHeader.tsx`
- Lưới 3 cột: ô trái trống, giữa là ✦ + tên "Abot" và dòng mô tả cố định, phải là menu ⋮. Không có đường kẻ, tin nhắn mờ dần khi cuộn vào dưới header.
- Nút X đã bị bỏ. "Thu gọn" giờ nằm trong menu ⋮, cùng "Cuộc trò chuyện mới" và "Mã hội thoại" (mục này chỉ chủ site thấy).
- Dòng mô tả luôn là `subtitle` ("Trợ lý kiến thức cá nhân"). Không còn đổi sang "Đang trả lời…" hay tên tool khi stream.

### Drawer và cử chỉ — `utils/useDrawerMotion.ts`, `RoadmapChatbotWidget.tsx`
- Dưới 768px, drawer trượt từ phải vào khi mở (`max-md:slide-in-from-right`). Mọi đường đóng (menu, Escape, chạm ngoài, vuốt) đều trượt ra phải trước khi unmount (`closeDrawer`).
- Vuốt sang phải để đóng: panel đi theo ngón tay. Đóng khi kéo quá 30% chiều rộng, hoặc vận tốc > 0.5 px/ms và đã kéo hơn 40px. Chưa tới ngưỡng thì bật về.
- Cử chỉ được bỏ qua khi: hướng kéo không rõ ràng là ngang (|dx| > 1.5·|dy|), chạm bắt đầu trong phần tử cuộn ngang hoặc trong ô nhập, hoặc đang mở bottom sheet feedback.
- Scrim `bg-black/30` nằm dưới panel, opacity tăng theo khoảng kéo.
- Desktop không có cử chỉ. Có hỗ trợ `prefers-reduced-motion`.
- Đã kiểm tra bằng TouchEvent giả lập: vuốt ngắn bật về, cuộn dọc không đóng, vuốt dài đóng. **Chưa thử trên máy thật.** Chưa làm nút Back của Android và chưa có gợi ý thị giác cho cử chỉ (cả hai đang chờ user xác nhận, xem `BRIEF-abot-mobile-drawer.md`).

### Stream thẻ gợi ý — `ChatMarkdown.tsx`, `components/CodeBlock.tsx`, `RoadmapChatbotWidget.tsx`
- Commit `4ce278d` và `be7aef0` của Antigravity.
- Fence chưa đóng được đánh dấu `open`. Thẻ gợi ý một dòng render ngay, chữ chảy theo token có con trỏ, nút ▷/copy ẩn tới khi fence đóng.
- **Đã tối ưu mượt mà (Zero-Jank Stream)**:
  - Triệt tiêu bậc nhảy +58px: Thẻ compact bọc trong CSS Grid expansion wrapper (`grid-rows-[1fr] my-2`), mọc chiều cao êm ái khi stream.
  - Triệt tiêu bước âm −6px/−7px/−21px: Regex `replace(/(\n[ \t]*)`{1,2}$/, "$1")` bảo toàn `\n` (không nuốt mất dòng); loại bỏ caret ngoài thừa khi thẻ code đang mở.
  - Bám sát đáy 100%: Thêm settle rAF lerp sau khi reply hoàn tất, đưa khung chat trôi êm ái sát đáy, loại bỏ hoàn toàn hiện tượng kẹt cách đáy 118px. Khóa bởi test `tests/unit/abot-ui-ux-smooth-stream.test.tsx`.

### Cỡ chữ và tương phản (đợt cuối)
Đo trên viewport 375px. Tương phản tính so với nền trắng hoặc `#F4F3F0`.

| Thành phần | Trước | Sau |
|---|---|---|
| Thân tin nhắn, bong bóng câu hỏi | 14px | `text-base md:text-sm` (16px mobile) |
| Tiêu đề markdown h1–h4 | lg/base/sm/xs | xl/lg/base/13px trên mobile, giữ cỡ cũ từ `md` |
| Thời gian, thời lượng bước | 11px | 12px (`text-xs`) |
| Nút "ID" | 10px | 11px |
| Inline code | 0.85em | 0.9em |
| Thẻ gợi ý | 13px | `text-sm md:text-[13px]` |
| Xám phụ | `#6B6862` (5.6 / 5.0) | `#5E5B55` (6.8 / 6.1), cả biến `--text-muted`, `--muted-foreground`, `--chat-text-muted` |
| Placeholder & Subtle text | `#8C8983` (3.5) | `#75716A` (4.9 / 4.5, WCAG AA), cả biến `--chat-text-subtle` |

- Chip nguồn: chữ `#5E5B55` trên `bg-muted/60`, khoảng 6.4. Đạt.
- `--chat-text-subtle` đã nâng lên `#75716A` (4.9:1 trên trắng, 4.5:1 trên surface).
- `ToolExecutionCard.tsx` đã cập nhật toàn bộ chữ 10–11px lên 11px–12px (`text-xs`), border `#E6E4DF`.
- **Đã gom màu và cỡ chữ về Design Tokens tập trung tại `sdk/typescript/src/react/tokens.ts`** (`CHAT_COLORS`, `WIDGET_THEME_VARS`).
- Lỗi lint `set-state-in-effect` ở `RoadmapChatbotWidget.tsx` (`setRunningCode`) đã được giải quyết triệt để bằng timer cleanup.

### Khác
- Copy: `utils/clipboard.ts` (`copyText`) fallback qua `execCommand("copy")`, vì trên `http://<IP LAN>` không có `navigator.clipboard`. Đã dùng ở mọi nút copy.
- `app/layout.tsx`: `interactiveWidget: "resizes-content"` để Android co trang khi mở bàn phím. Áp dụng cho cả site.
- `next.config.ts`: `devIndicators: false`.

## Việc đã hoàn thành bởi agent UI/UX
1. [x] **Stream thẻ gợi ý thật sự mượt (Zero-Jank Stream)**: Triệt tiêu hoàn toàn bậc nhảy +58px (CSS Grid expansion), triệt tiêu các bước âm −6px/−7px/−21px (bảo toàn `\n`, tránh double caret), bám sát đáy 100% khi stream xong (settle rAF lerp, không còn kẹt 118px).
2. [x] **Gom màu và cỡ chữ thành Design Tokens**: Tập trung tại `tokens.ts`, nâng `--chat-text-subtle` lên `#75716A` (4.9:1, đạt WCAG AA), fix cỡ chữ 11-12px trong `ToolExecutionCard.tsx`.

## Việc tiếp theo
1. Rà nhịp khoảng cách dọc giữa tin nhắn, thẻ, hàng hành động và ô nhập trên các màn hình nhỏ (< 360px).
2. Thử drawer, ô nhập và stream trên Android và iOS thật. Ghi kết quả theo `tests/manual/README.md`.
3. Quyết định giao diện của mic khi tắt, và chỗ của tính năng context window (nút "+").

## Ràng buộc
- React + Tailwind v4, TypeScript strict, không `any`, không `@ts-ignore`, không thêm dependency.
- Không trộn Tailwind với inline style, trừ giá trị động (transform lúc kéo).
- Comment trong code viết tiếng Anh, ngắn, nói lý do.
- Không phá: bám đáy khi stream, `useVisualViewportBox`, cử chỉ drawer, focus ô nhập, fallback copy.
- Cổng kiểm tra: `yarn tsc --noEmit -p .`, `yarn lint`, `yarn test`. Hiện có 839 test pass.
  - `tests/route/triage-routes.test.ts` thỉnh thoảng fail ngẫu nhiên, chạy lại thì pass.
  - Lỗi lint `set-state-in-effect` ở `RoadmapChatbotWidget.tsx` (`setRunningCode`) có từ trước.

## Trạng thái git
- Nhánh `feat/abot-stream-snippets`.
- Đã commit: `4ce278d` và `be7aef0` (phần stream, của Antigravity).
- **Chưa commit:** drawer (`useDrawerMotion.ts`, `tests/unit/drawer-motion.test.ts`), header, ô nhập, chữ và màu, cùng các test đã cập nhật (`tests/unit/m1-challenger-stress.test.ts`, `tests/e2e/chat-upgrade/tier1-typography-streaming.test.ts`).
