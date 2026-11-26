# PLAN: Thống nhất Brand Concept & Semantic Design Tokens

- **Trạng thái:** `DRAFT`. Chờ Owner chốt Phase 0 (wireframe + Q1–Q5) trước khi Claude Code tách `TASK-*` cho Antigravity.
- **Ngày lập:** 2026-11-26 · **Cập nhật:** 2026-11-26 (rút gọn sau review: bỏ Portfolio/Cris AI và OG khỏi phạm vi, thêm bước wireframe, đổi "Big Update" thành gộp token rồi dọn từng file, SDK dùng namespace token riêng)
- **Mốc codebase đối chiếu:** `main` @ `5c898b2`
- **Domain:** `design-system`, `components/ui`, `roadmap-learning`, `news-inbox`, `roadmap-assistant-abot`, `auth-security` (`/login`)
- **Tài liệu liên hệ:** [`docs/design-system.md`](../docs/design-system.md), [`AGENTS.md`](../AGENTS.md) (mục *Phạm vi hiện tại*), [`docs/adr/0010`](../docs/adr/0010-lesson-status-known-learning-target.md), [`docs/adr/0019`](../docs/adr/0019-owner-only-site-no-public-news.md), [`.handoff/specs/TASK-visual-hierarchy-001.md`](./specs/TASK-visual-hierarchy-001.md)..[`004.md`](./specs/TASK-visual-hierarchy-004.md)

---

## 1. Bài toán

### 1.1 Mục tiêu
Các màn Owner dùng hằng ngày (Lesson, Topic, News, Abot, `/login`, Search Palette) dùng **một bộ token duy nhất** ở `:root`/`.dark` và một bản sắc. Màu, cỡ chữ và nút đi qua token và primitive, không viết cứng.

Không đặt mục tiêu "thay toàn bộ component trong một đợt". Gộp token là phần lớn giá trị: khi mọi màn đọc chung `:root`, đổi palette ở một chỗ là mọi bề mặt đổi theo. Phần còn lại dọn theo từng file, đúng cách `docs/design-system.md` đang làm (baseline, sửa file nào dọn finding file đó).

### 1.2 Hiện trạng đã kiểm trong code

| Vùng | Hiện trạng | Vấn đề |
|---|---|---|
| Global `:root` (`app/styles/globals.css`) | Steel Blue (`#6b9ac4`, `--color-steel*`, hue 240) | `/login` ăn màu này, lệch với Workspace. `--primary` Steel quá nhạt khi đặt chữ trắng lên. |
| Workspace & News (`app/styles/roadmap-theme.css`, áp qua `.roadmap-theme` ở `app/[topicSlug]/layout.tsx`, `app/(news)/layout.tsx`) | Giấy ấm `#faf9f5`/`#161513`, accent `#c04a30`/`#e3745b`, token `--status-*` | Token chỉ sống trong `.roadmap-theme`. `app/layout.tsx` (`themeColor`) và `app/manifest.ts` cũng dùng `#faf9f5`/`#161513`. |
| Abot SDK (`roadmap-rag-assistant/sdk/typescript/src/react/`) | `tokens.ts` có `CHAT_COLORS` (hex riêng, lệch nhẹ `roadmap-theme.css`), `RoadmapChatbotWidget.tsx` gắn `WIDGET_THEME_VARS` inline lên root widget | 666 literal hex (71 trong số đó là `fill`/`stroke`/`stopColor` SVG, hợp lệ theo `design-system.md`; `AbotMascot.tsx` 42, `abotMascotPaths.tsx` 43), 41 `dark:`, 82 `<button>`. `WIDGET_THEME_VARS` đặt `colorScheme: "light"` và ghi đè các tên chung `--bg`, `--background`, `--accent` ngay trong widget, nên widget không có dark mode thật và che token của host. Launcher còn màu Steel (`#181A20`, `#8BB5D9`). Mắt `AbotMascot` xanh `#0EA5E9`, thân `abotMascotPaths` nâu đất. |
| Shared UI | `@base-ui/react` (shadcn `base-nova`) + `antd` + `react-toastify` + `ROADMAP_*_BTN_CLASS` | `antd` chỉ còn ở 3 file: `components/ui/editor/nodes/ImageComponent.tsx`, `plugins/ImagesPlugin/index.tsx`, `plugins/ToolbarPlugin/index.tsx`. `react-toastify` chỉ ở `components/ui/toast.tsx`. Màu callout lặp ở `globals.css` và `editor.css`. `motion` chỉ dùng ở `components/ui/lens.tsx`, còn lại 17 file dùng `framer-motion`. `components.json` trỏ sai `"css": "app/globals.css"` (file thật `app/styles/globals.css`). |
| Font (`app/layout.tsx`) | Đã nạp `Inter`, `JetBrains_Mono`, `Fraunces` qua `next/font/google` | Các option ở mục 2 dùng được font sẵn có; option nào cần font khác (`Helvetica Neue`, `Avenir Next`, `Iowan Old Style`) thì chỉ là fallback hệ thống, không nạp thêm. |

