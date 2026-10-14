export interface ParsedChunk {
  ordinal: number;
  heading: string | null;
  content: string;
}

export const TARGET_CHUNK_SIZE = 1500;

interface Section {
  heading: string | null;
  body: string;
}

/**
 * Splits document into sections delimited by Markdown headings (#, ##, ###, etc.)
 */
function splitByHeadings(text: string): Section[] {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];

  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const headingRegex = /^(#{1,6})\s+(.+)$/;

  for (const line of lines) {
    const match = line.match(headingRegex);
    if (match) {
      if (currentLines.length > 0 || currentHeading !== null) {
        const body = currentLines.join("\n").trim();
        if (body.length > 0) {
          sections.push({ heading: currentHeading, body });
        }
      }
      currentHeading = match[2].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0 || currentHeading !== null) {
    const body = currentLines.join("\n").trim();
    if (body.length > 0) {
      sections.push({ heading: currentHeading, body });
    }
  }

  return sections;
}

/**
 * Splits long text (> TARGET_CHUNK_SIZE) into smaller pieces preserving sentences or lines.
 */
function splitLongParagraph(paragraph: string, maxSize: number): string[] {
  if (paragraph.length <= maxSize) return [paragraph];

  const pieces: string[] = [];
  // Split by sentence endings (. ! ?) or line breaks
  const sentences = paragraph.split(/(?<=[.!?\n])\s+/);

  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= maxSize) {
      current += " " + sentence;
    } else {
      pieces.push(current.trim());
      current = sentence;
    }

    // If a single sentence exceeds maxSize, hard slice it
    while (current.length > maxSize) {
      pieces.push(current.slice(0, maxSize).trim());
      current = current.slice(maxSize).trim();
    }
  }

  if (current.trim().length > 0) {
    pieces.push(current.trim());
  }

  return pieces;
}

/**
 * Chunks a document by markdown headings and paragraphs, targeting <= 1,500 chars per chunk.
 * Each chunk tracks its nearest heading and an increasing ordinal.
 */
export function chunkDocument(text: string, maxChunkSize = TARGET_CHUNK_SIZE): ParsedChunk[] {
  const sections = splitByHeadings(text);
  const chunks: ParsedChunk[] = [];
  let ordinal = 0;

  for (const section of sections) {
    const paragraphs = section.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

    let currentChunk = "";

    for (const rawParagraph of paragraphs) {
      const subParagraphs = splitLongParagraph(rawParagraph, maxChunkSize);

      for (const p of subParagraphs) {
        if (!currentChunk) {
          currentChunk = p;
        } else if (currentChunk.length + 2 + p.length <= maxChunkSize) {
          currentChunk += "\n\n" + p;
        } else {
          chunks.push({
            ordinal: ordinal++,
            heading: section.heading,
            content: currentChunk.trim(),
          });
          currentChunk = p;
        }
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        ordinal: ordinal++,
        heading: section.heading,
        content: currentChunk.trim(),
      });
    }
  }

  return chunks;
}
