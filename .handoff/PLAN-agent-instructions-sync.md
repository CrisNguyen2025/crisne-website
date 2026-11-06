# PLAN: Cấu trúc instruction cho nhiều coding agent, sync giữa nhiều máy

- **Trạng thái:** Phase A đã làm trên `main` (2026-11-06, chưa commit). Phase B, C chờ Owner trả lời mục 8
- **Người viết:** Claude Code (Opus 5.5), 2026-11-06
- **Người verify:** Antigravity, sau đó Claude Code đối chiếu lại, 2026-11-06
- **Phạm vi:** chỉ file instruction (`*.md`), skill, symlink, `.gitignore`. Không đụng code ứng dụng.

---

## 1. Bối cảnh

- Owner dùng **Claude Code là chính**, **Codex** và **Antigravity** là phụ.
- Dùng trên **hai máy**: máy công ty và máy cá nhân.
- Mục tiêu: **một cấu trúc thống nhất**. Máy nào, agent nào cũng đọc được cùng một bộ rule và skill. Không có tình trạng "máy này có, máy kia không" hay "IDE này có, IDE kia không".

## 2. Nguyên tắc

> **Concept (rule, skill, quyết định) nằm trong git. Chi tiết riêng của máy (đường dẫn, phiên bản runtime) nằm ngoài git.**

Chia 3 tầng, mỗi tầng có đúng một nguồn:

| Tầng | Nội dung | Nguồn | Cách sync |
|---|---|---|---|
| Cá nhân | Cách làm việc, giao tiếp, rule code chung, git và bảo mật, skill cá nhân | Repo private `agent-config` | `git clone` + `install.sh` trên mỗi máy |
| Dự án | Stack, conventions, ADR, glossary, skill dự án, MCP dự án | Repo dự án (`crisne-website`) | Commit vào git |
| Máy | Đường dẫn nvm, phiên bản Node, MCP chỉ có trên một máy | `CLAUDE.local.md` (gitignore) | Không sync |

## 3. Cấu trúc đích

### 3.1 Tầng cá nhân: repo `agent-config` (private, tách khỏi repo dự án)

```
agent-config/
├─ AGENTS.md            ← rule cá nhân, nguồn duy nhất, viết trung lập với tool
├─ claude/CLAUDE.md     = dòng "@../AGENTS.md" + phần chỉ Claude Code có
├─ skills/              ← skill cá nhân (think, prompt-master, query-optimizer, …)
└─ install.sh           ← chỉ tạo symlink, idempotent, backup file cũ trước khi ghi đè
```

`install.sh` tạo các symlink:

| Symlink | Trỏ tới | Tool đọc |
|---|---|---|
| `~/.claude/CLAUDE.md` | `agent-config/claude/CLAUDE.md` | Claude Code |
| `~/.claude/skills` | `agent-config/skills` | Claude Code |
| `~/.codex/AGENTS.md` | `agent-config/AGENTS.md` | Codex |
| `~/.agents/skills` | `agent-config/skills` | Codex |
| `~/.gemini/GEMINI.md` | `agent-config/AGENTS.md` | Antigravity (và Gemini CLI) |
| `~/.gemini/config/skills` | `agent-config/skills` | Antigravity (V10, theo quan sát trên máy) |

Trước khi `install.sh` tạo symlink, cần di chuyển dữ liệu đang có:
- `~/.claude/skills` hiện là **thư mục thật** có 15 mục: một phần là symlink sang `~/.agents/skills`, một phần là thư mục thật (`context7`, `generative-ui`, `hyperframes-cli`, `hyperframes-registry`, `media-use`, `vercel-react-best-practices`). Chuyển hết vào `agent-config/skills/` rồi mới thay bằng symlink. `install.sh` backup cả thư mục, không chỉ từng file.
- `~/.gemini/GEMINI.md` hiện chứa rule của một dự án công ty khác (dự án A). Chuyển phần đó về `AGENTS.md` của dự án ấy trước, nếu không dự án đó mất rule khi file bị thay bằng symlink.

### 3.2 Tầng dự án: `crisne-website`

```
crisne-website/
├─ AGENTS.md                 ← rule dự án, file thật ở root, viết trung lập
├─ CLAUDE.md                 = "@AGENTS.md" + phần chỉ Claude Code có (≤ 15 dòng)
├─ CLAUDE.local.md           ← gitignore, chi tiết của máy
├─ GLOSSARY.md, docs/        ← giữ nguyên
├─ .agents/skills/<x>/       ← nơi thật duy nhất của skill dự án
├─ .claude/skills/<x>        → symlink ../../.agents/skills/<x>  (commit)
├─ .claude/settings.json     ← commit
├─ .mcp.json                 ← commit (đã có)
└─ .handoff/specs/           ← TASK spec: Claude viết, Codex/Antigravity thực thi
```

