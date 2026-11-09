---
name: cris-code-intel
description: Bản đồ cấu trúc xử lý logic và công cụ tra cứu code intelligence cho workspace crisne-website. Hỗ trợ trace luồng thực thi (execution flow), tra cứu concept/domain, blast radius impact analysis, và ánh xạ API route -> service -> DB theo tư duy GitNexus. Dùng khi cần hiểu kiến trúc, giải thích cách hoạt động, lần vết lỗi hoặc kiểm tra ảnh hưởng trước khi sửa code.
---

# Cris Code Intelligence (`cris-code-intel`)

Bản đồ hóa toàn diện cấu trúc xử lý logic của workspace `crisne-website` (Next.js 15 App Router + Python FastAPI AI Microservice), theo mô hình Code Intelligence của GitNexus.

---

## ⚡ Khi nào sử dụng

- **Khám phá kiến trúc / Concept**: "Hệ thống hoạt động thế nào?", "Cơ chế phân quyền Actor hoạt động ra sao?", "Tại sao Lesson Status lại chỉ hiển thị cho Owner?"
- **Lần vết luồng thực thi (Flow Trace)**: "Luồng tạo bài học qua Abot đi qua những file nào?", "Khi user đổi trạng thái bài học thì data đi từ UI đến DB thế nào?", "Chặng nào là điểm nghẽn hoặc rủi ro?"
- **Truy vết lỗi (Debugging)**: "Lỗi 401 khi lưu bài học đến từ đâu?", "Tại sao lệnh CUD của Visitor bị chặn?", "Endpoint `/api/workflows/[id]/runs` xử lý thế nào khi lỗi node?"
- **Phân tích tầm ảnh hưởng (Impact Analysis)**: "Sửa `RoadmapItem` hay hàm `updateItemStatus` sẽ ảnh hưởng đến những flow nào?", "Blast radius rủi ro ở mức nào?"
- **Ánh xạ Route (Route Mapping)**: "Endpoint X được xử lý bởi handler nào và gọi service nào?"

---

## 🛠️ Công cụ Tra cứu CLI: `cris-intel`

Chạy từ thư mục gốc của repository:

```bash
# Cú pháp tổng quát:
npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/cris-code-intel/scripts/cris-intel.ts <command> [args]
```

### Các lệnh chính:

| Lệnh                 | Ý nghĩa                                                                | Ví dụ                                               |
| -------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| `status`             | Kiểm tra độ tươi của dataset và tóm tắt số lượng thực thể              | `... cris-intel.ts status`                          |
| `query <từ khóa>`    | Tìm kiếm processes, domains, routes, symbols liên quan đến một concept | `... cris-intel.ts query "lesson status"`           |
| `trace <flow_id>`    | Lần vết từng chặng chi tiết (UI ➔ Gateway ➔ Logic ➔ DB) với file:line  | `... cris-intel.ts trace FLOW_LESSON_STATUS_UPDATE` |
| `concept [domain]`   | Xem chi tiết kiến trúc một domain, quy ước ADRs, glossary và key files | `... cris-intel.ts concept roadmap-learning`        |
| `route-map [filter]` | Xuất bảng ánh xạ Route ➔ Handler ➔ Domain ➔ Flow kích hoạt             | `... cris-intel.ts route-map roadmaps`              |
| `impact <target>`    | Phân tích blast radius (ai gọi, flow nào dùng, mức độ rủi ro)          | `... cris-intel.ts impact RoadmapItem`              |

---

## 📋 5 Quy Trình Thao Tác (Workflows)

### 1. Concept Exploration (Khám phá Concept & Domain)

```
1. Liệt kê các domain: cris-intel concept
2. Đi sâu vào domain mục tiêu: cris-intel concept <domain_id>
3. Đối chiếu các ADR liên quan trong `docs/adr/` và thuật ngữ trong `GLOSSARY.md`
4. Kiểm tra các key files được liệt kê trong domain
```

### 2. Execution Flow Tracing (Lần vết Luồng Thực thi)

```
1. Tìm luồng liên quan: cris-intel query "<từ khóa>"
2. Chạy trace chi tiết: cris-intel trace <FLOW_ID>
3. Đọc tuần tự các Chặng (Hops) từ Layer Presentation -> Gateway -> Logic -> Persistence
4. Lưu ý các Bất biến (Invariants) và Kịch bản thất bại (Failure Modes)
5. Mở trực tiếp các file tại chặng nghi vấn để đọc implementation
```

