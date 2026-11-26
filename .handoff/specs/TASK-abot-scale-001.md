---
task_id: "TASK-abot-scale-001"
branch: "main"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "antigravity"
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "roadmap-rag-assistant/rag_service/core/generation/profile.py"
    - "roadmap-rag-assistant/rag_service/core/generation/pipeline.py"
    - "roadmap-rag-assistant/rag_service/core/augmentation/context.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/profile.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/prompts.py"
    - "roadmap-rag-assistant/rag_service/context_usage.py"
    - "roadmap-rag-assistant/tests/test_generation_pipeline.py"
    - "roadmap-rag-assistant/tests/test_context_usage.py"
    - "roadmap-rag-assistant/tests/test_owner_memory.py"
    - "roadmap-rag-assistant/tests/test_phase3_provenance_and_linking.py"
    - "app/api/roadmap-assistant/*/route.ts" # `*` thay cho `[...path]` vì check-boundary.sh so glob của bash
    - "tests/route/roadmap-assistant-proxy.test.ts"
  continues_dirty: [] # commit e16f1a7 đã đưa `[...path]/route.ts` và `roadmap-assistant-proxy.test.ts` lên HEAD; working tree của task này sạch
  read_only_references:
    - "AGENTS.md"
    - "GLOSSARY.md"
    - "docs/adr/0002-roadmap-assistant-access-via-proxy.md"
    - "docs/adr/0006-in-memory-vector-search.md"
    - "docs/adr/0012-owner-thread-state-in-turso.md"
    - "docs/adr/0015-abot-owner-memory.md"
    - "docs/adr/0017-owner-only-statement-provenance.md"
    - "roadmap-rag-assistant/rag_service/auth.py"
    - "roadmap-rag-assistant/rag_service/core/memory/store.py"
    - "roadmap-rag-assistant/rag_service/core/provenance.py"
    - "roadmap-rag-assistant/rag_service/core/generation/cite_channel.py"
    - "roadmap-rag-assistant/rag_service/core/generation/sources_channel.py"
    - "roadmap-rag-assistant/rag_service/core/generation/grounding.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/engine.py"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/retrieval/ingestion.py"
    - "roadmap-rag-assistant/rag_service/api/routes.py"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "prisma/**"
    - "docs/adr/**"
    - "GLOSSARY.md"
    - "AGENTS.md"
    - "roadmap-rag-assistant/pyproject.toml"
    - "roadmap-rag-assistant/requirements.txt"
    - "roadmap-rag-assistant/evals/**"
    - "roadmap-rag-assistant/rag_service/core/memory/**"
    - "roadmap-rag-assistant/rag_service/domains/roadmap/agent.py"
    - "roadmap-rag-assistant/rag_service/api/routes.py"

deploy_steps: []

fast_gate: ["type_check", "pytest", "boundary_check"]
verification_gate:
  pytest: "cd roadmap-rag-assistant && .venv/bin/python -m pytest -q"
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn lint"
  vitest: "yarn test"
  intel_status: "yarn intel status"
  doctor_delta: "yarn doctor --since HEAD --check"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-abot-scale-001"
---

# TASK: Batch A — Tối ưu Abot Instructions, Context Budget & Proxy Header Timeout

> **Trạng thái hiện tại** (cập nhật mỗi khi dừng): COMPLETED (2026-11-26) — Batch A đã qua full verification gate trên `HEAD 476eef3` (chờ `git commit`).

## 1. Context & Architectural Intent