**Lý do giữ `AGENTS.md` là file thật ở root** thay vì dồn vào `.agents/AGENTS.md`:
- Codex và Antigravity tìm `AGENTS.md` ở root. Nếu dồn vào `.agents/` thì root vẫn cần một symlink, tức là thêm một bước trỏ mà không được lợi gì.
- Codex không có cú pháp import (V6), nên nội dung thật phải nằm trong `AGENTS.md`.

**Lý do `CLAUDE.md` vẫn cần `@AGENTS.md`:** Claude Code (từ v2.1.277) tự đọc `AGENTS.md`, nhưng chỉ khi không có `CLAUDE.md` hay `CLAUDE.local.md` (V1). Repo có `CLAUDE.md`, nên phải import. Nhờ import, thêm `CLAUDE.local.md` cũng không làm `AGENTS.md` bị bỏ qua.

## 4. Thay đổi so với hiện tại

| # | Hiện tại | Thay đổi | Lý do |
|---|---|---|---|
| 1 | Rule cá nhân nằm ở `~/Desktop/CLAUDE.md`. Claude chỉ nạp vì repo nằm dưới thư mục Desktop. `~/.claude/CLAUDE.md` chưa có. `~/.codex/AGENTS.md` và `~/.gemini/GEMINI.md` được viết riêng | Gộp cả ba vào `agent-config/AGENTS.md`, rồi symlink | Một nguồn cho mọi tool và mọi máy |
| 2 | `.gitignore` ignore toàn bộ `.claude/` (ghi chú "Local dev launch config") | Chỉ ignore `.claude/settings.local.json`, `.claude/worktrees/`, `.claude/launch.json`, `.claude/skills/gitnexus/`, và thêm `CLAUDE.local.md` | Symlink skill và settings sang được máy kia. `launch.json` là cấu hình dev của từng máy (có dòng `TURSO_AUTH_TOKEN=`); `.claude/skills/gitnexus/` do GitNexus tự ghi, không ignore thì mỗi lần analyze sinh diff |
| 3 | `.claude/skills/` có thư mục thật (`think`, `prompt-master`, `query-optimizer`, `gitnexus*`) xen với symlink | Skill dự án chuyển hết sang `.agents/skills/`, `.claude/skills/` chỉ còn symlink. Skill không dính tới dự án (`think`, `prompt-master`, `query-optimizer`) **giữ nguyên ở Phase A**, chỉ chuyển sang `agent-config/skills/` ở Phase B sau khi `install.sh` đã chạy, để không có lúc nào bị mất. **Riêng skill GitNexus:** giữ nguyên chỗ GitNexus tự ghi, không symlink (xem V12 và mục 7) | Một nơi thật, Codex và Antigravity cũng dùng được |
| 4 | `AGENTS.md` trỏ tới `.codex/codex-rules/…`, `.codex/skills/`, `.cursor/active-context.md`, nhưng **cả ba đều không tồn tại** | Bỏ | Tham chiếu chết |
| 5 | `AGENTS.md` có header "Auto-synced \| 75 observations", khối "Available Tools save/query" của brainsync, các rule bị lặp kiểu "X — X" | Bỏ hoặc viết lại. **Giữ nguyên văn** hai câu `Don't import server-only code in client components` và `Không hardcode secret, API key, token, password trong code` | Nội dung tự sinh, bị lặp. Hai câu kia được test `tests/e2e/tier1-r4-integrity-pipeline.test.ts:65-71` kiểm tra nguyên văn; mất câu nào thì `yarn test` và CI fail |
| 6 | `AGENTS.md` có đoạn "Setup (máy Owner): `PATH=~/.nvm/versions/node/v22.22.2/bin…`" | Chuyển đường dẫn nvm cụ thể sang `CLAUDE.local.md`. `AGENTS.md` vẫn giữ phần dùng chung cho mọi agent: "cần GitNexus, Node ≥ 22.18; luôn chạy `gitnexus analyze --skip-agents-md`" (Codex/Antigravity không đọc `CLAUDE.local.md`) | Chi tiết của một máy. Bằng chứng: máy cá nhân **không có** Node v22.22.2 (nvm chỉ có v20.19.4, v20.19.5, v22.18.0); `gitnexus` duy nhất trong `PATH` là bản 1.6.3 dưới Node v20.19.5 |
| 7 | Khối GitNexus viết theo tên MCP tool (`gitnexus_impact(...)`) | `AGENTS.md` viết theo hành vi và lệnh CLI. Cách gọi qua MCP chuyển sang `CLAUDE.md` | Codex/Antigravity có thể chưa cấu hình MCP GitNexus. Lưu ý: chạy `gitnexus analyze` thiếu `--skip-agents-md` sẽ chèn lại block GitNexus vào cả `AGENTS.md` lẫn `CLAUDE.md` (source 1.6.3, `ai-context.js:250`), phá giới hạn "CLAUDE.md ≤ 15 dòng" |
| 8 | Mục "📌 Việc tiếp theo" trong `AGENTS.md` | Chuyển sang `.handoff/specs/` | File instruction nên ổn định |
| 9 | Rule trùng giữa `~/Desktop/CLAUDE.md` và `AGENTS.md` (naming `isLoading`, format giá trị optional, không hardcode secret) | Mỗi rule chỉ ở một tầng. Rule đang có trong `AGENTS.md` dự án thì **ở lại repo**; bản ở tầng cá nhân bị xoá, không xoá bản trong repo | Tránh hai bản lệch nhau. Repo public: người clone và Codex/Antigravity trên máy chưa cài `agent-config` vẫn phải thấy rule của dự án |
| 10 | Auto-memory của Claude nằm ở `~/.claude/projects/<đường-dẫn>/memory/`, khác nhau giữa hai máy | Kiến thức lâu dài đưa vào git (`agent-config/AGENTS.md` hoặc ADR). Memory chỉ giữ thứ riêng của máy | Memory không sync |
| 11 | `AGENT.md` (số ít, bản brainsync tháng 3, đã gitignore) | Đề xuất xoá, **cần Owner xác nhận** | File cũ gây nhầm |

