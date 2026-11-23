# crisne-website — Agent instructions

File dùng chung cho mọi coding agent (Claude Code, Codex, Antigravity). Phần chỉ Claude Code có nằm trong `CLAUDE.md`.

**Stack:** JavaScript/TypeScript · Next.js + React + Tailwind · service Python `roadmap-rag-assistant/` (FastAPI)

## ✅ Commands (CI chạy đúng các lệnh này)

- Typecheck: `yarn tsc --noEmit -p .`
- Lint / test: `yarn lint` · `yarn test`
- Schema và index: `yarn test:schema-sql --check` · `yarn check:knowledge-index`
- Config agent: `yarn agents:sync --check` (sinh lại bằng `yarn agents:sync`)
- Python (`cd roadmap-rag-assistant`): `.venv/bin/python -m pytest -q` · `.venv/bin/python -m evals validate`

## 📚 Skills

Skill dự án nằm thật ở `.agents/skills/` (Claude Code, Codex, Antigravity đều tự đọc description từ đây). `.claude/skills/<x>` chỉ là symlink trỏ sang đó. Phần dưới chỉ ghi rule mà description không nói:

- **`cris-how-to-sync`:** bắt buộc dùng trước khi lập plan, review thiết kế hoặc đưa target mới vào repo.
- **`cris-code-intel`:** impact và route map dùng GitNexus, trừ route FastAPI và `/api/roadmap-assistant/*` (GitNexus không thấy consumer, risk không đáng tin): dùng `yarn intel trace FLOW_ABOT_*`. CLI `yarn intel <lệnh>`, bản đồ chi tiết `docs/code-intel/CRIS_WORKSPACE_MAP.md`.
- **`design-doc-mermaid`:** chỉ dùng cho sơ đồ commit trong file `.md` của repo; quy ước repo nằm đầu `SKILL.md`. Nguồn: [SpillwaveSolutions/design-doc-mermaid](https://github.com/SpillwaveSolutions/design-doc-mermaid) (MIT).
- **`verify-ci`:** dùng sau khi sửa code; subagent `verifier` của Claude Code chạy skill này.

## 🤖 Config agent (MCP, subagent, hook)

Sửa ở `.agents/adapter/`, rồi chạy `yarn agents:sync`. Không sửa file do sync sinh ra: `.mcp.json`, `.agents/mcp_config.json`, `.agents/hooks.json`, `.claude/agents/*.md` (hook chặn), `.claude/settings.json` mục `hooks` (hook không chặn, chỉ CI `--check` bắt). Chi tiết: `.agents/adapter/README.md`.

## 🧪 Manual Test Results

- Trước khi test thủ công hay chạy Playwright cho một tính năng: đọc `tests/manual/README.md` và kịch bản liên quan. Case `Pass` mà code liên quan chưa đổi kể từ commit của lần chạy thì không chạy lại.
- Sau mỗi lần chạy: ghi kết quả vào kịch bản (ngày, commit, môi trường), theo quy ước trong `tests/manual/README.md`.

## 🛡️ Safety rules

- **NEVER** run `git clean -fd` or `git reset --hard` without checking `git log` and verifying commits exist.
- **NEVER** delete untracked files or folders blindly. Always backup or stash before bulk edits.

## 🌿 Git branches

- Nhánh làm việc (`feat/*`, `fix/*`, `chore/*`, `docs/*`, ...) sau khi đã merge vào `main` thì xoá ngay, tránh nhánh rác và conflict về sau.
- Kiểm tra trước khi xoá: nhánh nằm trong `git branch --merged main`. Xoá local bằng `git branch -d <branch>`, không dùng `-D` (`-d` tự từ chối nếu còn commit chưa merge).
- Xoá nhánh remote (`git push origin --delete <branch>`) là thao tác push: hỏi user trước. Sau đó chạy `git fetch --prune` để dọn ref `origin/*` đã mất.
- Không xoá nhánh đang checkout hay nhánh đang có worktree; không đụng `main`.

## 📐 Conventions

Chỉ ghi quy ước riêng của repo. Quy ước chung của Next.js/React/Tailwind và những gì ESLint đã bắt thì không ghi lại ở đây.

- Don't import server-only code in client components
- Không hardcode secret, API key, token, password trong code
- Inline style chỉ dùng cho giá trị tính lúc runtime; còn lại dùng Tailwind
- Code mới không fetch data trong useEffect; dùng server action hoặc Server Component
- Naming props/biến theo đúng single component/func, không gắn use-case (sai: isChatLoading, đúng: isLoading)
- Giá trị optional khi hiển thị phải qua hàm format tương ứng (formatString, formatDateTime, ...)

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **crisne-website**. GitNexus builds a call graph and execution flows of the codebase; use it to understand code, assess impact, and navigate safely.

> **Setup:** GitNexus cần Node ≥ 22.18 (dự án vẫn chạy Node 20). Index nằm ở `.gitnexus/` (đã gitignore). Khi index cũ, chạy lại **luôn kèm cờ** `gitnexus analyze --skip-agents-md`; thiếu cờ thì GitNexus chèn lại block này vào cả `AGENTS.md` lẫn `CLAUDE.md`. Đường dẫn cài đặt riêng từng máy để trong `CLAUDE.local.md`. Giấy phép của GitNexus là PolyForm Noncommercial.

- **Trước khi sửa function/class/method:** chạy impact analysis, báo blast radius (direct callers, affected processes, risk level). Có tool GitNexus (MCP `gitnexus_*`) trong phiên thì dùng nó; không có thì dùng `yarn intel impact <symbol>` và nói rõ kết quả lấy từ dataset `cris-code-intel`, không phải GitNexus.
- Risk HIGH hoặc CRITICAL: cảnh báo user trước khi sửa, không được bỏ qua.
- Trước khi commit: kiểm tra diff chỉ chạm các symbol và luồng dự kiến (`gitnexus_detect_changes()` nếu có).
- Đổi tên symbol: không find-and-replace; dùng GitNexus rename nếu có, không có thì hỏi user.
- Cách dùng chi tiết nằm trong các skill `gitnexus-*`.

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
- Từ 2026-11-23, Knowledge Acquisition (đưa News Item vào Lesson kèm Provenance, nối kết quả vào Abot) thuộc phạm vi Abot: Phase 1 và Phase 3 của `.handoff/PLAN-knowledge-acquisition.md`. Phase 2 (nhiều loại nguồn, tách job worker) hoãn tới khi Phase 1 được dùng thật.
- Vẫn giữ nguyên luồng 👍/👎 hiện có của Cris AI. Khi sửa code dùng chung (`app/api/chat/feedback/route.ts`, `lib/ai/langfuse.ts`) thì không được đổi behavior của luồng này.

## 📌 Việc đang mở

Không ghi ở đây. Chỉ mục: `.handoff/BACKLOG.md`.
