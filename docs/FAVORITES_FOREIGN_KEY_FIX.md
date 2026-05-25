# Fix: Foreign Key Constraint Error

## Vấn đề

Khi favorite một tag, API trả về lỗi:

```
Foreign key constraint violated: `foreign key`
```

## Nguyên nhân

Prisma schema ban đầu có foreign key constraint từ `Favorite.tagId` đến `Tag.id`:

```prisma
model Favorite {
  tagId String
  tag Tag @relation(fields: [tagId], references: [id], onDelete: Cascade)
}
```

Nhưng **tags không lưu trong database**! App đang dùng **Notion API** để lưu tags, không phải bảng `Tag` trong Prisma.

```typescript
// /app/api/tags/route.ts
import { getTags, createTag } from "@/lib/notion";
```

Khi insert vào bảng `Favorite` với `tagId` từ Notion, SQLite báo lỗi vì `tagId` không tồn tại trong bảng `Tag`.

## Giải pháp

Bỏ foreign key constraint vì `tagId` reference đến Notion API, không phải database:

### Before (❌ Lỗi)

```prisma
model Tag {
  id        String     @id @default(cuid())
  name      String     @unique
  favorites Favorite[] // Relation to favorites
}

model Favorite {
  id        String   @id @default(cuid())
  userId    String
  tagId     String
  createdAt DateTime @default(now())

  tag Tag @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([userId, tagId])
  @@index([userId])
  @@index([tagId])
}
```

### After (✅ Fixed)

```prisma
model Tag {
  id        String     @id @default(cuid())
  name      String     @unique
  notes     Note[]
  // Note: Favorite model doesn't have foreign key to Tag (tags are from Notion API)
}

model Favorite {
  id        String   @id @default(cuid())
  userId    String
  tagId     String   // Tag ID from Notion API (no foreign key constraint)
  createdAt DateTime @default(now())

  @@unique([userId, tagId])
  @@index([userId])
  @@index([tagId])
}
```

## Migration

```bash
npx prisma migrate dev --name remove_favorite_foreign_key
```

Migration SQL:

```sql
-- Drop the foreign key constraint
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_Favorite" ("createdAt", "id", "tagId", "userId")
SELECT "createdAt", "id", "tagId", "userId" FROM "Favorite";

DROP TABLE "Favorite";
ALTER TABLE "new_Favorite" RENAME TO "Favorite";

CREATE UNIQUE INDEX "Favorite_userId_tagId_key" ON "Favorite"("userId", "tagId");
CREATE INDEX "Favorite_userId_idx" ON "Favorite"("userId");
CREATE INDEX "Favorite_tagId_idx" ON "Favorite"("tagId");

PRAGMA foreign_keys=ON;
```

## Test

### Before fix (❌)

```bash
curl -X POST 'http://localhost:3334/api/favorites' \
  -H 'Content-Type: application/json' \
  -H 'X-User-ID: 8184ca08-a568-4fa8-a483-9ca5e08ff32a' \
  --data-raw '{"tagId":"36b5a981-aa24-8146-9179-f31a85d5fc5f"}'

# Response:
{"error":"Failed to add favorite","details":"Foreign key constraint violated: `foreign key`"}
```

### After fix (✅)

```bash
curl -X POST 'http://localhost:3334/api/favorites' \
  -H 'Content-Type: application/json' \
  -H 'X-User-ID: 8184ca08-a568-4fa8-a483-9ca5e08ff32a' \
  --data-raw '{"tagId":"36b5a981-aa24-8146-9179-f31a85d5fc5f"}'

# Response:
{"success":true}

# Verify in database:
sqlite3 prisma/dev.db "SELECT * FROM Favorite;"
# Output:
cmpku4w36000f5248gwpy0w86|8184ca08-a568-4fa8-a483-9ca5e08ff32a|36b5a981-aa24-8146-9179-f31a85d5fc5f|1779691108721

# Get favorites:
curl 'http://localhost:3334/api/favorites' \
  -H 'X-User-ID: 8184ca08-a568-4fa8-a483-9ca5e08ff32a'

# Response:
{"favorites":["36b5a981-aa24-8146-9179-f31a85d5fc5f"]}
```

## Lưu ý

### Ưu điểm của việc bỏ foreign key:

✅ Favorites có thể reference đến tags từ bất kỳ nguồn nào (Notion, JSON, API khác)  
✅ Không bị lỗi khi tag chưa sync vào database  
✅ Linh hoạt hơn cho tương lai (multi-source tags)

### Nhược điểm:

❌ Không có referential integrity từ database  
❌ Có thể có "orphan favorites" (tagId không tồn tại)  
❌ Phải validate tagId ở application layer

### Best practice:

Nên validate tagId trước khi insert:

```typescript
// POST /api/favorites
export async function POST(req: NextRequest) {
  const { tagId } = await req.json();
  
  // Validate tagId exists in Notion
  const tags = await getTags();
  const tagExists = tags.some(t => t.id === tagId);
  
  if (!tagExists) {
    return NextResponse.json(
      { error: "Tag not found" },
      { status: 404 }
    );
  }
  
  // Then insert
  await prisma.favorite.create({ data: { userId, tagId } });
}
```

## Files Changed

- ✅ `/prisma/schema.prisma` - Removed foreign key constraint
- ✅ `/prisma/migrations/20260525063806_remove_favorite_foreign_key/` - Migration
- ✅ `/app/api/favorites/route.ts` - Added detailed logging

## Kết luận

✅ **Fixed!** Favorites system bây giờ hoạt động với tags từ Notion API.

- POST /api/favorites → ✅ Success
- GET /api/favorites → ✅ Returns correct favorites
- Database → ✅ Favorites persisted
- No foreign key constraint → ✅ Works with external tags
