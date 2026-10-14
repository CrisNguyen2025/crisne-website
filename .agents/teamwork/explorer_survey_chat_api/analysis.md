# Kỹ Thuật Chi Tiết Chat API & Anti-Slop Engine (Requirement R2)

> **Mã khảo sát**: Survey Explorer 2 — Chat API & Anti-Slop Engine  
> **Phạm vi**: Requirement R2 (và nền tảng cho R3), bao gồm `app/api/chat/route.ts`, prompt engineering, anti-slop filter, action metadata schema, và giao thức server-client.  
> **Thời gian thực hiện**: 2026-10-14  

---

## 1. Tóm tắt & Bối cảnh Khảo sát

Mục tiêu của Requirement R2 là tái cấu trúc toàn diện pipeline xử lý AI tại `app/api/chat/route.ts` nhằm giải quyết dứt điểm hiện tượng **"AI Slop"** (văn phong sáo rỗng, mở bài rườm rà, nịnh nọt, kết bài tóm tắt thừa thãi), đồng thời thiết lập cơ chế **"Direct Answer First"** (câu đầu tiên trả lời thẳng vào trọng tâm trong <20 từ) và phát sinh **Structured Action Metadata** phục vụ cho Generative Action Chips ở giao diện (Requirement R3).

Khảo sát này cung cấp thiết kế kiến trúc toàn diện gồm:
1. **Phân tích hiện trạng pipeline chat** tại `app/api/chat/route.ts` và các thành phần phụ thuộc (`lib/ai/*`).
2. **Anti-Slop Prompt Engineering Blueprint**: Thiết kế lại persona, quy tắc ràng buộc, và few-shot examples để ép LLM tuân thủ tuyệt đối quy tắc Direct Answer First.
3. **Bộ từ vựng & Pattern Catalog Anti-Slop**: Danh mục phân loại các mẫu câu mở đầu (throat-clearing), lời khen sáo rỗng (sycophancy), từ đệm (fillers), và đoạn kết tóm tắt (recap kickers) bằng cả tiếng Việt và tiếng Anh.
4. **Deterministic Anti-Slop Stream Transformer**: Bộ lọc làm sạch luồng trực tiếp trên server để đảm bảo 100% tuân thủ ngay cả khi model vi phạm.
5. **Đặc tả Action Metadata & Entity Catalog**: Chuẩn hóa cú pháp payload hành động `[[action:type|id|label]]` và bảng tra cứu thực thể (Kamala, Zelene Spa, Smartbit, JAVIS, Roadmap Layers, Contact).
6. **Hợp đồng giao tiếp (Interface Contract)** giữa Server và Client, đảm bảo tương thích ngược 100% với hệ thống test hiện hữu và các client chat.

---

## 2. Phân tích Hiện trạng `app/api/chat/route.ts` & Chat Pipeline

### 2.1 Luồng Xử lý Hiện tại (Execution Trace)
Pipeline trong `app/api/chat/route.ts` đang hoạt động theo các bước tuần tự sau:
1. **Rate Limiting (`lib/rate-limit.ts`)**: Giới hạn 20 request / 5 phút trên mỗi IP.
2. **Payload Validation**: Kiểm tra `message` (tối đa 1000 ký tự), lọc `history` (tối đa 6 turns, mỗi turn cắt tối đa 2000 ký tự), kiểm tra `sessionId`.
3. **Langfuse Tracing Setup (`@langfuse/tracing`)**: Khởi tạo span gốc `CHAT_TRACE_NAME = "chat"`, chuẩn bị headers `X-Trace-Id` và kích hoạt `after(flushLangfuse)`.
4. **Response Caching (`lib/ai/response-cache.ts`)**: Truy vấn cache cho các câu hỏi độc lập (không có history và không chứa PII). Nếu trúng cache, stream trực tiếp text đã lưu.
5. **Query Rewrite (`lib/ai/rag-engine.ts`)**: Khi có history, gọi LLM để viết lại câu hỏi follow-up thành câu hỏi độc lập (ví dụ "dự án đó dùng stack gì?" $\rightarrow$ "Dự án Zelene dùng stack gì?").
6. **Hybrid Retrieval (`lib/ai/rag-engine.ts`)**:
   - Tạo vector embedding cho query qua `DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"` (768 chiều).
   - Chạy hàm `findRelevantChunks` kết hợp điểm vector (trọng số 0.75) và keyword match (trọng số 0.25), lọc theo ngưỡng `MIN_VECTOR_SCORE = 0.6` và lấy top 4 chunks (`RETRIEVAL_TOP_K = 4`).
   - Xây dựng `ragContext` dạng Markdown thô.
