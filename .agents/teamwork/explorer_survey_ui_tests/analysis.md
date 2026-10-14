# Báo Cáo Khảo Sát Chi Tiết: Giao Diện Chatbot UI, Generative Action Chips, Markdown Rendering & Hạ Tầng Kiểm Thử (R3 & R4)

- **Người thực hiện**: Survey Explorer 3 (UI & Test Verification Infrastructure)
- **Thư mục làm việc**: `.agents/teamwork/explorer_survey_ui_tests/`
- **Ngày thực hiện**: 2026-10-14
- **Dự án**: `crisne-website` (Next.js 16.2.9, React 19.2.4, Tailwind CSS 4, Vitest 5.0.4)

---

## 1. Tóm Tắt Khảo Sát (Executive Summary)

Dự án hiện sở hữu hai luồng chatbot hoạt động độc lập được điều phối thông qua `components/site-chatbot.tsx`:
1. **`FloatingChatBot`** (dành cho trang `/portfolio`): Tương tác hỏi đáp thông tin cá nhân, kinh nghiệm lập trình, dự án tiêu biểu và thông tin liên hệ của Cris Nguyen thông qua endpoint `/api/chat` (sử dụng Gemini + RAG hybrid search + Langfuse tracing).
2. **`RoadmapAssistantChatbot`** (dành cho trang chủ `/` - Roadmap Workspace): Trợ lý AI chuyên biệt cho quản trị lộ trình, tra cứu bài học và thực thi công cụ WebMCP/FastAPI thông qua SDK `roadmap-rag-assistant/sdk/typescript`.

### Các phát hiện then chốt:
- **Markdown Rendering hiện tại rất sơ khai và tồn tại lỗi**: Cả 2 component đều dùng hàm regex tự chế (`parseInlineMarkdown` và `formatMarkdownText`). Cả hai **hoàn toàn không hỗ trợ Markdown Link `[text](url)`**, không xử lý khối code nhiều dòng ```` ``` ````, bỏ sót heading `#`, `####`, và dễ bị vỡ format khi token streaming trả về từng phần chưa đóng thẻ.
- **Hoàn toàn chưa có Generative Action Chips (R3)**: Khi AI nhắc đến các dự án (Kamala, Zelene Spa, Smartbit, JAVIS), hay gợi ý thao tác lộ trình (tạo topic, tạo layer, thêm item, nhảy tới layer, xem /plan), phản hồi chỉ là văn bản thô, người dùng không thể bấm trực tiếp để kích hoạt modal hay điều hướng giao diện.
- **Vi phạm React 19 Ref Mutate trong Render Phase**: Trong `useRoadmapAssistantChat.ts`, các ref `onWebMcpRef.current = ...`, `getContextRef.current = ...`, và `clientRef.current = ...` bị gán trực tiếp trong thân render function, vi phạm quy tắc render-phase của React 19 dẫn đến lỗi ESLint `react-hooks/refs: Cannot access refs during render`.
- **Hạ tầng kiểm thử & Build rất ổn định**:
  - `npx tsc --noEmit` hoàn thành với **0 lỗi**.
  - `npm test` (Vitest 5.0.4) chạy **9 test files, 82 tests, 100% passed**.
  - `npm run build` (Next.js 16.2.9 Turbopack) biên dịch thành công 42 route pages trong **4.6s** với **0 lỗi**.
  - Tuy nhiên, hiện tại **100% test suites là backend/unit logic**, **chưa hề có bất kỳ test case nào cho markdown parsing, action chip extraction hay chatbot UI**.

---

## 2. Khảo Sát Chi Tiết Các Thành Phần Chatbot UI

### 2.1. Bản Đồ Phân Bổ Chatbot Theo Tuyến Đường

