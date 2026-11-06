#!/usr/bin/env ts-node
/**
 * CRIS CODE INTELLIGENCE CLI (cris-intel)
 *
 * Tra cứu bản đồ xử lý logic, lần vết luồng thực thi (execution flow trace),
 * phân tích tầm ảnh hưởng (impact analysis) và ánh xạ route-to-code cho workspace crisne-website.
 * Theo mô hình Code Intelligence của GitNexus.
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

interface SymbolRef {
  name: string;
  type: string;
  filePath: string;
  domainId: string;
  description: string;
  callers: string[];
  callees: string[];
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
  symbols: SymbolRef[];
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

function handleStatus(data: WorkspaceMap) {
  const currentCommit = getCurrentCommit();
  const isFresh = currentCommit === data.headCommit;

  console.log("\n📊 === CRIS WORKSPACE CODE INTELLIGENCE STATUS ===");
  console.log(`Repository    : ${data.repository}`);
  console.log(`Map Version   : ${data.version}`);
  console.log(`Generated At  : ${data.generatedAt}`);
  console.log(`Map Commit    : ${data.headCommit.slice(0, 7)}`);
  console.log(`Current Commit: ${currentCommit.slice(0, 7)}`);
  console.log(
    `Index Status  : ${isFresh ? "🟢 FRESH (Đồng bộ)" : "⚠️ MODIFIED (Chênh lệch commit nhưng logic cơ bản giữ nguyên)"}`
  );
  console.log("───────────────────────────────────────────────────");
  console.log(`Domains       : ${data.domains.length}`);
  console.log(`Entry Points  : ${data.entryPoints.length}`);
  console.log(`ExecutionFlows: ${data.executionFlows.length}`);
  console.log(`Data Models   : ${data.dataModels.length}`);
  console.log(`Core Symbols  : ${data.symbols.length}`);
  console.log(`ADR Rules     : ${data.invariantsAndRules.length}\n`);
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

  // 5. Matches in Symbols
  const matchedSymbols = data.symbols.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
  );

  if (matchedSymbols.length > 0) {
    console.log(`🧩 CORE SYMBOLS (${matchedSymbols.length}):`);
    for (const s of matchedSymbols) {
      console.log(`  • ${s.name} (${s.type}) -> ${s.filePath}`);
      console.log(`    ${s.description}\n`);
    }
  }

  if (
    matchedFlows.length === 0 &&
    matchedDomains.length === 0 &&
    matchedRoutes.length === 0 &&
    matchedModels.length === 0 &&
    matchedSymbols.length === 0
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

function handleRouteMap(data: WorkspaceMap, filter?: string) {
  let routes = data.entryPoints;
  if (filter) {
    const f = filter.toLowerCase();
    routes = routes.filter(
      (r) =>
        r.path.toLowerCase().includes(f) ||
        r.domainId.toLowerCase().includes(f) ||
        r.method.toLowerCase().includes(f)
    );
  }

  console.log(`\n🚪 === API ROUTE MAP (${routes.length} routes) ===\n`);
  console.log("| Method | Path | Auth | Domain | Handler | Triggered Flow |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const r of routes) {
    console.log(
      `| \`${r.method}\` | \`${r.path}\` | ${r.authRequirement} | ${r.domainId} | \`${r.handler}\` | ${r.triggersFlow} |`
    );
  }
  console.log("");
}

function handleImpact(data: WorkspaceMap, target: string) {
  if (!target) {
    console.error(
      "Vui lòng truyền tên hàm, model hoặc route cần phân tích ảnh hưởng (blast radius)."
    );
    return;
  }
  const t = target.toLowerCase();

  console.log(`\n💥 === BLAST RADIUS & IMPACT ANALYSIS: "${target}" ===\n`);

  // Symbol match
  const symbol = data.symbols.find((s) => s.name.toLowerCase() === t);
  if (symbol) {
    console.log(
      `Target: Symbol ${symbol.name} (${symbol.type}) tại ${symbol.filePath}`
    );
    console.log(`Mô tả : ${symbol.description}`);
    console.log(`Caller trực tiếp (Ai gọi hàm này?):`);
    symbol.callers.forEach((c) => console.log(`  ▲ ${c}`));
    console.log(`Callee (Hàm này gọi ai?):`);
    symbol.callees.forEach((c) => console.log(`  ▼ ${c}`));
  }

  // Model match
  const model = data.dataModels.find(
    (m) => m.name.toLowerCase().includes(t) || m.table.toLowerCase() === t
  );
  if (model) {
    console.log(`Target: Data Model [${model.name}] (Bảng: ${model.table})`);
    console.log(`Domain: ${model.domainId}`);
    console.log(`Relations: ${model.relations.join(", ") || "None"}`);
    console.log(`Bất biến : ${model.invariants.join("; ")}`);
  }

  // Flows affected
  const affectedFlows = data.executionFlows.filter(
    (f) =>
      f.steps.some(
        (s) =>
          s.component.toLowerCase().includes(t) ||
          (s.functionOrMethod &&
            s.functionOrMethod.toLowerCase().includes(t)) ||
          s.action.toLowerCase().includes(t)
      ) ||
      (model && f.domainId === model.domainId)
  );

  console.log(
    `\nLuồng thực thi bị ảnh hưởng (Affected Execution Flows) [${affectedFlows.length}]:`
  );
  if (affectedFlows.length === 0) {
    console.log("  Không phát hiện flow trực tiếp nào.");
  } else {
    for (const f of affectedFlows) {
      console.log(`  ⚠️ [${f.id}] ${f.name} (Actor: ${f.actor})`);
    }
  }

  const riskLevel =
    affectedFlows.length > 3
      ? "HIGH"
      : affectedFlows.length > 0
        ? "MEDIUM"
        : "LOW";
  console.log(
    `\nĐánh giá rủi ro (Risk Level): ${riskLevel === "HIGH" ? "🔴 HIGH" : riskLevel === "MEDIUM" ? "🟡 MEDIUM" : "🟢 LOW"}\n`
  );
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
  { term: "star", preferred: "Favorite", reason: "GLOSSARY.md: Dùng Favorite cho Tag" }
];

const INVARIANT_RULES_CATALOG: InvariantRuleCheck[] = [
  {
    keywords: ["pinecone", "weaviate", "qdrant", "milvus", "chromadb", "chroma"],
    rule: "ADR-0006",
    message: "Vi phạm ADR-0006: Abot bắt buộc dùng in-memory vector store (numpy + BM25 FTS), cấm dùng external vector DB.",
    severity: "CRITICAL"
  },
  {
    keywords: ["openai", "text-embedding-3", "cohere", "huggingface"],
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

function handleHowToSync(data: WorkspaceMap, target: string) {
  if (!target) {
    console.error(
      "Vui lòng truyền mô tả Target cần đánh giá tính tương thích và đồng bộ.\nVí dụ: yarn intel how-to-sync \"Thêm trường metadata JSON vào RoadmapItem\""
    );
    return;
  }

  const queryLower = target.toLowerCase();

  console.log(`\n🛡️ === CRIS HOW-TO-SYNC AUDIT REPORT ===`);
  console.log(`Mục tiêu đánh giá (Target): "${target}"\n`);

  // 1. Check Glossary Violations
  const detectedAvoidTerms: AvoidTermCheck[] = [];
  for (const item of AVOID_TERMS_CATALOG) {
    const regex = new RegExp(`\\b${item.term}\\b`, "i");
    if (regex.test(queryLower) || queryLower.includes(item.term.toLowerCase())) {
      detectedAvoidTerms.push(item);
    }
  }

  // 2. Check ADR Invariant Violations
  const detectedViolations: InvariantRuleCheck[] = [];
  for (const rule of INVARIANT_RULES_CATALOG) {
    const matched = rule.keywords.some((kw) => queryLower.includes(kw.toLowerCase()));
    if (matched) {
      detectedViolations.push(rule);
    }
  }

  // 3. Scan Sync Effects
  const syncEffects: string[] = [];

  const mentionsDb =
    queryLower.includes("model") ||
    queryLower.includes("schema") ||
    queryLower.includes("bảng") ||
    queryLower.includes("trường") ||
    queryLower.includes("table") ||
    queryLower.includes("prisma") ||
    queryLower.includes("field") ||
    queryLower.includes("column");
  if (mentionsDb) {
    syncEffects.push("Database & Schema: prisma/schema.prisma -> chạy yarn db:push Turso -> scripts/export-test-schema.ts");
  }

  const mentionsRoadmapMutation =
    queryLower.includes("lesson") ||
    queryLower.includes("topic") ||
    queryLower.includes("section") ||
    queryLower.includes("roadmapitem") ||
    queryLower.includes("bài học") ||
    queryLower.includes("status");
  if (mentionsRoadmapMutation) {
    syncEffects.push("RAG Vector Index: Cần gắn hook after(requestRagReindex) khi có CUD để Python backend nạp lại in-memory vector store");
  }

  const mentionsPython =
    queryLower.includes("fastapi") ||
    queryLower.includes("intent") ||
    queryLower.includes("router") ||
    queryLower.includes("abot") ||
    queryLower.includes("rag") ||
    queryLower.includes("python") ||
    queryLower.includes("p0") ||
    queryLower.includes("preview");
  if (mentionsPython) {
    syncEffects.push("Dual-Service Sync: Đồng bộ schemas Pydantic (Python) với Next.js BFF proxy /api/roadmap-assistant");
  }

  const mentionsEnv =
    queryLower.includes("env") ||
    queryLower.includes("token") ||
    queryLower.includes("secret") ||
    queryLower.includes("api key") ||
    queryLower.includes("key");
  if (mentionsEnv) {
    syncEffects.push("Deployment Env: Cập nhật docs/DEPLOY_ENV.md cho cả Vercel (Next.js) và Render (Python microservice)");
  }

  const mentionsNewTerm =
    queryLower.includes("thuật ngữ") ||
    queryLower.includes("concept") ||
    queryLower.includes("từ mới") ||
    detectedAvoidTerms.length > 0;
  if (mentionsNewTerm) {
    syncEffects.push("Core Docs: Cập nhật định nghĩa vào GLOSSARY.md (chú ý _Also_ và _Avoid_)");
  }

  // Luôn luôn cần sync Code Intelligence
  syncEffects.push("Code Intelligence: Cập nhật .agents/skills/cris-code-intel/data/cris-workspace-map.json và kiểm tra với yarn intel status");

  // 4. Find affected Domains & Execution Flows
  const matchedDomains = data.domains.filter(
    (d) =>
      queryLower.includes(d.id.toLowerCase()) ||
      queryLower.includes(d.name.toLowerCase()) ||
      d.glossary.some((g) => queryLower.includes(g.toLowerCase()))
  );

  const matchedFlows = data.executionFlows.filter(
    (f) =>
      queryLower.includes(f.domainId.toLowerCase()) ||
      f.name.toLowerCase().split(" ").some((w) => w.length > 3 && queryLower.includes(w))
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

  console.log("\n───────────────────────────────────────────────────");
  if (hasCritical) {
    console.log("⚖️ KẾT LUẬN: 🔴 KHÔNG NÊN (REJECTED / ANTI-PATTERN)");
    console.log("Lý do: Target vi phạm trực tiếp các bất biến hệ thống không thể thỏa hiệp.");
    console.log("Hành động: Hủy bỏ hoặc thiết kế lại theo các giải pháp thay thế chính quy trong references/ARCHITECTURAL_INVARIANTS.md.\n");
  } else if (hasHighOrMedium || hasGlossaryWarning) {
    console.log("⚖️ KẾT LUẬN: 🟡 CẢI THIỆN / ĐIỀU CHỈNH (CONDITIONAL / NEEDS ALIGNMENT)");
    console.log("Lý do: Ý tưởng phù hợp nhưng cần điều chỉnh thuật ngữ, ranh giới proxy, hoặc bổ sung đầy đủ các bước đồng bộ.");
    console.log("Hành động: Sửa đổi các điểm cảnh báo ở trên trước khi lập kế hoạch triển khai chi tiết.\n");
  } else {
    console.log("⚖️ KẾT LUẬN: 🟢 NÊN (APPROVED / ARCHITECTURALLY ALIGNED)");
    console.log("Lý do: Target tương thích kiến trúc, tuân thủ Glossary và không xung đột với các ADRs.");
    console.log("Hành động: Triển khai theo Sync Effects Checklist và cập nhật dataset cris-code-intel sau khi hoàn tất.\n");
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
    case "route-map":
    case "routes":
      handleRouteMap(data, subArg);
      break;
    case "impact":
      handleImpact(data, subArg);
      break;
    case "how-to-sync":
    case "eval":
    case "sync-check":
      handleHowToSync(data, subArg);
      break;
    default:
      console.log(`
CRIS CODE INTELLIGENCE CLI (cris-intel)
Bản đồ cấu trúc xử lý logic của workspace crisne-website theo GitNexus Code-Intel.

LỆNH HỖ TRỢ:
  status                   Kiểm tra tình trạng và độ tươi của dataset
  query <từ khóa>          Tìm kiếm processes, domains, routes, symbols liên quan
  trace <flow_id>          Lần vết từng chặng chi tiết của một luồng xử lý
  concept [domain_id]      Xem kiến trúc tổng quan hoặc chi tiết một domain
  route-map [bộ lọc]       Hiển thị ma trận API Route -> Handler -> Domain
  impact <symbol/model>    Phân tích blast radius và đánh giá rủi ro khi sửa đổi
  how-to-sync <mục tiêu>   Thẩm định xung đột, hiệu ứng đồng bộ và kết luận NÊN/KHÔNG NÊN

VÍ DỤ:
  npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/cris-code-intel/scripts/cris-intel.ts query "lesson status"
  npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/cris-code-intel/scripts/cris-intel.ts trace FLOW_LESSON_STATUS_UPDATE
  npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/cris-code-intel/scripts/cris-intel.ts concept roadmap-learning
  npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/cris-code-intel/scripts/cris-intel.ts route-map roadmaps
  npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/cris-code-intel/scripts/cris-intel.ts impact RoadmapItem
  npx ts-node --compiler-options '{"module":"CommonJS"}' .agents/skills/cris-code-intel/scripts/cris-intel.ts how-to-sync "Thêm trường metadata vào RoadmapItem"
`);
      break;
  }
}

main();