- **Goal**: Giảm bloat và lặp lại trong `<system>` prompt của Abot (~24% empty RAG prompt / ~43.5% empty chitchat prompt đang bị chiếm bởi `PROMPT_SUGGESTION_FORMAT`), bỏ gọi lặp `format_owner_memory` mỗi lượt trả lời, căn chỉnh công thức budget trong `context_usage.py` cho khớp với trần cắt thực tế, và chuyển `chat/context` sang `SYNC_TIMEOUT_PATHS` trên proxy Next.js.
- **Why**:
  - `roadmap-rag-assistant/rag_service/core/augmentation/context.py#build_prompt` hiện nhồi vô điều kiện `PROMPT_SUGGESTION_FORMAT` (926 ký tự / ~232 token) vào cả `rag` lẫn `chitchat` trên mọi câu hỏi, lặp lại quy tắc `<owner_memory>` ở 3 chỗ (`rules_rag`, `rules_chitchat`, `memory_note`), và đưa cả quy tắc `<owner_memory>` lẫn Provenance (chỉ dành cho Owner) vào prompt của Visitor.
  - `roadmap-rag-assistant/rag_service/core/generation/pipeline.py#_build_generation_sections` (L93-103) gọi `format_owner_memory` lần thứ hai chỉ để lấy `selected_memory_ids` cho Langfuse metadata.
  - `roadmap-rag-assistant/rag_service/context_usage.py` tính `history_cap` = 5.160 token dù `format_history` cắt ở `history_total_chars = 8000` (~2.000 token nội dung), dùng `DOCUMENT_BUDGET_CHARS = 1200` (comment lỗi thời ghi 300 ký tự) trong khi chunked lesson thực tế tới 1.800+ ký tự nội dung, và không cộng overhead tag/note vào `memory_cap`.
  - Commit `e16f1a7` đặt `HEADER_TIMEOUT_STREAM_MS = 5_000` cho mọi path ngoài `SYNC_TIMEOUT_PATHS` trong `app/api/roadmap-assistant/[...path]/route.ts`, khiến `POST /chat/context` (vốn chờ `history_store.load` + `session_store.load` + `owner_memory_store.list_active` trước khi trả JSON) có nguy cơ 502 khi Turso chậm hoặc cold-start > 5s.
- **Dependencies**:
  - `roadmap-rag-assistant/rag_service/core/generation/profile.py#DomainProfile`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/profile.py#PROFILE`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/prompts.py#PROMPT_SUGGESTION_FORMAT`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/router/policy.py#SUGGESTION`
  - `roadmap-rag-assistant/rag_service/core/augmentation/context.py#build_prompt`, `format_history`, `select_documents`
  - `roadmap-rag-assistant/rag_service/core/generation/pipeline.py#GenerationPipeline._build_stream_setup`, `_build_generation_sections`
  - `roadmap-rag-assistant/rag_service/context_usage.py#conversation_context`, `DOCUMENT_BUDGET_CHARS`
  - `app/api/roadmap-assistant/[...path]/route.ts#SYNC_TIMEOUT_PATHS`, `UNLIMITED_PATHS`

## 2. Invariants & Rules

- Rule dự án: `AGENTS.md`. ADR liên quan: ADR-0002 (Actor isolation), ADR-0006 (chỉ số chung), ADR-0009 (Topic/bài học/mục), ADR-0012 (Thread Owner), ADR-0015 (Owner Memory), ADR-0017 (Provenance Owner-only).
- **Domain-neutrality trong `core/`**: `roadmap-rag-assistant/tests/test_generation_pipeline.py#test_core_never_names_a_business_domain` (L277-290) quét **toàn bộ text** (kể cả comment và docstring) trong `rag_service/core/**/*.py` và cấm các từ `lộ trình|topic|layer|abot|roadmap|bài học`. Tuyệt đối không dùng từ domain trong `core/generation/profile.py`, `core/generation/pipeline.py`, `core/augmentation/context.py`.
- **Giữ ổn định prefix cache & hợp đồng output**:
  - Giữ `persona + core rules` ở đầu `<system>`; các phần có điều kiện (`rules_owner_memory`, `rules_provenance`, `suggestion_format`) gắn ở cuối `<system>` theo thứ tự cố định khi kích hoạt.
  - Giữ nguyên cú pháp trích dẫn `[[id]]` và `<sources>id1, id2</sources>` cho `CiteChannel` / `SourceChannel`, giữ chuỗi `"trong <context>"` trong `PROFILE.rules_rag` (`tests/test_context_usage.py:45`), và giữ hướng dẫn không tự nhận hành động ghi (`ACTION_CLAIM` / `grounding_policy="sentence"`).
  - Giữ quy tắc recall ngắn hạn theo `<conversation_history>` trong cả `rules_rag` và `rules_chitchat` để `test_name_from_turn_one_reaches_the_prompt_of_turn_three` và eval `_answer` không hồi quy khi `owner_memories` rỗng.
- **Actor isolation & tương thích test đơn vị**:
  - `rules_owner_memory` chỉ tiêm khi `mem_block` khác rỗng (`bool(req.owner_memories)` — lưu ý các unit test trong `tests/test_owner_memory.py` gọi `build_prompt` trực tiếp với `owner_memories=[mem]` mà không set `current_actor="owner"`, nên gating theo `bool(mem_block)` vừa bảo vệ Visitor ở runtime vừa tương thích unit test).
  - `rules_provenance` chỉ tiêm khi `req.mode == "rag" and is_owner() and bool(req.lesson_provenances)` và có ít nhất 1 `doc` được chọn có provenance (`any(req.lesson_provenances.get(d.id) for d in docs)`).
