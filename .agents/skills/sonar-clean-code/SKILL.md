---
name: sonar-clean-code
description: Kiểm tra và refactor mã nguồn crisne-website theo Sonar Clean Code Concept (Consistent, Intentional, Adaptable, Responsible) theo mô hình Hybrid (AST từ eslint-plugin-sonarjs + Ruff kết hợp audit ngữ nghĩa bằng AI). Dùng khi user yêu cầu audit/refactor clean code, giảm Cognitive Complexity, xử lý ReDoS/duplicate code/swallowed exceptions, hoặc trước khi dọn nợ kỹ thuật trên một module.
---

# Sonar Clean Code (`sonar-clean-code`)

Áp dụng mô hình **Sonar Clean Code Concept** (4 thuộc tính trên 3 nhóm chất lượng **Maintainability / Reliability / Security**) kết hợp AST deterministic tại local (không cần SonarQube Server, Cloud hay Docker).

## 1. Bốn thuộc tính Clean Code & ánh xạ công cụ trong `crisne-website`

| Thuộc tính | Chất lượng | Trọng tâm kiểm tra | AST tool tự động | Phần AI review ngữ nghĩa |
|---|---|---|---|---|
| **Consistent** | Maintainability | Naming thống nhất, formatting, pattern async/error đồng bộ, cú pháp chuẩn | `eslint-plugin-sonarjs` (`concise-regex`), `prettier`, `ruff` (`UP`, `RUF100`) | Không trộn nhiều style/helper khác nhau cho cùng 1 việc; tuân thủ `GLOSSARY.md` & `docs/design-system.md` |
| **Intentional** | Maintainability / Reliability | Dead code, unused exports/vars, boolean rối, logic thừa, shadowing globals, side-effect ngầm | `sonarjs` (`no-globals-shadowing`, `no-redundant-assignments`, `no-invariant-returns`, `no-use-of-empty-return-value`, `misplaced-loop-counter`, `duplicates-in-character-class`, `void-use`), `knip`, `ruff` (`F`, `B`, `SIM`, `RUF019`, `RUF059`) | Magic numbers/strings khó hiểu, điều kiện phủ định kép, hàm trả giá trị mập mờ |
| **Adaptable** | Maintainability | Giảm Cognitive Complexity (`<= 15` TS, McCabe `<= 10` Python), early return, tách helper, gom nhánh/hàm trùng lặp | `sonarjs` (`cognitive-complexity`, `no-nested-conditional`, `no-nested-functions`, `no-nested-template-literals`, `no-duplicated-branches`, `regex-complexity`), `ruff` (`C901`, `SIM102/114`) | Duplicate logic khác tên biến/tham số giữa 2 hàm/route/service; God function/component trộn UI + business logic |
| **Responsible** | Security / Reliability | Không nuốt exception, ReDoS backtracking, PRNG an toàn, dangling async tasks, SSRF/XSS/SQLi, resource safety, validate input | `sonarjs` (`super-linear-regex`, `pseudo-random`, `no-os-command-from-path`), `ruff` (`S`, `ASYNC`, `RUF006`, `BLE001`), `cris-doctor` (`BE-ROUTE-AUTH`, `BE-ERROR-LEAK`, `BE-FETCH-TIMEOUT`, `BE-QUERY-IN-LOOP`, `SEC-SECRET`) | Catch rộng (`except Exception` / `catch`) làm mất ngữ cảnh lỗi; race condition; kiểm tra cleanup stream/DB/timer |

## 2. Phạm vi & Bất biến bắt buộc

- **Tôn trọng `AGENTS.md`:** mặc định bỏ qua Cris AI (`app/portfolio/**`, `app/api/chat/**`, `components/floating-bot/**`, `hooks/use-floating-chat.ts`) trừ khi Owner yêu cầu; không làm thay đổi luồng 👍/👎 ở code dùng chung (`lib/ai/langfuse.ts`).
- **Tôn trọng `docs/design-system.md`:** khi sửa file `.tsx` thuộc UI, tránh phát sinh finding `DS-*` mới và dọn `DS-*` trong file vừa chạm nếu an toàn.
- **Tôn trọng `GLOSSARY.md` & ADRs:** không đổi tên domain lệch glossary (`_Avoid_`), giữ nguyên public API/route contract, schema JSON và behavior hiện có.
- **Không dùng `cris-doctor` thay thế refactor:** `cris-doctor` chỉ đọc để đo baseline/delta; `sonar-clean-code` hướng dẫn quy trình scan + refactor có kiểm chứng.