**Không làm:** dọn `docs/backup*.md`, đổi cấu trúc `docs/`, sửa ADR hay `GLOSSARY.md`, sửa code ứng dụng.

## 5. Thứ tự triển khai

Mỗi phase chạy độc lập: phase sau không thực hiện được thì phase trước vẫn dùng bình thường.

1. **Phase A, repo dự án:** các mục 2 đến 9 ở bảng trên, trừ phần chuyển skill cá nhân của mục 3. Verify trên máy cá nhân: `yarn test` pass (có test đọc `AGENTS.md`), `git status` không có `.claude/launch.json` hay `.claude/skills/gitnexus/`, danh sách skill của Claude Code không thiếu skill nào so với trước.
2. **Phase B, `agent-config`:** tạo repo, gộp rule global (mục 1), viết `install.sh`, chạy trên máy cá nhân. Sau khi `install.sh` chạy xong mới chuyển `think`, `prompt-master`, `query-optimizer` khỏi `.claude/skills/` của repo dự án.
3. **Phase C, máy công ty:** `git clone` cả hai repo, chạy `install.sh`, rồi verify.

Rollback:
- Phase A: `git checkout` các file đã đổi.
- Phase B và C: `install.sh` đã backup file cũ (ví dụ `*.bak`), xoá symlink rồi khôi phục bản backup.

## 6. Cần verify

Antigravity verify trước, Claude Code đối chiếu lại bằng docs và trạng thái máy cá nhân (2026-11-06). Cột "Kết quả" là kết luận sau đối chiếu.