Số liệu `cris-doctor --scope ui` @ `5c898b2`: 319 finding `DS-*` (`DS-RAW-BUTTON` 114, `DS-RAW-COLOR` 101, `DS-ARBITRARY-VALUE` 81, `DS-STATIC-INLINE-STYLE` 14, `DS-DARK-VARIANT` 9). Doctor chưa quét SDK và `components/ui/*.tsx` cấp đầu.

### 1.3 Phạm vi

**Làm:**
- Chốt một Brand Concept qua wireframe trên màn thật (Phase 0).
- Gộp `.roadmap-theme` vào `:root`/`.dark`, gộp callout, sửa `components.json`.
- Gỡ `antd` khỏi editor, thay `react-toastify`, bỏ `motion` (giữ `framer-motion`).
- Đưa Abot SDK sang namespace token riêng có dark mode.
- Dọn `DS-*` theo từng màn trong phạm vi, gắn với các spec `visual-hierarchy` đã có.

**Không làm:**
- **Portfolio (`/portfolio`) và Cris AI (`components/floating-bot/**`, `hooks/use-floating-chat.ts`):** ngoài phạm vi theo `AGENTS.md`. Ngoài ra theo ADR-0019 và `middleware.ts`, mọi route trừ `/login` đều chuyển về trang đăng nhập, nên Portfolio không có Visitor nào xem. Sau khi gộp token, Portfolio có thể lệch màu vì còn dùng `--color-steel*`; chấp nhận, ghi vào BACKLOG.
- **OG image (`opengraph-image.tsx`):** crawler bị chuyển về `/login` nên không thấy ảnh. Giữ nguyên.
- Backend, `prisma/schema.prisma`, Python service, phân quyền, luồng 👍/👎 của Cris AI (ADR-0003, ADR-0011).
- Không tự viết lại primitive shadcn ở `components/ui/*.tsx` cấp đầu. Thêm primitive bằng `shadcn add`, thiếu kiểu thì thêm `variant`/`size` vào cva.
- Không thêm UI framework nặng (`antd`, MUI, Chakra, `react-icons`).

---

## 2. Đề xuất 4 Brand Color & UI Concept Directions (Để trao đổi với Claude Agent)

Các phương án dưới đây tránh các mẫu AI mặc định (tránh nền kem + terracotta rập khuôn, tránh thẻ SaaS bo tròn đồng loạt, tránh nhiều màu cầu vồng trang trí), dùng **OKLCH / WCAG AA+** và phân biệt rõ **typography, hình khối (radius/border), mật độ hiển thị và bảng màu** cho cả `Portfolio`, `Workspace`, `News` và `Abot`.

