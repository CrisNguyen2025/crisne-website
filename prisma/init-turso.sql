-- CreateTable
CREATE TABLE IF NOT EXISTS "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6b9ac4',
    "prompt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "link" TEXT,
    "description" TEXT,
    "tagId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "focusTasks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ApiEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "requestExample" TEXT,
    "responseExample" TEXT,
    "featureId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiEndpoint_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "Feature" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Feature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RoleApiAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "access" TEXT NOT NULL DEFAULT 'denied',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoleApiAccess_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoleApiAccess_apiId_fkey" FOREIGN KEY ("apiId") REFERENCES "ApiEndpoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Roadmap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortCode" TEXT DEFAULT 'AI',
    "description" TEXT,
    "icon" TEXT DEFAULT 'Layers',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RoadmapLayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roadmapId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "shortTag" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadmapLayer_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RoadmapGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "layerId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadmapGroup_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "RoadmapLayer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RoadmapItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "content" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadmapItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RoadmapGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ApiEndpoint_method_path_key" ON "ApiEndpoint"("method", "path");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Feature_name_key" ON "Feature"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RoleApiAccess_roleId_apiId_key" ON "RoleApiAccess"("roleId", "apiId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Favorite_userId_idx" ON "Favorite"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Favorite_tagId_idx" ON "Favorite"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_tagId_key" ON "Favorite"("userId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Roadmap_slug_key" ON "Roadmap"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoadmapLayer_roadmapId_idx" ON "RoadmapLayer"("roadmapId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoadmapGroup_layerId_idx" ON "RoadmapGroup"("layerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoadmapItem_groupId_idx" ON "RoadmapItem"("groupId");
