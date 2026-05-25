# Setup Notion Database for Favorites

## Vấn đề

SQLite (`dev.db`) không hoạt động trên production (Vercel, Cloudflare) vì:
- Serverless environment không có persistent filesystem
- Mỗi request chạy trên container khác nhau
- File database không thể share giữa các instances

## Giải pháp

Lưu Favorites vào **Notion** (giống như Posts & Tags).

## Bước 1: Tạo Notion Database

1. Mở Notion workspace của bạn
2. Tạo database mới tên **"Favorites"**
3. Thêm các properties:

| Property Name | Type | Description |
|--------------|------|-------------|
| **UserId** | **Title** | Anonymous user ID (UUID) - **MUST be Title type** |
| **TagId** | Text | Tag ID from Tags database |

⚠️ **QUAN TRỌNG**: `UserId` phải là type **Title** (không phải Text) vì mỗi Notion database yêu cầu 1 Title field.

### Ví dụ cấu trúc:

```
Favorites Database
├─ UserId (Title) ⭐ Primary field
├─ TagId (Text)
└─ Created time (auto)
```

### Sample data:

| UserId | TagId |
|--------|-------|
| 8184ca08-a568-4fa8-a483-9ca5e08ff32a | 36b5a981-aa24-8146-9179-f31a85d5fc5f |
| 8184ca08-a568-4fa8-a483-9ca5e08ff32a | 36a5a981-aa24-8100-9b63-d54f609cebfb |
| abc-123-def-456 | 36b5a981-aa24-8146-9179-f31a85d5fc5f |

## Bước 2: Lấy Database ID

1. Mở Favorites database trong Notion
2. Copy URL: `https://www.notion.so/<workspace>/<DATABASE_ID>?v=...`
3. Lấy phần `<DATABASE_ID>` (32 ký tự hex)

Ví dụ URL:
```
https://www.notion.so/myworkspace/3635a981aa2480609aabe8b29b2fca21?v=...
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                  Database ID
```

## Bước 3: Cấu hình Environment Variables

Thêm vào `.env.local`:

```bash
NOTION_FAVORITES_DB_ID=YOUR_FAVORITES_DATABASE_ID_HERE
```

Ví dụ:
```bash
NOTION_FAVORITES_DB_ID=3635a981aa2480609aabe8b29b2fca21
```

## Bước 4: Deploy lên Production

### Vercel

1. Vào Vercel Dashboard → Project Settings → Environment Variables
2. Thêm biến:
   - Name: `NOTION_FAVORITES_DB_ID`
   - Value: `<your-database-id>`
   - Environment: Production, Preview, Development

3. Redeploy:
```bash
git push origin main
```

### Cloudflare Pages

1. Vào Cloudflare Dashboard → Pages → Settings → Environment Variables
2. Thêm:
   - Variable name: `NOTION_FAVORITES_DB_ID`
   - Value: `<your-database-id>`

3. Redeploy

## Bước 5: Test

### Local test:

```bash
# 1. Update .env.local with NOTION_FAVORITES_DB_ID
# 2. Restart dev server
npm run dev

# 3. Test API
curl -X POST 'http://localhost:3334/api/favorites' \
  -H 'Content-Type: application/json' \
  -H 'X-User-ID: test-user-123' \
  --data-raw '{"tagId":"36b5a981-aa24-8146-9179-f31a85d5fc5f"}'

# Expected: {"success":true}

# 4. Check Notion database - should see new row
```

### Production test:

```bash
curl -X POST 'https://crisne.blog/api/favorites' \
  -H 'Content-Type: application/json' \
  -H 'X-User-ID: test-user-123' \
  --data-raw '{"tagId":"36b5a981-aa24-8146-9179-f31a85d5fc5f"}'

# Expected: {"success":true}
```

## Migration từ SQLite sang Notion

Nếu bạn đã có favorites trong SQLite local, hãy migrate:

```bash
# 1. Export từ SQLite
sqlite3 prisma/dev.db "SELECT userId, tagId FROM Favorite;" > favorites.csv

# 2. Import vào Notion
# - Mở Favorites database trong Notion
# - Click "..." → Import → CSV
# - Upload favorites.csv
# - Map columns: userId → UserId, tagId → TagId
```

## Code Changes

### `/lib/notion.ts` - Added:

```typescript
export const FAVORITES_DB_ID = process.env.NOTION_FAVORITES_DB_ID!;

export interface NotionFavorite {
  id: string;
  userId: string;
  tagId: string;
  createdAt: string;
}

export async function getFavorites(userId: string): Promise<string[]>
export async function addFavorite(userId: string, tagId: string): Promise<NotionFavorite>
export async function removeFavorite(userId: string, tagId: string): Promise<void>
```

### `/app/api/favorites/route.ts` - Changed:

```typescript
// Before: Prisma
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
await prisma.favorite.findMany({ where: { userId } });

// After: Notion
import { getFavorites, addFavorite, removeFavorite } from "@/lib/notion";
await getFavorites(userId);
```

## Advantages

✅ Works on serverless (Vercel, Cloudflare, Netlify)  
✅ No database file management  
✅ Consistent with Posts & Tags (all in Notion)  
✅ Easy to view/edit data in Notion UI  
✅ Automatic backups (Notion handles it)  
✅ No migration needed when scaling

## Disadvantages

❌ Slower than SQLite (API calls)  
❌ Rate limits (Notion API: 3 requests/second)  
❌ Requires internet connection  
❌ Depends on Notion uptime

## Performance Optimization

Nếu cần tối ưu performance, có thể thêm caching:

```typescript
// Cache favorites in memory for 5 minutes
const favoritesCache = new Map<string, { data: string[], expiry: number }>();

export async function getFavorites(userId: string): Promise<string[]> {
  const cached = favoritesCache.get(userId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  
  const data = await getFavoritesFromNotion(userId);
  favoritesCache.set(userId, {
    data,
    expiry: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
  
  return data;
}
```

## Troubleshooting

### Error: "NOTION_FAVORITES_DB_ID is not defined"

- Check `.env.local` has `NOTION_FAVORITES_DB_ID=...`
- Restart dev server after adding env var
- On production, check environment variables in hosting dashboard

### Error: "Could not find database"

- Verify database ID is correct (32 hex characters)
- Check Notion integration has access to the database
- Share database with your Notion integration

### Error: "Unauthorized"

- Check `NOTION_TOKEN` is valid
- Verify integration has access to Favorites database
- Re-share database with integration if needed

## Next Steps

1. ✅ Create Favorites database in Notion
2. ✅ Add UserId and TagId properties
3. ✅ Get database ID from URL
4. ✅ Add `NOTION_FAVORITES_DB_ID` to `.env.local`
5. ✅ Test locally
6. ✅ Add env var to production (Vercel/Cloudflare)
7. ✅ Deploy and test

Done! 🎉
