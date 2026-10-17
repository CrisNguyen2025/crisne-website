# Abot — kế hoạch cải thiện trải nghiệm người dùng

Phạm vi: widget Abot (`roadmap-rag-assistant/sdk/typescript/src/react/*`), host `components/roadmap/RoadmapAssistantChatbot.tsx`, proxy `app/api/roadmap-assistant/[...path]/route.ts`, RAG service `roadmap-rag-assistant/rag_service`.

Quy ước chung cho mọi mục:
- Mỗi mục là một commit riêng, kèm test.
- Sau mỗi mục: `npx tsc --noEmit -p .`, `npx vitest run`, `pytest tests --ignore=tests/test_sdk.py`, rồi build lại `dist` của SDK.
- Không thêm dependency runtime vào SDK.

---

## P0 — người dùng gặp ngay ở lần chat đầu

### P0-1. Gợi ý theo quyền ghi

**Vấn đề (đã kiểm chứng):** khách bấm gợi ý "Tạo 2 layer Mock 1 và Mock 2" thì nhận "🔒 Chỉ owner mới thực hiện được thao tác thay đổi roadmap."

**Hướng:** widget nhận `canWrite`. Quyền lấy từ endpoint nhẹ, không gọi `auth()` trong root layout (gọi ở đó sẽ biến mọi trang thành dynamic, mất static render).

**Các bước:**
1. Thêm `GET /api/roadmap-assistant/me` → `{ canWrite: boolean }`, dùng `hasWriteAccess(req)` có sẵn. Header `Cache-Control: private, no-store`.
   - Lưu ý: route catch-all `[...path]` đang proxy mọi đường dẫn tới Python; route tĩnh `me/route.ts` sẽ được ưu tiên hơn, cần test xác nhận.
2. `RoadmapAssistantChatbot.tsx`: fetch `/me` một lần khi mount, truyền `canWrite` (mặc định `false`) vào widget.
3. `ChatbotConfig` thêm `canWrite?: boolean`; hook nhận và chuyển cho `buildWelcomeMessage`.
4. `welcome.ts`: `getWelcomeSuggestions(context, canWrite)`.
   - `canWrite = true`: giữ gợi ý tạo layer như hiện tại.
   - `canWrite = false`: thay bằng gợi ý chỉ đọc, ví dụ "Topic này có những layer nào?" (hoặc kèm topic từ URL).
5. Lời chào được dựng lúc khởi tạo state, trước khi `/me` trả về. Khi `canWrite` đổi và người dùng chưa gửi tin nào, dựng lại lời chào.

**Test:**
- Unit `welcome-suggestions.test.ts`: có và không có quyền ghi → gợi ý khác nhau; bản không quyền không chứa "Tạo".
- Route test cho `/me`: owner → `true`, khách → `false`, có header no-store.
- Pytest: câu gợi ý chỉ đọc mới được `entity_extractor` phân loại là truy vấn, không phải hành động ghi.

**Xong khi:** khách không còn thấy gợi ý ghi; owner vẫn thấy; chuyển quyền không làm mất tin đã gửi.

### P0-2. Lỗi thân thiện + nút Thử lại

**Vấn đề:** lỗi kết nối hiện "Hãy đảm bảo server FastAPI đang chạy tại http://localhost:8000" (`useRoadmapAssistantChat.ts`, `onError` và `catch`). Không có cách gửi lại.

**Các bước:**
1. `ChatMessage` thêm `retryOf?: string` (nội dung câu hỏi cần gửi lại) khi `status = 'error'`.
2. Thay nội dung lỗi:
   - Mất mạng / server không trả lời: "Abot đang gặp sự cố kết nối. Bạn thử lại sau ít phút nhé."
   - Lỗi 429: "Bạn gửi hơi nhanh, đợi một chút rồi thử lại."
   - Lỗi khác: "Có lỗi xảy ra khi trả lời."
   - Chi tiết kỹ thuật chỉ `console.error`, không hiển thị.
