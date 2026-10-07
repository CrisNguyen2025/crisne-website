#!/usr/bin/env node
/**
 * AI pre-commit review (human-in-the-loop)
 * AI scan staged diff theo rules trong AGENTS.md → dev Accept (chặn để fix) / Reject (bỏ qua) từng warning.
 *
 * Env:
 *   SKIP_AI_REVIEW=1        bỏ qua review
 *   AI_REVIEW_ENGINE        copilot | claude (mặc định: tự detect, ưu tiên copilot)
 *   AI_REVIEW_MOCK=<file>   đọc kết quả AI từ file JSON (test không gọi AI)
 *   AI_REVIEW_TIMEOUT       ms, mặc định 120000
 */
const { execSync, spawnSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const RULES_FILE = 'AGENTS.md'
const MAX_PROMPT_CHARS = 100_000
const TIMEOUT = Number(process.env.AI_REVIEW_TIMEOUT) || 120_000
const EXCLUDES = [
  ':!*.lock',
  ':!package-lock.json',
  ':!pnpm-lock.yaml',
  ':!*.tsbuildinfo',
  ':!*.md',
  ...['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'pdf', 'woff', 'woff2'].map((ext) => `:!*.${ext}`),
]

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).trim()
const warn = (msg) => console.error(`⚠️  [ai-review] ${msg}`)
const info = (msg) => console.error(`🤖 [ai-review] ${msg}`)

function shouldSkip(gitDir) {
  if (process.env.SKIP_AI_REVIEW === '1') return 'SKIP_AI_REVIEW=1'
  if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD'))) return 'đang merge'
  if (['rebase-merge', 'rebase-apply'].some((d) => fs.existsSync(path.join(gitDir, d)))) return 'đang rebase'
  return null
}

function readRules() {
  const content = fs.readFileSync(RULES_FILE, 'utf8')
  const section = content.match(/<!-- review-rules:start -->([\s\S]*?)<!-- review-rules:end -->/)
  if (!section) return []
  return [...section[1].matchAll(/^- \[(\w+)\]\[(error|warn)\]\s*(.+)$/gm)].map(([, id, severity, text]) => ({
    id,
    severity,
    text: text.trim(),
  }))
}

/** Parse diff → { files: { path: Map<line, code> } (chỉ dòng thêm mới), rendered: text có số dòng cho AI } */
function parseDiff(diff) {
  const files = {}
  const out = []
  let file = null
  let lineNo = 0
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw.replace(/^\+\+\+ b\//, '')
      files[file] = new Map()
      out.push(`=== ${file}`)
    } else if (raw.startsWith('@@')) {
      lineNo = Number(raw.match(/\+(\d+)/)[1])
    } else if (!file || raw.startsWith('diff --git') || raw.startsWith('--- ') || raw.startsWith('index ')) {
      continue
    } else if (raw.startsWith('+')) {
      files[file].set(lineNo, raw.slice(1))
      out.push(`${lineNo}|+|${raw.slice(1)}`)
      lineNo++
    } else if (raw.startsWith(' ')) {
      out.push(`${lineNo}| |${raw.slice(1)}`)
      lineNo++
    }
  }
  return { files, rendered: out.join('\n') }
}

function buildPrompt(rules, rendered) {
  return `Bạn là code reviewer. Chỉ review các dòng đánh dấu "+" (dòng mới thêm) theo đúng danh sách RULES. Không báo lỗi ngoài RULES, không báo dòng context.

RULES:
${rules.map((r) => `${r.id} [${r.severity}] ${r.text}`).join('\n')}

DIFF (format mỗi dòng: <số dòng>|<+ hoặc trống>|<code>):
${rendered}

Trả về DUY NHẤT một JSON array, không markdown, không giải thích.
Mỗi phần tử: {"rule":"R01","file":"<path>","line":<số dòng>,"message":"<mô tả ngắn bằng tiếng Việt>"}
Không có vi phạm thì trả về [].`
}

function hasCommand(cmd) {
  return spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0
}

function runEngine(prompt) {
  if (process.env.AI_REVIEW_MOCK) return fs.readFileSync(process.env.AI_REVIEW_MOCK, 'utf8')

  const engine = process.env.AI_REVIEW_ENGINE || ['copilot', 'claude'].find(hasCommand)
  if (!engine || !hasCommand(engine)) throw new Error('không tìm thấy AI CLI (copilot/claude)')

  const args = {
    copilot: ['-p', prompt],
    claude: ['-p', prompt, '--output-format', 'text', '--tools', '', '--strict-mcp-config'],
  }[engine]
  if (!args) throw new Error(`engine không hỗ trợ: ${engine}`)

  info(`đang review bằng ${engine}...`)
  const res = spawnSync(engine, args, {
    encoding: 'utf8',
    timeout: TIMEOUT,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.error) throw new Error(res.error.code === 'ETIMEDOUT' ? `timeout sau ${TIMEOUT}ms` : res.error.message)
  if (res.status !== 0) throw new Error(`${engine} exit ${res.status}: ${(res.stderr || res.stdout || '').trim().slice(0, 300)}`)
  return res.stdout
}

function parseFindings(output) {
  const start = output.indexOf('[')
  const end = output.lastIndexOf(']')
  if (start === -1 || end < start) throw new Error('AI không trả về JSON array')
  const data = JSON.parse(output.slice(start, end + 1))
  if (!Array.isArray(data)) throw new Error('JSON không phải array')
  return data
}

const fingerprint = (f, code) =>
  crypto.createHash('sha1').update(`${f.rule}|${f.file}|${code.trim()}`).digest('hex')

function loadDismissed(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return []
  }
}

