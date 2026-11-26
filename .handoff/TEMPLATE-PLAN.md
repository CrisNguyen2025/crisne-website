# PLAN: [Tên kế hoạch ngắn gọn]

- **Trạng thái:** `DRAFT` (`DRAFT` | `READY` | `IN_PROGRESS` | `COMPLETED` | `ARCHIVED`)
- **Ngày lập:** YYYY-MM-DD · **Cập nhật:** YYYY-MM-DD
- **Mốc codebase đối chiếu:** `main` @ `<commit-sha>`
- **Phạm vi liên quan:** `[roadmap-learning | roadmap-assistant-abot | knowledge-acquisition | notes-editor | storage-media | auth-security | tooling]`
- **Tài liệu liên hệ:** [`GLOSSARY.md`](../GLOSSARY.md), [`docs/README.md`](../docs/README.md), [`.handoff/BACKLOG.md`](./BACKLOG.md)

---

## 1. Mục tiêu & Ranh giới

- **Mục tiêu cốt lõi:** [1–3 câu nêu bài toán cần giải quyết và kết quả đầu ra có thể kiểm chứng]

**Làm (In-Scope):**
- [Hạng mục 1]
- [Hạng mục 2]

**Không làm (Out-of-Scope):**
- Không chạm phạm vi đang khoá trong `AGENTS.md` (ví dụ `Cris AI`).
- [Hạng mục loại trừ rõ ràng để tránh trượt phạm vi]

---

## 2. Tiến độ Batch / Spec (`Living Progress`)

> Cập nhật bảng này sau mỗi khi một `TASK-*` hoàn tất verify hoặc đổi trạng thái, để một phiên mới chỉ cần đọc đầu file là nắm được điểm tiếp tục.

| Spec | Nhánh | Nội dung | Phụ thuộc | Trạng thái |
| :--- | :--- | :--- | :--- | :--- |
| [`TASK-<slug>-001`](./specs/TASK-example-001.md) | `feat/<slug>-001` | [ Tóm tắt phạm vi batch 1 ] | — | `DRAFT` |
| [`TASK-<slug>-002`](./specs/TASK-example-002.md) | `feat/<slug>-002` | [ Tóm tắt phạm vi batch 2 ] | `001` | `DRAFT` |

---

## 3. Ma trận Đồng bộ & Xung đột (`cris-how-to-sync`)

| Kiểm tra | Trạng thái | Chi tiết / Yêu cầu đồng bộ |
| :--- | :--- | :--- |
| **ADRs & Bất biến** | `[Tuân thủ | Có điều kiện]` | [Đối chiếu `ADR-0001..0020`, quyền `Owner` vs `Visitor`] |
| **Glossary** | `[Tuân thủ]` | [Dùng đúng thuật ngữ `GLOSSARY.md`, tránh danh sách `_Avoid_`] |
| **Dual-Service / RAG** | `[Không | Bắt buộc]` | [Next.js proxy, FastAPI schema, `notifyRoadmapChanged()` / `notifyOwnerMemoryChanged()`] |
| **Database & Turso** | `[Không | Bắt buộc]` | [`prisma/schema.prisma`, `init-turso.sql`, `tests/fixtures/schema.sql`, `deploy_steps`] |
| **Code Intel & Doctor** | `[Không | Bắt buộc]` | [`cris-workspace-map.json`, `yarn intel status`, `yarn doctor --since HEAD --check`] |

---

## 4. Quyết định đã chốt (`Decision Log`)

| # | Vấn đề | Quyết định của Owner | Ngày & Căn cứ |
| :--- | :--- | :--- | :--- |
| 1 | [Câu hỏi thiết kế 1] | [Phương án đã chọn] | `YYYY-MM-DD` — [Lý do ngắn gọn / ADR liên quan] |

---

## 5. Phát hiện Thực tế & Ghi chú Verify (`Surprises & Discoveries`)

- [Chỉ ghi ngắn gọn các điểm thực tế lúc đọc code hoặc chạy verify khác với giả định ban đầu, kèm `path:line` hoặc commit. Nhật ký chạy chi tiết lưu ở spec `TASK-*` hoặc chuyển sang `docs/archive/` khi đóng plan.]
