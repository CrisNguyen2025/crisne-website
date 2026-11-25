---
name: cris-doctor
description: Khám sức khoẻ toàn bộ code FE + BE của crisne-website (Next.js UI và API, Prisma, 2 service FastAPI), chỉ đọc, ra report bug/risk/nit kèm file:line và so với baseline để thấy finding mới. Dùng khi user hỏi tình trạng code, nợ kỹ thuật, code chết, route thiếu kiểm quyền, "doctor", "khám code", "health check"; trước khi lập plan cho một vùng code; hoặc khi cần biết một thay đổi có làm tăng finding không (`--since --check`). Không dùng thay `verify-ci` (pass/fail trên diff trước commit).
---

# Cris Doctor (`cris-doctor`)

Khám sức khoẻ code của `crisne-website`. Script `yarn doctor` chạy check máy móc và cho ra kết quả lặp lại được. Mode `full` thêm test suite, `pip-audit` và phần agent đọc code (mục 4). Plan và danh sách check: `.handoff/PLAN-cris-doctor.md`.

## 1. Quy tắc

- **Chỉ đọc.** Không sửa code để làm sạch finding trong cùng lượt khám. Muốn sửa thì đề xuất, chờ user duyệt.
- **Không in secret.** Check `SEC-SECRET` chỉ nêu loại key. Không đọc `.env*`.
- **Mặc định bỏ Cris AI** (`app/portfolio/**`, `app/api/chat/**`, `components/floating-bot/**`, `hooks/use-floating-chat.ts`) theo mục Phạm vi hiện tại của `AGENTS.md`. Chỉ thêm `--include-cris-ai` khi user yêu cầu.
- **Phân loại theo CLAUDE.md:** `bug` (sai hoặc lỗ hổng), `risk` (dễ thành bug), `nit` (convention, dọn dẹp).
- Finding chỉ ghi vào `.handoff/BACKLOG.md` khi Owner duyệt. Mỗi dòng backlog trỏ tới report, không chép nội dung.

## 2. Lệnh

```bash
yarn doctor                              # quick, FE + BE, toàn repo (~30s)
yarn doctor --target be --scope rag      # chỉ service rag
yarn doctor --mode full                  # thêm vitest, pytest, pip-audit (cần mạng)
yarn doctor --since HEAD --check         # chỉ file đang đổi; exit 1 nếu có bug/risk mới so với baseline
yarn doctor --only BE-ROUTE-AUTH,PY-RUFF # chạy vài check
yarn doctor --update-baseline            # ghi lại baseline (bắt buộc --target all)
```

- `--target fe|be|all`. FE = vùng `ui` (`components/`, `hooks/`, `logic/`, trang trong `app/`, file `"use client"` trong `lib/`). BE = `next` (`app/api/`, `lib/`, `prisma/`, `scripts/`, `middleware.ts`, `auth.ts`), `rag`, `worker`.
- Output: report `.handoff/doctor/DOCTOR-<date>.md`, dữ liệu đầy đủ `.handoff/doctor/latest.json` (cả hai gitignore). Baseline `.handoff/doctor/baseline.json` thì commit.
- Check thiếu tool thì báo `skipped` kèm cách cài (ruff, mypy và pip-audit đến từ extra `[dev]` của `roadmap-rag-assistant`). `PY-MYPY` chạy với `--no-site-packages`: chỉ kiểm code của repo, thư viện ngoài coi là `Any`, nên kết quả giống nhau ở mọi máy. `CIRCULAR-IMPORT` chỉ tính import chạy lúc load module (bỏ `import type` và `import()` động). `DEPS-PIP-AUDIT` audit gói đã cài trong `.venv` của từng service, nên kết quả theo máy đang chạy.
- Không bao giờ vào baseline, lần nào có cũng tính là mới: finding cấp toàn bộ (test suite fail), lỗi `BUILD-TSC` (CI đòi 0 lỗi) và `SEC-SECRET`.
- Chỉ ghi baseline khi working tree ổn định (tsc và test pass), ngay trước khi commit. Baseline ghi giữa lúc đang sửa dở sẽ nhận luôn finding tạm thời. Vitest có vài test đo thời gian hay flaky; fail ở test khác nhau giữa các lần chạy thì chạy lại trước khi báo.

## 3. Đọc kết quả

