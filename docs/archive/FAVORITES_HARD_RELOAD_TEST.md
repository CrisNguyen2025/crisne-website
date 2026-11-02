# Test Plan: Favorites Persistence After Hard Reload

## Hiện trạng

Hệ thống favorites hiện tại sử dụng **2 lớp lưu trữ**:

1. **localStorage** (client-side) - Lưu `notes-anonymous-user-id` và `notes-favorite-tags`
2. **Database SQLite** (server-side) - Bảng `Favorite` với `userId`, `tagId`, `createdAt`

## Luồng hoạt động

### Lần đầu truy cập
```
1. Client generate UUID → Lưu vào localStorage["notes-anonymous-user-id"]
2. Client gọi GET /api/favorites với header X-User-ID: <uuid>
3. Server query database: SELECT * FROM Favorite WHERE userId = <uuid>
4. Server trả về danh sách tagIds
5. Client lưu vào state + localStorage["notes-favorite-tags"]
```

### Khi favorite/unfavorite tag
```
1. Client cập nhật UI ngay lập tức (optimistic update)
2. Client lưu vào localStorage["notes-favorite-tags"]
3. Sau 300ms debounce → Gọi API POST/DELETE /api/favorites
4. Server lưu vào database
5. Nếu API fail → Rollback UI + localStorage
```

### Hard reload (Ctrl+Shift+R / Cmd+Shift+R)
```
1. localStorage KHÔNG bị xóa (chỉ cache bị xóa)
2. Client đọc userId từ localStorage["notes-anonymous-user-id"]
3. Client gọi GET /api/favorites với header X-User-ID
4. Server query database → Trả về favorites
5. Client restore state từ server
```

## Kết luận

✅ **Hard reload KHÔNG làm mất favorites** vì:
- `userId` vẫn còn trong localStorage
- Favorites được lưu trong database
- Mỗi lần load lại sẽ sync từ database về

❌ **Chỉ mất khi**:
- Clear localStorage (Clear browsing data)
- Dùng Incognito/Private mode
- Dùng browser khác
- Dùng device khác

## Test Cases

### Test 1: Normal Reload (F5)
1. Favorite một vài tags
2. Nhấn F5
3. ✅ Favorites vẫn còn

### Test 2: Hard Reload (Ctrl+Shift+R)
1. Favorite một vài tags
2. Nhấn Ctrl+Shift+R (hoặc Cmd+Shift+R trên Mac)
3. ✅ Favorites vẫn còn (load từ database)

### Test 3: Clear Cache (giữ localStorage)
1. Favorite một vài tags
2. DevTools → Application → Clear site data (bỏ tick "Local storage")
3. ✅ Favorites vẫn còn

### Test 4: Clear localStorage
1. Favorite một vài tags
2. DevTools → Application → Local Storage → Delete "notes-anonymous-user-id"
3. Reload
4. ❌ Favorites mất (vì userId mới được generate)

### Test 5: Multi-user (2 browsers)
1. Browser A: Favorite tags [A, B, C]
2. Browser B: Favorite tags [X, Y, Z]
3. ✅ Mỗi browser có favorites riêng (userId khác nhau)

## Cách test thực tế

```bash
# 1. Start dev server
npm run dev

# 2. Mở http://localhost:3000/notes

# 3. Favorite một vài tags

# 4. Mở DevTools → Application → Local Storage
#    - Kiểm tra "notes-anonymous-user-id" (UUID)
#    - Kiểm tra "notes-favorite-tags" (array of tagIds)

# 5. Mở DevTools → Network → Refresh
#    - Kiểm tra request GET /api/favorites
#    - Kiểm tra header X-User-ID
#    - Kiểm tra response có đúng favorites không

# 6. Hard reload (Cmd+Shift+R)
#    - Favorites vẫn còn ✅

# 7. Clear localStorage → Reload
#    - Favorites mất (userId mới) ❌
```

## So sánh với localStorage-only

| Tính năng | localStorage-only | localStorage + Database |
|-----------|-------------------|------------------------|
| Hard reload | ✅ Giữ được | ✅ Giữ được |
| Clear cache | ✅ Giữ được | ✅ Giữ được |
| Clear localStorage | ❌ Mất | ❌ Mất (userId mới) |
| Multi-user | ❌ Không support | ✅ Support |
| Sync across devices | ❌ Không | ✅ Có (nếu có auth) |
| Server-side rendering | ❌ Không | ✅ Có |

## Roadmap: Sync khi có account

Khi user tạo account và đăng nhập:

```typescript
// 1. Lấy favorites của anonymous user
const anonymousUserId = localStorage.getItem("notes-anonymous-user-id");
const anonymousFavorites = await fetch("/api/favorites", {
  headers: { "X-User-ID": anonymousUserId }
});

// 2. Merge vào account của user
await fetch("/api/auth/merge-favorites", {
  method: "POST",
  body: JSON.stringify({
    anonymousUserId,
    favorites: anonymousFavorites.favorites
  })
});

// 3. Xóa anonymous userId, dùng real userId
localStorage.removeItem("notes-anonymous-user-id");
localStorage.setItem("notes-user-id", realUserId);
```
