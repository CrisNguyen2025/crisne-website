# Kế hoạch: Topic → Bài học, `section` thay cho Layer và Group

> Trạng thái: **chờ duyệt**. Chưa có thay đổi nào trong code hay database.

## Bối cảnh

Hiện tại muốn lưu **một bài học** phải có đủ 3 cấp cha:

```
Roadmap ─► RoadmapLayer (bắt buộc shortTag "02-LLM") ─► RoadmapGroup (tên duy nhất trong layer) ─► RoadmapItem
```

Hệ quả:

- Topic mới tạo không thêm bài được cho tới khi có layer ("Start your first layer").
- Bot phải hỏi lại "layer nào?", rồi "nhóm nào?" (ADR-0008 đã bỏ Level nhưng vẫn còn 2 cấp này).
- `KnowledgeTriage` phải mang theo `layerId`, `layerTag` và `groupTitle`.
- Router của RAG có cả một lớp từ vựng riêng cho layer, nhóm và shortTag.

Mục tiêu của bot là **kho kiến thức cá nhân**: giai đoạn này lưu trữ, sau đó tìm kiếm sâu theo những chủ đề chủ thể theo dõi. Bốn cấp là thừa so với mục tiêu đó.

**Thời điểm:** Turso hiện chỉ có 1 topic, 0 bài (đã backup ở `~/Desktop/crisne-turso-backup-2026-11-02.json`), nên migration dữ liệu gần như rỗng.

## Mô hình mới

```
Roadmap (Topic) ─► RoadmapItem (bài học, section?: string)
```

| Bảng | Giữ | Bỏ | Thêm |
|---|---|---|---|
| `Roadmap` | id, slug, title, description, icon, order, isLocked | `shortCode` | — |
| `RoadmapLayer` | — | **cả bảng** | — |
| `RoadmapGroup` | — | **cả bảng** | — |
| `RoadmapItem` | id, title, description, content, order | `groupId` | `roadmapId` (FK, cascade), `section String?` |
| `KnowledgeTriage` | roadmapSlug, … | `layerId`, `layerTag`, `groupTitle` | `section String?` |

**Quy tắc của `section`:**

- Không bắt buộc. Bài không có section nằm ở mục "Chung".
- So khớp bằng `normalizeTitle()` (`lib/roadmap/duplicates.ts`): "RAG" và "rag " là cùng một section. Khi lưu, nếu đã có section khớp thì dùng lại đúng cách viết đang có.
- Thứ tự section = thứ tự bài nhỏ nhất trong section đó. Không cần bảng riêng.
- Tên bài là duy nhất **trong một topic** (trước đây là trong một group).
- Đổi tên section = cập nhật mọi bài của section đó, qua một endpoint riêng.
- Sau này nếu cần section có mô tả hay thứ tự riêng thì mới tách thành bảng.

**Tên gọi:** trong code dùng `section`; trên UI và trong lời bot dùng "mục".

## Các giai đoạn

Mỗi giai đoạn là một commit riêng, test xanh ở cuối mỗi giai đoạn. **Bước 0** là commit các thay đổi đang dở trên branch `feat/rag-index-freshness` trước, để diff của việc này đứng riêng.

### 1. Quyết định và tài liệu

- `docs/adr/0009-topic-holds-lessons-by-section.md`: Topic chứa bài trực tiếp, `section` thay Layer và Group. Đổi ADR-0008 sang `superseded by ADR-0009`.
- `GLOSSARY.md`: bỏ **Layer** và **Group**; thêm **Section** (_Also_: mục; _Avoid_: layer, nhóm, group).
- `docs/README.md`: cập nhật bảng ADR.

### 2. Schema và migration

- `prisma/schema.prisma`, `prisma/init-turso.sql`, `prisma/seed.ts` theo mô hình mới.
- `scripts/flatten-to-sections.ts`: mặc định chạy thử (dry-run), ghi thật với `--apply`, cùng kiểu với các script hiện có. Script này:
  1. Backup toàn bộ bảng ra JSON.
  2. Với mỗi bài: `roadmapId` lấy từ layer của group; `section` lấy theo tên layer, hoặc "Layer · Group" khi layer đó có nhiều group.
  3. Chuyển các cột của `KnowledgeTriage` sang `section`.
  4. Xoá `RoadmapGroup` và `RoadmapLayer`, xoá `Roadmap.shortCode`.
- Script này **thay cho** `scripts/drop-group-level.ts` (migration ADR-0008 chưa chạy trên Turso). Gỡ script cũ cùng lệnh `db:drop-group-level`.
- **Chạy trên Turso chỉ khi bạn xác nhận**: chạy thử trước, rồi mới `--apply`.

### 3. API Next.js

| Route | Thay đổi |
|---|---|
| `POST /roadmaps` | Chỉ nhận `title`, `description`. Bỏ `shortCode` và `layers` |
| `GET /roadmaps/[slug]` | Trả `{ roadmap, items, sections }`. `sections` được suy ra từ items, theo đúng thứ tự |
| `PATCH/DELETE /roadmaps/[slug]` | Bỏ `shortCode` |
| `POST /roadmaps/items` | `{ roadmapSlug, section?, title, description? }` |
| `PATCH /roadmaps/items/[id]` | Thêm `section` (chuyển mục) |
| `POST /roadmaps/items/reorder` | Sắp xếp trong một topic |
| **Mới** `PATCH /roadmaps/[slug]/sections` | Đổi tên một section: `{ from, to }` |
| `GET /roadmaps/full-export` | Topic → items (có `section`) |
| `triage/*` | `section` thay cho `layerId`, `layerTag`, `groupTitle`; approve tạo bài vào topic và section |
| **Xoá** | `[slug]/layers`, `layers/[id]`, `groups`, `groups/[id]`, `lib/roadmap/groups.ts` |

