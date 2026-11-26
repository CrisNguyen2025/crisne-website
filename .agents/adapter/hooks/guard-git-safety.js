const path = module.require('path');
const { readActiveLock } = module.require('./guard-task-boundary');

const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env']);
const SHELL_WRAPPERS = new Set(['sh', 'bash', 'zsh']);
const COMMAND_PREFIXES = new Set(['sudo', 'command', 'env']);

function splitShellSegments(command) {
  const segments = [];
  let current = [];
  let token = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  const pushToken = () => {
    if (token.length > 0) {
      current.push(token);
      token = '';
    }
  };

  const pushSegment = () => {
    pushToken();
    if (current.length > 0) {
      segments.push(current);
      current = [];
    }
  };

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];

    if (escaped) {
      token += ch;
      escaped = false;
      continue;
    }

    if (inSingle) {
      if (ch === "'") inSingle = false;
      else token += ch;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    if (inDouble) {
      if (ch === '"') inDouble = false;
      else token += ch;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
    } else if (ch === '"') {
      inDouble = true;
    } else if (ch === ';' || ch === '\n' || ch === '|' || ch === '&' || ch === '(' || ch === ')' || ch === '`') {
      pushSegment();
    } else if (/\s/.test(ch)) {
      pushToken();
    } else {
      token += ch;
    }
  }

  pushSegment();
  return segments;
}

function unwrapCommandTokens(tokens) {
  let idx = 0;
  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok) || COMMAND_PREFIXES.has(tok)) {
      idx += 1;
      continue;
    }
    break;
  }
  return tokens.slice(idx);
}

function extractGitSubcommand(args) {
  let idx = 0;
  while (idx < args.length) {
    const arg = args[idx];
    if (GIT_OPTS_WITH_VALUE.has(arg)) {
      idx += 2;
      continue;
    }
    if (arg.startsWith('-')) {
      idx += 1;
      continue;
    }
    return { subcmd: arg, subArgs: args.slice(idx + 1) };
  }
  return null;
}

function hasShortFlag(args, flagChar) {
  for (const arg of args) {
    if (arg === '--') break;
    if (/^-[A-Za-z]+$/.test(arg) && arg.includes(flagChar)) {
      return true;
    }
  }
  return false;
}

function hasDotTarget(args) {
  let afterDoubleDash = false;
  for (const arg of args) {
    if (arg === '--') {
      afterDoubleDash = true;
      continue;
    }
    if (!afterDoubleDash && arg.startsWith('-')) {
      continue;
    }
    if (arg === '.' || arg === './') {
      return true;
    }
  }
  return false;
}

function checkGitCall(subcmd, subArgs, activeLock) {
  if (subcmd === 'reset' && subArgs.includes('--hard')) {
    return 'Lệnh "git reset --hard" bị chặn để bảo vệ thay đổi chưa commit (xem AGENTS.md mục Safety rules).';
  }

  if (subcmd === 'clean') {
    const isDryRun = subArgs.includes('--dry-run') || hasShortFlag(subArgs, 'n');
    const isForced = subArgs.includes('--force') || hasShortFlag(subArgs, 'f');
    if (isForced && !isDryRun) {
      return 'Lệnh "git clean -f" bị chặn để tránh mất file untracked (xem AGENTS.md mục Safety rules).';
    }
  }

  if ((subcmd === 'restore' || subcmd === 'checkout') && hasDotTarget(subArgs)) {
    return `Lệnh "git ${subcmd} ." bị chặn vì xoá toàn bộ working tree. Chỉ hoàn tác từng file cụ thể khi cần (xem executor.md quy tắc 4).`;
  }

  if (subcmd === 'branch' && (hasShortFlag(subArgs, 'D') || (subArgs.includes('--delete') && subArgs.includes('--force')))) {
    return 'Lệnh "git branch -D" bị chặn: chỉ xoá nhánh đã merge bằng "git branch -d <branch>" (xem AGENTS.md mục Git branches).';
  }

  if (subcmd === 'push' && (subArgs.includes('--force') || subArgs.includes('--force-with-lease') || hasShortFlag(subArgs, 'f'))) {
    return 'Lệnh "git push --force" bị chặn để bảo vệ lịch sử nhánh remote.';
  }

  if (activeLock && (subcmd === 'commit' || subcmd === 'push')) {
    return `Đang trong phiên Executor ("${activeLock.taskId}"): không được chạy "git ${subcmd}" (xem executor.md quy tắc 1).`;
  }

  return null;
}

function inspectShellCommand(command, activeLock, depth) {
  if (depth > 2) return null;

  for (const rawTokens of splitShellSegments(command)) {
    const tokens = unwrapCommandTokens(rawTokens);
    if (tokens.length === 0) continue;

    const bin = path.basename(tokens[0]);
    const rest = tokens.slice(1);

    if (SHELL_WRAPPERS.has(bin)) {
      const cIdx = rest.indexOf('-c');
      if (cIdx !== -1 && typeof rest[cIdx + 1] === 'string') {
        const nestedReason = inspectShellCommand(rest[cIdx + 1], activeLock, depth + 1);
        if (nestedReason) return nestedReason;
      }
      continue;
    }

    if (bin !== 'git') continue;

    const parsedGit = extractGitSubcommand(rest);
    if (!parsedGit) continue;

    const denyReason = checkGitCall(parsedGit.subcmd, parsedGit.subArgs, activeLock);
    if (denyReason) return denyReason;
  }

  return null;
}

module.exports = async function guardGitSafety(payload) {
  const { tool, repoRoot } = payload || {};
  if (!tool || tool.category !== 'shell' || typeof tool.command !== 'string' || !repoRoot) {
    return undefined;
  }

  const activeLock = readActiveLock(repoRoot);
  const reason = inspectShellCommand(tool.command, activeLock, 0);
  if (!reason) {
    return undefined;
  }

  return {
    decision: 'deny',
    reason,
  };
};