### Option 01 — **Swiss Index** *(Precision Editorial Grid — Dieter Rams / Vignelli / Linear)*
- **Ngôn ngữ UI & Hình khối:** Lưới 1px sắc nét, không đổ bóng trang trí, góc bo `4px` gọn, sidebar cố định bên trái dẫn vào bảng danh sách bài học.
- **Typography:** Neo-Grotesque tracking chặt (`Helvetica Neue` / `Inter` weight 700 cho display, 400 cho thân bài) kết hợp `JetBrains Mono` (`tabular-nums`) cho metadata và số đếm.
- **Bảng màu cốt lõi:**
  - **Light:** Cool Paper `#F6F6F3` · Surface `#FFFFFF` · Recessed `#ECECE6` · Ink `#111111` · Muted `#555550` · Rule `#D6D6CE` · **Signal Cobalt** `#0047AB` (7.9:1 trên trắng).
  - **Dark:** Carbon `#0D0D0D` · Surface `#151515` · Recessed `#1E1E1C` · Ink `#F2F2EE` · Muted `#8E8E88` · Rule `#292925` · **Signal Cobalt** `#6CA8FF`.
  - **Status:** Target `#0047AB` / `#6CA8FF` · Learning `#9E4F00` / `#F2A65A` · Known `#454540` / `#9E9E98` (giữ trung tính, không xanh lòe loẹt) · Danger `#C62828` / `#F87171`.

### Option 02 — **Sumi & Jade** *(Modernist Print & Calm Reading — Muji / Kinfolk / Craft)*
- **Ngôn ngữ UI & Hình khối:** Cột đọc trung tâm rộng thoáng, phân tách tầng bằng sắc độ nền thay vì khung viền dày; card bo `10px`, nút thao tác & bộ chọn trạng thái dùng dạng pill (`9999px`).
- **Typography:** Serif biểu cảm (`Fraunces` / `Iowan Old Style`) cho tiêu đề Topic, Lesson và Hero statement, đi cùng Sans trung tính cho điều khiển giao diện.
- **Bảng màu cốt lõi:**
  - **Light:** Washi Stone `#F1F0EC` · Surface `#FAFAF8` · Recessed `#E7E5DF` · Sumi Ink `#181A18` · Muted `#585C58` · **Celadon Jade** `#1B5E4B` (7.6:1 contrast).
  - **Dark:** Deep Moss `#111412` · Surface `#181C19` · Recessed `#212723` · Ink `#E8ECE8` · Muted `#8E9790` · **Jade** `#63C7A3`.
  - **Status:** Target `#265985` / `#7DB5E8` · Learning `#9C5B12` / `#E4A856` · Known `#4B5751` / `#99A69E` (tách riêng khỏi Jade brand accent) · Danger `#B8383B` / `#F07174`.

### Option 03 — **Nordic Instrument** *(Developer Workbench — Teenage Engineering / Zed / Braun)*
- **Ngôn ngữ UI & Hình khối:** Thanh lệnh `⌘K` trên đỉnh, layout chia pane kỹ thuật, góc bo `6px` kèm mép nổi nhẹ (`inset 0 -1px`) trên nút chính, hợp người đọc code và viết tài liệu kỹ thuật hằng ngày.
- **Typography:** Geometric Sans (`Avenir Next` / `Inter`) kết hợp `JetBrains Mono` cho badge, slug và phím tắt.
- **Bảng màu cốt lõi:**
  - **Light:** Cool Chalk `#EEF2F6` · Surface `#FFFFFF` · Recessed `#E3E8EF` · Ink `#111827` · Muted `#4B5563` · Border `#CFD7E3` · **Instrument Amber** `#BD4B0C` (5.0:1 chữ trắng).
  - **Dark:** Slate Night `#0D1117` · Surface `#161B22` · Recessed `#21262D` · Ink `#E6EDF3` · Muted `#8B949E` · Border `#30363D` · **Instrument Amber** `#F3944E`.
  - **Status:** Target `#1D4ED8` / `#60A5FA` · Learning `#BD4B0C` / `#F3944E` · Known `#15803D` / `#4ADE80` · Danger `#DC2626` / `#F87171`.

