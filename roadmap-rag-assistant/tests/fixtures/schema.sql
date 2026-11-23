-- CreateTable
CREATE TABLE "Roadmap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT DEFAULT 'Layers',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roadmapId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "section" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'known',
    "statusUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadmapItem_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SlugRedirect" (
    "fromSlug" TEXT NOT NULL PRIMARY KEY,
    "entity" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ThreadMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ThreadState" (
    "threadId" TEXT NOT NULL PRIMARY KEY,
    "activeTopicSlug" TEXT,
    "activeTopicTitle" TEXT,
    "activeLessonId" TEXT,
    "activeLessonTitle" TEXT,
    "activeSection" TEXT,
    "closedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OwnerMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "scopeTopicSlug" TEXT,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'explicit',
    "status" TEXT NOT NULL DEFAULT 'active',
    "replacesMemoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME
);

-- CreateTable
CREATE TABLE "NewsSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultTags" TEXT NOT NULL DEFAULT '[]',
    "etag" TEXT,
    "lastModified" TEXT,
    "lastFetchedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "thumbnailUrl" TEXT,
    "tldr" TEXT,
    "takeaways" TEXT NOT NULL DEFAULT '[]',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "personalNote" TEXT,
    "ingestStatus" TEXT NOT NULL DEFAULT 'queued',
    "reviewStatus" TEXT NOT NULL DEFAULT 'published',
    "readState" TEXT NOT NULL DEFAULT 'unread',
    "isSaved" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "publicAt" DATETIME,
    "extractionMethod" TEXT,
    "extractionError" TEXT,
    "normalizedTitle" TEXT,
    "possibleDuplicateOfId" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NewsItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngestJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "newsItemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stage" TEXT,
    "forceDeep" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRunAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IngestJob_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Roadmap_slug_key" ON "Roadmap"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItem_slug_key" ON "RoadmapItem"("slug");

-- CreateIndex
CREATE INDEX "RoadmapItem_roadmapId_idx" ON "RoadmapItem"("roadmapId");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItem_roadmapId_title_key" ON "RoadmapItem"("roadmapId", "title");

-- CreateIndex
CREATE INDEX "SlugRedirect_entity_targetId_idx" ON "SlugRedirect"("entity", "targetId");

-- CreateIndex
CREATE INDEX "ThreadMessage_threadId_idx" ON "ThreadMessage"("threadId");

-- CreateIndex
CREATE INDEX "ThreadMessage_createdAt_idx" ON "ThreadMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ThreadState_updatedAt_idx" ON "ThreadState"("updatedAt");

-- CreateIndex
CREATE INDEX "ThreadState_closedAt_updatedAt_idx" ON "ThreadState"("closedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "OwnerMemory_status_scopeTopicSlug_idx" ON "OwnerMemory"("status", "scopeTopicSlug");

-- CreateIndex
CREATE INDEX "OwnerMemory_kind_status_idx" ON "OwnerMemory"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_feedUrl_key" ON "NewsSource"("feedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_canonicalUrl_key" ON "NewsItem"("canonicalUrl");

-- CreateIndex
CREATE INDEX "NewsItem_reviewStatus_readState_createdAt_idx" ON "NewsItem"("reviewStatus", "readState", "createdAt");

-- CreateIndex
CREATE INDEX "NewsItem_isSaved_reviewStatus_createdAt_idx" ON "NewsItem"("isSaved", "reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "NewsItem_isSaved_createdAt_idx" ON "NewsItem"("isSaved", "createdAt");

-- CreateIndex
CREATE INDEX "NewsItem_origin_createdAt_idx" ON "NewsItem"("origin", "createdAt");

-- CreateIndex
CREATE INDEX "NewsItem_createdAt_idx" ON "NewsItem"("createdAt");

-- CreateIndex
CREATE INDEX "NewsItem_ingestStatus_idx" ON "NewsItem"("ingestStatus");

-- CreateIndex
CREATE INDEX "NewsItem_normalizedTitle_idx" ON "NewsItem"("normalizedTitle");

-- CreateIndex
CREATE INDEX "NewsItem_isPublic_publicAt_idx" ON "NewsItem"("isPublic", "publicAt");

-- CreateIndex
CREATE INDEX "IngestJob_status_nextRunAt_idx" ON "IngestJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "IngestJob_status_lockedUntil_idx" ON "IngestJob"("status", "lockedUntil");

-- CreateIndex
CREATE INDEX "IngestJob_newsItemId_idx" ON "IngestJob"("newsItemId");

