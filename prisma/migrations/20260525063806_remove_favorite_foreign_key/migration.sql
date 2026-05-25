-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Favorite" ("createdAt", "id", "tagId", "userId") SELECT "createdAt", "id", "tagId", "userId" FROM "Favorite";
DROP TABLE "Favorite";
ALTER TABLE "new_Favorite" RENAME TO "Favorite";
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");
CREATE INDEX "Favorite_tagId_idx" ON "Favorite"("tagId");
CREATE UNIQUE INDEX "Favorite_userId_tagId_key" ON "Favorite"("userId", "tagId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