### Option 04 — **Monolith Ink** *(Stark Broadsheet Editorial — NYT Magazine / Vercel Mono)*
- **Ngôn ngữ UI & Hình khối:** Tương phản đen/trắng tối đa, chia cột bằng đường kẻ `1px` sắc cạnh (`0px` radius cho khối nội dung) đối lập với nút CTA dạng viên nang (`9999px`).
- **Typography:** Display weight `800` tracking chặt (`-0.04em`) tạo độ tương phản kích thước rõ với body `400`.
- **Bảng màu cốt lõi:**
  - **Light:** Pure White `#FFFFFF` · Recessed `#F4F4F5` · Ink `#09090B` · Muted `#52525B` · Border `#E4E4E7` · **Vermilion Mark** `#C81E1E` (chỉ dùng cho điểm nhấn sống, focus, unread).
  - **Dark:** Pitch `#09090B` · Surface `#111114` · Recessed `#18181C` · Ink `#FAFAFA` · Muted `#A1A1AA` · Border `#27272A` · **Vermilion Mark** `#F87171`.
  - **Status:** Target `#09090B` / `#FAFAFA` · Learning `#9A3412` / `#FB923C` · Known `#52525B` / `#A1A1AA` · Danger `#C81E1E` / `#F87171`.

### Ma trận so sánh nhanh cho buổi trao đổi Concept

| Tiêu chí | 01 Swiss Index | 02 Sumi & Jade | 03 Nordic Instrument | 04 Monolith Ink |
|---|---|---|---|---|
| **Bản sắc chính** | Chỉ mục kỹ thuật sắc nét | Đọc viết điềm tĩnh, editorial | Công cụ kỹ sư / IDE | Ấn phẩm tương phản cực mạnh |
| **Hình khối đặc trưng** | `4px`, lưới `1px`, không bóng | `10px` card + `pill` CTA | `6px` machined + `⌘K` | `0px` khung kẻ + `pill` CTA |
| **Khớp Portfolio + Workspace + Abot** | Rất đồng nhất trên mọi trang | Rất hợp bài dài & Portfolio craft | Rất hợp Developer Identity & News | Tối giản mạnh, không lỗi thời |
| **Mức độ tách khỏi AI slop** | Cao (không kem/terracotta, không glow) | Cao (stone + celadon + serif thật) | Cao (cool slate + amber) | Rất cao (achromatic + 1 signal) |

### Ghi chú khi chọn option

- **Chọn trên wireframe, không chọn trên bảng hex** (Phase 0). Hàng "Khớp Portfolio" trong ma trận không còn là tiêu chí vì Portfolio ngoài phạm vi; tiêu chí chính là đọc Lesson dài và quét News inbox hằng ngày.
- **Cả 4 option đều bỏ palette ấm hiện tại.** Phải cập nhật thêm `themeColor` (`app/layout.tsx`), `app/manifest.ts`, và xem lại thân mascot (`abotMascotPaths.tsx`, nâu đất `#311A13`/`#F3BB9E`) có còn hợp tông không.
- **Option kèm đổi hình khối (radius, border, pill) và typography**, không chỉ màu. Phần màu và radius nằm ở Phase 1 (token); phần layout (sidebar, pane, `⌘K` trên đỉnh, cột đọc) là thay đổi bố cục, chỉ làm trong Phase 4 cùng spec `visual-hierarchy` của từng màn, không gộp vào Phase 1.
- **Lesson Status (ADR-0010):** option nào cũng phải giữ đúng 3 giá trị `target`, `learning`, `known` và kèm icon hoặc nhãn. Option 03 dùng cùng màu Amber cho `learning` và accent thương hiệu: cần tách, nếu không thì trạng thái và điểm nhấn trùng nhau.
- **Contrast** của các con số ghi tay (7.9:1, 7.6:1, 5.0:1...) được kiểm lại bằng script ở Phase 1.

---

## 3. Kiến trúc token

