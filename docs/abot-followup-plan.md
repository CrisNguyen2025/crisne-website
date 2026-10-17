# Abot — kế hoạch xử lý các phần còn lệch sau P0–P2

Nguồn: bước đối chiếu với `docs/abot-ux-plan.md`. Năm việc còn lại:

| # | Việc | Loại | Cần người dùng |
|---|---|---|---|
| 0 | Commit mốc cho P0–P2 trước khi refactor | Quy trình | Duyệt commit |
| 1 | Cache-Control của `/me` | Đã tìm ra nguyên nhân | Không |
| 2 | Hạ tầng test DOM (jsdom + Testing Library) | Dev dependency | Duyệt thêm devDependency |
| 3 | Test cho hook và widget (retry, new chat, khôi phục, menu, giới hạn) | Test | Không |
| 4 | Tách `MessageList.tsx` | Refactor | Không |
| 5 | Kiểm tra bàn phím trên điện thoại thật | Kiểm thử tay | Có (thiết bị) |

Thứ tự: 0 → 1 → 2 → 3 → 4 → 5. Bước 3 phải xong trước bước 4: test là lưới an toàn cho refactor.

---

## 0. Commit mốc

**Lý do:** toàn bộ thay đổi P0–P2 đang chưa commit, trộn với các sửa đổi khác trong working tree. Refactor ở bước 4 mà không có mốc thì khó quay lại.

**Các bước:**
1. Liệt kê file thay đổi của P0–P2, tách khỏi các file không thuộc phạm vi (ví dụ `rag_service/*` của việc khác).
2. Chạy `detect_changes()` theo quy tắc trong `CLAUDE.md`.
3. Chia commit theo mục: P0-1, P0-2, P0-3, P1-4…7, P2-8, P2-9, tách duplicate-guard và phần welcome thành commit riêng.

**Xong khi:** `git status` chỉ còn các file ngoài phạm vi; mỗi commit build và test qua.

---

## 1. Cache-Control của `/me` — nguyên nhân đã rõ

**Nguyên nhân:** `next.config.ts` có rule `headers()` cho `source: "/api/((?!v1/roadmaps).*)*"`, đặt `Cache-Control: no-store, no-cache, must-revalidate`. Rule này ghi đè header do route `/api/roadmap-assistant/me` tự đặt (`private, no-store`).

**Đánh giá:** giá trị bị ghi đè vẫn có `no-store`, nên không trình duyệt hay proxy nào lưu câu trả lời. Không có rủi ro lộ quyền giữa người dùng.

**Quyết định đề xuất:** giữ nguyên rule chung; bỏ header riêng trong route để tránh hiểu nhầm, và sửa test route cho khớp hành vi thật (không kiểm header ở mức route nữa). Không đổi `next.config.ts`.

**Xong khi:** `curl -I /api/roadmap-assistant/me` trả `no-store…`; test route không còn khẳng định giá trị bị ghi đè.

---

## 2. Hạ tầng test DOM

**Hiện trạng:** `vitest.config.mts` chạy `environment: "node"`, `include: ["tests/**/*.test.ts"]`. Không có `jsdom`, `@testing-library/react`.

**Các bước:**
1. Thêm devDependency (yarn 4):
   - `jsdom`
   - `@testing-library/react` (bản hỗ trợ React 19)
2. Giữ môi trường mặc định là `node`. File test DOM tự khai báo `// @vitest-environment jsdom` ở dòng đầu, để các test hiện có không đổi môi trường.
3. Mở `include` thành `tests/**/*.test.{ts,tsx}` để viết test có JSX.
4. Không thêm gì vào `roadmap-rag-assistant/sdk/typescript/package.json`: SDK vẫn không có dependency runtime.

**Rủi ro:** `yarn.lock` thay đổi; cài đặt cần mạng. Nếu không muốn thêm thư viện, phương án B là test logic thuần (tách `retry`/`clearMessages` ra hàm thuần nhận `messages` và trả `messages` mới), nhưng sẽ không test được phần render.

**Xong khi:** một test mẫu `renderHook` chạy được; toàn bộ test cũ vẫn qua.

---

## 3. Test cho hook và widget

Tất cả dùng `fetch` giả (cùng kiểu `controlledStream` trong `tests/unit/sdk-stream-timeout.test.ts`) — không gọi mạng.

### 3a. `retry` (P0-2)
- Lượt 1: `fetch` trả 500 → tin bot có `status: 'error'`, nội dung không chứa `localhost`/`:8000`.
- Gọi `retry(botId)` với `fetch` trả stream thành công → `fetch` được gọi lần 2 với **cùng** `message`; danh sách chỉ còn lời chào + 1 câu hỏi + 1 câu trả lời.
- Tin không phải lỗi hoặc không có câu hỏi phía trước → `retry` không làm gì.

### 3b. `clearMessages` / "Cuộc trò chuyện mới" (P1-5)
- Đang stream (stream giả chưa đóng) → gọi `clearMessages` → `signal.aborted === true`, `isLoading === false`.
- Sau đó: đúng 1 tin chào, `conversationId` khác trước, khoá storage bị xoá.
- Token đến muộn từ stream cũ không xuất hiện trong hội thoại mới.

