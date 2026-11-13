---
task_id: "TASK-context-engineering-001"
branch: "main"
version: "3.0.0"
type: "implement"
priority: "P2"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 0

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/evals/corpus/public/roadmap/**"
    - "roadmap-rag-assistant/evals/datasets/_scope/samples.jsonl"
    - "roadmap-rag-assistant/evals/datasets/_scope/meta.json"
    - "roadmap-rag-assistant/evals/datasets/_answer/**"
    - "roadmap-rag-assistant/evals/datasets/_routing/**"
    - "roadmap-rag-assistant/evals/datasets/tags.json"
    - "roadmap-rag-assistant/rag_service/config.py"
  continues_dirty: []
  read_only_references:
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/adr/**"
    - "roadmap-rag-assistant/evals/GUIDELINES.md"
    - "roadmap-rag-assistant/evals/README.md"
    - "roadmap-rag-assistant/evals/datasets/_scope/README.md"
    - "roadmap-rag-assistant/evals/corpus_export.py"
    - "roadmap-rag-assistant/evals/scope_tune.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/scope_centroid.py"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "prisma/**"
    - "roadmap-rag-assistant/rag_service/domains/**"
    - "roadmap-rag-assistant/rag_service/core/**"
    - "roadmap-rag-assistant/sdk/**"

verification_gate:
  python_test: "cd roadmap-rag-assistant && python -m pytest -q"
  evals_validate: "cd roadmap-rag-assistant && python -m evals validate"
  knowledge_index: "yarn check:knowledge-index"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-context-engineering-001"
---

# TASK: Abot cover chủ đề Context Engineering (corpus + evals)

## 1. Context & Architectural Intent

- **Goal**: Abot trả lời được các câu hỏi về Context Engineering từ bài học của roadmap. Hiện câu hỏi kiểu này bị xếp vào `domain_gap`: Abot biết là chủ đề AI/LLM nhưng chưa có bài.
- **Why**: Kiến thức của Abot hoàn toàn lấy từ DB (Roadmap + RoadmapItem). Phạm vi được xét bằng tâm cụm embedding (`scope_centroid.py`), không có danh sách từ khóa. Vì vậy cover chủ đề mới = thêm bài học, rồi cập nhật evals để đo và giữ chất lượng.
- **Điều kiện tiên quyết (Owner làm, không phải Executor)**: các bài học ở Phụ lục A đã được tạo trong topic AI, mục `Context Engineering`. Tạo qua Abot (luồng Preview → Confirm) hoặc qua editor; cả hai tự gọi `requestRagReindex`. **Nếu chưa có các bài này trong DB thì Executor dừng và ESCALATE.**
- **Dependencies**: `evals/corpus_export.py` (export corpus), `evals/scope_tune.py` (chọn ngưỡng scope), `evals/datasets/_scope/README.md` (nhãn `roadmap` / `domain_gap` / `external` / `none`, split tune/holdout).

## 2. Invariants & Rules

- Rule dự án: `AGENTS.md`. Viết sample theo `evals/GUIDELINES.md`.
- Không sửa code retrieval/router. Nếu eval tụt mà phải sửa code mới cứu được thì ESCALATE, không tự sửa.
- Giữ tỉ lệ split: sample mới chia cho cả `split-tune` và `split-holdout`. Holdout viết bằng cách diễn đạt khác hẳn tune.
- Sample `domain_gap` cũ đang chỉ đúng các khái niệm nay đã có bài thì đổi sang `roadmap`, không xóa. Ghi lý do trong `metadata`.
- Chỉ sửa ngưỡng trong `rag_service/config.py` khi `scope_tune.py` đề xuất ngưỡng khác. Ghi số liệu trước và sau vào mục 5.
- Ngoài phạm vi: viết nội dung bài học, UI (xem TASK-abot-context-panel-001), sửa `prompts.py`.

## 3. Step-by-Step Implementation Checklist

- [ ] **Step 1**: Kiểm điều kiện tiên quyết. Liệt kê các bài thuộc mục `Context Engineering` trong DB, đối chiếu với Phụ lục A. Thiếu bài nào thì ESCALATE.
- [ ] **Step 2**: Chạy `corpus_export.py` để export lại `evals/corpus/public/roadmap/`. Diff phải chỉ có thêm/sửa các bài liên quan.
- [ ] **Step 3**: Thêm vào `_scope/samples.jsonl` khoảng 12 sample `target: roadmap` về Context Engineering (6 tune, 6 holdout), trộn tiếng Việt, tiếng Anh và câu có/không có khung câu hỏi. Thêm 3 sample `domain_gap` cho khái niệm AI gần đó nhưng chưa có bài, để giữ ranh giới.
- [ ] **Step 4**: Thêm khoảng 8 case vào `_answer`, mỗi bài trong Phụ lục A ít nhất một case, kèm ý chính câu trả lời phải có. Thêm khoảng 3 case `_routing`: một câu hỏi kiến thức, một yêu cầu "tóm tắt mục Context Engineering", một lệnh CUD vào mục đó (Owner).
- [ ] **Step 5**: Chạy `scope_tune.py` trên tune split. Ghi ngưỡng cũ/mới, accuracy tune/holdout và số `external_admitted` vào mục 5. Chỉ cập nhật `config.py` khi holdout không tệ hơn và `external_admitted` không tăng.
- [ ] **Step 6**: Chạy gate: `python -m evals validate`, `python -m pytest -q`, `yarn check:knowledge-index`.

## Phụ lục A: Mục `Context Engineering` (topic AI)

Gom 5 bài đã có vào mục này:
- Context Window
- In-Context Learning
- Model Context Protocol (MCP)
- Conversational Memory
- Prompt Caching

Bài mới, Owner viết nội dung:
1. **Context Engineering là gì**: khác prompt engineering ở chỗ nào; context là tài nguyên hữu hạn, cần chọn đúng thông tin, đúng lúc.
2. **Token Budget & phân bổ context**: system prompt, định nghĩa tool, memory, lịch sử, tài liệu truy xuất, buffer cho auto-compact. Ví dụ minh hoạ: mục Context trong menu ⋮ của Abot (TASK-abot-context-panel-001) và panel Context của Claude Code.
3. **Context Rot & Lost-in-the-Middle**: context càng dài càng giảm chất lượng; vị trí thông tin trong context ảnh hưởng tới kết quả.
4. **Compaction & tóm tắt hội thoại**: khi nào nén, giữ lại gì, cửa sổ lịch sử trượt (Abot giữ 4 lượt).
5. **Just-in-time Retrieval**: nạp dữ liệu khi cần thay vì nhồi sẵn; tool result trimming.
6. **Sub-agent & cô lập context**: chia việc để mỗi agent có context sạch, chỉ trả về kết luận.
7. **Memory file**: CLAUDE.md, AGENTS.md, memory bền giữa các phiên.
8. **Deferred Tool Loading**: chỉ nạp schema của tool khi cần, để tiết kiệm token.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [ ] `Python Test`: PENDING
- [ ] `Evals Validate`: PENDING
- [ ] `Knowledge Index`: PENDING
- [ ] `Boundary Check`: PENDING

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-context-engineering-001/result.json`
- **Scope tune (trước → sau)**: ...
- **Modified Files**:
  - `...`
