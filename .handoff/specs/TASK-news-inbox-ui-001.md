---
task_id: "TASK-news-inbox-ui-001"
branch: "feat/news-ingest-phase-1"
version: "3.0.0"
type: "implement"
priority: "P1"
status: "COMPLETED"
assigned_executor: "claude" # agy 429 ngày 2026-11-22, Dev chọn Claude làm
max_attempts: 3
current_attempt: 1

boundaries:
  allowed_to_modify:
    - "components/news/NewsFeedClient.tsx"
    - "components/news/NewsCard.tsx"
    - "components/news/NewsReaderSheet.tsx"
    - "components/news/NewsReaderPanel.tsx"
    - "components/news/NewsDecisionBar.tsx"
    - "lib/news/schemas.ts"
    - "lib/news/queries.ts"
    - "app/(news)/news/page.tsx"
    - "app/(news)/news/sources/page.tsx" # thêm lúc làm: default view cũng là inbox
    - "tests/unit/news-feed-ui.test.tsx"
    - "tests/unit/news-schemas.test.ts"
    - "tests/route/news-feed-query.test.ts"
    - "tests/route/news-item-patch-route.test.ts" # thêm lúc làm: view all giờ gồm mọi bài
    - "tests/manual/news-inbox.md"
    - "tests/manual/README.md"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
  continues_dirty:
    - "components/news/NewsFeedClient.tsx"
    - "components/news/NewsCard.tsx"
    - "components/news/NewsReaderSheet.tsx"
    - "lib/news/schemas.ts"
    - "lib/news/queries.ts"
    - "app/(news)/news/page.tsx"
    - "tests/unit/news-feed-ui.test.tsx"
    - "tests/unit/news-schemas.test.ts"
    - "tests/route/news-feed-query.test.ts"
    - ".agents/skills/cris-code-intel/data/cris-workspace-map.json"
  read_only_references:
    - ".handoff/specs/assets/news-inbox-wireframe.html"
    - "app/styles/roadmap-theme.css"
    - "app/(news)/layout.tsx"
    - "components/news/QuickPasteDialog.tsx"
    - "components/news/SourcesManagerSheet.tsx"
    - "logic/news/newsService.ts"
    - "app/api/news/route.ts"
    - "docs/adr/0011-drop-knowledge-triage.md"
  strictly_forbidden:
    - "package.json"
    - "yarn.lock"
    - "tsconfig.json"
    - "prisma/**"
    - "app/api/**"
    - "lib/news/ingest.ts"
    - "news-ingest-worker/**"
    - "components/ui/**"

deploy_steps: []

fast_gate: ["type_check", "boundary_check"]
verification_gate:
  type_check: "yarn tsc --noEmit -p ."
  lint: "yarn eslint components/news lib/news 'app/(news)' tests/unit/news-feed-ui.test.tsx tests/route/news-feed-query.test.ts"
  test: "yarn vitest run tests/unit/news-feed-ui.test.tsx tests/unit/news-schemas.test.ts tests/route/news-feed-query.test.ts tests/route/news-item-patch-route.test.ts"
  intel_status: "yarn intel status"
  boundary_check: "bash .agents/skills/agent-handoff/scripts/check-boundary.sh TASK-news-inbox-ui-001"
---

# TASK: News thành hộp phân loại (bố cục A+B), phase 1 chỉ UI

> **Trạng thái hiện tại**: COMPLETED, chưa commit. Phase 2 (Nạp vào kho, gán Đã xử lý tự động) chưa làm.
>
> **Đổi sau review của Dev (2026-11-22)**, các mục bên dưới đã bị thay:
> - Tab chỉ còn `Tất cả` (`all` = mọi bài) · `Chờ xử lý` (`inbox`) · `Đã xử lý` (`done` = `isSaved` hoặc `dismissed`). Bỏ tab Để sau, Bỏ qua.
> - Thanh quyết định chỉ có **Bỏ qua**; bài đã xử lý có **Đưa lại Chờ xử lý**. "Đã xử lý" là trạng thái nền khi bài đã nạp vào Topic/Lesson (phase 2); tới lúc có field riêng, `isSaved` giữ chỗ.
> - Dòng danh sách không có nút nhanh; bấm cả dòng để mở bài.
> - Tag và Ghi chú nằm ở cột phải của panel khi panel rộng từ 672px.
> - Sửa lỗi mất data khi chuyển tab: mọi fetch bỏ response nếu bộ lọc đã đổi (`latestFilterKeyRef`, `dataKey`).