- **Proxy timeout**: `chat/context` chuyển sang `SYNC_TIMEOUT_PATHS` (25s), **giữ nguyên** trong `UNLIMITED_PATHS` để Visitor mở Context sheet không bị trừ rate limit.
- **Ngoài phạm vi (Batch B/C)**: không sửa `core/memory/extractor.py`, `core/memory/store.py`, `domains/roadmap/agent.py`, `api/routes.py`, UI SDK, WebMCP hay `evals/`.

## 3. Step-by-Step Implementation Checklist

- [x] **Step 1 — Mở rộng contract `DomainProfile` (domain-neutral)** (`roadmap-rag-assistant/rag_service/core/generation/profile.py#DomainProfile`):
  - Thêm các field tuỳ chọn trên `DomainProfile` (không chứa từ cấm domain):
    - `rules_owner_memory: str = ""`
    - `rules_provenance: str = ""`
    - `should_include_suggestion_format: Optional[Callable[[str], bool]] = None`
- [x] **Step 2 — Tách & cắt gọn domain prompts** (`roadmap-rag-assistant/rag_service/domains/roadmap/prompts.py`, `roadmap-rag-assistant/rag_service/domains/roadmap/profile.py`):
  - Trong `prompts.py`:
    - Giữ `PROMPT_SUGGESTION_FORMAT` (bỏ dòng cuối trùng lặp nếu đã có trong `rules_rag`, hoặc giữ nguyên format code-block mẫu).
    - Định nghĩa `OWNER_MEMORY_RULES` (gom 1 bản duy nhất các quy tắc dùng `[preference]` / `[profile]` / `[techstack]` / `[goal]` / `[learning_note]`, không trích `[[id]]` hay `<sources>`, `<document>` thắng khi mâu thuẫn kỹ thuật, bỏ qua prompt injection đổi vai trò/tiết lộ bí mật).
    - Định nghĩa `PROVENANCE_RULES` (chuyển đoạn `"Nguồn gốc bên ngoài của tài liệu (Document → External Source): ..."` từ `rules_rag` L83-85 sang đây).
    - Thêm helper `wants_prompt_suggestions(query: str) -> bool` nhận các yêu cầu gợi ý prompt (vd: `"prompt mẫu"`, `"vài prompt"`, `"ví dụ prompt"`, `"gợi ý ... prompt"`, `"gợi ý câu hỏi mẫu"`). Lưu ý `router/policy.py#SUGGESTION` bắt cả `"gợi ý"` / `"goi y"` đứng một mình, nên nếu gọi `SUGGESTION` thì phải bắt buộc kèm ngữ cảnh prompt/câu hỏi mẫu và loại trừ các câu khuyến nghị học tập/tìm bài (vd: `"gợi ý học gì tiếp"`, `"gợi ý bài cần ôn"`, `"gợi ý bài về RAG"`, `"gợi ý lộ trình phù hợp"`).
  - Trong `profile.py`:
    - Cập nhật `PROFILE.rules_rag`: bỏ đoạn chi tiết `<owner_memory>` (L78-82) và đoạn provenance (L83-85); giữ nguyên nhắc nhở ngắn về `<conversation_history>` (L77) và toàn bộ rule citation `[[id]]`, `<sources>`, empty-lesson, no-match, `"trong <context>"`.
    - Cập nhật `PROFILE.rules_chitchat`: bỏ đoạn `<owner_memory>` lặp lại (L97-98); giữ ngoại lệ `<conversation_history>` (L94-96); sửa L99 thay `"Topic/Item"` bằng `"Topic/bài học"` (hoặc gợi ý tính năng phù hợp theo ngữ cảnh, không dùng từ legacy `"Item"`).
    - Rút gọn `PROFILE.memory_note` (`"Bộ nhớ dài hạn về Owner (không phải tài liệu nguồn để trích dẫn [[id]]):"`), `history_note` và `query_note` nếu có chữ thừa lặp lại, giữ rõ ranh giới dữ liệu vs chỉ dẫn.
    - Gán `rules_owner_memory=OWNER_MEMORY_RULES`, `rules_provenance=PROVENANCE_RULES`, `should_include_suggestion_format=wants_prompt_suggestions` trên `PROFILE`.