```
app/styles/globals.css (@theme inline + :root + .dark)   ← nguồn duy nhất
  ├── Surface & Ink: background, foreground, card, surface-subtle, border, border-strong
  ├── Brand: primary, brand-accent, brand-accent-soft, ring
  ├── Semantic: info / success / warning / danger (+ -bg, -border, -fg)
  ├── Callout: dùng lại Semantic, bỏ bản lặp ở editor.css
  ├── Lesson Status: status-target / status-learning / status-known (+ -bg, -border)
  └── Scale: --text-* (gồm --text-2xs nếu cần), --radius-*, z-index, shadow

lib/design/brand-tokens.ts   ← chỉ cho nơi không đọc được CSS var: themeColor (layout.tsx), manifest.ts

Abot SDK: namespace riêng --abot-*
  ├── tokens.ts: định nghĩa --abot-* với fallback light/dark khớp Brand Concept (chạy standalone vẫn đúng)
  └── Host (Next.js) map một lần: --abot-bg: var(--background); --abot-accent: var(--brand-accent); ...
```

**Quy ước:**
1. Bỏ `.roadmap-theme` như một theme riêng. `roadmap-theme.css` chỉ còn typography `.editorial-prose`, dùng biến của `:root`.
2. `--primary` (hành động chính, nút đặc) và `--brand-accent` (active, focus ring, link, dấu hiệu thương hiệu) tách vai. Accent không tô lên mọi dòng danh sách.
3. Không màu trang trí theo cảm tính. Ngoại lệ màu cứng: logo bên thứ ba và thuộc tính SVG, theo `design-system.md`.
4. Không `dark:` trong component (trừ `dark:prose-invert`), không giá trị tuỳ ý. Cỡ chữ nhỏ cần thì khai báo `--text-*` trong `@theme`.
5. **SDK không đọc thẳng token của host.** SDK chỉ biết `--abot-*`, host lo việc map. Giữ được tính độc lập của package (không import `@/components/ui/*`, không phụ thuộc tên token Next.js). `WIDGET_THEME_VARS` thôi ghi đè tên chung (`--bg`, `--background`, `--accent`) và thôi khoá `colorScheme: "light"`.

---

## 4. Lộ trình

| Phase | Nội dung | Xong khi | Phụ thuộc |
|---|---|---|---|
| **0. Chốt concept** (Owner ↔ Claude Code) | Bước 1: dựng cả 4 option trên Lesson reader (light và dark), Owner loại còn 2. Bước 2: dựng 2 option còn lại trên Lesson reader, News inbox và một sheet của Abot, light và dark (skill `evon:ui-ux`). Owner chọn. Trả lời Q2–Q5. Cập nhật `docs/design-system.md` mục *Nguồn token*. | Owner đã chọn một option trên ảnh; `design-system.md` ghi token mới | — |
| **1. Gộp token** | Chuyển token của `roadmap-theme.css` và callout lên `:root`/`.dark` theo option đã chọn (màu, radius, font); xoá `--color-steel*` khỏi các màn trong phạm vi; sửa `components.json`; tạo `lib/design/brand-tokens.ts` cho `layout.tsx`, `manifest.ts`; thêm script kiểm contrast các cặp token. | Script contrast pass (chữ ≥ 4.5:1, UI ≥ 3:1, cả light và dark); ảnh chụp trước/sau 3 màn ở Phase 0 khớp wireframe về màu; `yarn doctor --check` không tăng finding | 0 |
| **2. Dependency** (2 TASK độc lập, chạy song song được) | **2a.** Gỡ `antd` khỏi 3 file editor, thay bằng primitive shadcn (`shadcn add` input, select, dialog, tooltip), xoá `antd` khỏi `package.json`. **2b.** Thay `react-toastify` theo Q4, xoá `app/styles/toast.css`. Kèm: chuyển `lens.tsx` sang `framer-motion`, xoá `motion`. | Không còn import `antd`, `react-toastify`, `motion`; editor và toast chạy đúng ở light/dark (kịch bản trong `tests/manual/`) | 1 |
| **3. Abot SDK** | Namespace `--abot-*` + fallback light/dark trong `tokens.ts`, host map trong Next.js; chuyển hex và `dark:` trong component sang `--abot-*`; đổi màu Launcher; chỉnh mascot theo Q3. Gắn với `TASK-visual-hierarchy-002` (HITL Preview, Sheets). | Widget đổi theo dark mode của host; không còn hex ngoài thuộc tính SVG và `tokens.ts`; không còn `dark:`; selector SVG của mascot trong test giữ nguyên | 1 |
| **4. Dọn từng màn** | Lesson/Topic, News, `/login`, Search Palette: thay `<button>` thô và `ROADMAP_*_BTN_CLASS` bằng `<Button>` + variant, dọn `DS-*`, áp bố cục của option đã chọn. Đi cùng `TASK-visual-hierarchy-001/003/004` để không sửa một file hai lần. Mỗi màn một TASK. | `DS-*` của các file đã chạm về 0; chạy `yarn doctor --update-baseline` và commit baseline cùng thay đổi | 1 (và 2a cho màn có editor) |

