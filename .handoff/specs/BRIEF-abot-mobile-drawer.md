# BRIEF: Abot trên điện thoại thành drawer, vuốt sang phải để đóng

Hiện trên điện thoại, Abot là một panel full màn hình (`fixed inset-0 h-[100dvh]`). Panel hiện ra bằng fade-in và biến mất ngay khi đóng. Nút X ở góc trên trái đã bị xoá, nên tạm thời "Thu gọn" nằm trong menu ⋮. Việc này đổi hành vi trên điện thoại sang dạng drawer trượt từ phải vào, đóng bằng cách vuốt sang phải, giống drawer của app native.

## Mục tiêu

Trên điện thoại (< 768px), Abot mở như một drawer trượt từ cạnh phải vào, và người dùng đóng nó bằng cách vuốt sang phải, tay kéo tới đâu panel đi theo tới đó.

## Bối cảnh

- Người dùng: chủ site và khách xem roadmap, chủ yếu trên Android Chrome (đã thử qua `http://<IP LAN>:3334`). iOS Safari cũng phải chạy.
- Code chính: `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx`.
  - `isOpen` / `setIsOpen` là state cục bộ (khoảng dòng 101).
  - Panel render có điều kiện `{isOpen && (...)}` (khoảng dòng 387). Class mobile là `fixed inset-0 z-50 h-[100dvh] ... animate-in fade-in duration-200`. Desktop (`md:`) là popup 400×720 bo góc.
  - Nút "Abot" (launcher) chỉ hiện khi `!isOpen` (khoảng dòng 478).
  - Đã có sẵn: đóng khi bấm ra ngoài (mousedown/touchstart trên document), đóng bằng Escape, `useVisualViewportBox` cho panel bám theo bàn phím.
- Header: `components/ChatHeader.tsx`. Ô trái là ô trống để giữ tiêu đề ở giữa, menu ⋮ có "Cuộc trò chuyện mới", "Thu gọn", "Mã hội thoại".
- Danh sách tin nhắn: `components/MessageList.tsx`. Đây là vùng cuộn dọc (`overflow-y-auto overscroll-contain touch-pan-y`). Bên trong có bảng và khối code cuộn ngang (`touch-pan-x`).
- `app/layout.tsx` đặt viewport `interactive-widget=resizes-content`.
- Repo đã có `framer-motion` (dùng ở `components/floating-bot/FloatingChatDrawer.tsx`) và `tw-animate-css`.
- Một agent khác (Antigravity, nhánh `feat/abot-stream-snippets`) đang sửa `RoadmapChatbotWidget.tsx`, `MessageList.tsx`, `ChatMarkdown.tsx`, `CodeBlock.tsx` cho phần stream. Cần phối hợp, không ghi đè.

## Yêu cầu

1. Dưới 768px, khi mở, panel trượt từ phải vào (`translateX(100%) → 0`) trong khoảng 250–300ms, ease-out.
2. Dưới 768px, khi đóng bằng bất kỳ cách nào (menu Thu gọn, Escape, vuốt), panel trượt ra phải rồi mới unmount. Không còn biến mất tức thì.
3. Vuốt sang phải để đóng:
   - Panel đi theo ngón tay theo trục X ngay từ khi chạm. Chỉ cho đi sang phải, không cho kéo sang trái quá vị trí 0.
   - Thả tay khi đã kéo quá 30% chiều rộng, hoặc vận tốc vuốt > 0.5 px/ms, thì đóng.
   - Thả tay dưới ngưỡng thì panel bật về vị trí 0.
4. Cử chỉ chỉ bắt đầu khi hướng kéo chủ yếu là ngang: |dx| > |dy| và dx > 10px. Cuộn dọc danh sách tin nhắn vẫn hoạt động như cũ.
5. Không nhận cử chỉ đóng khi:
   - chạm bắt đầu trong một phần tử đang cuộn ngang được (bảng, khối code);
   - chạm bắt đầu trong ô nhập;
   - đang có bottom sheet feedback (`FeedbackReasonSheet`) mở.
6. Có lớp nền tối sau drawer (khoảng `bg-black/30`). Độ mờ giảm dần theo khoảng đã kéo. Chạm vào lớp nền thì đóng.
7. Desktop (≥ 768px) giữ nguyên: popup, không có cử chỉ vuốt.
8. Tôn trọng `prefers-reduced-motion`: bỏ animation trượt, mở và đóng tức thì. Vuốt vẫn đóng được.
9. Nút Back của Android đóng drawer thay vì rời trang. [cần xác nhận: có muốn làm trong lượt này không]
10. Có gợi ý thị giác cho cử chỉ (ví dụ một gạch dọc mờ ở mép trái panel). [cần xác nhận: có cần không, kiểu nào]

## Ràng buộc

- React + Tailwind, TypeScript strict, không `any`, không `@ts-ignore`.
- Không thêm dependency. Được dùng `framer-motion` (đã có) hoặc Pointer Events + CSS transform tự viết.
- Chỉ animate `transform` và `opacity`, không animate `width`, `left` hay `right`.
- Trong lúc kéo không re-render cả widget mỗi frame: cập nhật transform qua ref hoặc motion value, không qua `useState`.
- Không trộn Tailwind với inline style, trừ giá trị động (transform đang kéo).
- Không phá: bám đáy khi stream, `useVisualViewportBox`, đóng khi bấm ra ngoài, Escape, focus ô nhập.
- Không sửa service Python, `package.json`, `yarn.lock`.
- Phối hợp với Antigravity trên `RoadmapChatbotWidget.tsx` và `MessageList.tsx`: merge vào nhánh của nó hoặc làm sau khi nó xong. [cần xác nhận thứ tự]

## Tiêu chí xong

- [ ] Ở viewport 375×812: mở thì panel trượt từ phải vào, đóng qua menu Thu gọn thì panel trượt ra phải.
- [ ] Trên Android Chrome thật: kéo sang phải 40% rồi thả thì đóng, kéo 15% rồi thả thì bật về, vuốt nhanh ngắn thì đóng.
- [ ] Cuộn dọc danh sách tin nhắn không bao giờ kích hoạt đóng.
- [ ] Cuộn ngang một bảng hoặc khối code dài không kích hoạt đóng.
- [ ] Gõ trong ô nhập và kéo chọn chữ không kích hoạt đóng.
- [ ] Trong lúc kéo, panel chạy mượt và không thấy giật (kiểm tra bằng Performance panel: không có long task > 50ms khi kéo).
- [ ] Desktop: popup y như cũ, không có cử chỉ.
- [ ] Bật reduced motion: mở và đóng tức thì.
- [ ] `yarn tsc --noEmit -p .`, `yarn lint`, `yarn test` pass. Ghi kết quả thử thủ công theo `tests/manual/README.md`.

## Ngoài phạm vi

- Mở drawer bằng cách vuốt từ mép phải màn hình vào.
- Đổi giao diện desktop.
- Drawer Cris AI (`FloatingChatDrawer.tsx`).
- Phần stream thẻ gợi ý (đang ở `TASK-abot-stream-snippets-001`).
- Tính năng context window (nút + trong ô nhập).
