---
name: verify-ci
description: Chạy các lệnh kiểm tra CI của repository crisne-website theo đúng phạm vi file thay đổi, trả báo cáo pass/fail dạng bảng kèm lỗi file:line, không sửa file nào. Dùng chủ động sau khi sửa code hoặc trước khi commit.
---

# Verify CI (`verify-ci`)

Skill kiểm tra chất lượng mã nguồn và đảm bảo tương thích CI cho repository `crisne-website`.

## ⚡ Khi nào dùng
- Sử dụng sau khi hoàn thành sửa đổi code và trước khi bàn giao / tạo pull request.
- Subagent `verifier` dùng skill này để kiểm định độc lập không sửa file.

## 🛡️ Quy tắc
1. **Chỉ đọc, không sửa file**: Tuyệt đối không thay đổi bất kỳ file nào trong working tree.
2. **Tiếp tục chạy khi lệnh trước fail**: Chạy đủ các lệnh liên quan đến các file thay đổi, không dừng sớm khi gặp lỗi đầu tiên.
3. **Báo cáo định dạng chuẩn**: Trả về bảng tổng hợp kết quả (Command, Status, Ghi chú) kèm danh sách lỗi định dạng `file:line` và mô tả ngắn; nêu rõ nếu có lệnh không thể chạy hoặc chưa verify được.

## 📋 Lựa chọn lệnh theo file thay đổi (`git status --porcelain`)

| Phạm vi file thay đổi | Lệnh thực thi | Ghi chú |
|---|---|---|
| Có file `.ts` hoặc `.tsx` | `yarn tsc --noEmit -p .` | Typecheck toàn bộ TypeScript |
| File `.ts`, `.tsx`, `.js`, `.mjs`, `.mts` thay đổi | `yarn eslint <danh_sách_file_đổi>` | **Chỉ lint trên file đổi**, không chạy `yarn lint` toàn repo (toàn repo có lỗi cũ, không ghi số cứng) |
| Bất kỳ file code / test nào | `yarn test` | Chạy toàn bộ test suite với Vitest |
| Có file trong `roadmap-rag-assistant/` | `cd roadmap-rag-assistant && .venv/bin/python -m pytest -q && .venv/bin/python -m evals validate` | Test service Python |
| Có file trong `prisma/` | `yarn test:schema-sql --check` | Kiểm tra schema SQL fixture |
| Có file trong dữ liệu knowledge (`lib/ai/data/`, `lib/ai/portfolio-knowledge.ts` hoặc `lib/ai/knowledge-base.ts`, nơi tính hash của index) | `yarn check:knowledge-index` | Kiểm tra tính đồng bộ của vector index |
| Có file code (`.ts`, `.tsx`, `.py`, `.prisma`) hoặc file trong `.agents/skills/cris-code-intel/` | `yarn intel status` | Exit 1 nghĩa là map lệch code: báo các ref `MISSING_*`, cần sửa `cris-workspace-map.json` trong cùng thay đổi |
| Có file trong `.agents/**` hoặc `.claude/**` | `yarn agents:sync --check` | CI chạy lệnh này |
| Có file code (`.ts`, `.tsx`, `.py`, `.prisma`) và đã có `.handoff/doctor/baseline.json` | `yarn doctor --since HEAD --check` | Skill `cris-doctor`. Exit 1 nghĩa là thay đổi thêm finding `bug`/`risk` mới: liệt kê các dòng 🆕 trong `.handoff/doctor/DOCTOR-<date>.md`. CI chạy `yarn doctor --check` trên toàn repo (job `doctor`) |

**Lỗi lint nghi là có từ trước:** chứng minh bằng `git show <nhánh gốc>:<file> | yarn eslint --stdin --stdin-filename <file>`. Bản gốc có cùng lỗi thì ghi "có từ trước (đã chứng minh)"; không chứng minh được thì coi là lỗi mới.

**Ghi chú GitNexus (chỉ báo, không chạy):** nếu có `.gitnexus/meta.json` mà `lastCommit` khác `git rev-parse HEAD`, thêm một dòng vào report gợi ý chạy `gitnexus analyze --skip-agents-md`.

## 📊 Mẫu báo cáo kết quả

```markdown
### Kết quả kiểm tra CI

| Lệnh | Trạng thái | Thời gian / Chi tiết |
|---|---|---|
| `yarn tsc --noEmit -p .` | PASSED | 0 errors |
| `yarn eslint <files>` | PASSED | 0 warnings, 0 errors |
| `yarn test` | PASSED | 842 passed, 8 skipped |

#### Chi tiết lỗi (nếu có):
- `path/to/file.ts:42`: Mô tả ngắn gọn lỗi
```
