import fs from "node:fs";
import path from "node:path";

// Initialize Node EventTarget shim for globalThis to simulate window CustomEvents
if (typeof (globalThis as any).addEventListener !== "function") {
  const bus = new EventTarget();
  (globalThis as any).addEventListener = bus.addEventListener.bind(bus);
  (globalThis as any).removeEventListener = bus.removeEventListener.bind(bus);
  (globalThis as any).dispatchEvent = bus.dispatchEvent.bind(bus);
  if (!(globalThis as any).window) {
    (globalThis as any).window = globalThis;
  }
}

export interface ChatActionChip {
  type: "project" | "roadmap" | "contact" | "link";
  id: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface ParsedMessageResult {
  cleanContent: string;
  actionChips: ChatActionChip[];
}

export const AUTHORITATIVE_PROJECTS = [
  { id: "kamala-commerce-tour", title: "Kamala Jewelry & Tour Platform" },
  { id: "zelene-spa-booking", title: "Zelene Head Spa Booking Platform" },
  { id: "smartbit-saas-platform", title: "Smartbit Multi-Tenant SaaS Platform" },
  { id: "javis-3d-tile-simulation", title: "JAVIS 3D Tile Pattern Simulation" },
];

export const AUTHORITATIVE_LAYERS = [
  { id: "layer-01", code: "01-DB", title: "Tầng Dữ liệu & Tri thức" },
  { id: "layer-02", code: "02-LLM", title: "Tầng LLM Application Layer" },
  { id: "layer-03", code: "03-RAG", title: "Tầng RAG + Agent Layer" },
  { id: "layer-04", code: "04-OPS", title: "Tầng Ops & Đánh giá (LLMOps)" },
  { id: "layer-05", code: "05-PROD", title: "Tầng Sản phẩm Production" },
];

export const AUTHORITATIVE_CONTACTS = [
  { id: "zalo", label: "Zalo" },
  { id: "github", label: "GitHub" },
  { id: "cv", label: "Tải CV", path: "/cris-nguyen-cv.pdf" },
  { id: "contact", label: "Liên hệ" },
];

export function getProjectRoot(): string {
  return path.resolve(__dirname, "../..");
}

export function fileExistsInProject(relPath: string): boolean {
  const fullPath = path.join(getProjectRoot(), relPath);
  return fs.existsSync(fullPath);
}

export function readProjectFile(relPath: string): string {
  const fullPath = path.join(getProjectRoot(), relPath);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf-8");
}

export async function readStreamToString(stream: ReadableStream<any>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      if (typeof value === "string") {
        result += value;
      } else {
        result += decoder.decode(value, { stream: true });
      }
    }
  }
  result += decoder.decode();
  return result;
}

export function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function getFirstSentence(text: string): string {
  // A sentence ending is [.!?] followed by whitespace or end of string, avoiding dot in abbreviations/domains like Next.js
  const match = text.match(/^([\s\S]+?[.!?])(?:\s+|$)/);
  return match ? match[1].trim() : text.trim();
}
