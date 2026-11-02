# Fix: Website không tự động cập nhật UI sau khi deploy

## Vấn đề

Khi deploy version mới lên production, users vẫn thấy UI cũ và phải hard reload (Cmd+Shift+R) để thấy changes.

## Nguyên nhân

### 1. Aggressive Caching trong `next.config.ts`

**Code cũ (❌ Sai):**

```typescript
{
  source: "/(.*)",
  headers: [
    {
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    },
  ],
}
```

Đoạn code này cache **TẤT CẢ** files (bao gồm HTML pages) trong **1 năm** (31536000 seconds = 365 days).

### Vấn đề:

- HTML pages bị cache → Browser không fetch version mới
- Ngay cả khi JS/CSS có hash mới, HTML vẫn reference files cũ
- User phải hard reload để bypass cache

## Giải pháp

### 1. ✅ Cache đúng cách - Chỉ cache static assets

**Code mới:**

```typescript
async headers() {
  return [
    // Cache static assets (JS, CSS) with hash in filename
    {
      source: "/_next/static/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    // Cache fonts
    {
      source: "/fonts/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    // Cache images
    {
      source: "/images/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=31536000, immutable",
        },
      ],
    },
    // Don't cache HTML pages - always revalidate
    {
      source: "/:path*.html",
      headers: [
        {
          key: "Cache-Control",
          value: "public, max-age=0, must-revalidate",
        },
      ],
    },
    // Don't cache API routes
    {
      source: "/api/:path*",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store, no-cache, must-revalidate",
        },
      ],
    },
  ];
}
```

### 2. ✅ Generate unique build ID

```typescript
const nextConfig: NextConfig = {
  // Generate build ID based on timestamp to force cache invalidation
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
  // ... rest of config
};
```

Mỗi lần build sẽ có ID khác nhau → Next.js generate files với hash mới.

## Cách hoạt động

### Before (❌):

```
Deploy v1:
  - /notes → cached 1 year
  - /_next/static/chunks/main-abc123.js → cached 1 year

Deploy v2:
  - /notes → Browser dùng cache cũ (không fetch)
  - /_next/static/chunks/main-xyz789.js → Không được load vì HTML cũ

User thấy: UI cũ ❌
```

### After (✅):

```
Deploy v1:
  - /notes → max-age=0, must-revalidate
  - /_next/static/chunks/main-abc123.js → cached 1 year

Deploy v2:
  - /notes → Browser fetch mới (vì max-age=0)
  - /_next/static/chunks/main-xyz789.js → Được load từ HTML mới

User thấy: UI mới ✅
```

## Cache Strategy

| Resource Type | Cache Duration | Reason |
|--------------|----------------|---------|
| HTML pages | 0 (always revalidate) | Cần fetch version mới mỗi lần |
| JS/CSS (with hash) | 1 year (immutable) | Hash thay đổi khi content thay đổi |
| Fonts | 1 year (immutable) | Không thay đổi |
| Images | 1 year | Không thay đổi thường xuyên |
| API routes | No cache | Dynamic data |

## Testing

### 1. Test local

```bash
# Build
npm run build

# Start production server
npm start

# Open browser
open http://localhost:3000

# Check response headers
curl -I http://localhost:3000/notes
# Should see: Cache-Control: public, max-age=0, must-revalidate

curl -I http://localhost:3000/_next/static/chunks/main-xxx.js
# Should see: Cache-Control: public, max-age=31536000, immutable
```

### 2. Test production

```bash
# Deploy to production
git push origin main

# Wait for deployment

# Check headers
curl -I https://crisne.blog/notes
curl -I https://crisne.blog/_next/static/chunks/main-xxx.js
```

### 3. Test cache behavior

1. Visit https://crisne.blog/notes
2. Open DevTools → Network tab
3. Reload (Cmd+R)
4. Check:
   - HTML: Status 200 (fetched from server)
   - JS/CSS: Status 200 (disk cache) or 304 (not modified)

## Additional Improvements

### 1. Service Worker (Optional)

Nếu muốn control cache tốt hơn, có thể thêm service worker:

```typescript
// public/sw.js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Always fetch HTML from network
  if (url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Cache-first for static assets
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
  }
});
```

### 2. Versioning in URL (Alternative)

Thay vì dùng `generateBuildId`, có thể thêm version vào URL:

```typescript
// package.json
{
  "version": "1.2.3"
}

// next.config.ts
import pkg from './package.json';

const nextConfig = {
  basePath: `/v${pkg.version}`,
  // or
  assetPrefix: `/v${pkg.version}`,
};
```

### 3. CDN Configuration

Nếu dùng CDN (Cloudflare, Vercel Edge), cần config cache rules:

**Vercel:**
```json
// vercel.json
{
  "headers": [
    {
      "source": "/(.*).html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=0, must-revalidate"
        }
      ]
    }
  ]
}
```

**Cloudflare:**
- Page Rules → Cache Level: Bypass for HTML
- Cache Everything → Exclude: `*.html`

## Troubleshooting

### Issue: Vẫn thấy UI cũ sau khi deploy

**Check:**

1. Clear browser cache:
   ```
   Chrome: Cmd+Shift+Delete → Clear cached images and files
   ```

2. Check response headers:
   ```bash
   curl -I https://crisne.blog/notes | grep Cache-Control
   ```

3. Check if CDN is caching:
   ```bash
   curl -I https://crisne.blog/notes | grep -i "cf-cache-status\|x-cache"
   ```

4. Verify build ID changed:
   ```bash
   # Check .next/BUILD_ID
   cat .next/BUILD_ID
   ```

### Issue: Static assets không load

**Check:**

1. Verify files exist:
   ```bash
   ls -la .next/static/chunks/
   ```

2. Check 404 errors in DevTools Network tab

3. Verify `assetPrefix` in next.config.ts

## Best Practices

✅ **DO:**
- Cache static assets with hash (JS, CSS, fonts)
- Always revalidate HTML pages
- Use unique build IDs
- Test cache behavior after deploy

❌ **DON'T:**
- Cache HTML pages for long periods
- Use `max-age=31536000` for everything
- Forget to test on production
- Ignore CDN cache settings

## Summary

### Changes Made:

1. ✅ Fixed `next.config.ts` cache headers
   - Only cache `/_next/static/*`, `/fonts/*`, `/images/*`
   - Don't cache HTML pages (`max-age=0`)
   - Don't cache API routes

2. ✅ Added `generateBuildId` for unique builds
   - Each build has timestamp-based ID
   - Forces new asset hashes

3. ✅ Documented cache strategy

### Result:

- ✅ Users see new UI immediately after deploy
- ✅ No need for hard reload
- ✅ Static assets still cached efficiently
- ✅ Better performance and UX

## Deploy Checklist

Before deploying:

- [ ] Run `npm run build` locally
- [ ] Check `.next/BUILD_ID` is unique
- [ ] Test cache headers with `curl -I`
- [ ] Verify HTML has `max-age=0`
- [ ] Verify static assets have `max-age=31536000`

After deploying:

- [ ] Visit site in incognito mode
- [ ] Check DevTools Network tab
- [ ] Verify new version is loaded
- [ ] Test on multiple browsers
- [ ] Check CDN cache status

Done! 🎉
