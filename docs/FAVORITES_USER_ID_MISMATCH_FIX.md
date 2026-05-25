# Fix: Favorites Persist After Deleting User ID

## Vấn đề

Khi user xóa `notes-anonymous-user-id` từ localStorage và reload, favorites vẫn hiển thị từ `notes-favorite-tags` cũ. Điều này gây nhầm lẫn vì:

1. User mới được generate UUID mới
2. Nhưng favorites cũ (của user cũ) vẫn hiển thị
3. Khi favorite/unfavorite, sẽ lưu vào DB với userId mới → Mismatch!

## Nguyên nhân

Code cũ chỉ load từ `localStorage["notes-favorite-tags"]` mà không kiểm tra xem favorites đó có thuộc về `userId` hiện tại không.

```typescript
// ❌ Code cũ - Không kiểm tra userId
const stored = localStorage.getItem("notes-favorite-tags");
if (stored) {
  setFavoriteTags(new Set(JSON.parse(stored)));
}
```

## Giải pháp

Lưu thêm `notes-favorite-tags-user-id` vào localStorage để track favorites thuộc về user nào. Khi load, kiểm tra mismatch:

```typescript
// ✅ Code mới - Kiểm tra userId match
const storedUserId = localStorage.getItem("notes-favorite-tags-user-id");
const stored = localStorage.getItem("notes-favorite-tags");

if (storedUserId === userId && stored) {
  // Same user → Load from localStorage
  setFavoriteTags(new Set(JSON.parse(stored)));
} else if (storedUserId && storedUserId !== userId) {
  // Different user → Clear old favorites
  console.log("User ID mismatch, clearing old favorites");
  setFavoriteTags(new Set());
  localStorage.removeItem("notes-favorite-tags");
  localStorage.setItem("notes-favorite-tags-user-id", userId);
}
```

## Implementation

### 1. Generate userId và clear favorites cũ

```typescript
useEffect(() => {
  const STORAGE_KEY = "notes-anonymous-user-id";
  let id = localStorage.getItem(STORAGE_KEY);
  
  if (!id) {
    // Generate new UUID v4 for new user
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    
    // Clear old favorites from localStorage (new user = empty favorites)
    localStorage.removeItem("notes-favorite-tags");
    setFavoriteTags(new Set());
  }
  
  setUserId(id);
}, []);
```

### 2. Load favorites với userId validation

```typescript
useEffect(() => {
  if (!userId) return;
  
  // Check if favorites in localStorage belong to current user
  try {
    const storedUserId = localStorage.getItem("notes-favorite-tags-user-id");
    const stored = localStorage.getItem("notes-favorite-tags");
    
    if (storedUserId === userId && stored) {
      // Same user → Load from localStorage (instant)
      setFavoriteTags(new Set(JSON.parse(stored)));
    } else if (storedUserId && storedUserId !== userId) {
      // Different user → Clear old favorites
      console.log("User ID mismatch, clearing old favorites");
      setFavoriteTags(new Set());
      localStorage.removeItem("notes-favorite-tags");
      localStorage.setItem("notes-favorite-tags-user-id", userId);
    } else {
      // First time → Set user ID
      localStorage.setItem("notes-favorite-tags-user-id", userId);
    }
  } catch {
    // ignore
  }
  
  // Then sync with server in background
  fetch("/api/favorites", {
    headers: { "X-User-ID": userId }
  })
    .then(res => res.json())
    .then(data => {
      setFavoriteTags(new Set(data.favorites));
      localStorage.setItem("notes-favorite-tags", JSON.stringify(data.favorites));
      localStorage.setItem("notes-favorite-tags-user-id", userId); // ⭐ Save userId
    });
}, [userId]);
```

### 3. Save favorites với userId

```typescript
// Mỗi khi save favorites, cũng save userId
localStorage.setItem("notes-favorite-tags", JSON.stringify([...newFavorites]));
localStorage.setItem("notes-favorite-tags-user-id", userId);
```

## localStorage Keys

Sau khi fix, localStorage sẽ có 3 keys:

| Key | Value | Purpose |
|-----|-------|---------|
| `notes-anonymous-user-id` | UUID v4 | User identifier |
| `notes-favorite-tags` | `["tagId1", "tagId2"]` | Favorites list |
| `notes-favorite-tags-user-id` | UUID v4 | Owner of favorites list |

## Test Cases

### ✅ Test 1: Normal usage
```
1. First visit → Generate userId
2. Favorite tags [A, B, C]
3. Reload → Favorites persist ✅
```

### ✅ Test 2: Delete userId
```
1. Favorite tags [A, B, C]
2. DevTools → Delete "notes-anonymous-user-id"
3. Reload
4. New userId generated
5. Old favorites cleared ✅
6. Empty favorites list ✅
```

### ✅ Test 3: Mismatch detection
```
1. User A (userId: abc-123) → Favorite [A, B, C]
2. Manually change "notes-anonymous-user-id" to "xyz-789"
3. Reload
4. Mismatch detected → Clear favorites ✅
5. Sync from server with userId=xyz-789 ✅
```

### ✅ Test 4: Multi-browser
```
Browser A (userId: abc-123):
  - localStorage: notes-favorite-tags-user-id = abc-123
  - Favorites: [A, B, C]

Browser B (userId: xyz-789):
  - localStorage: notes-favorite-tags-user-id = xyz-789
  - Favorites: [X, Y, Z]

✅ Each browser has separate favorites
```

## Luồng hoạt động

### Scenario 1: Lần đầu truy cập
```
1. No userId in localStorage
2. Generate new UUID → Save to "notes-anonymous-user-id"
3. Clear "notes-favorite-tags" (if exists)
4. Set "notes-favorite-tags-user-id" = new UUID
5. Fetch from server → Empty array
6. Display empty favorites ✅
```

### Scenario 2: User cũ quay lại
```
1. userId exists in localStorage
2. Load userId
3. Check: storedUserId === userId? → YES
4. Load favorites from localStorage (instant)
5. Sync with server in background
6. Display favorites ✅
```

### Scenario 3: Xóa userId
```
1. User deletes "notes-anonymous-user-id"
2. Reload
3. No userId → Generate new UUID
4. Clear "notes-favorite-tags"
5. Set "notes-favorite-tags-user-id" = new UUID
6. Fetch from server → Empty array
7. Display empty favorites ✅
```

### Scenario 4: Mismatch (manual edit)
```
1. storedUserId = "abc-123"
2. currentUserId = "xyz-789"
3. Mismatch detected!
4. Clear "notes-favorite-tags"
5. Set "notes-favorite-tags-user-id" = "xyz-789"
6. Fetch from server with userId=xyz-789
7. Display correct favorites ✅
```

## Kết luận

✅ **Fix hoàn tất!**

- Favorites chỉ hiển thị khi userId match
- Xóa userId → Clear favorites cũ
- Mỗi user có favorites riêng
- Không còn mismatch giữa localStorage và database

## Files Changed

- ✅ `/app/notes/NotesClient.tsx`:
  - Clear favorites when generating new userId
  - Validate userId before loading favorites from localStorage
  - Save userId alongside favorites
  - Detect and handle userId mismatch
