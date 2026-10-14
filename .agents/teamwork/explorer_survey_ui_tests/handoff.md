# Handoff Report — UI & Test Verification Infrastructure (R3 & R4)

- **Agent**: Survey Explorer 3 (UI & Test Verification Infrastructure)
- **Working Directory**: `/Users/tienanhnguyen/Desktop/src_example/crisne-website/.agents/teamwork/explorer_survey_ui_tests`
- **Date**: 2026-10-14
- **Milestone**: Survey & UI/Test Infrastructure Investigation

---

## 1. Observation (Các Quan Sát Thực Tế)

### 1.1. Hiện Trạng Chatbot & Tách Tuyến Đường
- **File `components/site-chatbot.tsx:8-16`**:
  ```tsx
  export function SiteChatbot() {
    const pathname = usePathname();
    if (pathname?.startsWith("/portfolio")) {
      return <FloatingChatBot />;
    }
    return <RoadmapAssistantChatbot position="bottom-right" />;
  }
  ```
  `FloatingChatBot` phục vụ trang Portfolio (`/portfolio`), trong khi `RoadmapAssistantChatbot` phục vụ các trang còn lại (bao gồm trang chủ `/` chứa `RoadmapWorkspace`).

### 1.2. Hạn Chế & Lỗi Của Bộ Parser Markdown Hiện Tại
- **File `components/floating-bot/FloatingChatBot.tsx:67-90`**:
  Hàm `parseInlineMarkdown` chỉ xử lý:
  ```tsx
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  ```
  Hoàn toàn không hỗ trợ Markdown Link `[text](url)`. Khi AI trả về `[Kamala](https://kamala.vn)` hay `[CV](/cris-nguyen-cv.pdf)`, văn bản in nguyên dạng chuỗi thô.
- **File `components/floating-bot/FloatingChatBot.tsx:28-65` (`FormattedMessage`)**:
  Hàm thực hiện `lines = content.split("\n")` trước tiên, khiến các khối code multiline ```` ```ts ... ``` ```` bị chia nhỏ thành từng dòng `<p>`, không thể render code block hoặc syntax highlight.
- **File `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx:251-281` (`renderInlineStyles`)**:
  Cũng chỉ xử lý `(\*\*.*?\*\*|`.*?`)`, hoàn toàn thiếu link parsing và khối code.
- **File `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx:7-247`**:
  Chứa 13 inline SVG icons chiếm 240 dòng code bên trong file widget giao diện (tổng file dài 894 dòng).

### 1.3. Vi Phạm Quy Tắc Render-Phase Ref Trong React 19
- Lệnh chạy kiểm tra ESLint:
  ```bash
  npm run lint
  ```
  Kết quả báo lỗi verbatim tại file `roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts`:
  - Dòng 28:3:
    ```
    onWebMcpRef.current = onWebMcpMessage;
    Cannot update ref during render (react-hooks/refs)
    ```
  - Dòng 32:3:
    ```
    getContextRef.current = getContext;
    Cannot update ref during render (react-hooks/refs)
    ```
  - Dòng 50:8:
    ```
    if (!clientRef.current) {
      clientRef.current = new RoadmapChatClient({ baseUrl });
    }
    Cannot access ref value during render (react-hooks/refs)
    ```

### 1.4. Dự Án & Cơ Chế Modal Sẵn Có
- **File `components/projects-section.tsx:8-138`**:
  Định nghĩa 4 dự án thực tế:
  1. `kamala-commerce-tour`: "Kamala Jewelry & Tour Platform" (Live: `https://kamala.vn/`)
  2. `zelene-spa-booking`: "Zelene Head Spa Booking Platform" (Live: `https://zelenespa.com/`)
  3. `smartbit-saas-platform`: "Smartbit Multi-Tenant SaaS Platform"
  4. `javis-3d-tile-simulation`: "JAVIS 3D Tile Pattern Simulation"
- **File `components/projects-section.tsx:151-165, 217-221`**:
  Modal chi tiết `ProjectDetailModal` được điều khiển bởi state `[selectedProject, setSelectedProject]` và `[isModalOpen, setIsModalOpen]`, hiện chưa có cơ chế lắng nghe sự kiện ngoài để mở tự động từ chatbot.
- **File `public/cris-nguyen-cv.pdf`** và `public/icon-zalo.svg`: Các tài nguyên liên hệ đã tồn tại sẵn trong thư mục `public/`.