7. **System Prompt Assembly** (Dòng 253 - 277): Ghép persona và RAG context vào chuỗi prompt tĩnh.
8. **LLM Generation with Fallback (`lib/ai/resilient-llm.ts`)**:
   - Gọi `generateStreamWithFallback` theo chuỗi model: `gemini-2.5-flash` $\rightarrow$ `gemini-2.5-flash-lite`.
   - Nhiệt độ cấu hình: `temperature: 0.3`, `topP: 0.9`, `maxOutputTokens: 1000`.
9. **Streaming Transmission**: Trả về `ReadableStream` phát raw chunks text (`TextEncoder.encode(chunk.text)`), Content-Type: `text/plain; charset=utf-8`.

### 2.2 Các Khiếm Khuyết Gây Ra "AI Slop" Trong Code Hiện Tại

| Vị trí | Đoạn code hiện tại | Hậu quả gây ra Slop |
|---|---|---|
| `app/api/chat/route.ts:256` | `1. Tự nhiên & Thân thiện: Nói chuyện như một kỹ sư công nghệ cởi mở, tự tin, nhiệt tình và khiêm tốn.` | Khái niệm "nhiệt tình" khiến LLM thường xuyên tự ý thêm các câu chào mời, nịnh nọt, ví dụ: *"Tuyệt vời! Rất vui được hỗ trợ bạn..."* |
| `app/api/chat/route.ts:259` | `HÃY NÓI TRỰC TIẾP: "Chào bạn! Về mảng mobile thì Cris có kinh nghiệm phát triển..."` | **Đây là nguyên nhân chính**: Prompt mẫu lại dùng chính câu mở đầu *"Chào bạn!"* làm ví dụ chuẩn, khiến model luôn bắt chước và phát sinh câu chào đầu dòng! |
| `app/api/chat/route.ts:264` | `4. Cởi mở & Hướng đến hành động: Gợi ý người dùng xem thêm chi tiết ở mục Projects trên trang web hoặc kết nối qua Zalo / LinkedIn / tải CV.` | Khiến model luôn lặp lại đoạn văn kết bài sáo rỗng ở cuối mọi câu trả lời (summary kickers): *"Hy vọng thông tin này giúp ích cho bạn. Đừng ngần ngại liên hệ với Cris nhé!"* |
| `app/api/chat/route.ts:151, 407` | Chuỗi fallback hardcoded: `Xin chào! Hiện tại chưa cấu hình GEMINI_API_KEY...` / `Chào bạn! Cris AI đang tạm quá tải...` | Fallback hệ thống cũng chứa sẵn throat-clearing openers. |
| Toàn bộ stream pipeline | Luồng raw streaming không có lớp kiểm duyệt/lọc tokens đầu và cuối. | Nếu LLM phát sinh câu chào hoặc lời kết sáo rỗng, toàn bộ ký tự rác đó bị bắn thẳng xuống UI của người dùng. |

---

## 3. Anti-Slop Prompt Engineering: Quy Tắc "Direct Answer First"

### 3.1 Quy Tắc Cốt Lõi: Direct Answer First (<20 Từ)
Quy tắc **Direct Answer First** yêu cầu:
1. **Câu đầu tiên (Sentence 1)** của phản hồi **BẮT BUỘC** phải là câu trả lời trực diện, chứa sự thật cụ thể, số liệu định lượng hoặc kết quả xác định.
2. **Độ dài câu đầu tiên**: Tối đa **20 từ** (không tính markdown formatting tags).
3. **Tuyệt đối cấm**:
   - Không câu chào ("Chào bạn", "Hello", "Xin chào").
   - Không lời cảm ơn hoặc khen ngợi ("Tuyệt vời", "Câu hỏi rất hay", "Cảm ơn bạn").
   - Không rào trước đón sau ("Về câu hỏi của bạn", "Đối với vấn đề này", "Tôi xin được trả lời").
   - Không lặp lại nguyên văn câu hỏi của người dùng.

### 3.2 Bảng So Sánh Mẫu Phản Hồi: AI Slop vs. Direct Answer First