## 1. Context & Architectural Intent
- **Goal**: Đổi `/news` từ lưới card + sheet sang bố cục đã chốt "A+B · Hộp phân loại": danh sách bên trái (520px từ `xl`), panel xử lý bên phải, thanh quyết định cố định ở đáy panel. Dưới `xl` danh sách và panel là hai màn riêng.
- **Why**: Owner dùng News như hộp chờ: gửi link vào, rồi xét từng bài có nạp vào Topic/Lesson được không. Việc chính là quyết định từng bài và đi tiếp, không phải lướt tin.
- **Wireframe (nguồn sự thật về hình)**: `.handoff/specs/assets/news-inbox-wireframe.html`, mở bằng `?v=ab`. Xem thêm `&man=xl` (màn xử lý khổ hẹp), `&kho=mobile`, `&tt=dang-tai|rong|loi`. Token màu, font và class Tailwind trong wireframe khớp `app/styles/roadmap-theme.css`; dùng lại class, không tự chọn màu mới.
- **Dependencies**: `components/news/NewsFeedClient.tsx` (state, polling, nuqs), `NewsCard.tsx`, `NewsReaderSheet.tsx` (logic auto-read 3s với `latestItemRef`/`onToggleReadRef`), `lib/news/queries.ts#buildViewWhere`, `#computeNewsCounts`, `lib/news/schemas.ts#NewsFeedViewSchema`, `NewsCountsDto`, route PATCH `app/api/news/[id]/route.ts` (chỉ dùng, không sửa).

## 2. Invariants & Rules
- Rule dự án: `AGENTS.md`.
- **ADR-0011**: "Knowledge Triage" đã bị bỏ. Không dùng chữ `triage` trong tên biến, component, view, prop hay copy. View mới tên `inbox`; nhãn UI là "Chờ xử lý".
- Phase 1 **không** có khối "Nạp vào kho", không có nút "Nạp", không có tab "Đã nạp" (cần backend và quyết định ở phase 2). Panel chỉ có Bỏ qua / Để sau.
- Ánh xạ trên dữ liệu hiện có, không đổi schema Prisma:
  - Chờ xử lý (`inbox`) = `reviewStatus != dismissed` và `isSaved = false` (gồm cả draft từ cron).
  - Để sau (`saved`) = `isSaved = true` và `reviewStatus != dismissed`.
  - Bỏ qua (`dismissed`, view mới) = `reviewStatus = dismissed`.
  - Tất cả (`all`) giữ như cũ.
- Hành động:
  - Bỏ qua → PATCH `{ reviewStatus: "dismissed" }`.
  - Để sau → PATCH `{ isSaved: true }`, và thêm `reviewStatus: "published"` nếu bài đang là draft.
  - Trong tab Bỏ qua, nút đổi thành "Khôi phục" → `{ reviewStatus: "published" }`.
  - Trong tab Để sau, nút "Để sau" đổi thành "Đưa lại Chờ xử lý" → `{ isSaved: false }`.
  - Sau mỗi quyết định, panel chọn bài kế tiếp trong danh sách hiện tại; hết bài thì panel về trạng thái rỗng.
- Giữ nguyên: auto-read sau 3s (hành vi và test hiện có), polling khi có job, phím `N` mở QuickPasteDialog, SourcesManagerSheet, QuickPasteDialog, re-ingest, sửa tag và ghi chú, search `q`, lọc `origin`/`tag`/`sort` (gom vào một nút icon "Lọc" mở popover hoặc sheet nhỏ).
- View `unread`, `draft`, `queue` vẫn giữ trong `NewsFeedViewSchema` để URL cũ và `/api/news` không vỡ, chỉ không hiện thành tab. Dải "N link đang được tóm tắt · Xem hàng đợi" mở view `queue`.
- Default view của trang đổi từ `unread` sang `inbox`.
- Không thumbnail trong danh sách.
- Phím `J`/`K` chuyển bài khi không gõ trong ô nhập (dùng lại `isEditableTarget`).
- Không fetch trong `useEffect` mới. Polling và effect fetch đang có thì giữ nguyên.
- Giá trị optional khi hiển thị đi qua hàm format sẵn có (`formatFriendlyTime`, ...).
- Ngoài phạm vi: gợi ý Topic/Lesson, nạp vào Lesson, trạng thái "Đã nạp", schema Prisma, API route, worker Python, Cris AI.

