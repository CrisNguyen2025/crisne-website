---
task_id: "TASK-abot-slug-router-001"
branch: "fix/abot-slug-router"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "codex"
max_attempts: 3
current_attempt: 2

boundaries:
  allowed_to_modify:
    - "app/api/v1/roadmaps/route.ts"
    - "tests/route/roadmap-topic-slug.test.ts"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/grounding.py"
    - "roadmap-rag-assistant/tests/test_router_policy.py"
    - "roadmap-rag-assistant/tests/test_route_traps.py"
    - "roadmap-rag-assistant/evals/router/**"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/entity_extractor.py"
    - ".handoff/specs/TASK-abot-slug-router-001.md"
  continues_dirty:
    # Lần 2 (Claude sửa): dirty vì việc Abot A (lọc "gíup tôi") đã verify, chưa commit; chỉ thêm "dieu chinh" ở danh sách động từ update
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/entity_extractor.py"
    # Lần 1 của task này, đã verify
    - "app/api/v1/roadmaps/route.ts"
    - "tests/route/roadmap-topic-slug.test.ts"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py"
    - "roadmap-rag-assistant/tests/test_router_policy.py"
    - "roadmap-rag-assistant/tests/test_route_traps.py"
  read_only_references:
    - "lib/utils.ts"
    - "lib/roadmap/duplicates.ts"
    - "tests/route/roadmap-duplicates.test.ts"
    - "docs/adr/0014*.md"
    - "GLOSSARY.md"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/commands.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/agent.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/write_gate.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/vietnamese.py"
    - "roadmap-rag-assistant/tests/test_intent_router_safety.py"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "prisma/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "roadmap-rag-assistant/pyproject.toml"
    - "roadmap-rag-assistant/requirements.txt"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/vietnamese.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/commands.py"
    - "roadmap-rag-assistant/rag_service/api/**"
    - "roadmap-rag-assistant/sdk/**"

deploy_steps: []

fast_gate: ["type_check", "route_test", "py_router_test", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  route_test: "yarn vitest run tests/route/roadmap-topic-slug.test.ts tests/route/roadmap-duplicates.test.ts"
  py_router_test: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q tests/test_router_policy.py tests/test_route_traps.py tests/test_intent_router_safety.py"
  test: "yarn test"
  py_test: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  evals_validate: "cd roadmap-rag-assistant && .venv/bin/python -m evals validate"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-abot-slug-router-001"
---

# TASK: Slug topic tiếng Việt + router hụt "điều chỉnh" và câu hỏi khả năng

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): 2026-11-19 Claude verify lần 2 = PASS. Lần 2 do Claude sửa tại chỗ: thêm "dieu chinh" vào động từ update của extractor deterministic, xoá Row `capability_no_object` không bao giờ thắng, thêm 5 câu vào `evals/router/holdout.jsonl`, thêm test kiểm câu trả lời. 5 file OUT_OF_SCOPE ở lần 1 là của Dev (việc khác), không commit chung. Chờ Dev commit.