| # | Khẳng định | Kết quả | Căn cứ |
|---|---|---|---|
| V1 | Claude Code đọc `CLAUDE.md`, **không** đọc `AGENTS.md`; hỗ trợ `@path` import (tối đa 4 cấp) và `CLAUDE.local.md` | **Sai một phần.** Từ v2.1.277, Claude Code tự đọc `AGENTS.md` khi không có `CLAUDE.md` / `.claude/CLAUDE.md` / `CLAUDE.local.md` ở cwd hoặc thư mục cha; có một trong ba file đó thì chỉ đọc `CLAUDE.md`. Import tối đa **4 hop**. `CLAUDE.local.md` đúng. Máy cá nhân chạy `2.1.318`. Antigravity ghi "Đúng", là sai | https://code.claude.com/docs/en/memory#agents-md |
| V2 | Claude Code đọc skill ở `~/.claude/skills/` (cá nhân) và `.claude/skills/` (dự án) | **Đúng** | https://code.claude.com/docs/en/skills |
| V3 | Claude Code đọc được skill khi `.claude/skills/<x>` là symlink | **Đúng (thử thực tế).** `abot-trace-report`, `domain-modeling`, `grilling` là symlink sang `../../.agents/skills/` và có trong danh sách skill của phiên Claude Code. (Bằng chứng Antigravity đưa ra bị nhầm: symlink trong `~/.claude/skills` trỏ tới `~/.agents/skills` ở home, không phải repo) | Thử thực tế |
| V4 | Codex đọc `AGENTS.md` ở root và ở thư mục con; global là `~/.codex/AGENTS.md` | **Đúng.** Bổ sung: mỗi thư mục ưu tiên `AGENTS.override.md`; file gần cwd nối sau nên thắng khi xung đột; tổng dung lượng giới hạn bởi `project_doc_max_bytes`, mặc định 32 KiB (`AGENTS.md` hiện 9.7 KB) | https://learn.chatgpt.com/docs/agent-configuration/agents-md |
| V5 | Codex đọc skill ở `.agents/skills/` (quét từ cwd lên tới root repo) và `$HOME/.agents/skills` | **Đúng** | https://developers.openai.com/codex/skills |
| V6 | Codex **không** hỗ trợ import trong `AGENTS.md` | **Đúng.** Docs chỉ mô tả việc tìm và nối nguyên file, không có cú pháp import | https://learn.chatgpt.com/docs/agent-configuration/agents-md |
| V7 | Antigravity đọc `AGENTS.md` ở root (có thêm `GEMINI.md`; khi xung đột thì `GEMINI.md` thắng) | **Đúng theo quan sát, chưa có link chính thức.** Antigravity dẫn tài liệu nội bộ `agy-customizations` | Antigravity tự báo |
| V8 | Rule global của Antigravity là `~/.gemini/GEMINI.md` | **Đúng theo quan sát, chưa có link chính thức.** Có thêm `~/.gemini/config/rules/*.md` | Antigravity tự báo |
| V9 | Skill dự án của Antigravity ở `.agents/skills/` (vẫn hỗ trợ `.agent/skills/` cũ) | **Đúng theo quan sát, chưa có link chính thức.** Còn nhận `_agents/`, `_agent/` | Antigravity tự báo |
| V10 | Đường dẫn skill global của Antigravity: `~/.gemini/antigravity/skills/` hay `~/.gemini/config/skills/`? | **`~/.gemini/config/skills/`, theo quan sát, chưa có link chính thức.** Skill cá nhân trên máy (`figma-design-auditor`, `nextjs-release-tracker`, `ponytail`) nằm ở đó và được nạp. `~/.gemini/antigravity/` là thư mục dữ liệu của app | Antigravity tự báo |
| V11 | Brainsync có tự ghi đè `AGENTS.md` không? | **Không ghi đè nữa.** Không có extension brainsync trong `~/.vscode/extensions`, theo Antigravity cũng không có CLI, cron, process hay git hook. Còn dữ liệu cũ: `AGENT.md` (14.8 KB, 2026-03-25, đã gitignore), `.brainsync/agent-rules.md` | Kiểm tra máy |
| V12 | `gitnexus analyze` có ghi vào `.claude/skills/gitnexus*` không? Nếu có, chuyển skill đó sang `.agents/skills` sẽ bị ghi lại | **Đúng với bản 1.6.3, chưa xác nhận với bản đang dùng.** Bản 1.6.3 (binary duy nhất trong `PATH`, dưới Node v20.19.5) luôn ghi 6 file `.claude/skills/gitnexus/<skill>/SKILL.md`, kể cả khi có `--skip-agents-md` (`dist/cli/ai-context.js:177-178, 265`). Hiện có hai bản khác nhau: `.claude/skills/gitnexus/gitnexus-*` (2026-10-15) và `.claude/skills/gitnexus-*` (2026-10-30, mới hơn, dùng `node .gitnexus/run.cjs`). Bản 1.6.12 có thể ghi vào chỗ khác, chưa kiểm | Source `gitnexus@1.6.3` |

## 7. Rủi ro