### 3. Debugging Bug / Error (Truy vết Lỗi)

```
1. Xác định triệu chứng (mã lỗi HTTP 401, 503, lỗi router hoặc SSE stream timeout)
2. Tra cứu route hoặc flow liên quan: cris-intel query "<error/symptom>"
3. Xem vết trace để xác định chặng nào có thể ném lỗi: cris-intel trace <FLOW_ID>
4. Đối chiếu Failure Modes đã được tài liệu hóa trong dataset
```

### 4. Blast Radius Impact Analysis (Phân tích Ảnh hưởng trước khi Sửa)

```
1. Chạy phân tích trước khi chạm vào bất kỳ hàm hoặc model nào: cris-intel impact <symbol_or_model>
2. Kiểm tra danh sách callers (ai đang phụ thuộc vào nó)
3. Kiểm tra danh sách affected flows (những luồng nghiệp vụ nào sẽ bị ảnh hưởng)
4. Nếu Risk Level là 🔴 HIGH: Cảnh báo người dùng và lập kế hoạch regression testing nghiêm ngặt
```

### 5. Route Mapping (Kiểm tra Endpoint & Quyền)

```
1. Tra cứu route: cris-intel route-map <tên_route>
2. Xác minh:
   - Phương thức HTTP (GET, POST, PATCH, PUT, DELETE)
   - Yêu cầu xác thực (none, owner_only, internal_bearer)
   - Handler file và luồng logic tương ứng
```

---

## 🏢 Bảng Tra Cứu Nhanh 8 Domains & ADRs Cốt Lõi

| Domain ID                | Tên Domain                      | ADRs Quy định                    | Trọng tâm                                                                                                                  |
| ------------------------ | ------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `roadmap-learning`       | Roadmap & Learning Progression  | ADR-0008, 0009, 0010             | Topic, Section (chuỗi tự do gom bài), Lesson, Lesson Status (`target`, `learning`, `known`)                                |
| `roadmap-assistant-abot` | Roadmap Assistant (Abot AI RAG) | ADR-0001, 0002, 0003, 0004, 0006 | Python microservice, proxy `/api/roadmap-assistant`, router P0-P8, in-memory vector store Gemini 768d, CUD Preview/Confirm |
| `notes-editor`           | Notes & Lexical CMS             | N/A                              | Lexical Editor, autosave debounce, tag taxonomy, markdown serialize                                                        |
| `storage-media`          | Storage & Media Assets          | N/A                              | S3/R2 client, image upload                                                                                                 |
| `auth-security`          | Auth & Actor Model              | ADR-0002                         | NextAuth, Actor `Owner` vs `Visitor`, `requireWriteAccess`, internal Bearer token                                          |
| `observability`          | Observability & Golden Set      | ADR-0011                         | Langfuse traces, feedback scores, Golden set evals                                                                         |

---

## ⚠️ Các Bất Biến & Quy Ước Không Được Vi Phạm (Invariants)

1. **Ranh giới Actor (Owner vs Visitor)**:
   - Visitor chỉ được phép đọc và hỏi đáp (RAG). Mọi lệnh CUD đều bị chặn ở cả tầng Gateway (Next.js proxy) và tầng Intent Router (Python backend).
   - Chỉ duy nhất Owner mới có quyền thay đổi dữ liệu roadmap và ghi chú.
2. **Quy trình CUD qua Abot (Human-in-the-loop)**:
   - Không một thao tác tạo, sửa, xóa nào của Abot được ghi trực tiếp vào DB mà không thông qua thẻ Preview (`PendingAction`) và được Owner nhấn nút "Xác nhận".
3. **Quy chuẩn Lesson Status (ADR-0010)**:
   - Trạng thái bài học chỉ gồm: `target`, `learning`, `known`.
   - Phản ánh tiến trình của Owner, không phản ánh độ khó của bài học.
   - Status chỉ hiển thị cho Owner, ẩn hoàn toàn với Visitor.
4. **Mô hình Embeddings (ADR-0004)**:
   - Tất cả vector embeddings trong dự án bắt buộc sử dụng Google Gemini `text-embedding-004` (768 dimensions).
5. **Đồng bộ RAG Re-index**:
   - Khi có bất kỳ thay đổi nào về bài học trên Next.js, phải kích hoạt `after(requestRagReindex)` để Python backend tự động nạp lại dữ liệu mà không làm nghẽn response của user.
