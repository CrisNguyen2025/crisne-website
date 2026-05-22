# 🚀 Cloudflare R2 Setup Guide

## ✅ Đã Hoàn Thành

- [x] Install AWS SDK dependencies
- [x] Create R2 client (`lib/r2-client.ts`)
- [x] Update upload API (`app/api/upload-image/route.ts`)
- [x] Configure environment variables
- [x] Build successfully

## 🌐 Setup Custom Domain: uploads.crisne.blog

### Step 1: Enable Public Access

```bash
1. Vào Cloudflare Dashboard
   https://dash.cloudflare.com/[account-id]/r2/overview

2. Click vào bucket "crisne-uploads"

3. Vào tab "Settings"

4. Tìm "Public Access"
   - Click "Allow Access"
   - Hoặc "Connect Domain"
```

### Step 2: Connect Custom Domain

```bash
1. Trong bucket settings, tìm "Custom Domains"

2. Click "Connect Domain"

3. Nhập domain: uploads.crisne.blog

4. Click "Continue"

5. Cloudflare sẽ tự động:
   ✅ Add DNS CNAME record
   ✅ Enable SSL certificate
   ✅ Enable CDN
```

### Step 3: Verify DNS

```bash
# Check DNS propagation
https://dnschecker.org

# Lookup: uploads.crisne.blog
# Type: CNAME
# Should point to: crisne-uploads.r2.cloudflarestorage.com
```

### Step 4: Test Upload

```bash
1. Start dev server:
   npm run dev

2. Vào http://localhost:3000/notes

3. Tạo post mới

4. Paste ảnh vào editor

5. Check console log:
   ✅ Uploaded to R2: https://uploads.crisne.blog/uploads/xxx.png

6. Verify ảnh hiển thị đúng
```

## 🔄 Alternative: Use R2.dev Domain (Temporary)

Nếu chưa muốn setup custom domain ngay:

### Step 1: Get R2.dev URL

```bash
1. Vào bucket settings

2. Tìm "Public R2.dev Bucket URL"

3. Click "Allow Access"

4. Copy URL: https://pub-xxxxx.r2.dev
```

### Step 2: Update .env.local

```bash
# Comment out custom domain
# R2_PUBLIC_URL=https://uploads.crisne.blog

# Use R2.dev domain
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

### Step 3: Restart Server

```bash
# Stop server (Ctrl+C)
npm run dev
```

## 📊 Cost Estimate

### Free Tier (Monthly)
```
✅ 10GB storage - FREE
✅ 1M Class A operations (writes) - FREE
✅ 10M Class B operations (reads) - FREE
✅ Unlimited egress bandwidth - FREE
```

### Your Usage (Estimated)
```
Blog with ~100 images (5MB each):
- Storage: 500MB < 10GB ✅ FREE
- Uploads: ~100 < 1M ✅ FREE
- Views: ~10K < 10M ✅ FREE

Total: $0/month
```

## 🔒 Security

### Environment Variables
```bash
# .env.local is in .gitignore
# Never commit these keys:
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=yyy
```

### Bucket Permissions
```bash
# API Token permissions:
✅ Object Read & Write (recommended)
❌ Admin Read & Write (too powerful)
```

## 🧹 Cleanup (Optional)

### Delete Old Local Images

```bash
# Old images in /public/uploads/ are no longer used
# You can safely delete them after migration

rm -rf public/uploads/*
```

### Verify No References

```bash
# Check if any posts still reference local images
grep -r "/uploads/" app/
grep -r "/uploads/" components/
```

## 🐛 Troubleshooting

### Issue: Upload fails with 403

```bash
Solution:
1. Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY
2. Verify API token has "Object Read & Write" permission
3. Check bucket name matches R2_BUCKET_NAME
```

### Issue: Images not loading

```bash
Solution:
1. Check R2_PUBLIC_URL is correct
2. Verify bucket has public access enabled
3. Check custom domain DNS is propagated
4. Try using R2.dev URL temporarily
```

### Issue: CORS errors

```bash
Solution:
1. Vào bucket settings
2. Tìm "CORS Policy"
3. Add rule:
   {
     "AllowedOrigins": ["https://crisne.blog", "http://localhost:3000"],
     "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["*"]
   }
```

## 📝 Next Steps

1. [ ] Setup custom domain `uploads.crisne.blog`
2. [ ] Test upload ảnh
3. [ ] Verify ảnh hiển thị đúng
4. [ ] (Optional) Migrate old images from local
5. [ ] (Optional) Setup cleanup script for orphan images

## 🎯 Summary

**What Changed:**
- ✅ Images now upload to Cloudflare R2 (not local)
- ✅ Images accessible via `uploads.crisne.blog`
- ✅ Unlimited bandwidth (no egress fees)
- ✅ Persistent storage (won't be deleted on deploy)
- ✅ CDN-backed (fast globally)

**What Stayed Same:**
- ✅ Upload API endpoint: `/api/upload-image`
- ✅ Editor paste functionality
- ✅ Image preview
- ✅ Size validation (5MB max)
- ✅ Type validation (png, jpg, gif, webp)

**Cost:**
- ✅ $0/month (within free tier)
- ✅ No egress fees (biggest savings vs S3)