| Câu hỏi người dùng | ❌ Phản hồi AI Slop (Bị cấm) | ✅ Phản hồi Direct Answer First (Chuẩn) |
|---|---|---|
| **"Cris có kinh nghiệm gì về Next.js & React?"** | *"Chào bạn! Rất vui được chia sẻ với bạn về kinh nghiệm của Cris. Về Next.js và React, Cris là một kỹ sư frontend với hơn 5 năm kinh nghiệm thực chiến dày dặn..."* (35 từ dạo đầu rườm rà) | **"Cris có hơn 5 năm xây dựng web và mobile production với Next.js, React và TypeScript."** (15 từ, vào thẳng số liệu) |
| **"Dự án nổi bật nhất của Cris gần đây?"** | *"Tuyệt vời! Cảm ơn bạn đã quan tâm. Cris đã tham gia rất nhiều dự án ấn tượng, trong đó nổi bật nhất có thể kể đến dự án Kamala..."* | **"Dự án tiêu biểu gần đây là Kamala Jewelry & Tour Platform và Zelene Head Spa Booking."** (15 từ, nêu ngay tên dự án) |
| **"Cris làm việc ở Kamala bao lâu?"** | *"Chào bạn nhé! Theo hồ sơ kinh nghiệm làm việc của Cris, anh ấy đã gắn bó tại công ty Kamala trong khoảng thời gian..."* | **"Cris làm việc tại Kamala 1 năm 6 tháng, từ tháng 1/2023 đến tháng 6/2024."** (14 từ, nêu chính xác mốc thời gian) |
| **"Cris có nhận làm Freelance không?"** | *"Chào bạn! Rất cảm ơn bạn đã có nhã ý muốn hợp tác. Cris hoàn toàn sẵn sàng nhận các dự án freelance..."* | **"Có, Cris nhận các dự án Freelance và Remote về frontend architecture, Next.js và React."** (14 từ, khẳng định dứt khoát) |
| **"Liên hệ Cris qua Zalo thế nào?"** | *"Chào bạn, bạn có thể dễ dàng kết nối với Cris qua Zalo bằng cách nhấn vào nút liên hệ ở cuối trang nhé..."* | **"Bạn có thể kết nối Zalo trực tiếp qua số liên hệ hoặc nút Connect Zalo ở cuối trang."** (18 từ) |

### 3.3 Thiết Kế Prompt Thay Thế Cho `app/api/chat/route.ts`

```typescript
export const ANTI_SLOP_SYSTEM_PROMPT = `
Bạn là **Cris AI** — đại diện kỹ thuật số (Digital Twin) của **Cris Nguyen** (Senior Frontend Engineer với hơn 5 năm kinh nghiệm chuyên sâu về Next.js, React, TypeScript).

### ⚡ QUY TẮC BẮT BUỘC SỐ 1: DIRECT ANSWER FIRST (< 20 TỪ)
- Câu đầu tiên PHẢI là câu trả lời trực diện, nêu ngay dữ kiện, con số hoặc câu trả lời có/không.
- Câu đầu tiên KHÔNG ĐƯỢC vượt quá 20 từ.
- TUYỆT ĐỐI KHÔNG mở đầu bằng lời chào ("Chào bạn", "Xin chào", "Hello"), lời cảm ơn, lời khen ("Tuyệt vời", "Câu hỏi hay") hoặc câu dẫn ("Về vấn đề này", "Để trả lời câu hỏi").

### 🚫 DANH SÁCH BỊ CẤM HOÀN TOÀN (ANTI-SLOP RULES):
1. **CẤM Throat-clearing openers**: "Chào bạn", "Xin chào", "Rất vui được hỗ trợ", "Cảm ơn câu hỏi", "Về câu hỏi của bạn", "Dưới đây là thông tin".
2. **CẤM Sycophantic praise**: "Tuyệt vời!", "Câu hỏi rất hay!", "Thật thú vị!", "Ý kiến rất sáng suốt!".
3. **CẤM Robotic meta-discourse**: "Dựa vào tài liệu được cung cấp", "Theo dữ liệu của tôi", "Trong ngữ cảnh trên", "Là một mô hình AI".
4. **CẤM Summary-recap kickers ở cuối bài**: "Tóm lại...", "Tổng kết lại...", "Nhìn chung...", "Hy vọng câu trả lời này giúp ích cho bạn!", "Nếu bạn có thắc mắc gì đừng ngần ngại hỏi nhé!", "Chúc bạn một ngày tốt lành!". Hãy dừng câu trả lời ngay khi hết ý kỹ thuật.
5. **CẤM Banned buzzwords**: "tận dụng tối đa", "đột phá", "tiên tiến nhất", "toàn diện", "đóng vai trò then chốt", "delve", "leverage", "streamline", "robust", "game-changer".