### 1.5. Thao Tác Roadmap & Custom Event
- **File `app/page.tsx:54-60`**:
  Đã sử dụng event `roadmap:updated` từ window:
  ```tsx
  useEffect(() => {
    const handleUpdate = () => { refreshRoadmaps(); };
    window.addEventListener("roadmap:updated", handleUpdate);
    return () => window.removeEventListener("roadmap:updated", handleUpdate);
  }, [refreshRoadmaps]);
  ```
- **File `app/page.tsx:119-124`**:
  Trạng thái mở modal tạo gồm: `isCreateTopicOpen`, `isCreateLayerOpen`, `isCreateItemOpen`, và `selectedLayerId`.

### 1.6. Kết Quả Kiểm Tra Hạ Tầng Kiểm Thử & Biên Dịch
1. **Lệnh `npx tsc --noEmit`**:
   - Mã thoát: 0. Không có bất kỳ lỗi TypeScript nào trong dự án chính.
2. **Lệnh `npm test` (`vitest run`)**:
   - Mã thoát: 0.
   - Kết quả: `9 passed (9 files)`, `82 passed (82 tests)`, thời gian thực thi: `764ms`.
3. **Lệnh `npm run build` (Next.js 16.2.9 Turbopack)**:
   - Mã thoát: 0.
   - Kết quả: Sinh thành công Prisma Client, Turbopack biên dịch trong `4.6s`, static page generation `42/42 (100%)`.

---

## 2. Logic Chain (Chuỗi Lập Luận Suy Luận)

1. **Từ Quan sát 1.1 & 1.4**: Người dùng trên trang `/portfolio` tương tác với `FloatingChatBot`, hỏi về kinh nghiệm và dự án của Cris Nguyen. Khi bot nhắc đến Kamala, Zelene Spa, Smartbit, hoặc JAVIS, người dùng mong muốn nhấp vào một Action Chip để xem chi tiết dự án mà không cần tự cuộn tìm thủ công.
2. **Từ Quan sát 1.4 & 1.5**: Trong `ProjectsSection`, modal `ProjectDetailModal` phụ thuộc state nội bộ. Vì `ProjectsSection` và `FloatingChatBot` cùng hiển thị trên `/portfolio`, cơ chế lý tưởng nhất để mở modal mà không vi phạm quy tắc kiến trúc hay prop drilling là:
   - `FloatingChatBot` phát ra `window.dispatchEvent(new CustomEvent('project:open-modal', { detail: { projectId } }))`.
   - `ProjectsSection` gắn listener `window.addEventListener('project:open-modal', ...)` để kích hoạt `handleViewDetail(project)`.
3. **Từ Quan sát 1.1 & 1.5**: Trên trang chủ `/`, người dùng tương tác với `RoadmapAssistantChatbot`. Khi bot gợi ý thao tác:
   - Nhảy tới layer: phát `roadmap:select-layer` `{ detail: { layerId } }` -> `app/page.tsx` cập nhật `selectedLayerId`.
   - Mở modal tạo: phát `roadmap:open-modal` `{ detail: { type: 'topic' | 'layer' | 'item' } }` -> `app/page.tsx` set state modal tương ứng thành `true`.
   Cách làm này hoàn toàn tương thích và đồng điệu với event `roadmap:updated` sẵn có trong `app/page.tsx:58`.
4. **Từ Quan sát 1.2**: Các parser hiện tại (`parseInlineMarkdown` và `renderInlineStyles`) bị lỗi rách regex, không hỗ trợ link `[text](url)` và code block. Việc tạo một component dùng chung `ChatMarkdown` với zero external dependencies (tách khối code trước, sau đó parse link/bold/inline code bằng regex nhóm an toàn) sẽ giải quyết triệt để lỗi hiển thị trên cả 2 chatbot mà không thêm thư viện nặng nề.
5. **Từ Quan sát 1.3**: Lỗi React 19 render-phase ref mutation bắt nguồn từ việc gán ref trực tiếp trong thân hook function. Để tuân thủ React 19, các gán ref này cần chuyển vào `useEffect` hoặc sử dụng pattern lazy initialization an toàn.
6. **Từ Quan sát 1.6**: Test suite hiện tại đạt 100% pass trên 82 test cases nhưng hoàn toàn thiếu test kiểm thử parser và action chips. Cần bổ sung test suites `tests/unit/chat-markdown.test.ts` và `tests/unit/action-chips.test.ts` để bảo vệ độ tin cậy của tính năng R3 & R4.

---