- [x] **Step 3 — Gating trong `build_prompt` & bỏ gọi lặp `format_owner_memory`** (`roadmap-rag-assistant/rag_service/core/augmentation/context.py`, `roadmap-rag-assistant/rag_service/core/generation/pipeline.py`):
  - Trong `context.py`:
    - Tách `synthesize_prompt(req: GenerationRequest, profile: DomainProfile, history: HistoryStore = history_store, documents: Optional[List[ContextDocument]] = None) -> tuple[str, list[str]]` (hoặc NamedTuple/dataclass chứa `prompt` và `selected_memory_ids`), và giữ `build_prompt(...) -> str` gọi `synthesize_prompt(...)[0]` để mọi caller hiện tại không vỡ.
    - Trong `synthesize_prompt`: tính `docs` (khi `req.mode == "rag"`) và `mem_block, selected_memory_ids` (khi `req.owner_memories`) một lần; dựng `<system>` với `(persona, rules)` đứng đầu, rồi chỉ nối thêm:
      1. `profile.rules_owner_memory` nếu `mem_block` không rỗng;
      2. `profile.rules_provenance` nếu `req.mode == "rag" and is_owner() and bool(req.lesson_provenances) and any(req.lesson_provenances.get(d.id) for d in docs)`;
      3. `profile.suggestion_format` nếu `profile.suggestion_format` khác rỗng và (`profile.should_include_suggestion_format is None` hoặc `profile.should_include_suggestion_format(req.query)`).
  - Trong `pipeline.py`:
    - `GenerationPipeline._build_stream_setup`: gọi `synthesize_prompt(req, profile, documents=documents)` và lưu `selected_memory_ids` vào `setup`.
    - `GenerationPipeline._build_generation_sections`: nhận `selected_memory_ids` từ `setup` và xoá hẳn lần gọi `format_owner_memory` thứ hai tại L93-103.
- [x] **Step 4 — Căn chỉnh budget trong `context_usage.py`** (`roadmap-rag-assistant/rag_service/context_usage.py#conversation_context`):
  - Cập nhật `DOCUMENT_BUDGET_CHARS` (L35-37) từ `1200` lên `2400` và cập nhật comment cho khớp `ITEM_CONTEXT_CHARS=1200` / `MAX_PASSAGES_PER_LESSON=2` × `PASSAGE_CONTEXT_CHARS=900` + metadata/provenance.
  - Sửa `history_cap` (L163) để phản ánh đúng trần thực tế của `format_history` và cả overhead thẻ/note (giống `memory_cap`): `max(messages, math.ceil((min(history_limit * profile.history_max_chars, profile.history_total_chars) + history_limit * TURN_OVERHEAD_CHARS + len(profile.history_note) + 48) / CHARS_PER_TOKEN))` — đảm bảo một cửa sổ đầy 8.000 ký tự / 20 lượt (`messages` ~2.192 token) không vượt `history_cap` (~2.193 token).
  - Sửa `memory_cap` (L164): khi `memory_tokens > 0`, tính bao gồm `profile.memory_note` và overhead thẻ `<owner_memory>\n</owner_memory>` (ví dụ `max(memory_tokens, math.ceil((profile.memory_total_chars + len(profile.memory_note) + 32) / CHARS_PER_TOKEN))`) để `memory_tokens <= memory_cap`; vẫn giữ `0` (và `parts` chỉ có `["system", "messages"]`) khi `memory_tokens == 0`.
- [x] **Step 5 — Chuyển `chat/context` sang `SYNC_TIMEOUT_PATHS` trên Next.js proxy** (`app/api/roadmap-assistant/[...path]/route.ts`):
  - Thêm `"chat/context"` vào `SYNC_TIMEOUT_PATHS` (`L18`), giữ nguyên trong `UNLIMITED_PATHS` (`L16`) và `POST_PATHS` (`L14`).