### 🎯 PHÁT SINH ACTION CHIPS CHO GIAO DIỆN:
Khi câu trả lời đề cập đến dự án, tầng kiến thức lộ trình, hoặc kênh liên hệ, BẮT BUỘC chèn thẻ Action theo cú pháp:
- Dự án:
  • Kamala: \`[[action:project|kamala-commerce-tour|Kamala Jewelry & Tour]]\`
  • Zelene Spa: \`[[action:project|zelene-spa-booking|Zelene Head Spa]]\`
  • Smartbit: \`[[action:project|smartbit-saas-platform|Smartbit SaaS Platform]]\`
  • JAVIS: \`[[action:project|javis-3d-tile-simulation|JAVIS 3D Simulation]]\`
- Tầng lộ trình (Roadmap Layers):
  • Tầng 1: \`[[action:roadmap|layer-01|Tầng 01: Knowledge Base]]\`
  • Tầng 2: \`[[action:roadmap|layer-02|Tầng 02: LLM Application]]\`
  • Tầng 3: \`[[action:roadmap|layer-03|Tầng 03: RAG + Agent]]\`
  • Tầng 4: \`[[action:roadmap|layer-04|Tầng 04: LLMOps]]\`
  • Tầng 5: \`[[action:roadmap|layer-05|Tầng 05: Production Deployment]]\`
- Kênh liên hệ:
  • Zalo: \`[[action:contact|zalo|Kết nối Zalo]]\`
  • GitHub: \`[[action:contact|github|GitHub @crisne]]\`
  • Tải CV: \`[[action:contact|cv|Tải CV (PDF)]]\`
  • Mục liên hệ: \`[[action:contact|contact|Mục Liên hệ]]\`

### 🔒 NGUYÊN TẮC DỮ KIỆN (GROUNDING):
- Mọi dữ kiện chỉ lấy từ phần THÔNG TIN bên dưới. Không suy đoán, không bịa thêm.
- Nếu không có thông tin: Trả lời ngắn gọn ngay câu đầu rằng Cris chưa có thông tin về vấn đề này và gợi ý hỏi về dự án, kỹ năng của Cris.

---
### 📚 [THÔNG TIN THỰC TẾ]:
{RAG_CONTEXT}
`.trim();
```

---

## 4. Danh Mục Anti-Slop Pattern & Bộ Lọc Stream Hai Lớp (Dual-Defense Filter)

Dù prompt engineering rất hiệu quả, các mô hình ngôn ngữ lớn (như Gemini Flash) đôi khi vẫn bị "trượt" do dữ liệu huấn luyện RLHF có xu hướng lịch sự thái quá. Do đó, cần áp dụng mô hình **Dual-Defense** (Phòng ngự 2 lớp):
- **Lớp 1 (Generative)**: Khống chế hành vi sinh bằng System Prompt + Few-shot.
- **Lớp 2 (Deterministic)**: Bộ lọc Regex & Buffer Stream trên Server loại bỏ triệt để opener ở đầu stream và kicker ở cuối stream.

### 4.1 Danh Mục Chi Tiết Các Mẫu Câu Bị Cấm (Pattern Catalog)

#### Nhóm 1: Throat-Clearing Openers (Mở đầu rườm rà)
```typescript
export const THROAT_CLEARING_OPENERS = [
  // Tiếng Việt
  /^(?:xin\s+)?chào\s+(?:bạn|anh|chị|em|quý\s+khách)(?:\s+nhé|\s+nha|\s+ạ)?[\s,!\.-]*/i,
  /^hello(?:\s+there)?[\s,!\.-]*/i,
  /^hi(?:\s+there)?[\s,!\.-]*/i,
  /^rất\s+vui\s+(?:được\s+)?(?:gặp|hỗ\s+trợ|chia\s+sẻ\s+với)\s+(?:bạn|anh|chị)[\s,!\.-]*/i,
  /^cảm\s+ơn\s+(?:bạn\s+)?đã\s+(?:đặt\s+)?câu\s+hỏi[\s,!\.-]*/i,
  /^về\s+(?:câu\s+hỏi|thắc\s+mắc|vấn\s+đề)\s+của\s+bạn[\s,!\.-]*/i,
  /^để\s+trả\s+lời\s+câu\s+hỏi\s+này[\s,!\.-]*/i,
  /^dưới\s+đây\s+là\s+(?:câu\s+trả\s+lời|thông\s+tin)[\s,!\.-]*/i,
  // Tiếng Anh
  /^(?:hello|hi|greetings)(?:\s+there)?[\s,!\.-]*/i,
  /^great\s+question[\s,!\.-]*/i,
  /^thanks\s+for\s+(?:asking|reaching\s+out)[\s,!\.-]*/i,
  /^i(?:'d|\s+would)\s+be\s+happy\s+to\s+help[\s,!\.-]*/i,
  /^regarding\s+your\s+question[\s,!\.-]*/i,
  /^to\s+answer\s+your\s+question[\s,!\.-]*/i,
];
```

#### Nhóm 2: Sycophantic Praise (Khen ngợi nịnh nọt)
```typescript
export const SYCOPHANTIC_PRAISE = [
  /^(?:thật\s+|rất\s+)?tuyệt\s+vời[\s,!\.-]*/i,
  /^câu\s+hỏi\s+(?:rất\s+)?(?:hay|thú\s+vị|tuyệt\s+vời)[\s,!\.-]*/i,
  /^bạn\s+hỏi\s+(?:rất\s+)?đúng\s+trọng\s+tâm[\s,!\.-]*/i,
  /^awesome\s+question[\s,!\.-]*/i,
  /^excellent\s+question[\s,!\.-]*/i,
];
```

#### Nhóm 3: Robotic Meta-Discourse (Dẫn nhập máy móc)
```typescript
export const ROBOTIC_META_DISCOURSE = [
  /^(?:dựa\s+vào|theo)\s+(?:tài\s+liệu|thông\s+tin|dữ\s+liệu)\s+(?:được\s+cung\s+cấp|ở\s+trên)[\s,!\.-]*/i,
  /^trong\s+ngữ\s+cảnh\s+(?:trên|này)[\s,!\.-]*/i,
  /^như\s+đã\s+nêu\s+ở\s+trên[\s,!\.-]*/i,
  /^based\s+on\s+the\s+provided\s+(?:context|documents)[\s,!\.-]*/i,
  /^according\s+to\s+the\s+information[\s,!\.-]*/i,
];
```

#### Nhóm 4: Summary-Recap Kickers (Đoạn kết tóm tắt sáo rỗng)
```typescript
export const SUMMARY_RECAP_KICKERS = [
  /(?:\n\s*)*(?:tóm\s+lại|nói\s+tóm\s+lại|tổng\s+kết\s+lại|nhìn\s+chung)[\s:,].*$/is,
  /(?:\n\s*)*hy\s+vọng\s+(?:những\s+)?(?:thông\s+tin|câu\s+trả\s+lời)\s+(?:trên|này)\s+(?:sẽ\s+)?(?:hữu\s+ích|giúp\s+ích).*$/is,
  /(?:\n\s*)*(?:nếu\s+)?(?:bạn\s+)?(?:có\s+thêm\s+câu\s+hỏi|cần\s+thêm\s+thông\s+tin|muốn\s+tìm\s+hiểu\s+thêm)[^.\n]*đừng\s+ngần\s+ngại.*$/is,
  /(?:\n\s*)*chúc\s+bạn\s+một\s+ngày.*$/is,
  /(?:\n\s*)*(?:in\s+conclusion|in\s+summary|to\s+sum\s+up|overall|ultimately)[\s:,].*$/is,
  /(?:\n\s*)*hope\s+this\s+helps.*$/is,
  /(?:\n\s*)*(?:feel\s+free\s+to|don't\s+hesitate\s+to)\s+(?:ask|reach\s+out).*$/is,
];
```

### 4.2 Thiết Kế `AntiSlopStreamTransformer` Cho Server

Để đảm bảo hiệu năng cao và độ trễ thấp (low TTFT - Time To First Token):
1. **Head Buffer**: Buffer khoảng 40–80 ký tự đầu tiên cho đến khi gặp dấu ngắt câu (`.`, `!`, `?`, `\n`) hoặc đủ độ dài nhận diện. Chạy regex xóa sạch các mẫu Opener và Praise. Sau khi xử lý câu đầu, chuyển stream sang chế độ pass-through trực tiếp không gây trễ.
2. **Tail Stripper**: Khi stream chuẩn bị kết thúc (`finally` hoặc hoàn tất loop), kiểm tra đoạn đuôi văn bản và loại bỏ các đoạn văn tóm tắt thừa thãi nếu có.

```typescript
export function createAntiSlopTransformStream() {
  let isHeadCleaned = false;
  let headBuffer = "";
  const HEAD_THRESHOLD = 80;

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      if (!isHeadCleaned) {
        headBuffer += chunk;
        // Kiểm tra xem đã đủ một câu hoặc vượt ngưỡng buffer
        const hasSentenceEnd = /[.!\?\n]/.test(headBuffer);
        if (hasSentenceEnd || headBuffer.length >= HEAD_THRESHOLD) {
          let cleanedHead = headBuffer;
          // Áp dụng bộ lọc openers & praise
          for (const pattern of [...THROAT_CLEARING_OPENERS, ...SYCOPHANTIC_PRAISE, ...ROBOTIC_META_DISCOURSE]) {
            cleanedHead = cleanedHead.replace(pattern, "");
          }
          // Viết hoa chữ cái đầu tiên nếu bị biến thành chữ thường sau khi cắt
          cleanedHead = cleanedHead.trimStart();
          if (cleanedHead.length > 0) {
            cleanedHead = cleanedHead.charAt(0).toUpperCase() + cleanedHead.slice(1);
          }
          controller.enqueue(cleanedHead);
          isHeadCleaned = true;
          headBuffer = "";
        }
      } else {
        controller.enqueue(chunk);
      }
    },
    flush(controller) {
      if (!isHeadCleaned && headBuffer.length > 0) {
        let cleanedHead = headBuffer;
        for (const pattern of [...THROAT_CLEARING_OPENERS, ...SYCOPHANTIC_PRAISE]) {
          cleanedHead = cleanedHead.replace(pattern, "");
        }
        controller.enqueue(cleanedHead.trimStart());
      }
    },
  });
}
```

---

## 5. Thiết Kế Action Metadata Schema & Entity Catalog

### 5.1 Cú pháp Payload: Embedded Action Tag `[[action:type|id|label]]`

Để đáp ứng Requirement R2 và chuẩn bị cho Requirement R3:
- Cú pháp đề xuất: `[[action:type|id|label]]`
- **Lý do lựa chọn định dạng này**:
  1. **Không phá vỡ định dạng stream văn bản**: Trả về trực tiếp qua `text/plain` hoặc `text/event-stream`, không làm thay đổi header hay cấu trúc response của Next.js route hiện hữu.
  2. **An toàn Markdown**: Cú pháp `[[action:...]]` không bị đụng độ với link `[title](url)` hay wikilink chuẩn, dễ dàng match bằng 1 biểu thức chính quy duy nhất.
  3. **Linh hoạt trong hiển thị**: Client có thể chọn hiển thị Action Chip ngay tại vị trí inline trong câu văn, hoặc tách riêng toàn bộ chips ra khỏi văn bản và hiển thị thành danh sách nút bấm tương tác bên dưới bong bóng chat.
  4. **Khả năng phục hồi (Degradation)**: Nếu client cũ chưa hỗ trợ render chip, chỉ cần regex replace bỏ `[[action:...]]` hoặc hiển thị text nhãn `label`.

### 5.2 TypeScript Interface Cho Action Chips

```typescript
export type ActionChipType = "project" | "roadmap" | "contact" | "command";

