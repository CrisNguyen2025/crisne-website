# Nginx Cache Strategy với Next.js

## Kiến trúc hiện tại

```
User Browser → Nginx (cache 1 phút) → Next.js Server
```

## Cache Layers

### Layer 1: Browser Cache
- **Controlled by**: Next.js `Cache-Control` headers
- **Current config**: 
  - HTML: `max-age=0, must-revalidate`
  - Static assets: `max-age=31536000, immutable`

### Layer 2: Nginx Cache
- **Controlled by**: Nginx config
- **Current config**: Cache 1 phút
- **Impact**: Ngay cả khi browser request mới, Nginx trả về cached response

## Timeline khi deploy

```
T=0:00  Deploy new version
        ├─ Next.js server có code mới
        └─ Nginx cache vẫn giữ version cũ

T=0:30  User A visit site
        ├─ Browser request HTML
        ├─ Nginx trả về cached HTML (version cũ)
        └─ User thấy UI cũ ❌

T=1:00  Nginx cache expire
        ├─ Next request đến Next.js server
        ├─ Nginx cache version mới
        └─ Users mới thấy UI mới ✅

T=1:30  User A reload
        ├─ Nginx trả về cached HTML (version mới)
        └─ User thấy UI mới ✅
```

## Vấn đề

### 1. Delay 1 phút
- Users có thể thấy UI cũ trong tối đa 1 phút sau khi deploy
- Không thể force update ngay lập tức từ Next.js

### 2. Inconsistent state
- User A (visit lúc T=0:30): Thấy UI cũ
- User B (visit lúc T=1:30): Thấy UI mới
- Cùng 1 thời điểm nhưng thấy 2 versions khác nhau

### 3. API vs HTML mismatch
- HTML cached 1 phút
- API không cached (hoặc cache ngắn hơn)
- → HTML cũ + API mới = Có thể lỗi

## Giải pháp

### Option 1: ✅ Bypass Nginx cache cho HTML (Recommended)

**Nginx config:**

```nginx
# Cache static assets (JS, CSS, images)
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    proxy_pass http://nextjs_backend;
    proxy_cache my_cache;
    proxy_cache_valid 200 1d;  # Cache 1 day
    proxy_cache_key "$scheme$request_method$host$request_uri";
    add_header X-Cache-Status $upstream_cache_status;
}

# Don't cache HTML pages
location / {
    proxy_pass http://nextjs_backend;
    proxy_cache off;  # ⭐ Disable cache for HTML
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    add_header Cache-Control "public, max-age=0, must-revalidate";
}

# Don't cache API routes
location /api/ {
    proxy_pass http://nextjs_backend;
    proxy_cache off;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
}

# Cache Next.js static assets
location /_next/static/ {
    proxy_pass http://nextjs_backend;
    proxy_cache my_cache;
    proxy_cache_valid 200 365d;  # Cache 1 year
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

**Kết quả:**
- ✅ HTML không cached → Users thấy UI mới ngay lập tức
- ✅ Static assets cached → Performance tốt
- ✅ Consistent state

---

### Option 2: ⚠️ Cache ngắn hơn (10-30 giây)

**Nginx config:**

```nginx
location / {
    proxy_pass http://nextjs_backend;
    proxy_cache my_cache;
    proxy_cache_valid 200 10s;  # Cache 10 seconds
    proxy_cache_key "$scheme$request_method$host$request_uri";
}
```

**Trade-offs:**
- ✅ Giảm delay từ 1 phút → 10 giây
- ⚠️ Vẫn có delay
- ⚠️ Tăng load lên Next.js server (cache expire nhanh hơn)

---

### Option 3: ⚠️ Cache với stale-while-revalidate

**Nginx config:**

```nginx
location / {
    proxy_pass http://nextjs_backend;
    proxy_cache my_cache;
    proxy_cache_valid 200 1m;
    proxy_cache_use_stale updating;  # Serve stale while updating
    proxy_cache_background_update on;
    proxy_cache_lock on;
}
```

**Cách hoạt động:**
1. Request 1: Nginx serve cached (1 phút cũ)
2. Nginx background fetch version mới
3. Request 2: Nginx serve version mới

**Trade-offs:**
- ✅ Giảm perceived latency
- ⚠️ Request đầu tiên vẫn thấy UI cũ
- ⚠️ Phức tạp hơn

---

### Option 4: 🔥 Purge cache khi deploy (Best for production)

**Setup:**

1. **Install Nginx cache purge module:**
```bash
# Ubuntu/Debian
apt-get install nginx-module-cache-purge