## 1. Context & Architectural Intent
- **Nhánh gốc**: `main`. Tạo nhánh `fix/abot-slug-router` trước khi chạy `baseline.sh`. Working tree trên `main` đang có thay đổi chưa commit của việc khác (Abot A/B và UI bài học): không đụng vào, `check-boundary.sh` sẽ phân biệt bằng baseline.
- **Goal C (slug)**: topic mới tạo từ title tiếng Việt phải có slug bỏ dấu đúng. Trên prod, title `Backend gíup tôi` ra slug `backend-gup-ti` (mất `í`, `ô`).
- **Why C**: `app/api/v1/roadmaps/route.ts` (hàm `POST`, biến `baseSlug`) tự viết slug bằng `toLowerCase → bỏ [^\w\s-] → thay khoảng trắng`, không chuẩn hoá NFD nên mọi ký tự có dấu bị xoá. Hàm đúng đã có: `slugify` trong `lib/utils.ts` (xử lý `đ`, bỏ dấu), lesson đang dùng nó.
- **Goal D1**: `điều chỉnh topic X thành Y` phải vào luồng CUD và nhận câu "Abot chưa sửa được..." (`UPDATE_NOT_SUPPORTED_REPLY` trong `router/grounding.py`), giống `chỉnh sửa topic ...` đã chạy đúng. Hiện nó rơi vào `knowledge_query` và ra RAG "Thông Tin Tìm Thấy".
- **Goal D2**: câu hỏi khả năng không có "bạn" và không có object, như `Có thể Edit được k`, `Có thể xóa được không`, phải được trả lời bằng nội dung khả năng của Abot (có sẵn trong `grounding.py`), không đi RAG. Hiện ra "Roadmap chưa có bài học về **xóa**".
- **Why D**: cả hai là thiếu luật deterministic trong bảng router, tái hiện được trên thread mới không có lịch sử (không phải lỗi ngữ cảnh/LLM). Probe đã chạy: `intent=knowledge_query route=vocabulary act=statement` cho `điều chỉnh ...`; `route=scope act=question` cho `Có thể Edit được k`.
- **Dependencies**:
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py`: `CUD_VERB_WORDS` (~dòng 351), `ACTION_VERBS["update"]` (~dòng 378), `CREATE_ROADMAP` (~dòng 382), bảng `Row(...)` (~dòng 472-512, `change_request`, `change_command`).
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/grounding.py`: `UPDATE_NOT_SUPPORTED_REPLY` (~dòng 199), help reply.
  - `router/write_gate.py#gate_action`: kiểm tra động từ trong phần được khẳng định, cần `ACTION_VERBS` khớp.
  - Flow: chạy `yarn intel trace FLOW_ABOT_CUD_PREVIEW_CONFIRM` trước khi sửa `policy.py` và ghi kết quả (route FastAPI không dùng GitNexus).

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`. Python: không `any`/`type: ignore` mới, không thêm dependency.
- **Không đổi** `vietnamese.py`: `expand_teencode` chủ ý bỏ "k", không thêm "k" vào teencode. Câu `Có thể Edit được k` phải được nhận ra mà không cần mở rộng "k" (dùng pattern chịu được `k|ko|không`).
- **D1 chỉ thêm dạng có danh từ roadmap**: `điều chỉnh + (topic|bài|mục|layer|section|lộ trình|chủ đề)`, theo cách `CREATE_ROADMAP` đã làm. Không thêm `điều chỉnh` trần vào `CUD_VERB_WORDS`, vì `điều chỉnh learning rate là gì` là câu hỏi kiến thức và phải giữ `knowledge_query`. Nếu cần thêm vào `ACTION_VERBS["update"]` (để `gate_action` không chặn `ACTION_NOT_ASKED`), thêm dạng đã fold (`dieu chinh`) và chứng minh bằng test bẫy rằng câu hỏi kiến thức không bị ảnh hưởng.
- **D2 chỉ khi không có object**: `có thể tạo topic Kafka được không` vẫn phải ra preview như hiện tại (`tests/test_intent_router_safety.py::test_polite_request_shows_a_confirmation_card_instead_of_writing`). Luật mới chỉ khớp "có thể + động từ thay đổi (sửa/edit/xóa/thêm/tạo/đổi tên/điều chỉnh/...) + được không|được k|được ko" khi giữa/sau động từ không có danh từ roadmap hay tên cụ thể.
- D2 trả lời bằng hằng có sẵn trong `grounding.py` (hoặc help reply hiện có). Nếu bắt buộc thêm hằng mới thì chỉ ghép từ nội dung đã có, không bịa khả năng Abot không có: Abot tạo/xóa topic và bài, đổi tên section; sửa topic hoặc bài thì mở trang Roadmap.
- D2 không đi qua LLM, không tạo `Write` nào, `write` của route phải là `none`.
- C: giữ nguyên `isReservedTopicSlug`, `findDuplicate` và toàn bộ nhánh trả lỗi. Không đổi slug topic đã có, không đụng DB, không viết migration.
- Ngoài phạm vi: lịch sử hội thoại trong router, teencode, khả năng sửa topic qua chat, `lesson_slugs` bên Python, `entity_extractor.py`, `commands.py`, thẻ Preview.

## 3. Step-by-Step Implementation Checklist
- [x] **Step 0**: tạo nhánh `fix/abot-slug-router` từ `main`; chạy `bash .agents/skills/agent-handoff/scripts/baseline.sh TASK-abot-slug-router-001` (Dev hoặc Claude làm, không phải Executor nếu đã có `baseline.txt`).
- [x] **Step 1 (C)**: trong `app/api/v1/roadmaps/route.ts` thay khối `baseSlug` bằng `slugify(title) || \`topic-${Date.now()}\`` (import `slugify` từ `@/lib/utils`). Giữ phần còn lại.
- [x] **Step 2 (C test)**: tạo `tests/route/roadmap-topic-slug.test.ts` theo mẫu mock của `tests/route/roadmap-duplicates.test.ts`. Case: `Backend giúp tôi` → slug `backend-giup-toi`; `Mặc định` → `mac-dinh`; `Kafka Streams` → `kafka-streams` (không đổi); title toàn ký tự đặc biệt → bắt đầu bằng `topic-`. Kiểm tra giá trị `slug` truyền vào `prisma.roadmap.create`.
- [x] **Step 3 (D recon)**: chạy `yarn intel trace FLOW_ABOT_CUD_PREVIEW_CONFIRM`; đọc `policy.py`, `grounding.py`, `write_gate.py`; viết thử 6 câu ở bảng dưới vào test trước (đỏ), xác nhận đúng như probe.
- [x] **Step 4 (D1)**: trong `policy.py` thêm nhận diện `điều chỉnh + danh từ roadmap` thành lệnh thay đổi (cùng cơ chế `CREATE_ROADMAP`/`change_command`), và thêm `dieu chinh` vào `ACTION_VERBS["update"]` nếu `gate_action` cần.
- [x] **Step 5 (D2)**: trong `policy.py` thêm một `Row` hẹp cho câu hỏi khả năng không object, đặt sau `about_assistant` và trước các row `knowledge_query`; trả câu khả năng từ `grounding.py`. Ghi chú ngắn bằng tiếng Anh nói vì sao nó phải đứng trước `roadmap_content_query`.
- [x] **Step 6 (D test)**: thêm case vào `tests/test_router_policy.py` và `tests/test_route_traps.py`; nếu `evals/router/**` có dataset router thì thêm 3-4 sample tương ứng và chạy `evals validate`.
- [x] **Step 7**: chạy toàn bộ `verification_gate`, ghi kết quả vào mục 4, cập nhật `result.json` theo `references/executor.md` mục 6. Không commit.