export interface BaseActionChipData {
  type: ActionChipType;
  id: string;
  label: string;
  icon?: string;
}

export interface ProjectActionChipData extends BaseActionChipData {
  type: "project";
  id: "kamala-commerce-tour" | "zelene-spa-booking" | "smartbit-saas-platform" | "javis-3d-tile-simulation";
  label: string;
  url?: string;
  category?: string;
}

export interface RoadmapActionChipData extends BaseActionChipData {
  type: "roadmap";
  id: "layer-01" | "layer-02" | "layer-03" | "layer-04" | "layer-05";
  label: string;
  order: number;
}

export interface ContactActionChipData extends BaseActionChipData {
  type: "contact";
  id: "zalo" | "github" | "cv" | "contact";
  label: string;
  href: string;
}

export interface CommandActionChipData extends BaseActionChipData {
  type: "command";
  id: string;
  label: string;
  commandText: string;
}

export type ActionChipPayload =
  | ProjectActionChipData
  | RoadmapActionChipData
  | ContactActionChipData
  | CommandActionChipData;
```

### 5.3 Bảng Tra Cứu Thực Thể Toàn Dự Án (Authoritative Entity Catalog)

| Phân loại | Entity ID | Display Label | Từ khóa kích hoạt (Triggers) | Hành động khi Click (R3) |
|---|---|---|---|---|
| **Project** | `kamala-commerce-tour` | Kamala Jewelry & Tour | `Kamala`, `Kamala Jewelry`, `Tour Kamala`, `kamala.vn` | Mở `ProjectDetailModal` chi tiết dự án Kamala |
| **Project** | `zelene-spa-booking` | Zelene Head Spa Booking | `Zelene`, `Zelene Spa`, `Head Spa`, `zelenespa.com` | Mở `ProjectDetailModal` chi tiết dự án Zelene |
| **Project** | `smartbit-saas-platform` | Smartbit SaaS Platform | `Smartbit`, `Smartbit Technology`, `Multi-tenant` | Mở `ProjectDetailModal` chi tiết dự án Smartbit |
| **Project** | `javis-3d-tile-simulation` | JAVIS 3D Simulation | `JAVIS`, `JAVIS 3D`, `Tile Pattern Simulation`, `Unity` | Mở `ProjectDetailModal` chi tiết dự án JAVIS |
| **Roadmap** | `layer-01` | 01. Tầng Dữ liệu & Tri thức | `tầng 1`, `layer 1`, `layer-01`, `knowledge base`, `tri thức` | Cuộn tới layer-01 hoặc mở layer trên Roadmap Canvas |
| **Roadmap** | `layer-02` | 02. Tầng LLM Application | `tầng 2`, `layer 2`, `layer-02`, `prompt engineering`, `llm` | Cuộn tới layer-02 hoặc mở layer trên Roadmap Canvas |
| **Roadmap** | `layer-03` | 03. Tầng RAG + Agent | `tầng 3`, `layer 3`, `layer-03`, `vector db`, `agent`, `mcp` | Cuộn tới layer-03 hoặc mở layer trên Roadmap Canvas |
| **Roadmap** | `layer-04` | 04. Tầng Ops & Đánh giá | `tầng 4`, `layer 4`, `layer-04`, `llmops`, `eval`, `ttft` | Cuộn tới layer-04 hoặc mở layer trên Roadmap Canvas |
| **Roadmap** | `layer-05` | 05. Tầng Sản phẩm Production | `tầng 5`, `layer 5`, `layer-05`, `circuit breaker`, `production` | Cuộn tới layer-05 hoặc mở layer trên Roadmap Canvas |
| **Contact** | `zalo` | Kết nối Zalo | `zalo`, `nhắn zalo`, `liên hệ zalo` | Mở link Zalo (`https://zalo.me`) trong tab mới |
| **Contact** | `github` | GitHub @crisne | `github`, `source code`, `repo` | Mở `https://github.com/crisne` trong tab mới |
| **Contact** | `cv` | Tải CV (PDF) | `cv`, `hồ sơ`, `resume`, `tải cv` | Mở/Tải trực tiếp file `/cris-nguyen-cv.pdf` |
| **Contact** | `contact` | Mục Liên hệ | `liên hệ`, `contact`, `hợp tác` | Cuộn màn hình tới `#contact` section |