## 3. Step-by-Step Implementation Checklist
- [ ] **Step 1**: `lib/news/schemas.ts`: thêm `"inbox"` và `"dismissed"` vào `NewsFeedViewSchema`; thêm `inbox: number` và `dismissed: number` vào `NewsCountsDto`. Cập nhật `tests/unit/news-schemas.test.ts` nếu có test enum view.
- [ ] **Step 2**: `lib/news/queries.ts`: thêm 2 case vào `buildViewWhere` và 2 count vào `computeNewsCounts` theo ánh xạ mục 2. Thêm test vào `tests/route/news-feed-query.test.ts`: `inbox` loại bài saved và dismissed, có draft; `dismissed` chỉ trả bài dismissed; counts đúng.
- [ ] **Step 3**: `app/(news)/news/page.tsx`: default view `inbox`.
- [ ] **Step 4**: `NewsCard.tsx` thành dòng danh sách theo `rowAB` trong wireframe: meta (chấm chưa đọc, icon platform, domain · author · thời gian), tiêu đề `font-display` 2 dòng (bài processing/failed hiện URL mono 1 dòng), TL;DR 2 dòng, nhãn trạng thái (RSS / Để sau / Đã bỏ qua / Đang tóm tắt / Lỗi / Chỉ có tiêu đề), nút nhanh Để sau và Bỏ qua chỉ hiện khi rê (luôn hiện trên thiết bị không hover), "Thử lại" cho bài lỗi. Dòng đang chọn: `bg-card` + vạch trái 2px. Giữ tên export `NewsCard` để không phá import.
- [ ] **Step 5**: Tạo `NewsReaderPanel.tsx` (panel inline, không phải sheet) theo `panelAB`, gồm: nút "← Danh sách" chỉ dưới `xl`; meta + `via <method>`; tiêu đề; "Mở nguồn gốc" và nút lưu; TL;DR viền trái màu nhấn; Ý chính; Tag (sửa được); Ghi chú; khối lỗi/re-ingest và bài trùng như sheet cũ. Chuyển logic auto-read nguyên vẹn từ `NewsReaderSheet.tsx`. Tạo `NewsDecisionBar.tsx` theo `decisionBar` (bỏ nút Nạp và câu gợi ý J/K tuỳ khổ như wireframe). Xoá `NewsReaderSheet.tsx` nếu không còn ai import (`grep -rn NewsReaderSheet`).
- [ ] **Step 6**: `NewsFeedClient.tsx`: layout cao đủ màn (`h-dvh`, header 1 hàng: ←, "News", ô tìm, nút Nguồn RSS dạng icon, "Thêm link"); cột trái gồm tab `Chờ xử lý · Để sau · Bỏ qua · Tất cả` có số đếm, nút "Lọc", dải đang xử lý, danh sách cuộn riêng; cột phải là panel. Từ `xl` tự chọn bài đầu tiên khi chưa chọn; dưới `xl` bấm bài thì ẩn danh sách, hiện panel. Trạng thái đang tải / rỗng ("Hộp đã trống") / lỗi theo wireframe `&tt=`. Nối handler Bỏ qua / Để sau / Khôi phục / J/K / tự sang bài kế theo mục 2.
- [ ] **Step 7**: Cập nhật `tests/unit/news-feed-ui.test.tsx` theo component mới, giữ test auto-read polling, thêm test: bấm Bỏ qua gọi handler với `dismissed`; Để sau trên draft gửi cả `isSaved: true` và `reviewStatus: "published"`.
- [ ] **Step 8**: `.agents/skills/cris-code-intel/data/cris-workspace-map.json`: cập nhật mục `private-news` (file mới, bỏ file xoá, mô tả hộp phân loại). Chạy `yarn intel status` cho xanh.
- [ ] **Step 9**: Chạy gate. Mở `/news` ở 1280px và 375px (dev server `yarn dev`, có `DEV_OWNER_BYPASS=true`), chụp màn để đính vào mục 5.

## 4. Verification Gate Results
<!-- Executor điền: PENDING | PASSED | FAILED | SKIPPED -->
- [x] `TypeCheck`: PASSED
- [x] `Lint`: PASSED
- [x] `Test`: PASSED (news 61/61; `yarn test` đủ bộ 106/106 ở 2 lần chạy lại, lần đầu 1 test chập chờn ngoài News)
- [x] `Intel Status`: PASSED
- [x] `Boundary Check`: PASSED (changed=13, violations=0)

## 5. Execution Audit Log
<!-- Executor điền. Không commit: Dev commit sau khi Claude verify -->
- **Result file**: `.handoff/runs/TASK-news-inbox-ui-001/result.json`
- **Modified Files**:
  - `lib/news/schemas.ts`, `lib/news/queries.ts`: view `inbox`, `dismissed` và số đếm
  - `app/(news)/news/page.tsx`, `app/(news)/news/sources/page.tsx`: default view `inbox`
  - `components/news/NewsCard.tsx`: dòng danh sách
  - `components/news/NewsReaderPanel.tsx`, `NewsDecisionBar.tsx`: mới; `NewsReaderSheet.tsx` đã xoá (bản sao ở scratchpad phiên)
  - `components/news/NewsFeedClient.tsx`: bố cục A+B, J/K, tự sang bài kế
  - `tests/unit/news-feed-ui.test.tsx`, `tests/route/news-feed-query.test.ts`
  - `.agents/skills/cris-code-intel/data/cris-workspace-map.json`
  - `tests/manual/news-inbox.md` (+ dòng trong `tests/manual/README.md`)
- **Bài học**: cập nhật nền (auto-read) không được khoá nút quyết định; test thủ công phải đưa tab trình duyệt ra trước, tab nền không hydrate.