| Thành phần | Vị trí File | Router / Hiển thị | Công nghệ / Data Source |
|---|---|---|---|
| `SiteChatbot` | `components/site-chatbot.tsx` | Toàn site (trong `app/layout.tsx:166`) | Điều hướng hiển thị: nếu `pathname.startsWith("/portfolio")` render `FloatingChatBot`, ngược lại render `RoadmapAssistantChatbot`. |
| `FloatingChatBot` | `components/floating-bot/FloatingChatBot.tsx` | `/portfolio` | Hook `useFloatingChat`, Next.js API `/api/chat`, Framer Motion, Lucide icons, Tailwind CSS 4. |
| `FloatingChatBotWrapper` | `components/floating-bot/FloatingChatBotWrapper.tsx` | dynamic import | `next/dynamic` với `{ ssr: false }` tránh lỗi hydration. |
| `RoadmapAssistantChatbot` | `components/roadmap/RoadmapAssistantChatbot.tsx` | `/` (Roadmap Workspace) | Bọc `RoadmapChatbotWidget` từ SDK `roadmap-rag-assistant/sdk/typescript`. |
| `RoadmapAssistantChatbotWrapper` | `components/roadmap/RoadmapAssistantChatbotWrapper.tsx` | dynamic import | `next/dynamic` với `{ ssr: false }`. |
| `RoadmapChatbotWidget` | `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx` | SDK React Component | 894 dòng code nguyên khối, nhúng 12 SVG icons thô, Telegram styling, tự quản lý UI + markdown. |

---

## 3. Khảo Sát Markdown Rendering & Các Điểm Yếu Regex

### 3.1. Phân Tích Hàm Render Hiện Tại

#### A. Trong `FloatingChatBot.tsx` (Dòng 28-90):
```tsx
function FormattedMessage({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 text-[13px] sm:text-[13px] leading-relaxed">
      {lines.map((line, idx) => {
        if (!line.trim()) return <div key={idx} className="h-1" />;
        // Bullet point
        if (line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ")) {
          const itemText = line.replace(/^[-•*]\s+/, "");
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-steel font-bold mt-0.5 shrink-0">•</span>
              <span>{parseInlineMarkdown(itemText)}</span>
            </div>
          );
        }
        // Numbered list
        const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (numberedMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-1">
              <span className="text-steel font-semibold shrink-0">{numberedMatch[1]}.</span>
              <span>{parseInlineMarkdown(numberedMatch[2])}</span>
            </div>
          );
        }
        // Regular paragraph
        return <p key={idx}>{parseInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

function parseInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} ...>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} ...>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}
```

#### B. Trong `RoadmapChatbotWidget.tsx` (Dòng 251-356):
Tương tự `FloatingChatBot`, có bổ sung kiểm tra `### ` và `## `, nhưng inline parsing vẫn chỉ dùng `/(\*\*.*?\*\*|`.*?`)/g`.

### 3.2. Danh Sách Các Lỗ Hổng & Bug Của Parser Hiện Tại

1. **Hoàn toàn không hỗ trợ Markdown Link `[text](url)`**:
   - Khi AI nhắc đến `[Kamala](https://kamala.vn)` hoặc `[Tải CV](/cris-nguyen-cv.pdf)` hoặc `[Xem chi tiết](#projects)`, văn bản hiển thị nguyên vẹn dạng chuỗi thô `[Kamala](https://kamala.vn)`.
   - Người dùng không thể nhấp vào link.
2. **Không hỗ trợ Multiline Code Blocks (```` ```lang ... ``` ````)**:
   - Vì hàm thực hiện `content.split("\n")` trước tiên, các khối code trải dài nhiều dòng bị bẻ gãy thành từng thẻ `<p>` riêng lẻ. Ký tự ``` đầu và cuối dòng hiển thị như văn bản thừa.
3. **Lỗi khi Streaming (Unclosed formatting tokens)**:
   - Trong quá trình streaming, token trả về từng từ. Khi chuỗi đang là `**Kinh nghiệm Next.js`, regex `split(/(\*\*.*?\*\*)/g)` không khớp được (vì chưa có `**` đóng). Do đó, người dùng nhìn thấy dấu `**` thô cho đến khi token cuối cùng xuất hiện mới giật nhẹ thành in đậm.
4. **Bỏ sót Heading cấp 1, 4 và Blockquotes**:
   - `FloatingChatBot` hoàn toàn không có xử lý heading (`# `, `## `, `### ` đều hiển thị dưới dạng `<p>### Tiêu đề</p>`).
   - Cả 2 bot không hỗ trợ blockquote `> Trích dẫn`.