## 3. Quy trình 4 bước (Hybrid AST → Audit → Batch Refactor → Verify)

### Bước 1: Quét AST toàn phạm vi (Deterministic)
Chạy đồng thời AST TS/JS và Python (không cần server):

```bash
# 1. TS/JS SonarJS + Next + TypeScript ESLint trên toàn source active
yarn eslint app lib logic components hooks scripts middleware.ts auth.ts

# 2. Typecheck + Dead code + Cris Doctor
yarn tsc --noEmit -p .
yarn doctor

# 3. Python Sonar-aligned Ruff + Mypy (Abot + News Worker)
roadmap-rag-assistant/.venv/bin/ruff check --isolated \
  --select F,E9,B,ASYNC,S,C901,SIM,BLE,RUF006,RUF019,RUF059,RUF100 \
  roadmap-rag-assistant/rag_service news-ingest-worker/news_worker
```

### Bước 2: Phân loại & Lập bảng Issues theo mức ưu tiên
Sắp xếp theo **3 nhóm chất lượng** của Sonar:
1. **Security & Reliability (Responsible):** `super-linear-regex` (ReDoS), `pseudo-random`, `RUF006` (dangling `create_task`), `BLE001` nuốt lỗi/mất stack, `ASYNC`, `S*`, `BE-*`.
2. **Correctness & Clarity (Intentional):** `no-globals-shadowing`, `duplicates-in-character-class`, `misplaced-loop-counter`, `no-invariant-returns`, `no-redundant-assignments`, `no-use-of-empty-return-value`, `SIM*`, `RUF019/059/100`.
3. **Complexity & Maintainability (Adaptable / Consistent):** `cognitive-complexity` (> 15), `C901` (> 10), `no-nested-conditional`, `no-duplicated-branches`, `regex-complexity`, `concise-regex`, duplicate logic liên hàm.

### Bước 3: Refactor theo batch nhỏ, giữ nguyên hành vi
Áp dụng các kỹ thuật chuẩn Sonar:
- **Cognitive Complexity / `C901`:** flatten bằng **early return / guard clauses**; tách helper thuần (single-purpose) cho từng bước parsing, validation hoặc rendering; dùng lookup map/table thay chuỗi `if/else if` dài.
- **ReDoS (`super-linear-regex`):** loại bỏ quantifier lồng nhau hoặc lookbehind có độ dài thay đổi; thay `/-+$/` hay `/\/+$/` bằng vòng lặp/slice tuyến tính $O(n)$, hoặc giới hạn character class cụ thể.
- **Duplicate branches / logic:** gộp nhánh giống nhau bằng điều kiện `||` hoặc tách shared helper tham số hoá phần khác biệt (`requestRagReindex` / `requestOwnerMemoryCacheInvalidate`).
- **Exception handling (`BLE001` / `catch`):** bắt cụ thể ngoại lệ có thể dự đoán (`httpx.HTTPError`, `OSError`, `ValueError`, `json.JSONDecodeError`); chỉ giữ fallback catch-all ở biên resilience (LLM fallback / SSE boundary / worker poll loop) kèm log rõ ràng hoặc `# noqa: BLE001` có lý do.
- **Dangling tasks (`RUF006`):** lưu `asyncio.Task` vào module-level `set[asyncio.Task]` và gắn `task.add_done_callback(set.discard)` (và log lỗi nếu task fail chưa được await).

### Bước 4: Verify sau mỗi batch
Chạy kiểm tra theo `verify-ci`:
- TS/JS: `yarn tsc --noEmit -p .`, `yarn eslint <files>`, `yarn test`
- Python: `cd roadmap-rag-assistant && .venv/bin/python -m pytest -q && .venv/bin/python -m evals validate` và `cd news-ingest-worker && .venv/bin/python -m pytest -q`
- Toàn cục trước khi chốt: `yarn doctor --since HEAD --check`, `yarn agents:sync --check`, `yarn intel status`, `yarn build`.

Xem bảng ánh xạ chi tiết từng rule tại [sonar-rules-map.md](references/sonar-rules-map.md).
