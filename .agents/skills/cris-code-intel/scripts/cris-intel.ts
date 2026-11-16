#!/usr/bin/env ts-node
/**
 * CRIS CODE INTELLIGENCE CLI (cris-intel)
 *
 * Lớp nghiệp vụ của code intel cho workspace crisne-website: domain, flow nghiệp vụ,
 * invariant, failure mode. Impact và route map dùng GitNexus (gitnexus_impact,
 * gitnexus_api_impact, gitnexus_route_map).
 *
 * Cách chạy:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/cris-code-intel/scripts/cris-intel.ts <command> [args]
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const DATASET_PATH = path.resolve(__dirname, "../data/cris-workspace-map.json");

interface Domain {
  id: string;
  name: string;
  summary: string;
  cohesionScore: number;
  adrs: string[];
  glossary: string[];
  keyFiles: string[];
  dataModels: string[];
}

interface Step {
  order: number;
  layer: string;
  component: string;
  functionOrMethod?: string;
  action: string;
  callsNext: string | null;
  dataPassed: string;
}

interface ExecutionFlow {
  id: string;
  name: string;
  domainId: string;
  actor: string;
  trigger: string;
  preconditions: string[];
  steps: Step[];
  invariants: string[];
  failureModes: string[];
  relatedAdrs: string[];
}

interface EntryPoint {
  id: string;
  type: string;
  path: string;
  method: string;
  authRequirement: string;
  domainId: string;
  summary: string;
  handler: string;
  triggersFlow: string;
}

interface DataModel {
  id: string;
  name: string;
  source: string;
  table: string;
  domainId: string;
  fields: string[];
  relations: string[];
  invariants: string[];
}

interface InvariantRule {
  ruleId: string;
  title: string;
  summary: string;
}

interface WorkspaceMap {
  version: string;
  generatedAt: string;
  headCommit: string;
  repository: string;
  architecture: {
    framework: string;
    languages: string[];
    database: string;
    ai_providers: string[];
    observability: string;
    layers: { id: string; name: string; description: string }[];
  };
  domains: Domain[];
  entryPoints: EntryPoint[];
  executionFlows: ExecutionFlow[];
  dataModels: DataModel[];
  invariantsAndRules: InvariantRule[];
}

function loadMap(): WorkspaceMap {
  if (!fs.existsSync(DATASET_PATH)) {
    console.error(`❌ Không tìm thấy dataset tại: ${DATASET_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(DATASET_PATH, "utf-8");
  return JSON.parse(raw) as WorkspaceMap;
}

function getCurrentCommit(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Handlers
// ─────────────────────────────────────────────────────────────────────────────

// Gom mọi ref dạng `path[#symbol]` mà map nhắc tới.
function collectRefs(data: WorkspaceMap): string[] {
  const refs = [
    ...data.domains.flatMap((d) => d.keyFiles),
    ...data.executionFlows.flatMap((f) =>
      f.steps.flatMap((s) => [
        s.functionOrMethod ? `${s.component}#${s.functionOrMethod}` : s.component,
        ...(s.callsNext ? [s.callsNext] : []),
      ])
    ),
    ...data.entryPoints.map((e) => e.handler),
    ...data.dataModels.map((m) => m.source),
  ];
  return [...new Set(refs)];
}

// Trả về mô tả lỗi, hoặc null nếu ref còn khớp code. Bỏ qua chuỗi không phải đường dẫn.
function checkRef(repoRoot: string, ref: string): string | null {
  const [filePath, symbol] = ref.split("#");
  if (!/^[\w.\-[\]]+\/|\.\w+$/.test(filePath)) return null;
  const fullPath = path.join(repoRoot, filePath);
  if (!fs.existsSync(fullPath)) return `MISSING_FILE   ${ref}`;
  if (!symbol) return null;
  const name = symbol.replace(/\(.*$/, "").split(".").pop() ?? symbol;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const content = fs.readFileSync(fullPath, "utf-8");
  return new RegExp(`\\b${escaped}\\b`).test(content) ? null : `MISSING_SYMBOL ${ref}`;
}

function handleStatus(data: WorkspaceMap) {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const refs = collectRefs(data);
  const errors = refs.map((r) => checkRef(repoRoot, r)).filter((e): e is string => e !== null);

  console.log("\n📊 === CRIS WORKSPACE CODE INTELLIGENCE STATUS ===");
  console.log(`Map Commit    : ${data.headCommit.slice(0, 7)} (tham khảo)`);
  console.log(`Current Commit: ${getCurrentCommit().slice(0, 7)}`);
  console.log(
    `Domains ${data.domains.length} | Entry Points ${data.entryPoints.length} | Flows ${data.executionFlows.length} | Data Models ${data.dataModels.length} | ADR Rules ${data.invariantsAndRules.length}`
  );
  console.log("───────────────────────────────────────────────────");
  if (errors.length === 0) {
    console.log(`🟢 OK: ${refs.length} ref đều khớp code\n`);
    return;
  }
  console.log(`🔴 ${errors.length}/${refs.length} ref không khớp code:`);
  errors.forEach((e) => console.log(`  ${e}`));
  console.log("");
  process.exit(1);
}

function handleQuery(data: WorkspaceMap, query: string) {
  if (!query) {
    console.error(
      'Vui lòng nhập từ khóa tìm kiếm. Ví dụ: query "lesson status"'
    );
    return;
  }
  const q = query.toLowerCase();

  console.log(`\n🔍 === KẾT QUẢ TÌM KIẾM CHO: "${query}" ===\n`);

  // 1. Matches in Execution Flows
  const matchedFlows = data.executionFlows.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q) ||
      f.trigger.toLowerCase().includes(q) ||
      f.steps.some(
        (s) =>
          s.action.toLowerCase().includes(q) ||
          s.component.toLowerCase().includes(q)
      )
  );

  if (matchedFlows.length > 0) {
    console.log(`📌 EXECUTION FLOWS (${matchedFlows.length}):`);
    for (const f of matchedFlows) {
      console.log(`  • [${f.id}] ${f.name}`);
      console.log(`    Actor: ${f.actor} | Domain: ${f.domainId}`);
      console.log(`    Trigger: ${f.trigger}`);
      console.log(`    Xem chi tiết: cris-intel trace ${f.id}\n`);
    }
  }

  // 2. Matches in Domains
  const matchedDomains = data.domains.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q) ||
      d.summary.toLowerCase().includes(q) ||
      d.glossary.some((g) => g.toLowerCase().includes(q))
  );

  if (matchedDomains.length > 0) {
    console.log(`🏢 DOMAINS (${matchedDomains.length}):`);
    for (const d of matchedDomains) {
      console.log(`  • [${d.id}] ${d.name} (Cohesion: ${d.cohesionScore})`);
      console.log(`    ${d.summary}`);
      console.log(
        `    Glossary: ${d.glossary.join(", ")} | ADRs: ${d.adrs.join(", ")}\n`
      );
    }
  }

  // 3. Matches in Entry Points
  const matchedRoutes = data.entryPoints.filter(
    (r) =>
      r.path.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q) ||
      r.handler.toLowerCase().includes(q)
  );

  if (matchedRoutes.length > 0) {
    console.log(`🚪 ENTRY POINTS / ROUTES (${matchedRoutes.length}):`);
    for (const r of matchedRoutes) {
      console.log(`  • [${r.method}] ${r.path} (${r.authRequirement})`);
      console.log(`    Handler: ${r.handler}`);
      console.log(`    ${r.summary}\n`);
    }
  }

  // 4. Matches in Data Models
  const matchedModels = data.dataModels.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.table.toLowerCase().includes(q) ||
      m.fields.some((f) => f.toLowerCase().includes(q))
  );

  if (matchedModels.length > 0) {
    console.log(`🗄️ DATA MODELS (${matchedModels.length}):`);
    for (const m of matchedModels) {
      console.log(
        `  • [${m.source.toUpperCase()}] ${m.name} (Table: ${m.table})`
      );
      console.log(`    Fields: ${m.fields.join(", ")}\n`);
    }
  }

  if (
    matchedFlows.length === 0 &&
    matchedDomains.length === 0 &&
    matchedRoutes.length === 0 &&
    matchedModels.length === 0
  ) {
    console.log("Không tìm thấy thực thể hoặc luồng nào khớp với từ khóa.");
  }
}

function handleTrace(data: WorkspaceMap, target: string) {
  if (!target) {
    console.error(
      "Vui lòng chỉ định Flow ID hoặc tên luồng cần trace. Ví dụ: trace FLOW_LESSON_STATUS_UPDATE"
    );
    return;
  }

  const flow = data.executionFlows.find(
    (f) =>
      f.id.toLowerCase() === target.toLowerCase() ||
      f.name.toLowerCase().includes(target.toLowerCase())
  );

  if (!flow) {
    console.error(`❌ Không tìm thấy Execution Flow khớp với: "${target}"`);
    console.log("Các flow hiện có:");
    data.executionFlows.forEach((f) => console.log(`  - ${f.id}: ${f.name}`));
    return;
  }

  console.log(`\n🛤️ === EXECUTION FLOW TRACE: [${flow.id}] ===`);
  console.log(`Tên luồng    : ${flow.name}`);
  console.log(`Domain       : ${flow.domainId}`);
  console.log(`Actor        : ${flow.actor}`);
  console.log(`Trigger      : ${flow.trigger}`);
  console.log(`Điều kiện đầu: ${flow.preconditions.join("; ")}`);
  console.log(`ADRs liên quan: ${flow.relatedAdrs.join(", ") || "None"}`);
  console.log("\n--- CÁC CHẶNG THỰC THI (ORDERED STEPS / HOPS) ---");

  for (const s of flow.steps) {
    console.log(`\n▶ [Chặng ${s.order}] Layer: ${s.layer}`);
    console.log(
      `  File/Component: ${s.component}${s.functionOrMethod ? ` -> ${s.functionOrMethod}` : ""}`
    );
    console.log(`  Hành động     : ${s.action}`);
    console.log(`  Dữ liệu truyền : ${s.dataPassed}`);
    if (s.callsNext) {
      console.log(`  Gọi tiếp theo : ↳ ${s.callsNext}`);
    } else {
      console.log("  Kết quả       : 🏁 Điểm kết thúc luồng");
    }
  }

  console.log("\n--- BẤT BIẾN & QUY ƯỚC (INVARIANTS) ---");
  flow.invariants.forEach((inv) => console.log(`  ⚠️ ${inv}`));

  console.log("\n--- KỊCH BẢN THẤT BẠI (FAILURE MODES) ---");
  flow.failureModes.forEach((fail) => console.log(`  💥 ${fail}`));
  console.log("");
}

function handleConcept(data: WorkspaceMap, domainArg: string) {
  if (!domainArg) {
    console.log("\n🏢 === DANH SÁCH TẤT CẢ DOMAINS TRONG WORKSPACE ===\n");
    for (const d of data.domains) {
      console.log(`• [${d.id}] ${d.name}`);
      console.log(`  ${d.summary}`);
      console.log(
        `  ADRs: ${d.adrs.join(", ") || "N/A"} | Models: ${d.dataModels.join(", ")}\n`
      );
    }
    console.log(
      "Chạy `cris-intel concept <domain_id>` để xem chi tiết kiến trúc một domain."
    );
    return;
  }

  const domain = data.domains.find(
    (d) =>
      d.id.toLowerCase() === domainArg.toLowerCase() ||
      d.name.toLowerCase().includes(domainArg.toLowerCase())
  );

  if (!domain) {
    console.error(`❌ Không tìm thấy Domain khớp với: "${domainArg}"`);
    return;
  }

  console.log(`\n🏢 === DOMAIN ARCHITECTURE: [${domain.id}] ===`);
  console.log(`Tên Domain    : ${domain.name}`);
  console.log(`Cohesion Score: ${domain.cohesionScore}`);
  console.log(`Mô tả         : ${domain.summary}`);
  console.log(`Glossary Terms: ${domain.glossary.join(", ")}`);
  console.log(`ADRs Quy ước  : ${domain.adrs.join(", ") || "None"}`);

  console.log("\n📂 CÁC TỆP NGUỒN CỐT LÕI (KEY FILES):");
  domain.keyFiles.forEach((f) => console.log(`  - ${f}`));

  console.log("\n🗄️ DATA MODELS:");
  domain.dataModels.forEach((m) => console.log(`  - ${m}`));

  console.log("\n🛤️ CÁC LUỒNG THỰC THI (EXECUTION FLOWS):");
  const flows = data.executionFlows.filter((f) => f.domainId === domain.id);
  flows.forEach((f) =>
    console.log(`  • [${f.id}] ${f.name} (Actor: ${f.actor})`)
  );

  console.log("\n🚪 ENTRY POINTS / ROUTES:");
  const routes = data.entryPoints.filter((r) => r.domainId === domain.id);
  routes.forEach((r) =>
    console.log(`  • [${r.method}] ${r.path} -> ${r.handler}`)
  );
  console.log("");
}

// ─────────────────────────────────────────────────────────────────────────────
// How-To-Sync / Target Evaluation Guard (cris-how-to-sync)
// ─────────────────────────────────────────────────────────────────────────────

interface InvariantRuleCheck {
  keywords: string[];
  rule: string;
  message: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
}

interface AvoidTermCheck {
  term: string;
  preferred: string;
  reason: string;
}

const AVOID_TERMS_CATALOG: AvoidTermCheck[] = [
  { term: "course", preferred: "Topic", reason: "GLOSSARY.md: Dùng Topic thay cho course / lộ trình con" },
  { term: "lộ trình con", preferred: "Topic", reason: "GLOSSARY.md: Dùng Topic" },
  { term: "layer", preferred: "Section", reason: "GLOSSARY.md & ADR-0009: Dùng Section, cấm dùng layer / group" },
  { term: "group", preferred: "Section", reason: "GLOSSARY.md & ADR-0009: Group đã bị thay thế bởi Section" },
  { term: "category", preferred: "Section / Tag", reason: "GLOSSARY.md: Tránh dùng category cho bài học hoặc tag" },
  { term: "module", preferred: "Section", reason: "GLOSSARY.md: Tránh dùng module cho bài học" },
  { term: "level", preferred: "Section / Lesson Status", reason: "GLOSSARY.md & ADR-0008/0010: Bỏ Level, dùng Section hoặc Status" },
  { term: "knowledge node", preferred: "Lesson / Item", reason: "GLOSSARY.md: Dùng Lesson thay cho knowledge node" },
  { term: "bài viết", preferred: "Lesson", reason: "GLOSSARY.md: Dùng Lesson" },
  { term: "progress", preferred: "Lesson Status", reason: "GLOSSARY.md & ADR-0010: Dùng Lesson Status (target/learning/known)" },
  { term: "mastery", preferred: "Lesson Status", reason: "GLOSSARY.md & ADR-0010: Dùng Lesson Status" },
  { term: "role", preferred: "Actor", reason: "GLOSSARY.md: Trong chatbot dùng Actor (Owner/Visitor); Role là thuật ngữ API Docs" },
  { term: "user type", preferred: "Actor", reason: "GLOSSARY.md: Dùng Actor (Owner/Visitor)" },
  { term: "admin", preferred: "Owner", reason: "GLOSSARY.md: Dùng Owner thay vì admin" },
  { term: "author", preferred: "Owner", reason: "GLOSSARY.md: Dùng Owner thay vì author" },
  { term: "guest", preferred: "Visitor", reason: "GLOSSARY.md: Dùng Visitor thay vì guest" },
  { term: "anonymous", preferred: "Visitor", reason: "GLOSSARY.md: Dùng Visitor" },
  { term: "session", preferred: "Thread", reason: "GLOSSARY.md: Chatbot dùng Thread thay vì session" },
  { term: "conversation", preferred: "Thread", reason: "GLOSSARY.md: Dùng Thread" },
  { term: "mutation", preferred: "Change / CUD", reason: "GLOSSARY.md: Dùng Change hoặc CUD khi nói về thay đổi bài học" },
  { term: "confirm card", preferred: "Preview", reason: "GLOSSARY.md: Dùng Preview cho thẻ xác nhận CUD" },
  { term: "pending card", preferred: "Preview", reason: "GLOSSARY.md: Dùng Preview" },
  { term: "queued action", preferred: "Pending Action", reason: "GLOSSARY.md: Dùng Pending Action" },
  { term: "star", preferred: "Favorite", reason: "GLOSSARY.md: Dùng Favorite cho Tag" },
  // Chỉ thêm các từ cấm ít nghĩa khác. Chưa đưa vào: write, domain, user, API, route, post, label, score,
  // benchmark, log, run, outline, template, auto-generate, knowledge base, topic (khi nói về phạm vi),
  // vì chúng phổ biến trong mô tả kỹ thuật hoặc chỉ bị cấm theo ngữ cảnh (code dùng write_gate, write_grant).
  { term: "rag bot", preferred: "Roadmap Assistant", reason: "GLOSSARY.md: Dùng Roadmap Assistant (Abot)" },
  { term: "roadmap chatbot", preferred: "Roadmap Assistant", reason: "GLOSSARY.md: Dùng Roadmap Assistant (Abot)" },
  { term: "no-context", preferred: "Domain Gap", reason: "GLOSSARY.md: Câu hỏi thuộc lĩnh vực nhưng chưa có Lesson là Domain Gap" },
  { term: "missing lesson", preferred: "Domain Gap", reason: "GLOSSARY.md: Dùng Domain Gap" },
  { term: "external question", preferred: "Out of Scope", reason: "GLOSSARY.md: Dùng Out of Scope (off-topic)" },
  { term: "floating bot", preferred: "Cris AI", reason: "GLOSSARY.md: Chatbot trang portfolio là Cris AI" },
  { term: "site chatbot", preferred: "Cris AI", reason: "GLOSSARY.md: Dùng Cris AI" },
  { term: "rating", preferred: "Feedback", reason: "GLOSSARY.md: Đánh giá 👍/👎 là Feedback" },
  { term: "vote", preferred: "Feedback", reason: "GLOSSARY.md: Dùng Feedback" },
  { term: "test set", preferred: "Golden Set", reason: "GLOSSARY.md: Tập câu hỏi kèm đáp án chuẩn là Golden Set" },
  { term: "bookmark", preferred: "Note / Favorite", reason: "GLOSSARY.md: Ghi chú/link là Note, Tag yêu thích là Favorite" }
];

const INVARIANT_RULES_CATALOG: InvariantRuleCheck[] = [
  {
    keywords: ["pinecone", "weaviate", "qdrant", "milvus", "chromadb", "chroma"],
    rule: "ADR-0006",
    message: "Vi phạm ADR-0006: Abot bắt buộc dùng in-memory vector store (numpy + BM25 FTS), cấm dùng external vector DB.",
    severity: "CRITICAL"
  },
  {
    keywords: ["openai", "text-embedding-3", "text-embedding-3-small", "text-embedding-3-large", "cohere", "huggingface"],
    rule: "ADR-0004",
    message: "Vi phạm ADR-0004: Toàn bộ vector embeddings bắt buộc dùng Google Gemini text-embedding-004 (768d).",
    severity: "CRITICAL"
  },
  {
    keywords: [
      "visitor write",
      "visitor cud",
      "visitor update",
      "visitor delete",
      "visitor create",
      "cho phép visitor sửa",
      "cho phép visitor tạo",
      "visitor ghi",
      "visitor thay đổi"
    ],
    rule: "ADR-0002",
    message: "Vi phạm ADR-0002: Visitor chỉ được phép đọc và hỏi đáp (RAG). Mọi lệnh CUD đều bị chặn ở cả Next.js Gateway và Python backend.",
    severity: "CRITICAL"
  },
  {
    keywords: [
      "direct port 8000",
      "bypass proxy",
      "gọi trực tiếp 8000",
      "gọi trực tiếp python",
      "direct fastapi",
      "direct microservice"
    ],
    rule: "ADR-0002",
    message: "Vi phạm ADR-0002: Trình duyệt chỉ được gọi backend Python qua proxy Next.js: /api/roadmap-assistant/[...path].",
    severity: "CRITICAL"
  },
  {
    keywords: ["postgres", "postgresql", "mongodb", "dynamodb"],
    rule: "ADR-0005",
    message: "Vi phạm ADR-0005: Production database sử dụng Turso (libSQL/SQLite). Mọi schema và migration phải theo SQLite dialect.",
    severity: "HIGH"
  },
  {
    keywords: ["zustand", "redux", "mobx", "recoil"],
    rule: "ARCH-STATE",
    message: "Cảnh báo kiến trúc: Ưu tiên Server Components + URL search params + React state. Tránh đưa client state store nặng vào repo.",
    severity: "MEDIUM"
  }
];

// Khớp nguyên từ: ký tự liền trước và sau không được là chữ, số, "_" hay "-",
// nên "schema-first" không khớp "schema", "authorization" không khớp "author".
// Không dùng \b vì \b của JS coi chữ có dấu tiếng Việt là ký tự ngắt từ.
function containsTerm(text: string, term: string): boolean {
  const escaped = term.normalize("NFC").toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_-])${escaped}(?![\\p{L}\\p{M}\\p{N}_-])`, "u").test(text);
}

function containsAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => containsTerm(text, term));
}

function handleHowToSync(data: WorkspaceMap, target: string) {
  if (!target) {
    console.error(
      "Vui lòng truyền mô tả Target cần đánh giá tính tương thích và đồng bộ.\nVí dụ: yarn intel how-to-sync \"Thêm trường metadata JSON vào RoadmapItem\""
    );
    return;
  }

  const queryLower = target.normalize("NFC").toLowerCase();

  console.log(`\n🛡️ === CRIS HOW-TO-SYNC AUDIT REPORT ===`);
  console.log(`Mục tiêu đánh giá (Target): "${target}"\n`);

  // 1. Check Glossary Violations
  const detectedAvoidTerms: AvoidTermCheck[] = [];
  for (const item of AVOID_TERMS_CATALOG) {
    if (containsTerm(queryLower, item.term)) {
      detectedAvoidTerms.push(item);
    }
  }

  // 2. Check ADR Invariant Violations
  const detectedViolations: InvariantRuleCheck[] = [];
  for (const rule of INVARIANT_RULES_CATALOG) {
    if (containsAnyTerm(queryLower, rule.keywords)) {
      detectedViolations.push(rule);
    }
  }

  // 3. Scan Sync Effects
  const syncEffects: string[] = [];

  const mentionsDb = containsAnyTerm(queryLower, [
    "model",
    "schema",
    "bảng",
    "trường",
    "table",
    "prisma",
    "field",
    "column",
  ]);
  if (mentionsDb) {
    syncEffects.push("Database & Schema: prisma/schema.prisma -> chạy yarn db:push Turso -> scripts/export-test-schema.ts");
  }

  const mentionsRoadmapMutation = containsAnyTerm(queryLower, [
    "lesson",
    "topic",
    "section",
    "roadmapitem",
    "bài học",
    "status",
  ]);
  if (mentionsRoadmapMutation) {
    syncEffects.push("RAG Vector Index: Cần gắn hook after(requestRagReindex) khi có CUD để Python backend nạp lại in-memory vector store");
  }

  const mentionsPython = containsAnyTerm(queryLower, [
    "fastapi",
    "intent",
    "router",
    "abot",
    "rag",
    "python",
    "p0",
    "preview",
  ]);
  if (mentionsPython) {
    syncEffects.push("Dual-Service Sync: Đồng bộ schemas Pydantic (Python) với Next.js BFF proxy /api/roadmap-assistant");
  }

  // "environment" và "biến môi trường" bù cho "env": khớp nguyên từ nên "env" không còn khớp "environment"
  const mentionsEnv = containsAnyTerm(queryLower, [
    "env",
    "environment",
    "biến môi trường",
    "token",
    "secret",
    "api key",
    "key",
  ]);
  if (mentionsEnv) {
    syncEffects.push("Deployment Env: Cập nhật docs/DEPLOY_ENV.md cho cả Vercel (Next.js) và Render (Python microservice)");
  }

  const mentionsNewTerm =
    containsAnyTerm(queryLower, ["thuật ngữ", "concept", "từ mới"]) || detectedAvoidTerms.length > 0;
  if (mentionsNewTerm) {
    syncEffects.push("Core Docs: Cập nhật định nghĩa vào GLOSSARY.md (chú ý _Also_ và _Avoid_)");
  }

  // Luôn luôn cần sync Code Intelligence
  syncEffects.push("Code Intelligence: Cập nhật .agents/skills/cris-code-intel/data/cris-workspace-map.json và kiểm tra với yarn intel status");

  // 4. Find affected Domains & Execution Flows
  const matchedDomains = data.domains.filter(
    (d) => containsAnyTerm(queryLower, [d.id, d.name, ...d.glossary])
  );

  const matchedFlows = data.executionFlows.filter(
    (f) =>
      containsTerm(queryLower, f.domainId) ||
      f.name.split(" ").some((w) => w.length > 3 && containsTerm(queryLower, w))
  );

  // 5. Output Findings
  console.log("───────────────────────────────────────────────────");
  console.log("1. XUNG ĐỘT & LỆCH CHUẨN KIẾN TRÚC (CONFLICT & INVARIANTS):");
  if (detectedViolations.length === 0) {
    console.log("  🟢 Không phát hiện vi phạm bất biến cốt lõi (ADR Invariants).");
  } else {
    for (const v of detectedViolations) {
      console.log(`  💥 [${v.severity}] [${v.rule}] ${v.message}`);
    }
  }

  console.log("\n2. KIỂM TRA THUẬT NGỮ GLOSSARY (SEMANTIC CONFUSION):");
  if (detectedAvoidTerms.length === 0) {
    console.log("  🟢 Không phát hiện từ ngữ bị cấm trong GLOSSARY.md.");
  } else {
    for (const a of detectedAvoidTerms) {
      console.log(`  ⚠️ Phát hiện từ cấm: "${a.term}" -> Khuyến nghị thay thế: "${a.preferred}" (${a.reason})`);
    }
  }

  console.log("\n3. MA TRẬN HIỆU ỨNG ĐỒNG BỘ (SYNC EFFECTS CHECKLIST):");
  for (const s of syncEffects) {
    console.log(`  🔄 [CẦN SYNC] ${s}`);
  }

  console.log("\n4. LIÊN ĐỚI WORKSPACE (CRIS-CODE-INTEL CONTEXT):");
  if (matchedDomains.length > 0) {
    console.log(`  🏢 Domains liên quan: ${matchedDomains.map((d) => `[${d.id}] ${d.name}`).join(", ")}`);
  }
  if (matchedFlows.length > 0) {
    console.log(`  🛤️ Execution Flows có thể bị ảnh hưởng (${matchedFlows.length}):`);
    matchedFlows.forEach((f) => console.log(`     • [${f.id}] ${f.name} (Actor: ${f.actor})`));
  }

  // 6. Final Verdict
  const hasCritical = detectedViolations.some((v) => v.severity === "CRITICAL");
  const hasHighOrMedium = detectedViolations.some((v) => v.severity !== "CRITICAL");
  const hasGlossaryWarning = detectedAvoidTerms.length > 0;

  // CLI chỉ so keyword: không kiểm tra được trùng lặp với module sẵn có hay độ cần thiết (bước 3 của skill),
  // nên mọi kết quả ở đây là sơ bộ, và không phát hiện vi phạm không có nghĩa là NÊN.
  console.log("\n───────────────────────────────────────────────────");
  if (hasCritical) {
    console.log("⚖️ KẾT LUẬN SƠ BỘ: 🔴 KHÔNG NÊN (REJECTED / ANTI-PATTERN)");
    console.log("Lý do: Target khớp keyword vi phạm trực tiếp các bất biến hệ thống không thể thỏa hiệp.");
    console.log("Hành động: Xác nhận vi phạm là thật (keyword có thể nằm trong câu phủ định), rồi hủy bỏ hoặc thiết kế lại theo references/ARCHITECTURAL_INVARIANTS.md.\n");
  } else if (hasHighOrMedium || hasGlossaryWarning) {
    console.log("⚖️ KẾT LUẬN SƠ BỘ: 🟡 CẢI THIỆN / ĐIỀU CHỈNH (CONDITIONAL / NEEDS ALIGNMENT)");
    console.log("Lý do: Target khớp keyword cảnh báo về thuật ngữ, ranh giới kiến trúc hoặc bước đồng bộ.");
    console.log("Hành động: Xử lý các điểm cảnh báo ở trên, rồi làm bước 3 của skill (phân tích trùng lặp) trước khi kết luận.\n");
  } else {
    console.log("⚖️ KẾT LUẬN SƠ BỘ: ⚪ CHƯA KẾT LUẬN (KHÔNG PHÁT HIỆN VI PHẠM KEYWORD)");
    console.log("Lý do: Không khớp keyword vi phạm ADR hay từ cấm trong GLOSSARY.md. CLI không kiểm tra trùng lặp với module sẵn có hay độ cần thiết.");
    console.log("Hành động: Làm bước 3 của skill (đọc code liên quan, tìm module đã giải quyết việc này) rồi mới kết luận NÊN / KHÔNG NÊN / CẢI THIỆN.\n");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  const subArg = args.slice(1).join(" ");

  const data = loadMap();

  switch (command) {
    case "status":
      handleStatus(data);
      break;
    case "query":
      handleQuery(data, subArg);
      break;
    case "trace":
      handleTrace(data, subArg);
      break;
    case "concept":
      handleConcept(data, subArg);
      break;
    case "how-to-sync":
    case "eval":
    case "sync-check":
      handleHowToSync(data, subArg);
      break;
    default:
      console.log(`
CRIS CODE INTELLIGENCE CLI (cris-intel)
Lớp nghiệp vụ của code intel cho workspace crisne-website: domain, flow, invariant, failure mode.

LỆNH HỖ TRỢ:
  status                   Kiểm mọi file/symbol mà map nhắc tới còn tồn tại (exit 1 nếu lệch)
  query <từ khóa>          Tìm flow, domain, route, data model liên quan
  trace <flow_id>          Lần vết từng chặng chi tiết của một luồng xử lý
  concept [domain_id]      Xem kiến trúc tổng quan hoặc chi tiết một domain
  how-to-sync <mục tiêu>   Thẩm định xung đột, hiệu ứng đồng bộ và kết luận NÊN/KHÔNG NÊN

  impact / route map: dùng GitNexus (gitnexus_impact, gitnexus_api_impact, gitnexus_route_map)

VÍ DỤ:
  yarn intel query "lesson status"
  yarn intel trace FLOW_LESSON_STATUS_UPDATE
  yarn intel concept roadmap-learning
  yarn intel how-to-sync "Thêm trường metadata vào RoadmapItem"
`);
      break;
  }
}

main();
