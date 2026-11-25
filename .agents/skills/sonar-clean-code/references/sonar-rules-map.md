# Ánh xạ Rules Sonar Clean Code trong `crisne-website`

## 1. ESLint (`eslint-plugin-sonarjs` trong `eslint.config.mjs`)

| Rule ID | Thuộc tính Sonar | Ý nghĩa & Cách sửa chuẩn |
|---|---|---|
| `sonarjs/cognitive-complexity` | Adaptable | Hàm vượt ngưỡng 15: tách helper thuần, dùng early return, thay `if/else` lồng bằng guard/map |
| `sonarjs/no-nested-conditional` | Adaptable | Ternary lồng nhau: tách biến `const ...`, dùng lookup map hoặc helper |
| `sonarjs/no-nested-functions` | Adaptable | Callback lồng > 5 tầng: tách handler/helper ở module scope |
| `sonarjs/no-nested-template-literals` | Adaptable | Template literal lồng trong `${...}`: tính chuỗi con vào biến trước |
| `sonarjs/no-duplicated-branches` | Adaptable | Hai nhánh `if/else` giống hệt: gộp điều kiện |
| `sonarjs/super-linear-regex` | Responsible (Security) | Nguy cơ ReDoS backtracking: đơn giản hoá regex, bỏ quantifier mơ hồ, hoặc thay bằng xử lý chuỗi $O(n)$ |
| `sonarjs/regex-complexity` | Adaptable | Regex quá phức tạp (> 20): tách nhiều pattern nhỏ rõ tên hoặc hàm kiểm tra |
| `sonarjs/duplicates-in-character-class` | Intentional | Ký tự lặp trong `[...]` (lưu ý flag `/i` làm `[a-zA-Z]` bị trùng): bỏ trùng |
| `sonarjs/concise-regex` | Consistent | `[0-9]` → `\d`, `{0,1}` → `?` |
| `sonarjs/pseudo-random` | Responsible (Security) | Dùng `node:crypto` (`randomUUID`/`randomBytes`) ở backend/ID; dùng `crypto.getRandomValues` cho UI browser |
| `sonarjs/no-globals-shadowing` | Intentional | Không đặt tên hàm `Error` trong Next.js `error.tsx` (đổi thành `TopicError` / `LessonError`) |
| `sonarjs/misplaced-loop-counter` | Intentional | Đổi `for (let n = 2; set.has(val); n++)` sang `while (set.has(val)) { ... }` |
| `sonarjs/void-use` | Intentional | Không dùng `void expr` cho non-promise (ví dụ ép reflow dùng `el.getBoundingClientRect()`) |
| `sonarjs/no-redundant-assignments` | Intentional | Xoá gán biến lặp lại trên mọi nhánh |
| `sonarjs/no-invariant-returns` | Intentional | Xoá nhánh thừa khi mọi path đều trả về cùng giá trị |
| `sonarjs/no-use-of-empty-return-value` | Intentional | Không đọc/return giá trị của hàm `void` |

## 2. Python Ruff (`cris-doctor` `PY-RUFF` + `pyproject.toml`)

| Mã Ruff | Thuộc tính Sonar | Mức `cris-doctor` | Cách sửa chuẩn |
|---|---|---|---|
| `F`, `E9` | Intentional / Reliability | `bug` (`F82x`/`E9`), `risk` (`F`) | Sửa syntax, undefined name, unused import/var |
| `S*`, `ASYNC*` | Responsible (Security/Reliability) | `risk` | Tránh blocking I/O trong `async`, SQL/shell injection |
| `RUF006` | Responsible (Reliability) | `risk` | Lưu task `asyncio.create_task` vào `_background_tasks: set[asyncio.Task]` + `add_done_callback` |
| `C901` | Adaptable | `nit` | Độ phức tạp McCabe > 10: tách helper nhỏ, early return |
| `SIM*` | Adaptable / Intentional | `nit` | Gộp `if` lồng (`SIM102`), gộp nhánh trùng (`SIM114`), dùng `contextlib.suppress` (`SIM105`), bỏ `.keys()` (`SIM118`), bỏ `return True/False` thừa (`SIM103`) |
| `RUF019`, `RUF059`, `RUF100` | Intentional | `nit` | Bỏ key check thừa, gán `_` cho biến unpack không dùng, xoá `noqa` thừa |
| `BLE001` (audit) | Responsible | Semantic audit | Bắt exception cụ thể thay cho `except Exception`; giữ fallback boundary có log + `# noqa: BLE001` kèm lý do nếu thực sự cần |