### 3c. Lưu và khôi phục (P1-4)
- Ghi sẵn một hội thoại vào `sessionStorage` → `renderHook` → khôi phục đúng tin và `conversationId`.
- Gửi một câu (fake timers) → sau 300ms storage có câu mới; trong lúc stream không ghi tin đang stream.
- `sessionStorage` ném lỗi → hook vẫn khởi tạo với lời chào.

### 3d. Lời chào theo quyền (P0-1)
- `canWrite: false` → lời chào không có "Tạo 2 layer".
- `rerender` với `canWrite: true` khi chưa gửi gì → lời chào có "Tạo 2 layer".
- Đã gửi một câu rồi mới đổi `canWrite` → hội thoại giữ nguyên.

### 3e. Widget (P0-2, P1-6, P1-7)
- `initialOpen`, `canWrite={false}` → mở menu ⋮: có "Cuộc trò chuyện mới", không có "Mã hội thoại".
- `canWrite={true}` → có cả hai.
- Ô nhập có `maxLength=2000`; nhập 1.800 ký tự → hiện "1.800/2.000"; 1.799 ký tự → không hiện bộ đếm.
- Tin lỗi hiện nút "Thử lại"; bấm → gọi lại `fetch` với câu hỏi gốc.

**Xong khi:** các test trên qua; tổng số test tăng tương ứng, không test cũ nào hỏng.

---

## 4. Tách `MessageList.tsx` (hoàn tất P2-9)

**Hiện trạng:** khối "Messages" trong `RoadmapChatbotWidget.tsx` dài khoảng 252 dòng, dùng 18 giá trị từ component cha.

**Props đề xuất (nhóm theo vai trò):**

| Nhóm | Props |
|---|---|
| Dữ liệu | `messages`, `isLoading`, `isStreaming`, `status`, `runningCode`, `expandedTools`, `feedback`, `copiedId` |
| Hành động | `sendMessage`, `retry`, `copyMessage`, `handleFeedback`, `handleRunCode`, `toggleToolExpand` |
| Cuộn | `scrollRef`, `bottomSentinelRef`, `showScrollBottom`, `scrollToBottom` |

**Các bước:**
1. Chuyển nguyên khối JSX sang `components/MessageList.tsx` (không sửa logic trong lúc chuyển).
2. Giữ IntersectionObserver và `useLayoutEffect` auto-scroll ở widget cha (chúng phụ thuộc `isOpen`), chỉ truyền ref xuống.
3. Typecheck SDK và app; chạy test bước 3 và toàn bộ suite.
4. Kiểm tra trên trình duyệt: nút cuộn xuống (hiện/ẩn), thẻ gợi ý gửi được, thẻ bước "Đã suy nghĩ", nút xác nhận hành động, sheet 👎.
5. Build lại `dist`.

**Không làm trong bước này:** tách tiếp thành `MessageRow`, đổi giao diện, đổi tên prop công khai của `RoadmapChatbotWidget`.

**Xong khi:** `RoadmapChatbotWidget.tsx` dưới khoảng 450 dòng; mọi test qua; hành vi trên trình duyệt không đổi.

---

## 5. Kiểm tra bàn phím trên điện thoại thật (P2-8)

**Chuẩn bị:**
- Điện thoại và Mac cùng Wi-Fi; lấy IP bằng `ipconfig getifaddr en1`.
- Nếu IP khác `192.168.1.22`: cập nhật `allowedDevOrigins` trong `next.config.ts` và chạy lại `npm run dev`.
- Mở `http://<IP>:3334` trên điện thoại.

**Kịch bản (làm trên iPhone Safari và Android Chrome):**
1. Mở widget → chạm ô nhập → bàn phím mở: ô nhập và nút gửi còn nhìn thấy, header không bị đẩy khỏi màn hình.
2. Gõ một câu dài nhiều dòng → nội dung không bị che.
3. Cuộn danh sách tin khi bàn phím đang mở → cuộn được, nút cuộn xuống hoạt động.
4. Đóng bàn phím → khung chat trở về toàn màn hình, không còn khoảng trống.
5. Xoay ngang rồi xoay dọc khi bàn phím mở.

**Ghi nhận:** chụp ảnh trước/sau cho mỗi kịch bản, đính kèm vào PR.

**Nếu lỗi:**
- Android Chrome: thêm `interactive-widget=resizes-content` vào meta viewport.
- iOS: kiểm tra `visualViewport.offsetTop` khi trang bị cuộn; nếu cần thì khoá cuộn `body` khi widget mở.

**Xong khi:** cả 5 kịch bản đạt trên hai trình duyệt, có ảnh chụp.

---

## Rủi ro chung

- Working tree đang có nhiều thay đổi ngoài phạm vi: commit mốc (bước 0) phải chọn file cẩn thận.
- Test DOM có thể chậm hơn test node: chỉ bật jsdom cho file cần.
- Refactor `MessageList` chạm vào nhiều handler: không gộp sửa logic vào cùng commit.
