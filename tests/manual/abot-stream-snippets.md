# Kịch bản kiểm thử: Abot stream các thẻ gợi ý (snippet) mượt mà (`abot-stream-snippets`)

Phạm vi: Kiểm thử các chức năng stream thẻ gợi ý và cuộn bám đáy theo `TASK-abot-stream-snippets-001`, bao gồm:
- Thẻ gợi ý compact (`CodeBlock`) render chữ chảy trực tiếp theo token (S1)
- Con trỏ stream (`StreamingCaret`) hiển thị trong thẻ khi đang stream (`open: true`) (S2)
- Nút hành động (Gửi & Sao chép) ẩn trong lúc stream và mờ dần hiện ra khi đóng fence (S3)
- Cuộn bám đáy nội suy theo rAF (lerp ~150-180ms), loại bỏ hoàn toàn giật nấc 58px mỗi thẻ (S4)
- Huỷ cuộn bám đáy ngay khi người dùng chủ động cuộn lên (wheel/touch) (S5)
- Thẻ kết thúc bằng `\n` trước fence đóng không bị inflate thành khối code nhiều dòng (S6)

## Chuẩn bị

1. Next.js dev server chạy cổng 3334 (`yarn dev`).
2. Roadmap Assistant RAG service chạy cổng 8000 (`yarn rag:dev`).
3. Mở `http://localhost:3334` ở viewport mobile 375×812 hoặc qua LAN trên Android Chrome (`http://192.168.1.x:3334`).

## Các bước thực hiện và kiểm tra

| # | Case | Thao tác | Kết quả mong đợi | Kết quả |
|---|---|---|---|---|
| S1 | Chữ chảy trực tiếp trong thẻ | Hỏi Abot `Bạn giúp được gì? Liệt kê lệnh mẫu` | Các thẻ gợi ý xuất hiện êm ái, text stream từ từ vào trong thẻ thay vì tráo đổi placeholder | `Pass` |
| S2 | Con trỏ stream bên trong thẻ | Quan sát thẻ gợi ý cuối cùng khi đang stream | Con trỏ nhấp nháy (`animate-pulse`) hiển thị ngay sau ký tự cuối cùng của thẻ | `Pass` |
| S3 | Nút thao tác hiện khi đóng fence | Quan sát nút ▷ và Chép trên thẻ | Nút thao tác ẩn trong lúc đang stream (`pointer-events-none opacity-0`) và fade-in (`opacity-100`) khi thẻ hoàn thành | `Pass` |
| S4 | Cuộn bám đáy lerp mượt mà | Quan sát khung chat khi danh sách 10–16 thẻ gợi ý xuất hiện | Khung chat trượt lên êm ái theo rAF (150–180ms), không còn giật nấc 58px | `Pass` |
| S5 | Huỷ cuộn khi người dùng cuộn lên | Lướt ngón tay hoặc lăn chuột lên trên khi Abot đang stream | Cuộn tự động dừng ngay lập tức, không kéo giật màn hình xuống đáy | `Pass` |
| S6 | Ổn định chiều cao thẻ | Stream thẻ có dấu xuống dòng `\n` trước fence đóng | Thẻ giữ nguyên kích thước compact `min-h-[50px]`, không phình to thành multiline code block (+76px) rồi co lại | `Pass` |

## Ghi kết quả

- **Lần chạy kiểm thử**: 2026-11-06 @ branch `feat/abot-stream-snippets`
  - Môi trường: Chrome Desktop DevTools Mobile Viewport (375×812) & Vitest unit suite.
  - Kết quả từng case:
    - **S1**: Thẻ code compact render ngay khi block code mở `open: true`, text stream từng từ qua `smoothStream` -> `Pass`.
    - **S2**: `StreamingCaret` render bên trong thẻ code khi `open: true` -> `Pass` (khoá bởi `tests/unit/stream-snippets.test.tsx`).
    - **S3**: Vùng nút thao tác giữ sẵn layout nhưng ẩn mượt mà bằng CSS opacity -> `Pass` (khoá bởi `tests/unit/stream-snippets.test.tsx`).
    - **S4**: Thuật toán exponential smoothing `1 - Math.exp(-dt / 55)` đưa scroll về đáy sau ~160ms không giật -> `Pass`.
    - **S5**: Wheel event (deltaY < 0) và touch drag đều ngắt rAF và giải phóng `isAtBottomRef` -> `Pass`.
    - **S6**: `cleanCode = code.replace(/\s+$/, "")` ngăn chặn hoàn toàn việc nhận diện nhầm thành multiline block -> `Pass` (khoá bởi `tests/unit/stream-snippets.test.tsx`).
  - Tổng kết: 6/6 Pass.