1. Mở report, đọc bảng tóm tắt. Cột **mới** là finding chưa có trong baseline. Đây là phần cần chú ý trước.
2. `bug` mới: nêu ngay cho user kèm `file:line` và hướng sửa.
3. Finding heuristic cần xác nhận bằng cách đọc code trước khi báo là bug: `BE-ROUTE-VALIDATION` (có thể đã validate tay), `BE-FETCH-TIMEOUT` (có thể là code chạy trong browser), `FE-EFFECT-FETCH`, `DEAD-KNIP` (file có thể được nạp động), `BE-QUERY-IN-LOOP` (vòng lặp phân trang theo cursor là cố ý).
4. Check gắn với invariant của repo:
   - `BE-ROUTE-AUTH`: route phải tự gọi guard, không chỉ dựa vào middleware (phòng thủ nhiều lớp, ADR-0019).
   - `PY-ROUTE-AUTH`: service FastAPI chỉ phục vụ request có `x-internal-key` hợp lệ; chỉ `/health` được miễn.
   - `BE-RAG-REINDEX`: route ghi `Roadmap`/`RoadmapItem` phải gọi `notifyRoadmapChanged`, nếu không Abot trả lời bằng index cũ.
5. Check `DS-*` theo `docs/design-system.md`, đều ở mức `nit`: CI báo trong report nhưng không chặn. Khi sửa một file UI, dọn luôn finding `DS-*` của file đó.
6. Báo cáo cho user theo mẫu ở mục 6.

## 4. Mode `full`: phần agent đọc code

Chạy `yarn doctor --mode full` trước, rồi làm các bước dưới cho vùng đã chọn. Mỗi bước là một nhóm trong report, ghi rõ đã đọc file nào.

| Nhóm | Đọc gì | Đối chiếu |
|---|---|---|
| AuthZ | Mọi `app/api/**/route.ts` có finding hoặc mới đổi; `middleware.ts`; `lib/auth/*` | ADR-0002, ADR-0017, ADR-0019: Owner-only, guard chạy trước khi đọc dữ liệu, route nhận `x-internal-key` phải so khớp giá trị |
| SSRF | `lib/news/feed-discovery.ts`, `lib/news/rss-fetcher.ts`, `news-ingest-worker/news_worker/ssrf.py` và chỗ gọi | URL do user nhập phải qua kiểm tra host public trước khi fetch; redirect cũng phải kiểm |
| Contract | Route `BE-ROUTE-VALIDATION`; schema trong `lib/*/schemas.ts`; `roadmap-rag-assistant/rag_service/api/schemas.py` | Body được validate đủ field; error shape `{ error }` và status code thống nhất |
| Convention FE | File `ui` mới đổi | Giá trị optional hiển thị qua `format*`; `useCallback`/`useMemo` có lý do; tên prop theo component; phần review tay của `docs/design-system.md` (contrast, trạng thái không chỉ bằng màu, `aria-label` cho nút chỉ có icon) |
| Manual test | `tests/manual/README.md` và kịch bản liên quan tới file đổi | Case `Pass` mà code liên quan đã đổi sau commit của lần chạy thì đánh dấu cần chạy lại |
| Dependency JS | Giao cho skill `risk-deps-tracker` | Không tự parse `npm audit` |
| Bảo mật sâu | Giao cho skill `security-audit` khi user yêu cầu audit | Doctor chỉ nêu điểm nghi ngờ |
| Bundle, React | Giao cho `next-bundle-optimizer` và `vercel-react-best-practices` | Chỉ khi user hỏi về hiệu năng FE |

## 5. Gắn vào luồng làm việc

| Lúc | Làm gì |
|---|---|
| Trước khi lập plan (`think`, `cris-how-to-sync`) | `yarn doctor --scope <vùng sắp sửa>`; plan ghi rõ sửa finding nào, để lại finding nào |
| Giao task (`agent-handoff`) | `verification_gate` có `doctor_delta: "yarn doctor --since HEAD --check"` |
| Sau khi sửa code (`verify-ci`, `verifier`) | Có baseline thì chạy `yarn doctor --since <nhánh gốc> --check` |
| Sau khi sửa xong finding | Chạy `yarn doctor --update-baseline` để baseline giảm theo, commit `baseline.json` cùng thay đổi |
| CI (job `doctor`) | `yarn doctor --check` ở mode quick cho mọi PR và push `main`. Fail thì xem artifact `doctor-report`. Finding mới là cố ý (hoặc vừa nâng ruff) thì chạy `--update-baseline` và commit baseline |
| Định kỳ | `yarn doctor --mode full`, rồi đề xuất cho Owner các `bug` cần đưa vào `BACKLOG.md` |

## 6. Mẫu báo cáo cho user

```markdown
### Cris Doctor: <date> · <target> · <mode>

| Check | bug | risk | nit | mới |
|---|---|---|---|---|

**Bug mới cần xử lý**
- `file:line`: mô tả, hướng sửa

**Đã xác nhận là false positive** (nếu có)
- `file:line`: lý do

**Chưa kiểm được:** check `skipped`/`error` và lý do
```
