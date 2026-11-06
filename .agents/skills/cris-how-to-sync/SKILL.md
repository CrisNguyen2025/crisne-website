---
name: cris-how-to-sync
description: Xác định và thẩm định bất kỳ target nào (tính năng, thư viện, model, route, pattern, thuật ngữ) cần add/join vào repo crisne-website có gây xung đột (conflict/confusion) hoặc hiệu ứng đồng bộ (sync effects) hay không; đưa ra kết luận NÊN / KHÔNG NÊN / CẢI THIỆN và kế hoạch đồng bộ dataset cho cris-code-intel.
---

# Cris How-To-Sync (`cris-how-to-sync`)

Quy chuẩn thẩm định kiến trúc tiền kiểm (Pre-Integration Compatibility & Sync Effect Guard) cho repository `crisne-website`. Đảm bảo mọi đề xuất bổ sung hoặc tích hợp thành phần mới vào repo đều được soi chiếu với 10 Core ADRs, `GLOSSARY.md`, ranh giới phân quyền Actor, và giữ cho Code Intelligence (`cris-code-intel`) luôn đồng bộ.

---

## ⚡ Khi nào kích hoạt Skill

Kích hoạt `cris-how-to-sync` trong các tình huống sau:
- **Trước khi lập kế hoạch (`/plan`) hoặc viết code**: Khi user hoặc issue yêu cầu thêm một tính năng mới, cài thư viện npm/python, tạo bảng DB mới, hay thêm API endpoint.
- **Khi đánh giá ý tưởng / Refactoring**: "Có nên chuyển từ SQLite sang Postgres không?", "Có nên dùng Zustand thay React state không?", "Có nên cài Pinecone để tìm kiếm vector không?"
- **Trước khi bàn giao task (`agent-handoff`)**: Lead Architect (Claude Code) hoặc Executor (Antigravity/Codex) cần kiểm tra blast radius và danh sách các điểm bắt buộc phải sync cùng commit.
- **Khi phát hiện nguy cơ lệch chuẩn**: Phát hiện code hoặc PR sử dụng các thuật ngữ lạ, đặt tên sai với `GLOSSARY.md`, hoặc gọi trực tiếp giữa các tầng mà không qua Gateway.

---

## 🛠️ Công cụ Hỗ trợ CLI: `yarn intel how-to-sync`

Chạy từ thư mục gốc của repository:

```bash
# Quét nhanh tính tương thích của Target từ câu mô tả:
yarn intel how-to-sync "<mô tả target hoặc tính năng cần thêm>"

# Ví dụ thực tế:
yarn intel how-to-sync "Thêm thư viện Pinecone để tối ưu tìm kiếm vector cho bài học"
yarn intel how-to-sync "Thêm trường metadata vào RoadmapItem và gọi hook re-index"
yarn intel how-to-sync "Tạo API route cho phép Visitor ghi chú trực tiếp vào database"
```

CLI sẽ đối chiếu tự động với:
1. Danh sách từ cấm (`_Avoid_`) trong `GLOSSARY.md`.
2. Bảng các bất biến và ranh giới hệ thống từ 10 ADRs.
3. Các Data Models, Routes và Domains hiện có trong `cris-workspace-map.json`.
4. Xuất kết quả sơ bộ và danh sách luồng bị ảnh hưởng (Affected Execution Flows).

---

## 📋 Quy Trình Thao Tác Chuẩn 4 Bước (SOP)

### Bước 1: Tiếp nhận & Phân loại Target
Xác định Target thuộc nhóm nào:
- `FEATURE`: Tính năng nghiệp vụ mới (e.g. quiz tương tác, bookmark, shareable badge).
- `DEPENDENCY_LIB`: Thư viện npm hoặc python mới (e.g. zustand, pinecone, prisma-extension).
- `MODEL_SCHEMA`: Bảng dữ liệu, quan hệ hoặc trường mới trong `prisma/schema.prisma`.
- `API_ROUTE`: Endpoint mới trên Next.js App Router hoặc FastAPI backend.
- `ARCHITECTURE_PATTERN`: Mẫu kiến trúc (caching Redis, background queue, websocket).
- `VOCABULARY_CONCEPT`: Khái niệm hoặc thuật ngữ domain mới xuất hiện trong UI/Code.

### Bước 2: Chạy Tiền kiểm Tự động (Automated Pre-flight)
Chạy lệnh CLI:
```bash
yarn intel how-to-sync "<mô tả chi tiết target>"
```
Ghi nhận kết quả sơ bộ: Có phát hiện từ cấm trong Glossary không? Có vi phạm keyword bất biến nào không? Có tác động đến Execution Flow cốt lõi nào không?