### 5.4 Cơ Chế Server-Side Entity Injection Fallback (Lưới An Toàn)
Nếu LLM trong quá trình sinh phản hồi quên chèn thẻ `[[action:...]]` dù trong bài viết có đề cập rõ tên dự án như "Kamala" hay "Zelene Spa", Server-side post processor sẽ tự động quét danh sách từ khóa thực thể và bổ sung thẻ tương ứng vào cuối phản hồi trước khi gửi về client. Điều này đảm bảo giao diện luôn hiển thị Action Chips 100% tin cậy.

---

## 6. Hợp Đồng Giao Tiếp (Interface Contract) Server - Client

### 6.1 Giao thức Wire Protocol
- **Endpoint**: `POST /api/chat`
- **Request Body**:
  ```json
  {
    "message": "Dự án gần đây nhất của Cris là gì?",
    "history": [],
    "sessionId": "b47e24a8-6df7-4b71-b0e2-6366fb8da001"
  }
  ```
- **Response Headers**:
  - `Content-Type: text/plain; charset=utf-8`
  - `Cache-Control: no-cache`
  - `X-Trace-Id: [hex 32 ký tự]`
- **Response Stream Content**:
  ```markdown
  Dự án tiêu biểu gần đây là Kamala Jewelry & Tour Platform và Zelene Head Spa Booking. [[action:project|kamala-commerce-tour|Kamala Jewelry & Tour]] [[action:project|zelene-spa-booking|Zelene Head Spa]]

  - **Kamala**: Nền tảng thương mại điện tử kết hợp cổng nội dung và đặt tour, phát triển bằng Next.js, Mantine UI và React Native Expo.
  - **Zelene**: Hệ sinh thái đặt lịch spa tại Mỹ tích hợp thanh toán Clover và app mobile.
  ```