# Or compile with --add-module=ngx_cache_purge
```

2. **Nginx config:**
```nginx
# Cache zone
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=1g inactive=60m;

# Purge endpoint (only from localhost)
location ~ /purge(/.*) {
    allow 127.0.0.1;
    deny all;
    proxy_cache_purge my_cache "$scheme$request_method$host$1";
}

location / {
    proxy_pass http://nextjs_backend;
    proxy_cache my_cache;
    proxy_cache_valid 200 1m;
}
```

3. **Deploy script:**
```bash
#!/bin/bash
# deploy.sh

# Deploy new version
git pull origin main
npm run build
pm2 restart nextjs

# Purge Nginx cache
curl -X PURGE http://localhost/purge/
curl -X PURGE http://localhost/purge/notes
curl -X PURGE http://localhost/purge/docs
# ... purge all HTML pages

echo "✅ Deployed and cache purged"
```

**Kết quả:**
- ✅ Cache 1 phút cho performance
- ✅ Purge cache khi deploy → Users thấy UI mới ngay
- ✅ Best of both worlds

---

### Option 5: 🚀 Versioned URLs (Advanced)

**Concept:**

```
Deploy v1: https://crisne.blog/v1/notes
Deploy v2: https://crisne.blog/v2/notes
```

**Next.js config:**

```typescript
// next.config.ts
import pkg from './package.json';

const nextConfig = {
  basePath: `/v${pkg.version}`,
  // or use environment variable
  basePath: process.env.APP_VERSION ? `/v${process.env.APP_VERSION}` : '',
};
```

**Nginx config:**

```nginx
# Redirect root to latest version
location = / {
    return 302 /v2/;
}

# Cache each version forever
location ~ ^/v[0-9]+/ {
    proxy_pass http://nextjs_backend;
    proxy_cache my_cache;
    proxy_cache_valid 200 365d;  # Cache 1 year
}
```

**Trade-offs:**
- ✅ Immutable URLs → Cache forever
- ✅ Instant updates (change redirect)
- ⚠️ Phức tạp hơn
- ⚠️ Cần manage multiple versions

---

## Recommended Setup

### For Production (High Traffic):

```nginx
# /etc/nginx/sites-available/crisne.blog

upstream nextjs_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

proxy_cache_path /var/cache/nginx/crisne 
    levels=1:2 
    keys_zone=crisne_cache:10m 
    max_size=1g 
    inactive=60m 
    use_temp_path=off;

server {
    listen 80;
    server_name crisne.blog;

    # Purge endpoint (localhost only)
    location ~ /purge(/.*) {
        allow 127.0.0.1;
        deny all;
        proxy_cache_purge crisne_cache "$scheme$request_method$host$1";
    }

    # Next.js static assets - cache 1 year
    location /_next/static/ {
        proxy_pass http://nextjs_backend;
        proxy_cache crisne_cache;
        proxy_cache_valid 200 365d;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Cache-Status $upstream_cache_status;
    }

    # Public static files - cache 1 day
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://nextjs_backend;
        proxy_cache crisne_cache;
        proxy_cache_valid 200 1d;
        add_header X-Cache-Status $upstream_cache_status;
    }

    # API routes - no cache
    location /api/ {
        proxy_pass http://nextjs_backend;
        proxy_cache off;
        proxy_no_cache 1;
        proxy_cache_bypass 1;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # HTML pages - cache 1 minute with purge on deploy
    location / {
        proxy_pass http://nextjs_backend;
        proxy_cache crisne_cache;
        proxy_cache_valid 200 1m;
        proxy_cache_key "$scheme$request_method$host$request_uri";
        proxy_cache_use_stale updating error timeout;
        add_header X-Cache-Status $upstream_cache_status;
        add_header Cache-Control "public, max-age=0, must-revalidate";
    }

    # Proxy settings
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}
```

### Deploy Script:

```bash
#!/bin/bash
# deploy.sh

