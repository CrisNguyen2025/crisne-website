export interface DocumentParser {
  canParse(mime: string, name: string): boolean;
  parse(buffer: Buffer): string;
}

export const MAX_DOCUMENT_FILE_SIZE = 1 * 1024 * 1024; // 1 MB
export const MAX_DOCUMENTS_PER_PROJECT = 50;

export class MarkdownParser implements DocumentParser {
  canParse(mime: string, name: string): boolean {
    const lowerName = name.toLowerCase();
    return (
      mime === "text/markdown" ||
      mime === "text/x-markdown" ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".markdown")
    );
  }

  parse(buffer: Buffer): string {
    return buffer.toString("utf-8");
  }
}

export class TextParser implements DocumentParser {
  canParse(mime: string, name: string): boolean {
    const lowerName = name.toLowerCase();
    return (
      mime === "text/plain" ||
      lowerName.endsWith(".txt")
    );
  }

  parse(buffer: Buffer): string {
    return buffer.toString("utf-8");
  }
}

export const documentParsers: DocumentParser[] = [
  new MarkdownParser(),
  new TextParser(),
];

export function parseDocument(buffer: Buffer, mime: string, name: string): string {
  if (buffer.length > MAX_DOCUMENT_FILE_SIZE) {
    throw new Error(`File size (${buffer.length} bytes) exceeds the maximum allowed limit of 1 MB.`);
  }

  const parser = documentParsers.find((p) => p.canParse(mime, name));
  if (!parser) {
    throw new Error(
      `Unsupported document format for "${name}" (${mime}). Only Markdown (.md) and plain text (.txt) files are supported.`
    );
  }

  return parser.parse(buffer);
}