### 6.2 Client-Side Parsing Logic (Dành Cho R3)
Client phía UI (trong `FloatingChatBot` và `RoadmapAssistantChatbot`) sẽ dùng hàm phân tách sau:
```typescript
const ACTION_TAG_REGEX = /\[\[action:(project|roadmap|contact|command)\|([^|\]]+)\|([^\]]+)\]\]/g;

export interface ParsedMessage {
  cleanContent: string;
  actionChips: ActionChipPayload[];
}

export function parseMessageContentAndActions(rawText: string): ParsedMessage {
  const chips: ActionChipPayload[] = [];
  const cleanContent = rawText.replace(ACTION_TAG_REGEX, (_, type, id, label) => {
    chips.push(resolveActionChip(type, id, label));
    return ""; // Tách chip ra khỏi văn bản hiển thị
  }).trim();

  return { cleanContent, actionChips: chips };
}
```

---

## 7. Danh Mục File Bị Tác Động & Phụ Thuộc (Affected Files & Dependencies)

### 7.1 Bảng Phân Tích Tác Động Chi Tiết

| Đường dẫn File | Loại thay đổi | Lý do & Nội dung thay đổi | Mức độ rủi ro |
|---|---|---|---|
| `app/api/chat/route.ts` | Sửa đổi | Cập nhật system prompt anti-slop; tích hợp `createAntiSlopTransformStream`; cập nhật chuỗi fallback tự nhiên không có từ mở đầu; hỗ trợ action metadata. | Trung bình |
| `lib/ai/chat-config.ts` | Bổ sung hằng số | Khai báo hằng số `MAX_DIRECT_ANSWER_WORDS = 20`, danh sách regex anti-slop, danh sách action types. | Thấp |
| `lib/ai/anti-slop.ts` (Tạo mới) | Module mới | Chứa `AntiSlopStreamTransformer`, catalog patterns cấm, hàm làm sạch head/tail của stream. | Thấp (Cô lập) |
| `lib/ai/action-chips.ts` (Tạo mới) | Module mới | Chứa schema TypeScript, Entity Catalog, và hàm inject/parse action tags. | Thấp (Cô lập) |
| `tests/route/chat-route.test.ts` | Cập nhật tests | Điều chỉnh mock data của fake LLM để tuân thủ Direct Answer First; thêm test suites kiểm tra Direct Answer First, loại bỏ openers/praise/kickers, và kiểm tra sinh action chips. | Trung bình |