### Bước 3: Phân tích Chuyên sâu (In-depth Architectural Check)
Đối chiếu với [Cẩm nang Bất biến](./references/ARCHITECTURAL_INVARIANTS.md):
1. **Kiểm tra ADR & Invariants**:
   - Có vi phạm ranh giới AI Microservice Python (ADR-0001)?
   - Có vi phạm bảo vệ quyền ghi của Actor `Owner` (ADR-0002)?
   - Có vi phạm định dạng Vector Embeddings Gemini 768d (ADR-0004)?
   - Có vi phạm cơ chế in-memory vector search của Abot (ADR-0006)?
   - Có làm lệch cấu trúc Topic ➔ Section ➔ Lesson (ADR-0009)?
   - Có đưa giá trị tùy tiện vào Lesson Status (`target`, `learning`, `known`) (ADR-0010)?
2. **Kiểm tra Xung đột & Trùng lặp (Redundancy)**:
   - Repo đã có module giải quyết việc này chưa? (R2 client có sẵn, Lexical có sẵn, DAG executor có sẵn, NextAuth có sẵn).
3. **Xác định Ma trận Hiệu ứng Đồng bộ (Sync Effects)**:
   - Cần thay đổi cả Next.js và Python service không?
   - Cần kích hoạt hook `after(requestRagReindex)` không?
   - Cần chạy migration Turso (`yarn db:push`) và export test schema không?
   - Có biến môi trường mới cần bổ sung vào `docs/DEPLOY_ENV.md` không?
   - Cần thêm từ vựng mới vào `GLOSSARY.md` hay viết ADR mới không?

### Bước 4: Xuất Báo Cáo Quyết Định (Target Assessment Report)
Tổng hợp và đưa ra 1 trong 3 kết luận dứt khoát:
- 🟢 **NÊN (APPROVED)**: Ý tưởng phù hợp kiến trúc, không xung đột bất biến, giải quyết đúng nhu cầu. Cung cấp checklist triển khai an toàn.
- 🔴 **KHÔNG NÊN (REJECTED)**: Vi phạm bất biến cốt lõi, phá vỡ ranh giới bảo mật, hoặc duplicate nặng nề chức năng đã có. Nêu giải pháp thay thế chính quy.
- 🟡 **CẢI THIỆN / ĐIỀU CHỈNH (CONDITIONAL)**: Ý tưởng tốt nhưng cần nắn dòng: đổi tên theo Glossary, bọc qua Proxy thay vì gọi direct, bổ sung bước đồng bộ bắt buộc.

Cuối báo cáo, luôn đính kèm **Data Spec** để cập nhật dataset của `cris-code-intel`.

---

## 📝 Mẫu Báo Cáo Chuẩn (Assessment Report Template)

```markdown
# 🛡️ CRIS TARGET ASSESSMENT: [Tên Target]

- **Phân loại**: [FEATURE | DEPENDENCY_LIB | MODEL_SCHEMA | API_ROUTE | PATTERN | VOCABULARY]
- **Domain Tiếp Nhận**: [roadmap-learning | roadmap-assistant-abot | notes-editor | workflow-builder | ...]
- **KẾT LUẬN CUỐI CÙNG**: [🟢 NÊN / 🔴 KHÔNG NÊN / 🟡 CẢI THIỆN]

---

### 1. Phân Tích Xung Đột & Nhầm Lẫn (Conflict & Confusion Analysis)
- **ADRs & Invariants**: [Chi tiết các điều khoản tuân thủ hoặc vi phạm]
- **Glossary & Semantics**: [Kiểm tra từ ngữ, cảnh báo các từ thuộc danh sách _Avoid_]
- **Trùng lặp Khả năng (Redundancy)**: [Xác nhận tính cần thiết so với các module sẵn có]

### 2. Ma Trận Hiệu Ứng Đồng Bộ (Sync Effects Checklist)
- [ ] **Dual-Service Sync**: [Cần cập nhật Next.js route / Python FastAPI router]
- [ ] **RAG Re-index Sync**: [Có cần gọi after(requestRagReindex) khi mutation diễn ra]
- [ ] **Database & Migration Sync**: [Cập nhật prisma/schema.prisma, chạy db:push Turso]
- [ ] **Observability Sync**: [Khai báo Langfuse trace tags hoặc Triage queue]
- [ ] **Environment Sync**: [Bổ sung biến ENV vào docs/DEPLOY_ENV.md cho Vercel/Render]
- [ ] **Core Docs Sync**: [Bổ sung định nghĩa vào GLOSSARY.md hoặc viết ADR mới]

### 3. Kế Hoạch Đồng Bộ Code Intelligence (cris-code-intel Spec)
Cung cấp JSON spec để tích hợp vào `.agents/skills/cris-code-intel/data/cris-workspace-map.json`:
```json
{
  "newEntryPoints": [...],
  "newExecutionFlows": [...],
  "updatedDataModels": [...]
}
```
Kiểm tra lại độ tươi sau khi hoàn thành với: `yarn intel status`.
```
