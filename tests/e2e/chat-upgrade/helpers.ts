import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ==========================================
// 1. Project Path & File Introspection
// ==========================================

export function getProjectRoot(): string {
  return path.resolve(__dirname, "../../..");
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

// ==========================================
// 2. React SSR & DOM Inspection Utilities
// ==========================================

export function renderComponentToHtml(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

export function extractTags(html: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

export function extractAttribute(html: string, tagName: string, attrName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*\\s${attrName}=["']([^"']*)["'][^>]*>`, "gi");
  const values: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    values.push(m[1]);
  }
  return values;
}

// ==========================================
// 3. WCAG Luminance & Color Contrast Formulas
// Reference: WCAG 2.1 Specification Section 1.4.3 & 1.4.6
// ==========================================

export function parseHexColor(hex: string): [number, number, number] {
  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function getRelativeLuminance(hex: string): number {
  const [r, g, b] = parseHexColor(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWcagAA(hexForeground: string, hexBackground: string, isLargeText = false): boolean {
  const ratio = getContrastRatio(hexForeground, hexBackground);
  return isLargeText ? ratio >= 3.0 : ratio >= 4.5;
}

export function meetsWcagAAA(hexForeground: string, hexBackground: string, isLargeText = false): boolean {
  const ratio = getContrastRatio(hexForeground, hexBackground);
  return isLargeText ? ratio >= 4.5 : ratio >= 7.0;
}

// ==========================================
// 4. SSE Stream Simulation & Protocol Shims
// ==========================================

export interface SseEvent {
  event: string;
  data: Record<string, unknown> | string;
}

export function formatSseChunk(event: string, data: Record<string, unknown> | string): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

export function createMockSseStream(events: SseEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(encoder.encode(formatSseChunk(ev.event, ev.data)));
      }
      controller.close();
    },
  });
}

export function parseSseLines(raw: string): SseEvent[] {
  const results: SseEvent[] = [];
  const blocks = raw.split(/\n\n+/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    let eventName = "message";
    let dataPayload = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataPayload = line.slice(5).trim();
      }
    }
    if (dataPayload) {
      try {
        results.push({ event: eventName, data: JSON.parse(dataPayload) });
      } catch {
        results.push({ event: eventName, data: dataPayload });
      }
    }
  }
  return results;
}

// ==========================================
// 5. Test Vectors: Markdown, Math, Alerts, Code
// ==========================================

export const TEST_VECTORS = {
  TABLE_SIMPLE: [
    "| Feature | Status | Tier |",
    "| :--- | :---: | ---: |",
    "| Markdown Tables | Pass | Tier 1 |",
    "| GitHub Callouts | Pass | Tier 1 |",
    "| Code Blocks | Pass | Tier 1 |",
  ].join("\n"),

  TABLE_UNALIGNED: [
    "| Item | Quantity | Price |",
    "| --- | --- | --- |",
    "| Widget A | 10 | $15.00 |",
    "| Widget B | 5 | $25.50 |",
  ].join("\n"),

  TABLE_RAGGED: [
    "| Name | Age | City |",
    "| --- | --- | --- |",
    "| Alice | 30 |",
    "| Bob | 25 | Hanoi | Extra |",
  ].join("\n"),

  CALLOUT_NOTE: [
    "> [!NOTE]",
    "> Đây là ghi chú quan trọng về cấu hình hệ thống.",
  ].join("\n"),

  CALLOUT_TIP: [
    "> [!TIP]",
    "> Hãy sử dụng phím tắt Ctrl+K để mở nhanh công cụ tìm kiếm.",
  ].join("\n"),

  CALLOUT_WARNING: [
    "> [!WARNING]",
    "> Thao tác này sẽ xoá cache hiện tại.",
  ].join("\n"),

  CALLOUT_IMPORTANT: [
    "> [!IMPORTANT]",
    "> Yêu cầu quyền admin trước khi cập nhật schema database.",
  ].join("\n"),

  CALLOUT_CAUTION: [
    "> [!CAUTION]",
    "> Hành động nguy hiểm không thể đảo ngược.",
  ].join("\n"),

  CODE_TYPESCRIPT: [
    "```typescript",
    "export interface UserProfile {",
    "  id: string;",
    "  username: string;",
    "  roles: string[];",
    "}",
    "```",
  ].join("\n"),

  CODE_PYTHON: [
    "```python",
    "def calculate_fibonacci(n: int) -> int:",
    "    if n <= 1: return n",
    "    return calculate_fibonacci(n - 1) + calculate_fibonacci(n - 2)",
    "```",
  ].join("\n"),

  MATH_INLINE: "Công thức năng lượng tương đối $E = mc^2$ được phát biểu bởi Einstein.",
  MATH_BLOCK: [
    "$$",
    "\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}",
    "$$",
  ].join("\n"),

  CHECKLIST: [
    "- [x] Hoàn thành phân tích kiến trúc",
    "- [x] Xây dựng Rich Markdown Engine",
    "- [ ] Kiểm thử toàn diện 4 Tier",
    "- [ ] Triển khai lên Production",
  ].join("\n"),

  NESTED_LIST: [
    "1. Bước chuẩn bị",
    "   - Cài đặt thư viện",
    "   - Cấu hình môi trường .env",
    "2. Bước triển khai",
    "   - Chạy migration",
    "   - Khởi động service",
  ].join("\n"),

  THINKING_CHUNK: "<think>Phân tích truy vấn người dùng: cần giải thích thuật toán Dijkstra và cung cấp bảng độ phức tạp.</think>Dưới đây là giải thích chi tiết:",
};
