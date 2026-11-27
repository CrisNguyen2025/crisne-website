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

## Theme roadmap và news (Figma mặc định + Brand options)

Nút "Tùy chọn" (…) ở header trang chủ, trang topic/lesson (`LectureShell`) và `/news` cho chọn theme.

- Lựa chọn lưu trong localStorage key `design` (`hooks/use-design.ts`), gắn `data-design="<theme>"` lên `<html>` (mặc định `default` = **Figma** thì không gắn). Đây là setting riêng, tách khỏi light/dark của `theme-provider`.
- Theme mặc định (`.roadmap-theme` trong `app/styles/roadmap-theme.css`) áp hệ **Figma** trên bố cục giấy nổi 90/9/1 (`#f7f7f5` desk → `#ffffff` sheet, `#000000` primary/ink, `#1ea64a` / `#157a36` rail/accent; Dark: `#050505` → `#121214`, `#dceeb1` accent).
- Mỗi theme thay thế là một file `app/styles/<theme>-theme.css`, chỉ ghi đè token trong `.roadmap-theme`. Abot widget (`AbotMascot` và khung chat) cùng `/portfolio` không đổi theo.
- Chỗ nào lệch so với file nguồn thì có comment `repo:` trong CSS: contrast chữ nhỏ ≥ 4.5:1, giữ token trạng thái Lesson theo ADR-0010, giữ màu lỗi khi nguồn không có màu semantic.
- Màu mới cho theme thêm vào file theme, không viết hex trong component (`DS-RAW-COLOR` vẫn áp dụng).

| Theme | Nguồn token | Light/dark | Ghi chú |
|---|---|---|---|
| Figma (Mặc định) | [getdesign.md/figma/design-md](https://getdesign.md/figma/design-md) | Light & Dark | `#f7f7f5` / `#000000`, rail `#1ea64a` (`#157a36` cho chữ nhỏ), Dark `#050505` / `#dceeb1` |
| Perplexity | Palette `perplexity.ai` | Light & Dark | `#f3f3ee` / `#13343b`, rail `#1fb8cd` (`#186b76` cho chữ nhỏ) |
| Cursor | Palette `cursor.com` | Light & Dark | `#f7f7f4` / `#26251e`, rail `#f54e00` (`#b83a00` cho chữ nhỏ) |
| Anthropic | Palette ấm trước đây của `.roadmap-theme` | Light & Dark | `#f7f5f0` / `#141413`, rail `#d97757` (`#a54628` cho chữ nhỏ) |
| Linear | [getdesign.md/linear/design-md](https://getdesign.md/linear/design-md) | Light & Dark | Dark `#08090a` / `#111215` / `#5e6ad2`; Light suy dẫn `#f4f5f7` / `#4550b5` |
| Letters | `letters.app` & [getdesign.md/design-md/letters](https://getdesign.md/design-md/letters) | Light & Dark | `#f2f2f4` / `#070709`, rail `#2597d0` (`#166ac4` cho chữ nhỏ); Dark suy dẫn |
| Stripe | [getdesign.md/stripe/design-md](https://getdesign.md/stripe/design-md) | Light & Dark | `#f6f9fc` / `#0d253d`, rail `#533afd` (`#4434d4` chữ nhỏ), bóng ánh `#003770` |
| Discord | [getdesign.md/discord/design-md](https://getdesign.md/discord/design-md) | Light & Dark | Dark `#0d0f24` / `#5865f2` / `#00b0f4`; Light suy dẫn `#f3f4f8` / `#4450c9` |
| Apple | [getdesign.md/apple/design-md](https://getdesign.md/apple/design-md) | Luôn light | System font (SF Pro trên máy Apple) |
| Railway | DESIGN.md "Inspired by Railway" (2026-11-27) | Luôn dark | IBM Plex Serif cho heading (`--font-plex-serif`), Inter cho body |
| PostHog | [designmd.me/discover/posthog/raw](https://designmd.me/discover/posthog/raw) | Light & Dark | Stack fallback hệ thống |

Các nguồn trích xuất bên thứ ba không phải tài liệu chính thức của từng hãng.

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
