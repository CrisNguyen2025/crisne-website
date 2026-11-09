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
- **`design-doc-mermaid`:** dùng khi cần sơ đồ Mermaid để commit trong một file `.md` của repo (`docs/code-intel/`, `docs/adr/`, runbook trong `docs/`, `.handoff/specs/`, `.handoff/PLAN-*`). Nguồn: [SpillwaveSolutions/design-doc-mermaid](https://github.com/SpillwaveSolutions/design-doc-mermaid) (MIT).
  - Sơ đồ chỉ để xem trong chat, không commit: không dùng skill này. Claude Code dùng `generative-ui`; agent khác trả fence `mermaid` ngay trong câu trả lời.
  - Fence `mermaid` đặt ngay trong file đích. Không tạo `docs/design/`, `./diagrams/` hay ảnh PNG/SVG để commit. Không dùng template trong `assets/` của skill; vị trí docs theo `docs/README.md`, spec theo `.handoff/specs/TEMPLATE-TASK.md`.
  - Style theo `docs/code-intel/CRIS_WORKSPACE_MAP.md`: nhãn tiếng Việt kèm tên trong code, tên domain đúng `GLOSSARY.md`. Không bắt buộc emoji hay `classDef`; nếu dùng `classDef` thì phải có `color:`.
  - Validate bằng `python3 .agents/skills/design-doc-mermaid/scripts/extract_mermaid.py <file.md> --validate` khi máy có `mmdc`. Không có `mmdc` (hoặc sandbox chặn) thì ghi rõ sơ đồ chưa validate.

## 🧪 Manual Test Results

- Trước khi test thủ công hay chạy Playwright cho một tính năng: đọc `tests/manual/README.md` và kịch bản liên quan. Case `Pass` mà code liên quan chưa đổi kể từ commit của lần chạy thì không chạy lại.
- Sau mỗi lần chạy: ghi kết quả vào kịch bản (ngày, commit, môi trường), theo quy ước trong `tests/manual/README.md`.

## 🛡️ Safety rules

- **NEVER** run `git clean -fd` or `git reset --hard` without checking `git log` and verifying commits exist.
- **NEVER** delete untracked files or folders blindly. Always backup or stash before bulk edits.

## 📐 Conventions

Chỉ ghi quy ước riêng của repo. Quy ước chung của Next.js/React/Tailwind và những gì ESLint đã bắt thì không ghi lại ở đây.

- Don't import server-only code in client components
- Không hardcode secret, API key, token, password trong code
- Không để console.log/debug log trong code commit
- Inline style chỉ dùng cho giá trị tính lúc runtime; còn lại dùng Tailwind
- Code mới không fetch data trong useEffect; dùng server action hoặc Server Component
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

## 🎯 Phạm vi hiện tại

- Từ 2026-11-09 chỉ tập trung vào Abot (Roadmap Assistant, `roadmap-rag-assistant/`). Cris AI (`/portfolio`, `hooks/use-floating-chat.ts`, `components/floating-bot/**`) tạm ngoài phạm vi: không đưa vào plan, review, test hay đề xuất cho tới khi Abot hoàn thiện.
- Vẫn giữ nguyên luồng 👍/👎 hiện có của Cris AI. Khi sửa code dùng chung (`app/api/chat/feedback/route.ts`, `lib/ai/langfuse.ts`) thì không được đổi behavior của luồng này.

## 📌 Việc đang mở

Không ghi ở đây. Xem `.handoff/specs/` (ví dụ Step 6 và mục 6 của `TASK-lesson-status-001.md`).