async function ask(findings) {
  const prompts = require('prompts')
  let cancelled = false
  const { accepted } = await prompts(
    {
      type: 'multiselect',
      name: 'accepted',
      message: `AI Review — ${findings.length} warning. ◉ Accept (sẽ fix, chặn commit) / ◯ Reject (bỏ qua)`,
      instructions: false,
      hint: 'Space: toggle · a: toggle all · Enter: xác nhận',
      choices: findings.map((f, i) => ({
        title: `[${f.rule}][${f.severity}] ${f.file}:${f.line}  ${f.message}`,
        value: i,
        selected: f.severity === 'error',
      })),
    },
    { onCancel: () => (cancelled = true) },
  )
  return cancelled ? null : new Set(accepted)
}

async function main() {
  const gitDir = git('rev-parse --git-dir')
  const skipReason = shouldSkip(gitDir)
  if (skipReason) return info(`bỏ qua (${skipReason})`), 0

  const rules = readRules()
  if (!rules.length) return warn(`không có rules trong ${RULES_FILE}, bỏ qua`), 0

  const diff = git(`diff --cached -U3 --diff-filter=ACMR -- . ${EXCLUDES.map((e) => `'${e}'`).join(' ')}`)
  if (!diff) return 0

  const { files, rendered } = parseDiff(diff)
  const prompt = buildPrompt(rules, rendered)
  if (prompt.length > MAX_PROMPT_CHARS) return warn(`diff quá lớn (${prompt.length} ký tự), bỏ qua review`), 0

  let raw
  try {
    raw = parseFindings(runEngine(prompt))
  } catch (e) {
    return warn(`${e.message} → cho phép commit (fail-open)`), 0
  }

  // Anti-hallucination: chỉ giữ finding có rule hợp lệ và trỏ đúng dòng được thêm mới
  const ruleMap = new Map(rules.map((r) => [r.id, r]))
  const dismissedFile = path.join(gitDir, 'ai-review', 'dismissed.json')
  const dismissed = loadDismissed(dismissedFile)
  const dismissedSet = new Set(dismissed.map((d) => d.fp))

  const findings = raw
    .filter((f) => ruleMap.has(f.rule) && files[f.file]?.has(Number(f.line)))
    .map((f) => {
      const code = files[f.file].get(Number(f.line))
      return { ...f, line: Number(f.line), severity: ruleMap.get(f.rule).severity, code, fp: fingerprint(f, code) }
    })
    .filter((f) => !dismissedSet.has(f.fp))

  const dropped = raw.length - findings.length
  if (dropped) info(`đã lọc ${dropped} warning (sai rule/dòng hoặc đã Reject trước đó)`)
  if (!findings.length) return info('✅ không có vi phạm'), 0

  if (!process.stdin.isTTY) {
    warn('không có terminal tương tác → chỉ cảnh báo:')
    findings.forEach((f) => console.error(`   [${f.rule}][${f.severity}] ${f.file}:${f.line}  ${f.message}`))
    return 0
  }

  const accepted = await ask(findings)
  if (!accepted) return warn('đã huỷ → chặn commit'), 1

  const rejected = findings.filter((_, i) => !accepted.has(i))
  if (rejected.length) {
    const by = spawnSync('git', ['config', 'user.name'], { encoding: 'utf8' }).stdout.trim() || 'unknown'
    const at = new Date().toISOString()
    dismissed.push(...rejected.map(({ fp, rule, file, line, message }) => ({ fp, rule, file, line, message, by, at })))
    fs.mkdirSync(path.dirname(dismissedFile), { recursive: true })
    fs.writeFileSync(dismissedFile, JSON.stringify(dismissed, null, 2))
  }

  if (accepted.size) {
    console.error('\n❌ [ai-review] Commit bị chặn. Cần fix:')
    findings
      .filter((_, i) => accepted.has(i))
      .forEach((f) => console.error(`   [${f.rule}] ${f.file}:${f.line}  ${f.message}\n      > ${f.code.trim()}`))
    return 1
  }
  return info(`✅ đã Reject ${rejected.length} warning → cho phép commit`), 0
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    warn(`lỗi không mong muốn: ${e.message} → cho phép commit (fail-open)`)
    process.exit(0)
  })
