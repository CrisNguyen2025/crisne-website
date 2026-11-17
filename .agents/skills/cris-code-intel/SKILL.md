---
name: cris-code-intel
description: Lớp nghiệp vụ của code intel cho workspace crisne-website - flow nghiệp vụ (UI → API → Service → AI/DB), domain, invariant, failure mode và ADR liên quan. Dùng khi cần hiểu một luồng nghiệp vụ đi qua những đâu, giải thích cách hoạt động hoặc lần vết lỗi. Impact và route map của code dùng GitNexus, trừ route FastAPI và /api/roadmap-assistant/* (GitNexus không thấy consumer) thì dùng `yarn intel trace FLOW_ABOT_*`.
---

# Cris Code Intelligence (`cris-code-intel`)

Lớp nghiệp vụ của workspace `crisne-website` (Next.js App Router + Python FastAPI): domain, flow nghiệp vụ, invariant, failure mode. Phần cấu trúc code (ai gọi ai, blast radius, route ↔ consumer) do GitNexus lo.

---

## ⚡ Khi nào sử dụng

- **Khám phá kiến trúc / Concept**: "Cơ chế phân quyền Actor hoạt động ra sao?", "Tại sao Lesson Status chỉ hiển thị cho Owner?"
- **Lần vết luồng nghiệp vụ**: "Luồng tạo bài học qua Abot đi qua những file nào?", "Đổi trạng thái bài học thì data đi từ UI đến DB thế nào?"
- **Truy vết lỗi**: "Lỗi 401 khi lưu bài học đến từ đâu?", "Tại sao lệnh CUD của Visitor bị chặn?"

**Không dùng skill này cho impact hay route map:** dùng `gitnexus_impact`, `gitnexus_api_impact`, `gitnexus_route_map`.
**Ngoại lệ:** route FastAPI và `/api/roadmap-assistant/*`. GitNexus không nối được proxy catch-all với FastAPI, nên báo `consumers: []` và risk LOW không đáng tin. Dùng `yarn intel trace FLOW_ABOT_*`.

---

## 🛠️ CLI: `yarn intel <lệnh>`

| Lệnh               | Ý nghĩa                                                                       | Ví dụ                                       |
| ------------------ | ----------------------------------------------------------------------------- | ------------------------------------------- |
| `status`           | Kiểm file/symbol trong map và ref trong `docs/code-intel/` còn tồn tại (exit 1 nếu lệch) | `yarn intel status`                         |
| `query <từ khóa>`  | Tìm flow, domain, route, data model liên quan                                 | `yarn intel query "lesson status"`          |
| `trace <flow_id>`  | Lần vết từng chặng (UI ➔ Gateway ➔ Logic ➔ DB) kèm invariant và failure mode | `yarn intel trace FLOW_LESSON_STATUS_UPDATE` |
| `concept [domain]` | Chi tiết một domain: ADR, glossary, key files                                 | `yarn intel concept roadmap-learning`       |

Sửa map (`data/cris-workspace-map.json`) xong phải chạy `yarn intel status` tới khi báo 🟢 OK. Ref ghi dạng `path#symbol` theo tên có thật trong code, không đoán.

---

## 📋 Quy Trình Thao Tác (Workflows)

### 1. Concept Exploration (Khám phá Concept & Domain)

```
1. Liệt kê các domain: yarn intel concept
2. Đi sâu vào domain mục tiêu: yarn intel concept <domain_id>
3. Đối chiếu các ADR liên quan trong `docs/adr/` và thuật ngữ trong `GLOSSARY.md`
4. Kiểm tra các key files được liệt kê trong domain
```

### 2. Execution Flow Tracing (Lần vết Luồng Thực thi)

```
1. Tìm luồng liên quan: yarn intel query "<từ khóa>"
2. Chạy trace chi tiết: yarn intel trace <FLOW_ID>
3. Đọc tuần tự các Chặng (Hops) từ Layer Presentation -> Gateway -> Logic -> Persistence
4. Lưu ý các Bất biến (Invariants) và Kịch bản thất bại (Failure Modes)
5. Mở trực tiếp các file tại chặng nghi vấn để đọc implementation
```

### 3. Debugging Bug / Error (Truy vết Lỗi)

```
1. Xác định triệu chứng (mã lỗi HTTP 401, 503, lỗi router hoặc SSE stream timeout)
2. Tra cứu route hoặc flow liên quan: yarn intel query "<error/symptom>"
3. Xem vết trace để xác định chặng nào có thể ném lỗi: yarn intel trace <FLOW_ID>
4. Đối chiếu Failure Modes đã được tài liệu hóa trong dataset
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