5. **Xung đột regex lồng nhau (Nested Formatting)**:
   - Biểu thức `text.split(/(\*\*.*?\*\*|`.*?`)/g)` không xử lý được liên kết chứa chữ in đậm `[**Kamala**](url)` hoặc in nghiêng `*italic*` / `_italic_`.

### 3.3. Giải Pháp Thiết Kế: Component `ChatMarkdown` Dùng Chung

Xây dựng một module parser độc lập, **Zero external dependency** (tuân thủ nguyên tắc YAGNI và ponytail skill):
- **Giai đoạn 1 - Block Tokenizer**:
  - Tách các khối code block (```` ``` ````) trước để giữ nguyên vẹn nội dung code nhiều dòng, render kèm header ngôn ngữ + nút copy code.
  - Phân loại: CodeBlock, Heading (H1-H3), Blockquote, Horizontal Rule (`---`), Bullet List, Numbered List, Paragraph.
- **Giai đoạn 2 - Inline Tokenizer**:
  - Regex an toàn bắt cặp đồng thời:
    - Markdown Link: `\[([^\]]+)\]\(([^)]+)\)`
    - Bold: `\*\*([^*]+)\*\*`
    - Inline Code: `` `([^`]+)` ``
    - Italic: `\*([^*]+)\*` hoặc `_([^_]+)_`
  - Tự động phát hiện URL trần (Auto-link URLs `https://...`) nếu có.
  - Các link mở ngoài có kèm `target="_blank" rel="noopener noreferrer"` và icon `ExternalLink` nhỏ gọn.

---

## 4. Khảo Sát Thiết Kế Generative Action Chips (Requirement R3)

### 4.1. Thực Thể Tham Chiếu (Entities) & Action Mapping

Dựa trên khảo sát codebase tại `components/projects-section.tsx`, `components/cta-section.tsx`, `hooks/use-roadmap.ts`, và `app/page.tsx`:

#### 1. Project References (Dự án nổi bật của Cris Nguyen):

| Dự án | Mã ID (`ProjectData.id`) | Dữ liệu & URL Thực tế | Hành động khi nhấp Action Chip |
|---|---|---|---|
| **Kamala** | `kamala-commerce-tour` | `https://kamala.vn/` | 1. Phát event `project:open-modal` kèm `id: "kamala-commerce-tour"`.<br>2. Nếu đang ở ngoài `/portfolio`, điều hướng về `/portfolio?project=kamala-commerce-tour#projects`. |
| **Zelene Spa** | `zelene-spa-booking` | `https://zelenespa.com/` | Mở `ProjectDetailModal` với id `zelene-spa-booking`. |
| **Smartbit** | `smartbit-saas-platform` | Multi-Tenant SaaS Platform | Mở `ProjectDetailModal` với id `smartbit-saas-platform`. |
| **JAVIS** | `javis-3d-tile-simulation` | Interactive 3D Tile Pattern Simulation | Mở `ProjectDetailModal` với id `javis-3d-tile-simulation`. |

#### 2. Roadmap Suggestions & Commands (Thao tác lộ trình học tập):

| Gợi ý / Lệnh | Từ khóa nhận diện | Hành động khi nhấp Action Chip |
|---|---|---|
| **Tạo Topic mới** | `tạo topic`, `create topic`, `/topic` | Phát event `roadmap:open-modal` với `{ type: 'topic' }` -> Mở `CreateTopicModal`. |
| **Tạo Layer mới** | `tạo layer`, `create layer` | Phát event `roadmap:open-modal` với `{ type: 'layer' }` -> Mở `CreateLayerModal`. |
| **Thêm Bài học** | `thêm bài học`, `tạo item`, `create item` | Phát event `roadmap:open-modal` với `{ type: 'item' }` -> Mở `CreateItemModal`. |
| **Nhảy tới Layer** | `Layer <tên hoặc số>`, `xem layer` | Phát event `roadmap:select-layer` với `{ layerId }` -> Cập nhật `selectedLayerId` trong `app/page.tsx`. |
| **Lập kế hoạch** | `/plan`, `lập kế hoạch` | Tự động điền hoặc gửi lệnh `/plan` vào khung chat. |

#### 3. Contact & Resource Channels (Kênh liên hệ Cris Nguyen):

| Kênh liên hệ | Đích đến | Hành động |
|---|---|---|
| **Zalo** | `process.env.NEXT_PUBLIC_ZALO_URL` hoặc `https://zalo.me` | Mở liên hệ Zalo trên tab mới. |
| **Tải CV** | `/cris-nguyen-cv.pdf` | Mở trực tiếp file PDF CV đã có sẵn trong `public/`. |
| **GitHub** | `https://github.com/crisne` | Mở profile GitHub của tác giả. |

### 4.2. Kiến Trúc Tương Tác Decoupled: Custom Browser Events

Để đảm bảo các Chatbot component (nằm ở tầng layout hoặc floating aside) có thể điều khiển trạng thái của trang chủ (`app/page.tsx`) và trang Portfolio (`components/projects-section.tsx`) mà **không gây prop-drilling hay can thiệp ref bừa bãi**, cơ chế giao tiếp thông qua **Native Custom Events** là tối ưu nhất:

```
┌─────────────────────────────────┐
│ FloatingChatBot / RoadmapWidget │
└────────────────┬────────────────┘
                 │ dispatches CustomEvent
                 ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ Window Event Bus                                             │
 │  - "project:open-modal"  { detail: { projectId } }           │
 │  - "roadmap:open-modal"  { detail: { type, layerId, level } }│
 │  - "roadmap:select-layer"{ detail: { layerId } }             │
 └───────┬───────────────────────────────┬──────────────────────┘
         │ listener                      │ listener
         ▼                               ▼
 ┌───────────────────────────┐   ┌──────────────────────────────┐
 │ ProjectsSection           │   │ RoadmapWorkspace             │
 │ (components/projects-     │   │ (app/page.tsx)               │
 │  section.tsx)             │   │                              │
 │ -> mở ProjectDetailModal  │   │ -> mở CreateTopic/Layer/Item │
 └───────────────────────────┘   │ -> setSelectedLayerId(...)   │
                                 └──────────────────────────────┘
```

Mô hình này đã được chứng minh hiệu quả trong codebase hiện tại:
- `window.dispatchEvent(new CustomEvent("roadmap:updated"))` đã và đang được dùng tại `hooks/use-roadmap-webmcp.ts:62`, `logic/roadmap/roadmapAssistantService.ts:76`, và `components/roadmap/RoadmapAssistantChatbot.tsx:90`.
- Do đó việc mở rộng thêm các event `project:open-modal`, `roadmap:open-modal`, `roadmap:select-layer` là hoàn toàn tự nhiên và nhất quán với kiến trúc sẵn có.

### 4.3. Cơ Chế Trích Xuất Action Chips: Hybrid (Metadata + Semantic Detection)

Để thỏa mãn cả R2 (server hỗ trợ parseable action metadata) và R3 (UI render interactive action chips):
1. **Semantic Client Detection (Luôn luôn hoạt động)**:
   - Dò tìm tự động trong văn bản câu trả lời các từ khóa thực thể: `Kamala`, `Zelene`, `Smartbit`, `JAVIS`, `Layer [X]`, `Zalo`, `CV`, `tạo layer`, `tạo topic`.
   - Cho dù server trả về plain text streaming thông thường, chips vẫn tự động hiển thị mượt mà.
2. **Structured Metadata Injection (R2/R3 Integration)**:
   - Hỗ trợ cú pháp comment metadata hoặc tag action ở cuối phản hồi, ví dụ:
     `<!--ACTIONS: [{"type":"project","id":"kamala-commerce-tour","label":"Xem Kamala"}]-->`
   - Parser tách khối comment này ra khỏi text hiển thị và parse thành mảng actions có độ ưu tiên cao nhất.
3. **Hiển thị Action Chips**:
   - Đặt ngay bên dưới bong bóng chat của Assistant (`role === "assistant"`).
   - Render dạng flex wrap với style chip bo tròn (`rounded-xl`), viền sáng, hiệu ứng hover/active scale `0.97`, icon emoji sinh động, hỗ trợ dark/light mode hoàn hảo.

---

## 5. Khảo Sát SDK Decoupling & Tuân Thủ React 19 (R1)

### 5.1. Lỗi Render-Phase Ref Mutation trong `useRoadmapAssistantChat.ts`

Kiểm tra bằng ESLint phát hiện 3 lỗi trực tiếp vi phạm quy tắc render-phase của React 19:
1. **Dòng 28**:
   ```ts
   const onWebMcpRef = useRef(onWebMcpMessage);
   onWebMcpRef.current = onWebMcpMessage; // ❌ Cannot update ref during render
   ```
2. **Dòng 32**:
   ```ts
   const getContextRef = useRef(getContext);
   getContextRef.current = getContext; // ❌ Cannot update ref during render
   ```
3. **Dòng 50-52**:
   ```ts
   const clientRef = useRef<RoadmapChatClient | null>(null);
   if (!clientRef.current) { // ❌ Cannot access ref value during render
     clientRef.current = new RoadmapChatClient({ baseUrl });
   }
   ```

**Phương án khắc phục chuẩn React 19**:
- Với callback/getter (`onWebMcpMessage`, `getContext`): Cập nhật ref bên trong `useEffect` hoặc dùng pattern getter an toàn.
- Với `clientRef`: Khởi tạo một lần qua `useMemo(() => new RoadmapChatClient({ baseUrl }), [baseUrl])` hoặc hàm getter an toàn.

### 5.2. Tách Biệt Headless Hook & Tinh Gọn `RoadmapChatbotWidget.tsx`

`RoadmapChatbotWidget.tsx` hiện dài 894 dòng:
- 13 icons SVG (từ dòng 7 đến 247) chiếm 240 dòng code -> Cần tách sang module `components/roadmap/icons/` hoặc `roadmap-rag-assistant/sdk/typescript/src/react/icons/`.
- Logic markdown formatter (dòng 251-356) -> Dùng chung component `ChatMarkdown`.
- Action buttons xác nhận (dòng 676-700) -> Chuyển thành Generative Action Chips tổng quát.
- Nhờ đó `RoadmapChatbotWidget.tsx` sẽ giảm từ 894 dòng xuống còn dưới 250 dòng, cực kỳ gọn gàng và dễ bảo trì.

---

## 6. Khảo Sát Hạ Tầng Kiểm Thử & Xác Minh (Requirement R4)

### 6.1. Tổng Kiểm Kê Công Cụ & Trạng Thái Hiện Tại

| Công cụ / Pipeline | Lệnh kiểm tra | Trạng thái hiện tại | Thời gian / Chi tiết |
|---|---|---|---|
| **TypeScript Strict** | `npx tsc --noEmit` | ✅ PASS (Mã thoát 0) | 0 lỗi trên toàn bộ dự án. |
| **SDK TypeScript** | `npm run typecheck` (trong `sdk/typescript`) | ✅ PASS (Mã thoát 0) | 0 lỗi trong SDK. |
| **Unit Test Runner** | `npm test` (`vitest run`) | ✅ PASS (Mã thoát 0) | 9 test files, 82 test cases pass 100%. Thời gian ~760ms. |
| **Next.js Production Build** | `npm run build` | ✅ PASS (Mã thoát 0) | Prisma Client sinh thành công. Next.js 16.2.9 Turbopack biên dịch 42/42 trang trong 4.6s. |
| **ESLint 9 (Flat Config)** | `npm run lint` | ⚠️ Phát hiện lỗi | 102 errors, 65 warnings. Chủ yếu gồm: React 19 ref mutation trong SDK, file biên dịch `dist/` trong SDK chưa được ignore, một vài `any` trong legacy logic. |
| **Pre-commit Script** | `.githooks/pre-commit` -> `scripts/ai-review.js` | Sẵn sàng | Đọc `AGENTS.md` kiểm tra 7 rules nghiêm ngặt. |

### 6.2. Đánh Giá Khoảng Trống Kiểm Thử (Test Gaps)

Tất cả 9 file test hiện có đều nằm ở backend/route:
- `tests/route/chat-route.test.ts` (22 tests)
- `tests/route/write-access.test.ts`
- `tests/unit/llm-circuit-breaker.test.ts`
- `tests/unit/llm-errors.test.ts`
- `tests/unit/owner-access.test.ts`
- `tests/unit/pii-mask.test.ts`
- `tests/unit/rag-engine.test.ts`
- `tests/unit/rate-limit.test.ts`
- `tests/unit/response-cache.test.ts`

**Khoảng trống lớn nhất**:
Chưa có test nào kiểm tra:
1. Trích xuất Action Chips từ phản hồi (`extractActionChips`).
2. Xử lý link markdown (`[Kamala](https://kamala.vn)`).
3. Xử lý khối code và danh sách không bị lỗi regex.
4. Xử lý an toàn khi token streaming chưa hoàn thiện.

**Đề xuất bổ sung test suites**:
- `tests/unit/chat-markdown.test.ts`: Kiểm tra pure markdown parsing logic (links, bold, code block, edge cases).
- `tests/unit/action-chips.test.ts`: Kiểm tra nhận diện thực thể dự án, gợi ý roadmap, kênh liên hệ và cấu trúc payload.

---

## 7. Danh Mục File Bị Ảnh Hưởng & Phân Bổ Triển Khai (R3 & R4)

### 7.1. Các File Cần Nâng Cấp Hoặc Tạo Mới

| File | Phân loại | Mục đích thay đổi |
|---|---|---|
| `components/chat/ChatMarkdown.tsx` | Tạo mới | Component markdown renderer dùng chung, xử lý link `[text](url)`, code block, bold, list, không vỡ regex. |
| `components/chat/ChatActionChips.tsx` | Tạo mới | Component render các Action Chips (Kamala, Zelene Spa, Smartbit, JAVIS, Layer jump, Create modal, Contact Zalo/CV). |
| `components/chat/action-chips-utils.ts` | Tạo mới | Logic trích xuất semantic action chips + parse action metadata + handler kích hoạt event. |
| `components/floating-bot/FloatingChatBot.tsx` | Nâng cấp | Thay thế `FormattedMessage` bằng `ChatMarkdown`, tích hợp `ChatActionChips` dưới câu trả lời của AI. |
| `components/projects-section.tsx` | Nâng cấp | Lắng nghe event `project:open-modal` để tự động mở `ProjectDetailModal` khi click chip dự án. Export mảng `projects`. |
| `app/page.tsx` | Nâng cấp | Lắng nghe event `roadmap:open-modal` và `roadmap:select-layer` để mở modal tạo và nhảy layer tương ứng. |
| `roadmap-rag-assistant/sdk/typescript/src/react/useRoadmapAssistantChat.ts` | Nâng cấp | Sửa toàn bộ lỗi render-phase ref mutations tuân thủ React 19. |
| `roadmap-rag-assistant/sdk/typescript/src/react/RoadmapChatbotWidget.tsx` | Nâng cấp | Tách 13 icons sang file riêng, thay thế formatMarkdownText bằng `ChatMarkdown`, tích hợp Action Chips. |
| `roadmap-rag-assistant/sdk/typescript/src/react/icons.tsx` | Tạo mới | Chứa các SVG icon tách ra từ `RoadmapChatbotWidget.tsx`. |
| `eslint.config.mjs` | Cấu hình | Bổ sung `roadmap-rag-assistant/sdk/typescript/dist/**` vào `globalIgnores` tránh check nhầm bundle dist. |
| `tests/unit/chat-markdown.test.ts` | Tạo mới (Test) | Unit test cho parser markdown (link, bold, code block, edge cases). |
| `tests/unit/action-chips.test.ts` | Tạo mới (Test) | Unit test cho action chip extraction và event payload. |

---

## 8. Kết Luận Khảo Sát

Hạ tầng ứng dụng hiện tại rất vững chắc với TypeScript và Turbopack build đều xanh 100%. Việc nâng cấp R3 (Generative Action Chips & Markdown Link/Code Rendering) và R4 (React 19 ref cleanup, Vitest UI helper suites, build verification) hoàn toàn khả thi, có phương án kiến trúc rõ ràng, sử dụng native browser custom events decoupled, không phát sinh dependencies mới và đảm bảo toàn vẹn tiêu chuẩn code của dự án.