set -e

echo "🚀 Deploying crisne.blog..."

# Pull latest code
git pull origin main

# Install dependencies
npm ci

# Build
npm run build

# Restart Next.js
pm2 restart nextjs

# Wait for server to be ready
sleep 2

# Purge Nginx cache for HTML pages
echo "🧹 Purging Nginx cache..."
curl -s -X PURGE http://localhost/purge/ > /dev/null
curl -s -X PURGE http://localhost/purge/notes > /dev/null
curl -s -X PURGE http://localhost/purge/docs > /dev/null
curl -s -X PURGE http://localhost/purge/tools > /dev/null

echo "✅ Deployed successfully!"
echo "🌐 Visit: https://crisne.blog"
```

---

## Testing

### 1. Check cache status

```bash
# Should see X-Cache-Status header
curl -I https://crisne.blog/notes

# First request: MISS
# Second request: HIT
# After purge: MISS
```

### 2. Test purge

```bash
# SSH to server
ssh user@server

# Purge cache
curl -X PURGE http://localhost/purge/notes

# Verify
curl -I https://crisne.blog/notes
# Should see: X-Cache-Status: MISS
```

### 3. Monitor cache

```bash
# Check cache size
du -sh /var/cache/nginx/crisne

# Check cache files
ls -lh /var/cache/nginx/crisne/

# Clear all cache (if needed)
rm -rf /var/cache/nginx/crisne/*
nginx -s reload
```

---

## Performance Comparison

| Strategy | Deploy → User sees new UI | Server Load | Complexity |
|----------|---------------------------|-------------|------------|
| No Nginx cache | Instant | High | Low |
| Cache 1 min (current) | 0-60 seconds | Low | Low |
| Cache 1 min + purge | Instant | Low | Medium |
| Cache 10 sec | 0-10 seconds | Medium | Low |
| Versioned URLs | Instant | Low | High |

## Recommendation

**For crisne.blog:**

1. ✅ **Keep Nginx cache 1 minute** (good for performance)
2. ✅ **Add cache purge on deploy** (instant updates)
3. ✅ **Monitor with X-Cache-Status header**

**Implementation:**

```bash
# 1. Install cache purge module
apt-get install nginx-module-cache-purge

# 2. Update nginx config (see above)
nano /etc/nginx/sites-available/crisne.blog

# 3. Test config
nginx -t

# 4. Reload nginx
nginx -s reload

# 5. Update deploy script
nano deploy.sh
chmod +x deploy.sh

# 6. Test deploy
./deploy.sh
```

---

## Troubleshooting

### Issue: Cache không purge

**Check:**

```bash
# Verify purge module loaded
nginx -V 2>&1 | grep cache_purge

# Check nginx error log
tail -f /var/log/nginx/error.log

# Test purge endpoint
curl -v -X PURGE http://localhost/purge/notes
```

### Issue: X-Cache-Status không hiển thị

**Fix:**

```nginx
# Add to location block
add_header X-Cache-Status $upstream_cache_status always;
```

### Issue: Cache không expire

**Check:**

```bash
# Verify cache path exists
ls -la /var/cache/nginx/crisne

# Check cache zone config
nginx -T | grep proxy_cache_path

# Clear cache manually
rm -rf /var/cache/nginx/crisne/*
```

---

## Summary

### Current State:
- ⚠️ Nginx cache 1 phút
- ⚠️ Users có thể thấy UI cũ trong 0-60 giây

### Recommended State:
- ✅ Nginx cache 1 phút (performance)
- ✅ Purge cache khi deploy (instant updates)
- ✅ Monitor với X-Cache-Status

### Result:
- ✅ Best performance (cache 1 phút)
- ✅ Instant updates (purge on deploy)
- ✅ Low server load
- ✅ Simple to maintain

Deploy script + Nginx config = Perfect! 🎉
