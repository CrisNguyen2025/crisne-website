# evals — Golden set & eval harness

Bộ eval có cấu trúc, máy đọc được, dùng để so sánh các phiên bản chunking / embedding / reranker / router
và bắt regression đến từng sample. Thiết kế tách **core** (domain-agnostic) và **domain** để có thể mang sang
repo hoặc domain khác.

Ba lớp dữ liệu:

| Lớp | Thư mục | Vai trò |
|---|---|---|
| Thư viện tri thức | `corpus/` | Tri thức dạng static, có label schema, `doc_id` / `section_id` ổn định, có version |
| Bộ đề | `datasets/` | Câu hỏi + kỳ vọng, trỏ vào `section_id` của corpus |
| Rulebook | [GUIDELINES.md](GUIDELINES.md) | Quy tắc viết sample, gán tag, bảo trì corpus |

> Dành cho agent: đọc mục [Invariants](#invariants-không-được-phá) trước khi sửa bất kỳ file nào trong `evals/`,
> và [GUIDELINES.md](GUIDELINES.md) trước khi thêm hoặc sửa sample.

## Cấu trúc

```text
evals/
├── kit/                     # CORE: chỉ dùng stdlib + evals.kit, KHÔNG import rag_service
│   ├── schema/              # contract dùng chung (JSON Schema), có field "version"
│   │   ├── sample.schema.json
│   │   ├── meta.schema.json
│   │   ├── document.schema.json      # label schema của tri thức
│   │   ├── corpus-meta.schema.json   # version + hash của một corpus
│   │   └── tags.json        # tag chung cho mọi domain
│   ├── target.py            # Protocol Target + Hit / RouteResult / Answer
│   ├── source.py            # DatasetSource, FileSource, validate()
│   ├── corpus.py            # CorpusSource, FileCorpusSource, content_hash, validate chéo datasets ↔ corpus
│   ├── acl.py               # AclGuard: bắt leak trên mọi retrieve / answer
│   ├── scorers.py           # chấm từng sample: retrieval, route, answer
│   ├── metrics.py           # tổng hợp + so ngưỡng
│   ├── runner.py            # CLI: validate | run | diff
│   └── report.py            # ghi run, in summary, diff 2 run
│
├── target.py                # RoadmapTarget  ┐ hai module DUY NHẤT import rag_service
├── corpus_export.py         # dev.db → corpus ┘
├── __main__.py              # entry point domain: `python -m evals ...` với path mặc định
├── GUIDELINES.md            # rulebook gán nhãn
├── corpus/
│   └── public/roadmap/      # <acl_tier>/<topic>/
│       ├── documents.jsonl  # 1 dòng = 1 document (export từ prisma/dev.db)
│       └── meta.json        # version, doc_count, sha256
├── datasets/
│   ├── tags.json            # tag riêng của domain (merge với kit/schema/tags.json)
│   ├── public/roadmap/      # <acl_tier>/<topic>/
│   │   ├── samples.jsonl
│   │   └── meta.json
│   └── _routing/            # bộ cross-topic: prefix "_", acl_tier khai báo trong meta
│       ├── samples.jsonl
│       └── meta.json
└── runs/                    # output, đã .gitignore
```

## Chạy

Từ `roadmap-rag-assistant/`:

```bash
.venv/bin/python -m evals validate                       # schema, tag, corpus, validate chéo datasets ↔ corpus
.venv/bin/python -m evals.corpus_export                  # export lại corpus; báo lỗi nếu nội dung đổi mà chưa bump version
.venv/bin/python -m evals.corpus_export --version 1.1    # ghi corpus version mới
.venv/bin/python -m evals run --opt mode=fts             # offline, không cần API key
.venv/bin/python -m evals run --opt mode=hybrid --profile hybrid   # cần GEMINI_API_KEY, dùng ngưỡng của hybrid
.venv/bin/python -m evals run --only _routing            # chạy 1 dataset theo prefix path
.venv/bin/python -m evals run --only _answer --opt mode=fts --opt answer=llm   # chấm câu trả lời thật: GỌI LLM, tốn quota
.venv/bin/python -m evals diff evals/runs/<base> evals/runs/<head>   # regressed / fixed / added / removed
.venv/bin/python -m pytest tests/test_evals_kit.py       # boundary + validate + scorer (offline)
```

`mode`: `fts` | `vector` | `hybrid` (mặc định `hybrid`).

Exit code: `0` ok · `1` dataset / corpus không hợp lệ, dưới ngưỡng, hoặc `diff` có regressed · `2` nội dung target
đang phục vụ (DB) khác corpus static.

Mỗi run ghi `runs/<run_id>/summary.json` (metric theo dataset, theo tag, ngưỡng fail, version dataset,
version corpus, fingerprint corpus) và `samples.jsonl` (kết quả từng sample, dùng cho `diff`).

## Contract

### Sample (`samples.jsonl`, mỗi dòng 1 object)

| Field | Bắt buộc | Ý nghĩa |
|---|---|---|
| `id` | ✓ | `<prefix>-NNN`, **bất biến**, không tái sử dụng, unique trên toàn `datasets/` |
| `input` | ✓ | nội dung gửi vào target |
| `history` | | các turn trước (`role`, `content`) cho multi-turn |
| `expected.behavior` | | `answer` \| `clarify` \| `refuse` |
| `expected.route` | | route mong đợi; `[]` = không quyết định (để LLM router xử lý) |
| `expected.contexts` | | `[{section_id, doc_id?, quote?, required?}]`; `[]` = off-topic, retrieval phải rỗng. Không có `required` = trúng 1 section là đủ; có `required: true` = phải lấy đủ mọi section required (câu multi-section) |
| `expected.facts` | | các ý bắt buộc có trong câu trả lời |
| `expected.forbidden` | | các chuỗi câu trả lời **không được** chứa (lộ bộ nhớ thread khác, PII đã mask, thông tin đã bị sửa); so substring không phân biệt hoa thường |
| `expected.answer` | | câu trả lời tham khảo, không dùng để chấm |
| `metadata.status` | ✓ | `active` \| `needs_review` \| `deprecated`; chỉ `active` được chạy |
| `metadata.tags` | | lấy từ `kit/schema/tags.json` + `datasets/tags.json` |
| `metadata.run_as` | | role khi gọi target; mặc định `meta.default_role` |
| `metadata.*` khác | | tự do cho domain, core bỏ qua |

`section_id` phải tồn tại trong `corpus/`; dataset không được trích document có tầng ACL cao hơn thư mục của nó.
Scorer chỉ chạy khi sample có field nó cần; thiếu field thì bỏ qua sample đó, không tính fail.

### Document (`corpus/**/documents.jsonl`, mỗi dòng 1 object)

| Field | Bắt buộc | Ý nghĩa |
|---|---|---|
| `doc_id` | ✓ | id ổn định, gán một lần (roadmap: `<topic>/<layer>/<slug-title>`) |
| `source_id` | | id ở hệ thống nguồn (DB); dùng để giữ `doc_id` qua các lần export |
| `title`, `doc_type` | ✓ | tiêu đề, loại tài liệu (roadmap: `topic` \| `layer` \| `item`) |
| `acl` | ✓ | danh sách role được đọc (roadmap: `["everyone"]`) |
| `sections[]` | ✓ | `{section_id, heading?, text}`; `section_id` unique toàn corpus (roadmap: 1 section, id = `doc_id`) |
| `metadata` | | tự do theo domain (roadmap: `topic`, `layer`, `layer_title`, `level`) |

`corpus/**/meta.json`: `owner`, `acl_tier`, `version` (`MAJOR.MINOR`), `source`, `doc_count`,
`sha256` = `kit.corpus.content_hash(documents)` (bỏ qua `doc_id` / `source_id` / `section_id`, không phụ thuộc thứ tự).

### Meta (`meta.json`)

`owner`, `acl_tier` (`public` \| `internal` \| `confidential`, phải khớp thư mục), `scorers`
(`retrieval` \| `route` \| `answer`), `k` (mặc định 5), `default_role`, `thresholds`
(key dạng `<scorer>.<metric>`, ví dụ `retrieval.hit@5`), `profiles` (tên → ngưỡng ghi đè `thresholds`, chọn bằng
`--profile`; dùng khi cùng dataset chạy nhiều cấu hình, ví dụ một profile cho mỗi retrieval mode).

### Metric

| Scorer | Capability | Metric |
|---|---|---|
| `retrieval` | `retrieve` | `hit@k`, `mrr@k` (on-topic), `off_topic_rejected` |
| `route` | `route` | `accuracy` (behavior + route cùng khớp) |
| `answer` | `answer` | `accuracy` (behavior, facts substring, không chứa forbidden, citation ⊇ required contexts) |

Thiếu capability thì scorer bị **skip** và được ghi lại trong summary, không báo lỗi.

### ACL leak

Runner bọc target bằng `AclGuard`. Mọi section trả về từ `retrieve` (và `citations` của `answer`) được so với
`acl` của document trong corpus: section đọc được khi `acl` chứa `everyone` hoặc chứa role đang chạy
(`metadata.run_as`, mặc định `meta.default_role`; không có role = anonymous, chỉ thấy `everyone`).
Mỗi leak được ghi vào `summary.json` (`acl_leaks`) và **luôn làm run fail**, không phụ thuộc ngưỡng.

## Hiện trạng (roadmap)

| Dataset | Nguồn migrate | Samples | Baseline `mode=fts` |
|---|---|---|---|
| `public/roadmap` | `tests/data/retrieval_eval_cases.json` (001–049) + bổ sung (050–083) | 83 (18 off-topic, 10 trong đó near-topic) | FTS: hit@5 0.954 · mrr@5 0.840 · off_topic_rejected 0.111 — hybrid: 1.0 · 0.932 · 0.667 |
| `_routing` | `tests/data/intent_eval_cases.json` + bộ blind/stress (đã map nhãn) | 142 active (38 gốc + 104 mới, 5 `needs_review`) | accuracy 0.7606 (gốc 38/38, mới 70/104). Ngưỡng hạ từ 1.0 xuống 0.75: 34 case heuristic chưa phủ (out_of_scope không từ khóa, plan_goal tiếng Anh, chitchat nhỏ). Ngưỡng chặn hồi quy; nâng lại khi sửa xong các nhóm này |
| `_answer` | viết mới (bug "quên tên Cris") + câu so sánh cần đủ 2 nguồn (021–024) | 24 | accuracy 0.9583 (groq `openai/gpt-oss-120b`, hybrid); fail còn lại `answer-008`, cũng fail trước khi có citation theo câu |

- Baseline khớp đúng với `tests/eval_retrieval.py --fts-only` (cùng hit@5, MRR, 1/8 off-topic).
- Corpus `public/roadmap@1.0`: 115 doc export từ `dev.db`, chỉ còn topic `ai-architecture`. Đã bỏ dữ liệu probe (`owner-probe`, `bypass-probe`),
  các topic rác/rỗng (`3`, `sss`, `tạo-c`, `tại-c-tạo-3-item-1-2`, `d-topic`, `ai-engineering`, `backend-go`,
  `cloud-devops`) cùng layer `General` của chúng, và 2 item `1111`, `2`.
- `off_topic_rejected` thấp ở FTS là điểm yếu đã biết của BM25 (luôn trả về kết quả); hybrid từ chối 67%, near-topic
  vẫn chỉ 40%. Chưa đặt ngưỡng cho metric này.
- Ngưỡng là sàn chống regression. Mặc định (FTS): `hit@5 ≥ 0.95`, `mrr@5 ≥ 0.80`. Profile `hybrid`:
  `hit@5 ≥ 0.98`, `mrr@5 ≥ 0.90`, `off_topic_rejected ≥ 0.60`. Đã hạ `mrr@5` từ 0.85 khi thêm
  sample khó (050–083); không nâng ngưỡng khi chưa có cải tiến thật.
- `VECTOR_MIN_SIMILARITY = 0.665` (`rag_service/rag/vector_store.py`) vẫn đúng chỗ: on-topic thấp nhất 0.670
  (`roadmap-064`), off-topic thuần cao nhất 0.629. Near-topic lên tới 0.719 nên chồng lấn on-topic; không có ngưỡng
  cosine nào tách được. Chặn near-topic cần cơ chế khác (reranker score, grounding check ở bước generation).
- Fail đã biết (FTS): `roadmap-060` (không dấu), `roadmap-066` (typo), `roadmap-083` (multi-section); cả 3 pass ở hybrid.

Phân bố tag của `public/roadmap`:

| Nhóm | Tag | n | Pass (FTS) |
|---|---|---|---|
| Hỏi đúng tên khái niệm | `canonical` | 14 | 100% |
| Paraphrase | `paraphrase` | 35 | 100% |
| Không dấu / typo / trộn Anh–Việt | `no-diacritics` · `typo` · `code-switch` | 5 · 3 · 3 | 80% · 67% · 100% |
| Cần đủ nhiều section | `multi-section` (+ `comparison`) | 5 | 80% |
| Ngoài corpus | `out-of-corpus` | 18 | 11% |
| Sát chủ đề nhưng không có bài | `near-topic` | 10 | 20% |

- `RoadmapTarget.capabilities = {retrieve, route}`, thêm `answer` khi chạy với `--opt answer=llm`. Không có option thì
  `_answer` bị skip, nên lệnh `run` mặc định vẫn offline. `answer` chạy agent thật với LLM trong `.env`, adapter SQLite
  đọc `prisma/dev.db` (không cần Next.js), role `visitor` (không ghi được DB). `history` của sample được nạp thẳng vào
  bộ nhớ (đã mask PII) trên một thread mới, không replay từng lượt. Behavior suy ra từ step/reply: `refuse` = sensitive /
  out_of_scope / no_match, `clarify` = mixed intent / unclear, còn lại `answer`. Citation = mọi `metadata.sources`
  (bài model gắn `[[id]]` sau khẳng định, rồi tới bài chỉ có trong dòng `<sources>`), không phụ thuộc `cited`.
  Vị trí từng khẳng định (`metadata.citations`) chưa được scorer chấm; khi đổi prompt citation thì đo thêm độ phủ và
  slice khớp `text` trên câu hỏi on-topic.
- `_answer` chưa đặt ngưỡng vì LLM không tất định; cần thêm vài run để biết độ dao động. Lịch sử: 0.875 ở 2 run đầu
  (`answer-006` "email của tôi là gì?" bị router đưa vào tìm kiếm), lên 1.0 sau khi router nhận câu hỏi về thông tin
  của chính người dùng (`CONVERSATION_RECALL` trong `rag_service/router/intent_router.py`). Khi thêm citation `[[id]]`
  theo câu, `answer-015` từng fail vì model gắn `[[id]]` vào câu gợi ý đọc thêm ở câu hỏi ngoài corpus; prompt nay nói
  rõ bài gợi ý không phải nguồn (`answer-013` cũng pass từ đó).
- `section_id` là `doc_id` của corpus (trước đây tạm dùng title). Đổi title trong DB không làm lệch dataset vì
  export giữ `doc_id` theo `source_id`.
- Bộ cũ trong `tests/data/` và các test `tests/eval_retrieval.py`, `tests/test_intent_eval.py` **vẫn giữ nguyên**.
  Xoá hay chuyển chúng sang đọc `evals/datasets` là quyết định riêng, chưa làm.

## Quy trình

**Thêm sample:** thêm dòng vào `samples.jsonl` với `id` kế tiếp → `python -m evals validate` → `run`.

**Corpus thay đổi** (`run` trả exit 2): `python -m evals.corpus_export --version <mới>` → `validate` (báo sample trỏ
vào section đã mất) → rà sample có section liên quan, đặt `metadata.status = "needs_review"` cho sample chưa kịp sửa.
Không xoá sample; bỏ dùng thì đặt `deprecated`. Chi tiết quy tắc version ở [GUIDELINES.md](GUIDELINES.md).

**Đổi ngưỡng:** chỉ sửa `thresholds` trong `meta.json`, kèm lý do trong PR.

**Thêm domain / repo mới:** copy `kit/` (hoặc cài như package) rồi viết:
1. `target.py` implement `kit.target.Target` (khai báo `capabilities`, `corpus_fingerprint()` dùng `kit.corpus.content_hash`;
   `Hit.section_id` phải là `section_id` của corpus).
2. `corpus/<acl_tier>/<topic>/{documents.jsonl,meta.json}` theo `document.schema.json` (export từ nguồn của domain).
3. `datasets/<acl_tier>/<topic>/{samples.jsonl,meta.json}` (+ `datasets/tags.json` nếu cần tag riêng).
4. `__main__.py` truyền path mặc định cho `kit.runner.main`.
Không cần sửa `kit/`.

**Thêm nguồn dữ liệu khác** (ví dụ API "Nguồn dữ liệu"): implement `DatasetSource` cho bộ đề và `CorpusSource`
cho thư viện (cùng `load()`, `version()`), trả về đúng format schema. `version()` phải xác định được snapshot để
run tái lập được.

**Thêm scorer riêng của domain:** dùng decorator `@scorer(name, capability)` từ `kit/scorers.py` trong module
domain, import module đó trước khi chạy, rồi khai báo `name` trong `meta.scorers`.

## Invariants (không được phá)

1. `kit/` không import `rag_service` hay `evals.target`. Đã có test `test_kit_does_not_import_domain_code`.
2. Runner nhận target / datasets / corpus qua argument; không hardcode path hay domain trong `kit/`.
3. `id` sample, `doc_id`, `section_id` bất biến; không đánh số lại, không tái sử dụng.
4. Schema là contract có `version`; thêm field bắt buộc hoặc đổi nghĩa field là breaking change → bump version.
5. `metadata` mở: core chỉ đọc field nó biết.
6. `kit/` chỉ dùng stdlib (validator JSON Schema trong `source.py` hỗ trợ subset: `type`, `enum`, `required`,
   `properties`, `additionalProperties: false`, `items`, `pattern`, `minLength`). Thêm keyword mới vào schema thì
   phải bổ sung validator.
7. `runs/` không commit. Dataset và corpus tầng `internal` / `confidential` không commit vào repo này.
8. Không sửa tay `corpus/**/documents.jsonl`; mọi thay đổi đi qua `corpus_export` (hash trong meta sẽ chặn).

## Checklist review / agent scan

- [ ] `python -m evals validate` OK
- [ ] `pytest tests/test_evals_kit.py` pass
- [ ] `python -m evals run --opt mode=fts` không có threshold fail và không có ACL leak; nếu có, `diff` với run trước để chỉ ra sample regressed
- [ ] Sample mới có `id` mới, tag hợp lệ, `refuse` không kèm `contexts` / `facts`
- [ ] Không có import domain trong `kit/`; không có path tuyệt đối trong `kit/`
- [ ] Đổi corpus thì đã export version mới qua `evals.corpus_export`, không sửa tay `documents.jsonl`
- [ ] Sample mới theo [GUIDELINES.md](GUIDELINES.md)

## Chưa làm (phase sau)

- Bộ `_acl/` (cùng câu hỏi, nhiều role): cần corpus có tài liệu không public; roadmap hiện toàn `everyone`, nên
  check leak đã chạy trên mọi sample nhưng luôn bằng 0. Đã kiểm chứng bằng corpus copy có doc chỉ cho `staff`.
- `ApiSource` / `ApiCorpusSource` thật (seam `DatasetSource` / `CorpusSource` đã có).
- Upload run lên storage / dashboard.
- Scorer `answer` bằng LLM judge thay cho substring; đo inter-annotator agreement; tách `dev` / `test`.
- Thêm `quote` vào `contexts` khi document có nhiều section.