## 3. Caveats (Các Điểm Giới Hạn & Giả Định)

1. **Môi trường chạy của Vitest**: `vitest.config.mts` đang cấu hình `environment: "node"`, không có JSDOM hay `@testing-library/react`. Do đó, các bài test unit mới cho Markdown và Action Chips phải tập trung kiểm thử pure utility/tokenizer functions (`parseMarkdownTokens`, `extractActionChips`, `handleActionChipClick`), không cố mount DOM component phức tạp nếu không cài thêm jsdom.
2. **Kích thước màn hình di động**: Action Chips cần có thuộc tính responsive (flex-wrap, text-xs, truncate nếu label dài) để tránh tràn ngang màn hình trên thiết bị di động (chiều rộng bot popup di động là `88dvh` bottom sheet).
3. **Mã dự án**: Đảm bảo tuân thủ nghiêm ngặt quy tắc trong `AGENTS.md` (không console.log, không inline style lẫn Tailwind, không import server-code vào client component).

---

## 4. Conclusion (Kết Luận & Kế Hoạch Triển Khai)

Nhiệm vụ R3 và R4 có thể triển khai dứt điểm và sạch sẽ thông qua các bước cụ thể:
1. **Module hóa Markdown (`components/chat/ChatMarkdown.tsx`)**:
   - Zero-dependency parser hỗ trợ code block (có nút copy), links `[text](url)` (với `target="_blank"`), bold, italic, list, quotes.
2. **Hệ thống Generative Action Chips (`components/chat/ChatActionChips.tsx` & `action-chips-utils.ts`)**:
   - Tự động nhận diện thực thể: Kamala, Zelene Spa, Smartbit, JAVIS, Layer jump, Create modals (topic/layer/item), Zalo, CV PDF.
   - Hỗ trợ cả 2 nguồn: Semantic keyword heuristic và Structured metadata comment (`<!--ACTIONS: [...]-->`).
   - Giao tiếp thông qua các custom window event không phụ thuộc (`project:open-modal`, `roadmap:open-modal`, `roadmap:select-layer`).
3. **Tích hợp UI**:
   - Cập nhật `components/floating-bot/FloatingChatBot.tsx` và `components/roadmap/RoadmapAssistantChatbot.tsx`.
   - Cập nhật `components/projects-section.tsx` và `app/page.tsx` để gắn các event listener tương ứng.
4. **Sửa lỗi React 19 trong SDK**:
   - Khắc phục 3 lỗi ref mutation trong `useRoadmapAssistantChat.ts`.
   - Tách 13 inline icons trong `RoadmapChatbotWidget.tsx` sang file `icons.tsx`.
   - Bổ sung `roadmap-rag-assistant/sdk/typescript/dist/**` vào `globalIgnores` của `eslint.config.mjs`.
5. **Bổ sung Unit Tests & Kiểm Tra Toàn Diện**:
   - Thêm `tests/unit/chat-markdown.test.ts` và `tests/unit/action-chips.test.ts`.
   - Đảm bảo `npx tsc --noEmit`, `npm test`, và `npm run build` đều đạt kết quả 100% xanh.

---

## 5. Verification Method (Phương Pháp Xác Minh Độc Lập)

Người thực hiện hoặc reviewer có thể kiểm chứng độc lập kết quả khảo sát bằng các lệnh và kiểm tra sau:

1. **Kiểm tra TypeScript Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   *Kỳ vọng*: Mã thoát 0, 0 lỗi.
2. **Kiểm tra Toàn bộ Test Suites**:
   ```bash
   npm test
   ```
   *Kỳ vọng*: Chạy toàn bộ 9 file test (và các file test mới bổ sung) qua Vitest, 100% passed.
3. **Kiểm tra Production Build**:
   ```bash
   npm run build
   ```
   *Kỳ vọng*: Prisma sinh client thành công, Next.js Turbopack build 42/42 trang thành công với mã thoát 0.
4. **Kiểm tra Lỗi React 19 Ref**:
   ```bash
   npx eslint roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts
   ```
   *Hiện tại*: Báo 3 lỗi `react-hooks/refs`. Sau khi fix theo hướng dẫn: 0 lỗi.
5. **Kiểm tra File Tài Liệu**:
   - Đọc chi tiết phân tích tại: `.agents/teamwork/explorer_survey_ui_tests/analysis.md`
   - Đọc báo cáo handoff tại: `.agents/teamwork/explorer_survey_ui_tests/handoff.md`