| Rủi ro | Hậu quả | Giảm thiểu |
|---|---|---|
| Máy công ty chạy Windows | Symlink trong git thành file text | Bật Developer Mode, hoặc để `install.sh` copy thay vì tạo symlink |
| Chính sách công ty không cho clone repo cá nhân hoặc để rule cá nhân trên máy | Phase C không làm được | Phase A vẫn dùng được; rule cá nhân trên máy công ty phải chép tay |
| Repo `crisne-website` là **public** | Rule cá nhân hoặc thông tin công ty bị lộ nếu để trong repo | Rule cá nhân chỉ để trong `agent-config` (private). `AGENTS.md` dự án không chứa email, URL nội bộ, đường dẫn máy |
| Brainsync ghi đè `AGENTS.md` (V11) | Mọi chỉnh sửa ở Phase A bị mất | Đã kiểm: không còn chạy. Giữ dòng này để đối chiếu nếu thấy `AGENTS.md` bị đổi lạ |
| Symlink skill GitNexus sang `.agents/skills/` (V12) | GitNexus dùng `mkdir` + `writeFile`, nên ghi xuyên qua symlink: mỗi lần `gitnexus analyze` sẽ đè bản gốc của gói lên `.agents/skills/gitnexus-*`, mất mọi chỉnh sửa local | Không symlink. Chỉ giữ một bộ ở chỗ GitNexus tự ghi. Trước Phase A: chạy `gitnexus analyze` bằng bản đang dùng, xem nó ghi vào đâu, rồi xoá bộ còn lại |
| Dọn rule trong `AGENTS.md` làm mất câu mà test kiểm tra | `yarn test` và CI fail (`tests/e2e/tier1-r4-integrity-pipeline.test.ts:65-71`) | Giữ nguyên văn hai câu (mục 4, dòng 5); chạy `yarn test` sau khi sửa `AGENTS.md` |
| Bỏ ignore `.claude/` | Commit nhầm `.claude/launch.json` (cấu hình dev của từng máy) và skill do GitNexus tự ghi | Ignore riêng hai đường dẫn đó (mục 4, dòng 2); kiểm `git status` trước khi commit |
| Chuyển skill cá nhân ở Phase A | Mất `think`, `prompt-master`, `query-optimizer` cho tới khi Phase B xong | Chỉ chuyển ở Phase B (mục 4, dòng 3) |
| Chạy `gitnexus analyze` thiếu `--skip-agents-md` | Block GitNexus bị chèn lại vào `AGENTS.md` và `CLAUDE.md` | Ghi lệnh kèm cờ trong `AGENTS.md` (mục 4, dòng 6); xem `git diff` sau mỗi lần analyze |
| Thay `~/.claude/skills` và `~/.gemini/GEMINI.md` bằng symlink | Mất skill thật trong `~/.claude/skills`; dự án A mất rule | Di chuyển dữ liệu trước (mục 3.1), `install.sh` backup cả thư mục |
| `~/.gemini/GEMINI.md` dùng chung với Gemini CLI | Rule cũng áp dụng cho Gemini CLI | Chấp nhận được, vì rule viết trung lập với tool |

## 8. Câu hỏi cho Owner

Antigravity đã trả lời thay một số câu bằng suy đoán. Các câu dưới đây vẫn cần **Owner** xác nhận.

1. Máy công ty chạy macOS hay Windows? (Máy cá nhân: macOS arm64.)
2. Máy công ty có được clone một repo private cá nhân không? Nếu không, `install.sh` cần chế độ copy thay vì symlink.
3. Ngoài `crisne-website` còn dự án nào dùng agent, có repo công ty không? Trên máy cá nhân thấy thêm ít nhất hai dự án công ty, nên Phase B có vẻ đáng giữ.
4. Brainsync còn dùng không? (V11: không thấy còn chạy.)
5. Có xoá `AGENT.md` và `.brainsync/` cũ không? (Cả hai là dữ liệu chết của brainsync.)
6. Dòng setup "gitnexus 1.6.12 dưới Node v22.22.2" trong `AGENTS.md` là của máy nào? Máy cá nhân không có Node v22.22.2.

## 9. Tiêu chí hoàn thành (sau khi chạy trên cả hai máy)

- [ ] Claude Code: `/memory` thấy `~/.claude/CLAUDE.md` (import `agent-config/AGENTS.md`) và `CLAUDE.md` của dự án (import `AGENTS.md`).
- [ ] Claude Code: danh sách skill có cả skill cá nhân lẫn skill dự án.
- [ ] Codex: hỏi "rule nào đang áp dụng?" thì trả lời đúng cả rule global lẫn rule dự án; liệt kê được skill trong `.agents/skills`.
- [ ] Antigravity: như Codex.
- [ ] `git status` trên máy mới sau khi clone và chạy `install.sh` không có file lạ. Lệnh `grep -rn "nvm/versions\|/Users/" AGENTS.md CLAUDE.md` không trả về dòng nào.
- [ ] Không còn tham chiếu tới file không tồn tại trong `AGENTS.md` và `CLAUDE.md`.
- [ ] `yarn test` pass, gồm `tests/e2e/tier1-r4-integrity-pipeline.test.ts`.
- [ ] `git status` không có `.claude/launch.json`, `.claude/skills/gitnexus/`, `CLAUDE.local.md`.
- [ ] Rule dự án (naming, format giá trị optional, không hardcode secret) vẫn nằm trong `AGENTS.md` của repo.