3. Hook thêm `retry(messageId)`: xoá cặp tin lỗi, gửi lại `retryOf`.
4. Widget: tin có `status = 'error'` hiện nút "Thử lại" (màu nhấn #C2410C, cùng kiểu nút xác nhận hiện có).
5. Bỏ `baseUrl` khỏi mọi chuỗi hiển thị.

**Test (vitest, mock client):**
- Lỗi mạng → nội dung tin không chứa `localhost`, `FastAPI`, `:8000`.
- Lỗi 429 → câu riêng.
- Gọi `retry` → gửi đúng câu hỏi gốc, chỉ còn một cặp tin.

**Xong khi:** mọi lỗi người dùng thấy đều là tiếng Việt thân thiện, và bấm Thử lại gửi lại đúng câu.

### P0-3. Timeout khi stream treo

**Vấn đề:** `client.ts` lưu `this.timeout` (120 giây) nhưng không dùng. Server ngừng gửi giữa chừng → loading vô hạn.

**Các bước:**
1. Trong `streamChat`, thêm idle timer: mỗi lần `reader.read()` trả dữ liệu thì đặt lại; quá `idleTimeout` (mặc định 30 giây) thì `abort()` và gọi `onError` với lỗi loại `timeout`.
2. Giữ `timeout` tổng (120 giây) cho cả request.
3. P0-2 hiển thị lỗi timeout: "Abot trả lời quá lâu. Bạn thử lại nhé." kèm nút Thử lại.
4. Dọn timer khi xong, khi lỗi, khi người dùng bấm dừng.

**Test (vitest, fake timers, stream giả):**
- Không có chunk trong 30 giây → `onError` loại timeout, request bị abort.
- Có chunk đều đặn mỗi 10 giây → không timeout.
- Bấm dừng → không còn timer chạy.

**Xong khi:** không có trạng thái loading nào kéo dài quá 30 giây mà không có dữ liệu mới.

---

## P1 — trải nghiệm và chi phí

### P1-4. Giữ hội thoại khi reload / chuyển trang

**Các bước:**
1. Lưu `messages` (bỏ tin đang `streaming`) và `conversationId` vào `sessionStorage`, khoá theo `baseUrl`.
2. Đọc lại khi khởi tạo hook; mọi truy cập bọc `try/catch` (chế độ riêng tư có thể chặn storage).
3. Giới hạn 50 tin gần nhất để tránh vượt dung lượng.
4. Ghi có debounce (khoảng 300ms) để không ghi ở mỗi token.

**Test:** khởi tạo lại hook → khôi phục đúng tin và mã hội thoại; storage ném lỗi → vẫn chạy với lời chào.

### P1-5. Nút "Cuộc trò chuyện mới"

**Các bước:**
1. `clearMessages` đặt lại về `[buildWelcomeMessage(context, canWrite)]` thay vì `[]`, tạo mã hội thoại mới, xoá `sessionStorage`.
2. Widget: thêm mục "Cuộc trò chuyện mới" (biểu tượng `NewChatIcon` có sẵn) vào menu ⋮.
3. Đang stream thì dừng stream trước khi xoá.

**Test:** gọi `clearMessages` → còn đúng một tin chào, mã hội thoại mới, storage rỗng.

### P1-6. Giới hạn độ dài tin nhắn

**Các bước:**
1. Server: `ChatRequest.message` thêm `max_length=2000` (FastAPI tự trả 422).
2. Proxy Next.js: kiểm tra trước khi forward, trả 413 với thông báo tiếng Việt.
3. Widget: `maxLength={2000}` cho ô nhập; hiện bộ đếm "1.850/2.000" khi vượt 1.800 ký tự.
4. P0-2 hiển thị lỗi 413/422: "Câu hỏi quá dài, bạn rút gọn giúp nhé."

**Test:** pytest gửi 2.001 ký tự → 422; route test proxy → 413; widget không cho gõ quá 2.000.

### P1-7. Menu ⋮ cho người dùng

**Các bước:**
1. "Conversation ID" → "Mã hội thoại", chỉ hiện khi `canWrite`.
2. Menu của khách chỉ có "Cuộc trò chuyện mới" (P1-5).

**Test:** render với `canWrite = false` → không có "Mã hội thoại".

---

## P2 — chất lượng và bảo trì

### P2-8. Bàn phím điện thoại che ô nhập

1. Thử thật trên iPhone (Safari) và Android (Chrome): mở widget, chạm ô nhập, gõ.
2. Nếu bị che: theo dõi `window.visualViewport` (`resize`), đặt chiều cao khung chat bằng `visualViewport.height`; dọn listener khi đóng widget.
3. Ghi kết quả thử nghiệm (ảnh chụp trước/sau) vào PR.

### P2-9. Tách `RoadmapChatbotWidget.tsx` (845 dòng)

1. Tách: `ChatHeader.tsx` (header + menu ⋮), `MessageList.tsx` (danh sách, sentinel, nút cuộn), `ChatComposer.tsx` (ô nhập, gửi/dừng).
2. Giữ nguyên props công khai của `RoadmapChatbotWidget` và đường dẫn import.
3. Làm sau cùng, sau khi P0/P1 đã vào, để tránh xung đột.

**Xong khi:** test giới hạn 750 dòng qua; toàn bộ test khác giữ nguyên kết quả.

---

## Thứ tự và phụ thuộc

1. P0-3 (timeout) → P0-2 (lỗi + thử lại) dùng chung đường xử lý lỗi.
2. P0-1 (quyền) → P1-5 và P1-7 cần `canWrite`.
3. P1-4 (lưu hội thoại) → P1-5 phải xoá storage.
4. P1-6 độc lập.
5. P2-8 cần thiết bị thật.
6. P2-9 cuối cùng.

## Rủi ro

- Route `/me` bị catch-all `[...path]` nuốt: cần test xác nhận route tĩnh thắng.
- Lời chào đổi sau khi `/me` trả về có thể làm giao diện nhảy: chỉ dựng lại khi người dùng chưa gửi tin.
- `sessionStorage` lưu nội dung chat trên máy người dùng: chỉ theo tab, tự xoá khi đóng tab.
