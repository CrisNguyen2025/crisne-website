import crypto from "crypto";
import { prisma as defaultPrisma } from "@/lib/prisma";
import type { PrismaClient, ProjectDocument } from "@prisma/client";
import { geminiProvider, DEFAULT_EMBEDDING_MODEL } from "@/lib/ai/gemini";
import type { LlmProvider } from "@/lib/ai/llm-provider";
import { withQuota } from "../quota";
import { parseDocument, MAX_DOCUMENTS_PER_PROJECT } from "./parser";
import { chunkDocument } from "./chunker";
import { buildStorageKey, deleteFromStorage, saveToStorage } from "./storage";

export interface IngestDocumentOptions {
  projectId: string;
  ownerId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  prisma?: PrismaClient;
  llm?: LlmProvider;
  quotaLimit?: number;
}

export interface IngestDocumentResult {
  document: ProjectDocument;
  skipped: boolean;
  chunksCount: number;
}

export async function ingestDocument(options: IngestDocumentOptions): Promise<IngestDocumentResult> {
  const {
    projectId,
    ownerId,
    filename,
    mimeType,
    buffer,
    prisma: db = defaultPrisma,
  } = options;

  const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

  // Check if identical document content already exists in this project
  const existingDoc = await db.projectDocument.findFirst({
    where: {
      projectId,
      contentHash: fileHash,
      status: "READY",
    },
  });

  if (existingDoc) {
    const chunksCount = await db.projectChunk.count({
      where: { documentId: existingDoc.id },
    });
    return {
      document: existingDoc,
      skipped: true,
      chunksCount,
    };
  }

  // Check project document limit
  const currentCount = await db.projectDocument.count({
    where: { projectId },
  });
  if (currentCount >= MAX_DOCUMENTS_PER_PROJECT) {
    throw new Error(`Project reached maximum limit of ${MAX_DOCUMENTS_PER_PROJECT} documents.`);
  }

  // Parse document content first (validates file size and format)
  const textContent = parseDocument(buffer, mimeType, filename);

  const documentId = crypto.randomUUID();
  const storageKey = buildStorageKey(projectId, documentId);

  // Create document in PENDING state
  const doc = await db.projectDocument.create({
    data: {
      id: documentId,
      projectId,
      ownerId,
      filename,
      mimeType,
      sizeBytes: buffer.length,
      storageKey,
      contentHash: fileHash,
      status: "PENDING",
    },
  });

  try {
    // 1. Save to storage
    await saveToStorage(storageKey, buffer, mimeType);

    // 2. Chunk document
    const rawChunks = chunkDocument(textContent);
    if (rawChunks.length === 0) {
      // Create at least one empty or header chunk if document was blank
      rawChunks.push({
        ordinal: 0,
        heading: null,
        content: textContent.trim() || "(empty document)",
      });
    }

    // 3. Setup LLM provider with quota wrapper for embeddings
    const baseLlm = options.llm ?? geminiProvider;
    const llmWithQuota = withQuota(baseLlm, {
      prisma: db,
      limit: options.quotaLimit,
    });

    const chunksToCreate = [];

    // 4. Ingest and embed each chunk (with deduplication cache per project)
    for (const chunk of rawChunks) {
      const chunkHash = crypto.createHash("sha256").update(chunk.content).digest("hex");

      // Check if an identical chunk in this project already has an embedding
      const existingChunk = await db.projectChunk.findFirst({
        where: {
          projectId,
          contentHash: chunkHash,
          embedding: { not: null },
        },
        select: {
          embedding: true,
          embeddingModel: true,
        },
      });

      let embeddingBytes: Buffer;
      let model = DEFAULT_EMBEDDING_MODEL;

      if (existingChunk?.embedding) {
        // Reuse cached embedding
        embeddingBytes = Buffer.from(existingChunk.embedding);
        model = existingChunk.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
      } else {
        // Generate new embedding with quota
        const embeddingNumbers = await llmWithQuota.embed(chunk.content, "RETRIEVAL_DOCUMENT");
        if (!embeddingNumbers || embeddingNumbers.length === 0) {
          throw new Error(`Failed to generate embedding for chunk "${chunk.ordinal}".`);
        }
        const f32 = new Float32Array(embeddingNumbers);
        embeddingBytes = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
      }

      chunksToCreate.push({
        projectId,
        documentId: doc.id,
        ordinal: chunk.ordinal,
        heading: chunk.heading,
        content: chunk.content,
        contentHash: chunkHash,
        embedding: embeddingBytes,
        embeddingModel: model,
      });
    }

    // 5. Batch insert chunks
    await db.projectChunk.createMany({
      data: chunksToCreate,
    });

    // 6. Mark document READY
    const updatedDoc = await db.projectDocument.update({
      where: { id: doc.id },
      data: {
        status: "READY",
        error: null,
      },
    });

    return {
      document: updatedDoc,
      skipped: false,
      chunksCount: chunksToCreate.length,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await db.projectDocument.update({
      where: { id: doc.id },
      data: {
        status: "FAILED",
        error: errorMsg,
      },
    }).catch(() => {});

    // Clean up storage if saved
    await deleteFromStorage(storageKey).catch(() => {});

    throw error;
  }
}
