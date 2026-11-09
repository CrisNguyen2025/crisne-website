const fs = require('fs');
const path = require('path');

const MAX_RAW_LENGTH = 8000;
const AGENT_PATTERN = /^[a-z0-9-]+$/;

// Ghi stdin của hook để đối chiếu định dạng thật của từng tool. Mặc định tắt: chỉ ghi khi file
// .handoff/runs/hook-debug/ENABLED tồn tại (thư mục runs/ nằm trong .gitignore). Không bao giờ ném lỗi.
function appendHookDebug(repoRoot, entry) {
  try {
    if (!entry || typeof entry.agent !== 'string' || !AGENT_PATTERN.test(entry.agent)) {
      return false;
    }

    const dir = path.join(repoRoot, '.handoff', 'runs', 'hook-debug');
    if (!fs.existsSync(path.join(dir, 'ENABLED'))) {
      return false;
    }

    const raw = typeof entry.raw === 'string' ? entry.raw.slice(0, MAX_RAW_LENGTH) : entry.raw;
    const line = JSON.stringify({ ...entry, raw });
    fs.appendFileSync(path.join(dir, `stdin-${entry.agent}.jsonl`), `${line}\n`);
    return true;
  } catch {
    return false;
  }
}

module.exports = { appendHookDebug, MAX_RAW_LENGTH };