Bảng test D (kỳ vọng sau khi sửa):

| Câu | Kỳ vọng |
|---|---|
| `điều chỉnh topic Backend thành Be` | `roadmap_cud`, trả "chưa sửa được qua chat", không gọi retrieve |
| `Có thể Edit được k` | trả câu khả năng, không gọi retrieve, `write=none` |
| `Có thể xóa được không` | như trên |
| `Có thể Edit bài học được không` | như trên (hiện ra RAG `roadmap_content_query`) |
| `điều chỉnh learning rate là gì` | vẫn `knowledge_query` (bẫy) |
| `chỉnh sửa prompt như thế nào` | vẫn `knowledge_query` (bẫy) |
| `có thể tạo topic Kafka được không` | vẫn ra preview (không đổi) |
| `bạn có thể sửa topic không` | vẫn "chưa sửa được qua chat" (không đổi) |

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Route test`: PASSED
- [x] `Py router test`: PASSED
- [x] `Test (vitest)`: PASSED
- [x] `Py test (pytest toàn bộ)`: PASSED
- [x] `Evals validate`: PASSED
- [x] `Intel Status`: PASSED
- [ ] `Boundary Check`: FAILED (theo executor.md Rule 6: 5 file OUT_OF_SCOPE do Dev sửa lúc 14:12 sau thời điểm tạo baseline 14:06)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-abot-slug-router-001/result.json`
- **Modified Files**:
  - `app/api/v1/roadmaps/route.ts`
  - `tests/route/roadmap-topic-slug.test.ts`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py`
  - `roadmap-rag-assistant/tests/test_router_policy.py`
  - `roadmap-rag-assistant/tests/test_route_traps.py`
  - `.handoff/specs/TASK-abot-slug-router-001.md`
- **Lần 2 (Claude)**: `router/entity_extractor.py` (thêm `dieu chinh`), `router/policy.py` (xoá Row thừa), `tests/test_route_traps.py` (test câu trả lời), `evals/router/holdout.jsonl` (+5 câu).
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng):
  - Test router phải kiểm cả câu trả lời của agent, không chỉ `router.decide()`: route đúng mà extractor đọc sai vẫn ra câu sai.
  - Spec cấm một file mà fix cần tới (`entity_extractor.py`) làm Executor dừng ở nửa đường; khi cấm file vì đang dirty, dùng `continues_dirty` thay vì `strictly_forbidden`.
  - `result.json` gán nguồn gốc file OUT_OF_SCOPE bằng phỏng đoán; luôn đối chiếu với `baseline.txt` và mtime trước khi tin.