Mọi route ghi vẫn gọi `notifyRoadmapChanged()`. Test quét route trong `tests/route/rag-reindex.test.ts` sẽ bắt các route mới.

### 4. Giao diện web

- **Bỏ** sidebar trái `CompactSidebar`, cùng `LayerSection`, `GroupSection`, `CreateLayerModal`, `EditLayerModal`, `CreateGroupModal` và `EditGroupModal`.
- **`MasterPanel`**: danh sách bài, chia theo tiêu đề mục. Tìm kiếm lọc theo tên bài và tên mục.
- **`RoadmapMap`**: mỗi cột là một mục, thay cho mỗi cột một layer.
- **`CreateItemModal`**: ô "Mục" vừa chọn được mục có sẵn, vừa gõ được mục mới, và được để trống.
- **`CreateTopicModal` và `EditTopicModal`**: bỏ shortCode và danh sách layer ban đầu.
- **`HomeDashboard`**: đếm số bài thay cho số layer.
- **`hooks/use-roadmap.ts`**: state là `items[]`, các mục được suy ra từ items. Bỏ các thao tác trên layer và group.
- **URL**: `?layer=` đổi thành `?section=`. Ngữ cảnh trang gửi cho bot dùng `section` thay `layerId`.
- **Điều hướng khi bỏ sidebar**: thanh dưới (Home, Topics, Triage, Portfolio) trên điện thoại vẫn giữ. Trên desktop thay sidebar bằng thanh trên cùng có bộ chọn topic.
- Cập nhật `lib/roadmap/types.ts`, `data.ts`, `resolveRoadmap.ts`, `logic/roadmap/*`, và các tool WebMCP trong `hooks/use-roadmap-webmcp.ts`.

### 5. Dịch vụ RAG

- **Adapter** (`base`, `http`, `sqlite`): bỏ các hàm cho layer và group; `create_item(topic, section, title, …)`.
- **Tool**: xoá `layer_tools.py`, `group_tools.py` và `layer_resolver.py`. `item_tools.py` (gồm `import_items_from_text`) nhận topic và section; tìm topic bằng `topic_named_in_message` đang có.
- **Router**:
  - `schemas.EntityLevel` chỉ còn `TOPIC` và `ITEM`.
  - Sửa `entity_extractor`, `policy` (cụm từ chỉ đối tượng: layer/nhóm đổi thành mục), `understanding`, `write_gate`, `object_sense` và `verifier`.
  - `target_grounding` lấy danh mục gồm topic, mục và bài.
- **Hỏi lại**: bỏ hẳn các bước hỏi "layer nào?" và "nhóm nào?" (`_ask_layer_choice`, `_ask_target_choice`, `group_choice_reply`, `NO_DEFAULT_LAYER_REPLY`, cùng các trạng thái `pending_layer_*` trong `session_store`). Chỉ còn hỏi "topic nào?" khi câu không nêu topic và cũng không có topic nào đang mở.
- **Executor và `changes.py`**: bỏ các nhánh xử lý layer và group.
- **Ingestion và engine**: tài liệu gồm topic và bài (bài có trường `section`); context ghi "Mục: …" thay cho "Layer: …".
- **Prompt và các câu trả lời cố định** (`grounding.py`, `agent_actions.py`): đổi ví dụ sang dạng `thêm bài X vào topic Y`, `… mục RAG`.
- **SDK**: bỏ `LayerChoicePicker`; cập nhật các cấp hiển thị trong `ChangeReviewCard` và các nhãn trong `formatters.ts`.

### 6. Eval và test

- **Corpus**: export lại `evals/corpus` theo schema mới.
- **Dataset**: viết lại các mẫu nhắc tới layer hoặc nhóm. Hiện có 32/228 mẫu trong `_routing`, 4 trong `_answer`, 2 trong `_scope`, và khoảng 220 dòng trong `evals/router/*.jsonl` (`decisions.jsonl` chiếm 148).
- **Baseline**: so `router-check` và `confuse` trước và sau, rồi báo lại từng thay đổi. **Bắt buộc giữ**: `write_now_violations = 0` và `stress.wrong_write = 0`.
- **Test**: khoảng 30 file Python và 12 file Next.js đụng tới layer hoặc group. Thêm test cho: lưu bài không có mục, gộp mục chỉ khác hoa thường hay khoảng trắng, đổi tên mục, và bot thêm bài mà không hỏi lại.

## Kiểm tra cuối

1. Toàn bộ `pytest`, các lệnh `evals` của CI, `yarn test`, typecheck và lint (không có lỗi mới).
2. Thử tay: tạo topic → thêm bài không có mục → thêm bài vào mục "RAG" → thêm bài vào mục "rag" (phải gộp chung) → đổi tên mục → tìm bài qua bot → xoá bài.
3. Bot: `thêm bài Hybrid Search vào topic AI Engineering mục RAG` phải chạy ngay, không hỏi lại layer.
4. Turso: chạy thử migration trước, bạn xác nhận rồi mới `--apply`.

## Rủi ro

- **Router và eval** là phần lớn và dễ lệch nhất, vì từ vựng layer và nhóm nằm sâu trong `policy.py` và trong các dataset. Đây là lý do phải đối chiếu baseline trước và sau.
- **Triển khai:** API đổi format, nên migration Turso, Next.js (Vercel) và RAG (Render/Railway) phải lên cùng lúc. Giữa các bước sẽ có vài phút bot ghi lỗi.
- **Không quay lại được dễ dàng** sau khi `--apply` trên Turso, ngoài cách nạp lại từ backup JSON.

## Ước lượng

Khoảng 80–100 file ở cả hai phía. Giai đoạn 5 và 6 (RAG và eval) chiếm khoảng một nửa khối lượng.