### 7.2 Tuân Thủ Quy Định Dự Án (Project Rules Compliance)
1. **TypeScript 5.9 Strict**: Toàn bộ interface mới và hàm tiện ích đều định kiểu rõ ràng, không dùng `any`.
2. **Không Server Code trong Client**: Các logic lọc stream và system prompt nằm trọn vẹn ở `lib/ai/` và `app/api/chat/`, chỉ export types và parser thuần túy cho client components.
3. **No Console Logs**: Không để lại console log debug khi commit.
4. **Không Thay Đổi Logic Hybrid Search**: Giữ nguyên cơ chế hybrid vector + keyword scoring trong `lib/ai/rag-engine.ts` để bảo toàn kết quả của `scripts/eval-retrieval.ts`.

---

## 8. Kế Hoạch Kiểm Thử & Xác Minh Độc Lập (Verification Plan)

### 8.1 Test Cases Cần Bổ Sung Vào `tests/route/chat-route.test.ts`
1. **Direct Answer First Enforcement**:
   - Truy vấn câu hỏi về kinh nghiệm $\rightarrow$ Xác minh câu đầu tiên $\le 20$ từ và không chứa từ chào hỏi.
2. **Strip Openers & Praise**:
   - Giả lập LLM trả về: `"Chào bạn! Rất vui được gặp bạn. Tuyệt vời! Cris có 5 năm kinh nghiệm..."` $\rightarrow$ Xác minh luồng đầu ra được làm sạch thành `"Cris có 5 năm kinh nghiệm..."`.
3. **Strip Recap Kickers**:
   - Giả lập LLM trả về câu có phần kết: `"\n\nTóm lại, nếu bạn có thắc mắc đừng ngần ngại hỏi nhé!"` $\rightarrow$ Xác minh đoạn tóm tắt bị cắt bỏ.
4. **Action Chips Emission**:
   - Truy vấn về dự án Kamala $\rightarrow$ Xác minh response stream chứa tag `[[action:project|kamala-commerce-tour|...]]`.

### 8.2 Lệnh Xác Minh Độc Lập
1. Chạy toàn bộ test suite:
   ```bash
   npm test
   ```
2. Chạy kiểm tra tĩnh TypeScript:
   ```bash
   npx tsc --noEmit
   ```
3. Chạy build kiểm thử:
   ```bash
   npm run build
   ```