- [x] **Step 6 — Cập nhật & bổ sung unit tests**:
  - `roadmap-rag-assistant/tests/test_generation_pipeline.py`:
    - Cập nhật `test_fixed_text_comes_before_per_request_data`: kiểm tra `PROMPT_SUGGESTION_FORMAT` CÓ mặt khi `query="gợi ý vài prompt"`, và KHÔNG có mặt khi `query="Docker là gì?"`, `query="xin chào"`, `query="gợi ý học gì tiếp"`, `query="gợi ý bài cần ôn"`, hoặc `query="gợi ý bài về RAG"`.
    - Bổ sung assert: không gọi `format_owner_memory` 2 lần trong `GenerationPipeline.astream` (monkeypatch spy); `test_core_never_names_a_business_domain` vẫn pass.
  - `roadmap-rag-assistant/tests/test_context_usage.py`:
    - Cập nhật `test_budget_is_abots_caps_not_the_model_window` khớp `history_cap` mới (tính theo `history_total_chars` + tag/note overhead) và `DOCUMENT_BUDGET_CHARS=2400`; thêm assert với cửa sổ đầy 8.000 ký tự / 20 lượt thì `messages <= history_cap`, và khi truyền `owner_memories` thì `memory_tokens <= memory_cap`.
  - `roadmap-rag-assistant/tests/test_owner_memory.py` & `roadmap-rag-assistant/tests/test_phase3_provenance_and_linking.py`:
    - Kiểm tra prompt của Visitor không chứa `OWNER_MEMORY_RULES` lẫn `PROVENANCE_RULES`, trong khi lượt Owner có `owner_memories` / `lesson_provenances` vẫn nhận đủ rule tương ứng.
  - `tests/route/roadmap-assistant-proxy.test.ts`:
    - Bổ sung test `POST /api/roadmap-assistant/chat/context` dùng `HEADER_TIMEOUT_SYNC_MS` (chờ `5_001ms` trước khi trả header vẫn thành công `200`, vượt `25_001ms` mới trả `502`).

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `Pytest`: PASSED (`1239 passed in 29.84s`; `evals validate`: `484 samples, 125 documents`; `evals router-check`: `heldout=64/261, wrong_write=0`; `evals.router.holdout`: `n=65, write_now_violations=0`; `evals.router.confuse`: `ratchet ok`; `ruff` & `mypy` trên 6 file nguồn sửa: 0 lỗi)
- [x] `TypeCheck`: PASSED (`yarn tsc --noEmit -p .`, 0 errors)
- [x] `Lint`: PASSED trên phạm vi file đổi (`npx eslint "app/api/roadmap-assistant/[...path]/route.ts" tests/route/roadmap-assistant-proxy.test.ts`: 0 errors, 0 warnings, khớp rule CI `.github/workflows/ci.yml` L91-104; lưu ý `yarn lint` toàn repo có 47 lỗi/99 cảnh báo cũ ở các file ngoài diff)
- [x] `Vitest`: PASSED (`yarn test`: `140 test files passed`, `1334 passed | 8 skipped (1342)` trong 18.75s; 8 skipped có sẵn ở `tests/e2e/tier1-r3-action-chips.test.ts`)
- [x] `Intel Status`: PASSED (`yarn intel status`: `🟢 OK`, `213 ref map + 40 ref docs đều khớp code`; `yarn agents:sync --check`: up to date)
- [x] `Doctor Delta`: PASSED (`yarn doctor --since HEAD --check` & `yarn doctor --check`: `0 bug/risk mới`)
- [x] `Boundary Check`: PASSED (`0` vi phạm khi đối chiếu `git diff --name-only HEAD` qua rule glob `lib.sh` với `allowed_to_modify` / `strictly_forbidden`; không dùng `baseline.txt` vì task giao trực tiếp trong swarm)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: N/A (thực thi trực tiếp qua swarm `#31` & verify bởi `@verifier-sync`)
- **Modified Files**:
  - `roadmap-rag-assistant/rag_service/core/generation/profile.py`
  - `roadmap-rag-assistant/rag_service/core/generation/pipeline.py`
  - `roadmap-rag-assistant/rag_service/core/augmentation/context.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/profile.py`
  - `roadmap-rag-assistant/rag_service/domains/roadmap/prompts.py`
  - `roadmap-rag-assistant/rag_service/context_usage.py`
  - `app/api/roadmap-assistant/[...path]/route.ts`
  - `roadmap-rag-assistant/tests/test_generation_pipeline.py`
  - `roadmap-rag-assistant/tests/test_context_usage.py`
  - `roadmap-rag-assistant/tests/test_owner_memory.py`
  - `roadmap-rag-assistant/tests/test_phase3_provenance_and_linking.py`
  - `tests/route/roadmap-assistant-proxy.test.ts`
- **Bài học** (Claude điền khi verify PASS, tối đa 3 dòng): Giữ các rule điều kiện (`rules_owner_memory`, `rules_provenance`, `suggestion_format`) ở đuôi `<system>` cắt ~44–52% prompt rỗng trên lượt thường mà vẫn giữ prefix cache ổn định và không lộ rule nội bộ sang `Visitor`; `history_cap` phải tính cả `history_note` + wrapper để không tràn trần khi cửa sổ đạt đủ 8.000 ký tự.