Q5 (doctor quét SDK) nếu chọn (A) thì thêm vào Phase 3.

---

## 5. Câu hỏi cần Owner chốt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| **Q1** | Option nào trong 4 option ở mục 2? | Chọn qua 2 bước wireframe ở Phase 0. |
| **Q2** | 4 spec `TASK-visual-hierarchy-001..004` (đang `DRAFT`, viết theo giả định giữ `.roadmap-theme` tách khỏi `:root`) xử lý thế nào? | **Hấp thụ:** giữ quyết định UX ở mục 0 của từng spec (Lesson Status, HITL Preview, News TL;DR, progress của `PublicationHome`), viết lại phần token theo Phase 1, chạy ở Phase 3 và 4. Cần Owner liệt kê quyết định nào của mục 0 được giữ. |
| **Q3** | `AbotMascot` xử lý thế nào? | Giữ dáng và selector SVG. Đổi mắt (xanh `#0EA5E9`) sang `--brand-accent`, và xem thân nâu đất có cần đổi theo option đã chọn; quyết trên wireframe. |
| **Q4** | Thay `react-toastify` bằng gì? | `sonner` qua `shadcn add sonner` (bản shadcn đang dùng, theme bằng CSS var, đã lo a11y và xếp chồng). Tự viết thì phải tự làm lại phần đó. |
| **Q5** | `cris-doctor` có quét thêm Abot SDK không? | Có, check riêng cho SDK: cấm hex ngoài thuộc tính SVG và `tokens.ts`, cấm `dark:`. Không áp `DS-RAW-BUTTON` vì SDK không dùng `@/components/ui/button`. |

---

## 6. Sync effects (`cris-how-to-sync`)

- **ADR, Glossary:** không đổi ADR. ADR-0010 giữ nguyên (3 giá trị Lesson Status, không chỉ dựa vào màu). Không thêm thuật ngữ domain.
- **Phạm vi `AGENTS.md`:** không mở lại Portfolio/Cris AI. Ghi vào `.handoff/BACKLOG.md` việc Portfolio có thể lệch màu sau Phase 1.
- **Docs cùng commit:** `docs/design-system.md` (Phase 0 và 1: nguồn token, bỏ dòng `.roadmap-theme`, thêm `--abot-*`), `components.json` (Phase 1).
- **Doctor:** `yarn doctor --update-baseline` sau mỗi TASK làm giảm finding, commit `.handoff/doctor/baseline.json` cùng thay đổi.
- **Code intel:** nếu xoá hoặc đổi tên component có trong `cris-workspace-map.json` thì chạy `yarn intel status` và cập nhật map.
- **Không chạm:** schema, API, Python service, env.

---

## 7. Prompt cho phiên Phase 0

```text
Đọc `.handoff/PLAN-brand-design-system-unification.md`.
Làm Phase 0 bước 1: dựng 4 option ở mục 2 trên Lesson reader (light và dark, skill `evon:ui-ux`) để tôi loại còn 2.
Sau đó bước 2: dựng 2 option còn lại trên Lesson reader, News inbox và một sheet của Abot. Tôi chọn xong thì chốt Q2–Q5 với tôi rồi tách TASK cho Phase 1.
```
