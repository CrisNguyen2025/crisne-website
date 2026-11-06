# crisne-website — Agent instructions

File dùng chung cho mọi coding agent (Claude Code, Codex, Antigravity). Phần chỉ Claude Code có nằm trong `CLAUDE.md`.

**Stack:** JavaScript/TypeScript · Next.js + React + Tailwind · service Python `roadmap-rag-assistant/` (FastAPI)

## ✅ Commands (CI chạy đúng các lệnh này)

- Typecheck: `yarn tsc --noEmit -p .`
- Lint / test: `yarn lint` · `yarn test`
- Schema và index: `yarn test:schema-sql --check` · `yarn check:knowledge-index`
- Python (`cd roadmap-rag-assistant`): `python -m pytest -q` · `python -m evals validate`

## 📚 Skills

Skill dự án nằm thật ở `.agents/skills/`. `.claude/skills/<x>` chỉ là symlink trỏ sang đó.

- **`cris-code-intel`:** dùng khi cần nắm kiến trúc, trace luồng thực thi (UI → API → Service → AI/DB), xem bản đồ API route hoặc đánh giá blast radius. CLI: `yarn intel <lệnh>`. Bản đồ chi tiết: `docs/code-intel/CRIS_WORKSPACE_MAP.md`.
- **`cris-how-to-sync`:** bắt buộc dùng trước khi lập plan, review thiết kế hoặc đưa target mới (feature, thư viện, model/migration, API route, pattern, thuật ngữ) vào repo. CLI: `yarn intel how-to-sync "<mô tả target>"`.
- **`abot-trace-report`:** dùng khi phân tích trace Langfuse của Abot.

## 🧪 Manual Test Results

- Trước khi test thủ công hay chạy Playwright cho một tính năng: đọc `tests/manual/README.md` và kịch bản liên quan. Case `Pass` mà code liên quan chưa đổi kể từ commit của lần chạy thì không chạy lại.
- Sau mỗi lần chạy: ghi kết quả vào kịch bản (ngày, commit, môi trường), theo quy ước trong `tests/manual/README.md`.

## 🛡️ Safety rules

- **NEVER** run `git clean -fd` or `git reset --hard` without checking `git log` and verifying commits exist.
- **NEVER** delete untracked files or folders blindly. Always backup or stash before bulk edits.

## 📐 Conventions

- Don't mix Tailwind with inline styles
- Don't import server-only code in client components
- Environment variables: chỉ biến có prefix `NEXT_PUBLIC_` mới được dùng ở client
- Don't use useEffect for data fetching — use server actions or loader
- Clean up effects — return cleanup function from useEffect
- Extract repeated class patterns into components
- Use responsive prefixes consistently (sm:, md:, lg:, xl:)
- Don't use arbitrary values when a utility class exists
- Use middleware.ts for authentication guards, not client-side checks
- Use next/image (not img tag) for automatic optimization
- Handle loading.tsx and error.tsx for every async route
- Use Server Components by default — add "use client" only when needed
- Use Suspense and Error Boundaries for async operations
- Không hardcode secret, API key, token, password trong code
- Không để console.log/debug log trong code commit
- Naming props/biến theo đúng single component/func, không gắn use-case (sai: isChatLoading, đúng: isLoading)
- Giá trị optional khi hiển thị phải qua hàm format tương ứng (formatString, formatDateTime, ...)

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **crisne-website**. GitNexus builds a call graph and execution flows of the codebase; use it to understand code, assess impact, and navigate safely.

> **Setup:** GitNexus cần Node ≥ 22.18 (dự án vẫn chạy Node 20). Index nằm ở `.gitnexus/` (đã gitignore). Khi index cũ, chạy lại **luôn kèm cờ** `gitnexus analyze --skip-agents-md`; thiếu cờ thì GitNexus chèn lại block này vào cả `AGENTS.md` lẫn `CLAUDE.md`. Đường dẫn cài đặt riêng từng máy để trong `CLAUDE.local.md`. Giấy phép của GitNexus là PolyForm Noncommercial.

## Always Do

- **Run impact analysis before editing any function, class, or method**, and report the blast radius (direct callers, affected processes, risk level) to the user.
- **Detect changes before committing** to verify the diff only affects expected symbols and execution flows.
- **Warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, query GitNexus for execution flows instead of grepping.

## Never Do

- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use GitNexus rename, which understands the call graph.

## Skills

| Task                                         | Read this skill file                               |
| -------------------------------------------- | -------------------------------------------------- |
| Understand architecture / "How does X work?" | `.agents/skills/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.agents/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.agents/skills/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.agents/skills/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.agents/skills/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.agents/skills/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->

## 📖 Core docs — Glossary & ADR

Nguồn sự thật về ngôn ngữ domain và quyết định kiến trúc. Index: `docs/README.md`.

- Trước khi đặt tên hoặc thiết kế: đọc `GLOSSARY.md`, dùng đúng thuật ngữ, tránh các từ trong `_Avoid_`.
- Tên trong `_Also_` là đồng nghĩa hợp lệ, không bắt lỗi khi dùng. Code mới đặt theo tên đang có trong code (ví dụ `RoadmapItem`, `roadmap`), không theo tên chính của glossary (ADR-0007).
- Không đi ngược một ADR trong `docs/adr/` khi chưa hỏi user. ADR ưu tiên hơn plan/context cũ trong `docs/`.
- Chỉ ghi `GLOSSARY.md` và `docs/adr/` trong buổi `/grill-with-docs` hoặc khi user yêu cầu, kể cả khi skill `domain-modeling` tự kích hoạt.
- Thuật ngữ giữ tiếng Anh như tên trong code, định nghĩa viết tiếng Việt. Glossary không chứa chi tiết implementation.
- ADR đã chốt thì không sửa nội dung: viết ADR mới, đổi ADR cũ sang `superseded by ADR-NNNN`.
- Repo public: không ghi email, key, token, URL nội bộ vào core docs.

## 📌 Việc đang mở

Không ghi ở đây. Xem `.handoff/specs/` (ví dụ Step 6 và mục 6 của `TASK-lesson-status-001.md`).
