# PLAN: Cắt gọn `AGENTS.md` theo nghiên cứu về cách agent làm theo file chỉ dẫn

- **Trạng thái:** Phase A đã làm trên `main` (2026-11-09, chưa commit), Owner duyệt Q1 = (b), Q2 = (b). Q3, Q4, Q5 chưa trả lời: block GitNexus giữ nguyên, chưa thêm dòng Mermaid, chưa làm Phase B.
- **Người viết:** Claude Code (Opus 5.5), 2026-11-09
- **Phạm vi:** `AGENTS.md`, và tuỳ chọn `eslint.config.mjs` (Phase B). Không đụng code ứng dụng.
- **Liên quan:** `.handoff/PLAN-agent-instructions-sync.md` (cấu trúc 3 tầng, đã chốt). Plan này không đổi cấu trúc đó, chỉ đổi nội dung bên trong `AGENTS.md`.

---

## 1. Căn cứ

| Nguồn | Kết luận dùng cho plan này |
|---|---|
| [Gloaguen et al., ETH Zurich, 2026](https://arxiv.org/abs/2602.11988) | Context file không làm tỉ lệ giải task tăng rõ, nhưng chi phí tăng hơn 20%. Agent **làm theo** chỉ dẫn khá sát, nên mỗi rule thêm vào là thêm ràng buộc và thêm bước. Overview codebase không giúp. Thứ có ích: quy ước riêng không tự suy ra được |
| [Lulla et al., 2026](https://arxiv.org/abs/2601.20404) | File được biên soạn cẩn thận giảm khoảng 28.6% runtime và 16.6% output token |
| [McMillan, 2026](https://arxiv.org/abs/2605.10039) | Kích thước, vị trí, cách chia file, mâu thuẫn giữa file: không tạo khác biệt đo được. Độ tuân thủ giảm dần trong session dài (phát hiện thăm dò, chưa xác nhận) |
| [IFScale, 2025](https://arxiv.org/abs/2507.11538) | Càng nhiều chỉ dẫn cùng lúc thì độ chính xác càng giảm. Model có xu hướng ưu tiên chỉ dẫn nằm ở đầu |
| [Claude Code docs: memory](https://code.claude.com/docs/en/memory) | Mỗi file nên dưới 200 dòng. Hai rule mâu thuẫn thì Claude có thể chọn bừa một. Rule bắt buộc thì dùng hook hoặc tool, không dựa vào chữ |
| [Anthropic: context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Dùng ít token nhất mà vẫn đủ thông tin quan trọng. Chỉ để con trỏ trong context, khi cần agent mới đọc nội dung |

**Hệ quả:** ở mức 104 dòng / 7.1 KB, `AGENTS.md` chưa phải quá dài. Lợi ích chính của việc cắt **không nằm ở token**, mà ở chỗ bỏ các rule **chung chung** (model đã biết) và các rule **trái với code hiện tại** (agent làm theo sát nên dễ sửa lan ra ngoài scope, hoặc phải chọn giữa rule và code).

## 2. Đối chiếu mục Conventions với code (2026-11-09)

Kiểm bằng `grep`/`find` trên `app/`, `components/`, `lib/`, `hooks/`, và `eslint --print-config`.

| Dòng | Rule | Thực tế trong repo | Đề xuất |
|---|---|---|---|
| 34 | Không trộn Tailwind với inline style | 74 chỗ `style={{` trong ít nhất 8 file (`navbar.tsx`, `NotesClient.tsx`, `floating-shapes.tsx`...) | **Hỏi Owner** (Q1) |
| 35 | Không import server-only vào client | Test kiểm tra nguyên văn câu này | **Giữ nguyên văn** |
| 36 | Chỉ biến `NEXT_PUBLIC_` dùng ở client | Hành vi mặc định của Next.js | Bỏ |
| 37 | Không fetch trong `useEffect` | 6 file có `useEffect` kèm `fetch(` (`NotesClient.tsx`, `use-can-write.ts`, `ImagePreview.tsx`...) | **Hỏi Owner** (Q2) |
| 38 | Cleanup effect | Kiến thức React chung | Bỏ |
| 39 | Tách class lặp thành component | Kiến thức chung | Bỏ |
| 40 | Dùng responsive prefix nhất quán | Kiến thức Tailwind chung | Bỏ |
| 41 | Không dùng arbitrary value khi đã có utility | Kiến thức Tailwind chung | Bỏ |
| 42 | Auth guard dùng `middleware.ts` | Repo **không có** `middleware.ts` hay `proxy.ts`; quyền ghi nằm ở `lib/auth/write-access.ts`. Next 16 (repo dùng 16.2.9) đã deprecate `middleware.ts`, thay bằng `proxy.ts` ([Next.js 16](https://nextjs.org/blog/next-16)) | Bỏ (rule cũ, sai tên file) |
| 43 | Dùng `next/image`, không dùng `<img>` | ESLint đã bật `@next/next/no-img-element` (warn); 0 chỗ `<img ` | Bỏ, đã có lint bắt |
| 44 | Mọi async route có `loading.tsx` và `error.tsx` | 0 file `loading.tsx`, 0 file `error.tsx` trên 4 `page.tsx` | Bỏ. Nếu muốn có thì tạo task riêng |
| 45 | Mặc định Server Component | Kiến thức Next.js chung | Bỏ |
| 46 | Dùng Suspense và Error Boundary | Kiến thức React chung | Bỏ |
| 47 | Không hardcode secret | Test kiểm tra nguyên văn câu này | **Giữ nguyên văn** |
| 48 | Không để `console.log` | 19 chỗ trong `app/`, `lib/`... ESLint **chưa** bật `no-console` | Giữ, xem Phase B |
| 49 | Naming theo component/func | Rule riêng của repo, đã chốt ở plan sync (mục 4 dòng 9) | Giữ |
| 50 | Format giá trị optional | Rule riêng của repo, đã chốt ở plan sync | Giữ |

Lint hiện có: `@typescript-eslint/no-explicit-any` = error, `@typescript-eslint/ban-ts-comment` = error, `@next/next/no-img-element` = warn, `no-console` = chưa bật.

## 3. Các mục khác của `AGENTS.md`

| Mục | Đề xuất | Lý do |
|---|---|---|
| Commands, Manual Test, Safety, Core docs, Phạm vi hiện tại, Việc đang mở | Giữ | Đều là thông tin riêng của repo, agent không tự suy ra được |
| Skills (dòng 14–20) | Giữ | Câu "bắt buộc dùng trước khi lập plan" là rule, không chỉ là mô tả skill |
| Block GitNexus (dòng 52–83) | Không sửa ở plan này, chỉ hỏi Owner (Q3) | Nằm giữa marker `gitnexus:start/end`: chạy `gitnexus analyze` thiếu `--skip-agents-md` sẽ ghi đè. Rule "impact trước **mọi** function" làm mỗi lần sửa thêm tool call |
| Core docs: thêm 1 dòng về sơ đồ | Tuỳ chọn (Q4) | Phục vụ mục tiêu docs bằng Mermaid. Chỉ là con trỏ, không nhúng sơ đồ vào `AGENTS.md` |

## 4. Bản nháp mục Conventions sau khi sửa

Giả sử Q1 = (b) và Q2 = (b). Nếu Owner chọn khác thì thay dòng tương ứng.

```markdown
## 📐 Conventions

Chỉ ghi quy ước riêng của repo. Quy ước chung của Next.js/React/Tailwind và những gì ESLint đã bắt thì không ghi lại ở đây.

- Don't import server-only code in client components
- Không hardcode secret, API key, token, password trong code
- Không để console.log/debug log trong code commit
- Inline style chỉ dùng cho giá trị tính lúc runtime; còn lại dùng Tailwind
- Code mới không fetch data trong useEffect; dùng server action hoặc Server Component
- Naming props/biến theo đúng single component/func, không gắn use-case (sai: isChatLoading, đúng: isLoading)
- Giá trị optional khi hiển thị phải qua hàm format tương ứng (formatString, formatDateTime, ...)
```

Tuỳ chọn Q4, thêm vào mục Core docs:

```markdown
- Sơ đồ luồng kỹ thuật viết bằng Mermaid trong `docs/`, ghi file nguồn mà sơ đồ mô tả. Không nhúng sơ đồ vào `AGENTS.md` hay `CLAUDE.md`.
```

Kết quả dự kiến: mục Conventions từ 17 dòng còn 7 dòng; `AGENTS.md` khoảng 94 dòng.

## 5. Triển khai

1. **Phase A, `AGENTS.md`:** thay mục Conventions theo mục 4. Thêm dòng Mermaid nếu Q4 = có. Không đụng block GitNexus.
2. **Phase B, tuỳ chọn, `eslint.config.mjs`:** thêm `"no-console": ["warn", { allow: ["warn", "error"] }]`. Đây là rule có sẵn của ESLint, không thêm dependency. Để mức `warn` nên 19 chỗ cũ không làm `yarn lint`/CI fail. Có thể bỏ rule chữ ở dòng 48 sau khi lint đã bắt. Chỉ làm nếu Q5 = có, vì đây là file cấu hình chứ không phải file chỉ dẫn.

Rollback: `git checkout AGENTS.md eslint.config.mjs`.

## 6. Verify

- [ ] `yarn test` pass. `tests/e2e/tier1-r4-integrity-pipeline.test.ts:65-71` kiểm tra nguyên văn hai câu ở dòng 35 và 47.
- [ ] `yarn lint` không có lỗi mới (Phase B chỉ sinh warning).
- [ ] `git diff AGENTS.md` không đụng tới vùng giữa `<!-- gitnexus:start -->` và `<!-- gitnexus:end -->`.
- [ ] Đo trước và sau (tuỳ chọn, theo khuyến nghị của Gloaguen et al.): chạy 2–3 task nhỏ giống nhau với bản cũ và bản mới, so sánh số tool call, token, kết quả.

Lưu ý: `AGENTS.md` hiện có thay đổi chưa commit (mục "Phạm vi hiện tại"). Phase A sửa chồng lên bản đó, không revert phần này.

## 7. Câu hỏi cho Owner

1. **Q1 — inline style (dòng 34):** repo có 74 chỗ `style={{`. Chọn: (a) giữ rule như cũ; (b) đổi thành "inline style chỉ cho giá trị runtime" (khuyên dùng); (c) bỏ rule.
2. **Q2 — fetch trong `useEffect` (dòng 37):** 6 file đang làm vậy. Chọn: (a) giữ như cũ; (b) chỉ áp dụng cho code mới (khuyên dùng); (c) bỏ rule.
3. **Q3 — GitNexus "impact trước mọi function":** giữ nguyên, hay thu hẹp lại (ví dụ chỉ khi sửa symbol được import ở file khác)? Nếu thu hẹp thì phải sửa trong block có marker, và luôn chạy `gitnexus analyze --skip-agents-md`.
4. **Q4 — thêm dòng quy ước sơ đồ Mermaid vào Core docs?**
5. **Q5 — làm Phase B (`no-console` mức warn)?**
