# Design system

Quy ước UI cho code mới của `crisne-website`. Skill `cris-doctor` bắt các rule có mã `DS-*` (mức `nit`, CI chỉ báo trong report, không chặn). Code cũ đã nằm trong baseline; sửa file nào thì dọn luôn finding của file đó.

## Nguồn token

| Thứ | Ở đâu |
|---|---|
| Token màu, font, radius toàn site (light/dark) | `app/styles/globals.css`: `@theme inline`, `:root`, `.dark` (Tailwind v4, không có `tailwind.config`) |
| Token editorial và trạng thái Lesson (`--status-target`, `--status-learning`, `--status-known`, `--editorial-*`) | `app/styles/roadmap-theme.css`, chỉ có hiệu lực trong `.roadmap-theme` |
| Lớp layout dùng chung (`section-padding`, `section-container`…) | `app/styles/spacing.css` |
| Primitive UI | `components/ui/*.tsx`, sinh bằng shadcn (style `base-nova`, `components.json`) |
| Icon | `lucide-react` |

Tài liệu gốc: [Tailwind CSS v4: Theme variables](https://tailwindcss.com/docs/theme), [shadcn/ui: Theming](https://ui.shadcn.com/docs/theming).

## Theme roadmap và news (Default / Apple / Railway / PostHog)

Nút "Tùy chọn" (…) ở header trang chủ, trang topic/lesson (`LectureShell`) và `/news` cho chọn theme.

- Lựa chọn lưu trong localStorage key `design` (`hooks/use-design.ts`), gắn `data-design="<theme>"` lên `<html>` (Default thì không gắn). Đây là setting riêng, tách khỏi light/dark của `theme-provider`.
- Mỗi theme là một file `app/styles/<theme>-theme.css`, chỉ ghi đè token trong `.roadmap-theme`. Abot widget và `/portfolio` không đổi theo.
- Theme chỉ gồm token màu, font, radius, shadow và typography của `.editorial-prose`. Bố cục trang của site gốc (nav, tile, breakpoint riêng) không áp.
- Chỗ nào lệch so với file nguồn thì có comment `repo:` trong CSS: contrast chữ nhỏ ≥ 4.5:1, giữ token trạng thái Lesson theo ADR-0010, giữ màu lỗi khi nguồn không có màu semantic.
- Màu mới cho theme thêm vào file theme, không viết hex trong component (`DS-RAW-COLOR` vẫn áp dụng).

| Theme | Nguồn token | Light/dark | Font |
|---|---|---|---|
| Apple | [getdesign.md/apple/design-md](https://getdesign.md/apple/design-md) | Luôn light | System font (SF Pro trên máy Apple) |
| Railway | DESIGN.md "Inspired by Railway" do Owner cung cấp (2026-11-27), một số màu được file ghi là suy đoán | Luôn dark | IBM Plex Serif cho heading (`--font-plex-serif`, `next/font`, không preload), Inter cho body |
| PostHog | [designmd.me/discover/posthog/raw](https://designmd.me/discover/posthog/raw) | Theo site: light là bản đo được, dark lấy từ khối `themes` của file (file ghi là suy ra) | Stack fallback của file, vì RoundHog không có file font công khai |

Cả ba nguồn đều là bản phân tích của bên thứ ba từ site công khai, không phải tài liệu của Apple, Railway hay PostHog, và không được họ chấp thuận.

## Rule

| Mã | Rule | Cách đúng |
|---|---|---|
| `DS-RAW-COLOR` | Không dùng màu viết cứng: hex/`rgb()`/`hsl()`/`oklch()` trong tsx, giá trị tuỳ ý `[#…]`, hay màu palette thô của Tailwind (`bg-rose-500`, `text-sky-600`…) | Dùng token: `bg-background`, `text-muted-foreground`, `text-destructive`, `bg-[var(--status-learning-bg)]`. Thiếu màu thì thêm token vào `:root` và `.dark` (hoặc `.roadmap-theme`) |
| `DS-DARK-VARIANT` | Không viết `dark:` trong component | Token đã có giá trị cho `.dark`. Ngoại lệ: `dark:prose-invert` |
| `DS-ARBITRARY-VALUE` | Không dùng cỡ chữ, spacing, z-index tuỳ ý (`text-[0.8125rem]`, `p-[7px]`, `z-[60]`) | Dùng thang Tailwind. Cần cỡ mới thì khai báo theme variable (`--text-*`, `--spacing-*`) trong `@theme` của `globals.css` rồi dùng như class thường |
| `DS-RAW-BUTTON` | Không dùng `<button>` thô | `<Button>` từ `@/components/ui/button`. Thiếu kiểu thì thêm `variant`/`size` vào `buttonVariants` (cva) thay vì tự viết class |
| `DS-STATIC-INLINE-STYLE` | `style={{…}}` chỉ cho giá trị tính lúc runtime (AGENTS.md) | Giá trị cố định chuyển sang class Tailwind |
| `DS-ICON-LIB` | Chỉ một bộ icon | `lucide-react`; không thêm `react-icons`, `@heroicons/*`, `@tabler/icons-react`, `@radix-ui/react-icons`, `@phosphor-icons/*` |

## Ngoại lệ

- `components/ui/*.tsx` (primitive shadcn ở cấp đầu thư mục): giữ nguyên như CLI sinh ra, doctor không quét. Thư mục con như `components/ui/editor/**` vẫn bị quét.
- `opengraph-image.tsx`, `icon.tsx`, `apple-icon.tsx`, `twitter-image.tsx`: `ImageResponse` chỉ nhận inline style và màu cụ thể.
- Màu cụ thể trong thuộc tính SVG (`fill`, `stroke`, `stopColor`, `floodColor`), ví dụ logo thương hiệu, và `themeColor` của viewport (meta tag, không đọc được CSS variable).

## Không có check tự động (review tay)

- Contrast chữ thường ≥ 4.5:1, chữ lớn ≥ 3:1 ở cả light và dark.
- Trạng thái không chỉ phân biệt bằng màu: có icon hoặc nhãn đi kèm (ví dụ trạng thái Lesson theo ADR-0010).
- Nút chỉ có icon phải có `aria-label`.
