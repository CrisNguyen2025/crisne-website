# Bàn giao: chuyển sang topic + mục (ADR-0009)

Trạng thái: **đang dở, chưa xong**. Tài liệu này để tiếp tục công việc vào ngày mai.

Quyết định kiến trúc: [ADR-0009](adr/0009-topic-holds-lessons-by-section.md). Kế hoạch 6 giai đoạn: [topic-section-plan.md](topic-section-plan.md).

## Đã làm (đã viết code)

- **Schema và migrate**: `RoadmapItem` thuộc `Roadmap` với `section` tùy chọn. Đã bỏ `RoadmapLayer`, `RoadmapGroup` và `shortCode`. Script `db:flatten-sections` mặc định dry-run, có `--local` và `--apply`. Đã test riêng script này.
- **API**: các route roadmap trả topic kèm items và sections. Route đổi tên mục là `PATCH /api/v1/roadmaps/[slug]/sections`. Mọi route ghi đều gọi `notifyRoadmapChanged()`.
- **UI**: đã bỏ sidebar trái, có chip mục, `SectionList`, `EditSectionModal`, `CreateTopicModal`.
- **RAG**: adapter, tool, executor, entity extractor, grounding, prompt và ingestion đã chuyển sang topic/item/section. Đã xóa `layer_tools`, `group_tools`, `layer_resolver`, `adapters/groups.py`.
- **Eval**: đã đổi wording trong `evals/router/*.jsonl` và `evals/datasets/*/samples.jsonl` sang topic/mục. `evals/corpus_export.py` đã bỏ các trường layer/group.

## Chưa xong

1. **Test RAG**: lần chạy gần nhất còn khoảng 58 fail và 4 lỗi collection (`test_guardrails`, `test_nlp`, `test_tools`, `test_write_policy`). Các nhóm fail: `test_duplicates`, `test_change_review`, `test_delete_by_name`, `test_route_traps`, `test_write_invariants`, `test_intent_eval`, `test_router_policy`, và các nhóm còn lại.
2. **Test Next/TS**: chưa chạy lại `yarn test` sau các thay đổi mới. Chưa chạy `tsc` (app và sdk) và eslint trên file đã đổi.
3. **Seed local `prisma/dev.db`**: lỗi `no column named roadmapId` dù file đã có cột này. Nghi ngờ Prisma client được generate từ schema cũ. Cần chạy `npx prisma generate` rồi thử lại.
4. **Corpus và eval**: chưa export lại `evals/corpus/public/roadmap/documents.jsonl`. Chưa chạy `router-check`. Chưa xác nhận `write_now_violation` và `stress.wrong_write` đều bằng 0. Chưa chạy holdout và confuse so với baseline.
5. **Verify UI/API trên trình duyệt**: chưa làm.
6. **Turso**: đang dùng schema cũ (còn `shortCode`, chưa có `roadmapId` trên `RoadmapItem`). Chưa chạy `--apply`. Cần xác nhận rõ ràng trước khi migrate hoặc xóa dữ liệu.

## Cảnh báo về seed

`prisma/seed.ts` import `lib/prisma.ts`. File này dùng Turso khi `.env` có `TURSO_DATABASE_URL`, nên `npx prisma db seed` ghi lên remote, không phải file local. Khi seed local, phải tắt `loadEnv()` và bỏ biến Turso. Kiểm tra chỉ đọc cho thấy remote còn 2 roadmap (`ai-engineering`, `ai-architecture`) và 0 item.

## Thứ tự làm ngày mai

1. `npx prisma generate`, rồi seed local bằng cách tách khỏi Turso.
2. Sửa test RAG theo nhóm, bắt đầu từ collection errors.
3. Chạy `yarn test`, `tsc`, eslint.
4. Export corpus (phiên bản mới), `router-check`, kiểm tra metric gating.
5. Verify UI/API.
6. Quyết định Turso với người dùng, rồi mới migrate.

## Không đưa vào commit

- `prisma/dev.db` (file tracked, hiện đã recreate rỗng).
- Các file backup `flatten-backup-*.json`.
