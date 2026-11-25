const fs = require('fs');
const path = require('path');

function resolveHookCliArgs(argv) {
  const hookId = argv[2];
  if (!hookId) {
    process.stderr.write('[hook-runner] Missing hook id\n');
    return null;
  }

  let agent = '';
  for (const arg of argv.slice(3)) {
    if (arg.startsWith('--agent=')) {
      agent = arg.slice('--agent='.length);
    }
  }

  if (!agent || (agent !== 'claude' && agent !== 'antigravity')) {
    process.stderr.write(`[hook-runner] Invalid or missing agent: "${agent}"\n`);
    return null;
  }

  return { hookId, agent };
}

function readRawStdinOrExit() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (err) {
    process.stderr.write(`[hook-runner] Failed to read stdin: ${err.message}\n`);
    return null;
  }
}

function loadHookIo(agent) {
  const hookIoPath = path.join(__dirname, 'adapters', agent, 'hook-io.js');
  if (!fs.existsSync(hookIoPath)) {
    process.stderr.write(`[hook-runner] hook-io not found at ${hookIoPath}\n`);
    return null;
  }
  return require(hookIoPath);
}

function loadHookFunction(repoRoot, hookId) {
  const hookScriptPath = path.join(repoRoot, '.agents', 'adapter', 'hooks', `${hookId}.js`);
  if (!fs.existsSync(hookScriptPath)) {
    process.stderr.write(`[hook-runner] Hook script not found at ${hookScriptPath}\n`);
    return null;
  }

  let hookFn;
  try {
    hookFn = require(hookScriptPath);
  } catch (err) {
    process.stderr.write(`[hook-runner] Error loading hook script: ${err.message}\n`);
    return null;
  }

  if (typeof hookFn !== 'function') {
    process.stderr.write(`[hook-runner] Hook script at ${hookScriptPath} does not export a function\n`);
    return null;
  }
  return hookFn;
}

function logHookDebugSafe(repoRoot, agent, hookId, rawInput, result) {
  try {
    const { appendHookDebug } = require('./core/hook-debug');
    appendHookDebug(repoRoot, {
      at: new Date().toISOString(),
      agent,
      hookId,
      cwd: process.cwd(),
      raw: rawInput,
      decision: result && result.decision ? result.decision : 'allow',
    });
  } catch {
    // log chỉ để gỡ lỗi, không được làm hỏng hook
  }
}

async function run() {
  const repoRoot = path.resolve(__dirname, '..', '..');

  try {
    const parsedArgs = resolveHookCliArgs(process.argv);
    if (!parsedArgs) process.exit(0);
    const { hookId, agent } = parsedArgs;

    const rawInput = readRawStdinOrExit();
    if (rawInput === null) process.exit(0);

    const hookIo = loadHookIo(agent);
    if (!hookIo) process.exit(0);
    const { parse, format } = hookIo;

    let parsedInput;
    try {
      parsedInput = parse(rawInput);
    } catch (err) {
      process.stderr.write(`[hook-runner] Error parsing stdin: ${err.message}\n`);
      process.exit(0);
    }

    const hookFn = loadHookFunction(repoRoot, hookId);
    if (!hookFn) process.exit(0);

    let result;
    try {
      result = await hookFn({ ...parsedInput, repoRoot });
    } catch (err) {
      process.stderr.write(`[hook-runner] Hook execution error: ${err.message}\n`);
      process.exit(0);
    }

    logHookDebugSafe(repoRoot, agent, hookId, rawInput, result);

    const formatted = format(result);
    const exitCode = formatted && typeof formatted.exitCode === 'number' ? formatted.exitCode : 0;
    if (formatted && formatted.stdout) {
      process.stdout.write(formatted.stdout, () => process.exit(exitCode));
    } else {
      process.exit(exitCode);
    }
  } catch (err) {
    process.stderr.write(`[hook-runner error] ${err.message}\n`);
    process.exit(0);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
