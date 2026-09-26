# Hướng Dẫn Cấu Hình Turso Database Cho Crisne Website

Dự án đã được tích hợp sẵn driver adapter `@prisma/adapter-libsql` để kết nối mượt mà với Turso Database trên cloud hoặc chạy local SQLite mà không cần sửa code.

---

## 1. Thông tin cấu hình

- **Turso Database URL:** `libsql://crisne-db-ntienanh.aws-ap-northeast-1.turso.io`
- **Turso Auth Token:** Token mà bạn đã tạo từ Turso CLI hoặc Dashboard.

---

## 2. Thiết lập Biến Môi Trường (Environment Variables)

### A. Chạy ở Local (nếu muốn test trực tiếp với Turso DB)
Mở file `.env` hoặc `.env.local` và thêm:

```env
DATABASE_URL="file:./dev.db"
TURSO_DATABASE_URL="libsql://crisne-db-ntienanh.aws-ap-northeast-1.turso.io"
TURSO_AUTH_TOKEN="<DÁN_TOKEN_TURSO_CỦA_BẠN_VÀO_ĐÂY>"
```

*(Lưu ý: Nếu không điền `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN`, hệ thống sẽ tự động fallback về dùng SQLite file local `dev.db`).*

### B. Cấu hình trên Vercel (Production)
Vào **Vercel Dashboard** -> Chọn project **crisne-website** -> **Settings** -> **Environment Variables**:

Thêm 3 biến môi trường sau:
1. `DATABASE_URL` = `file:./dev.db` *(bắt buộc để Prisma Schema engine khởi tạo)*
2. `TURSO_DATABASE_URL` = `libsql://crisne-db-ntienanh.aws-ap-northeast-1.turso.io`
3. `TURSO_AUTH_TOKEN` = `<TOKEN_TURSO_CỦA_BẠN>`

---

## 3. Khởi tạo Bảng & Dữ liệu trên Turso (Migration & Seed)

### Bước 1: Đẩy schema lên Turso
Chạy lệnh sau trên terminal máy của bạn:

```bash
npx turso db shell crisne-db < prisma/migrations/...
# HOẶC dùng Prisma push trực tiếp qua Turso (nếu đã set TURSO_AUTH_TOKEN trong .env):
```

Nếu bạn đã cài **Turso CLI**:
```bash
# Push schema trực tiếp từ file schema vào Turso
turso db shell crisne-db-ntienanh ".read <(npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script)"
```

Cách đơn giản nhất bằng script seed đã tích hợp:
1. Thêm `TURSO_AUTH_TOKEN` vào `.env.local`.
2. Chạy:
```bash
# Đẩy schema lên database
npx prisma db push

# Chạy seed dữ liệu mẫu ban đầu (Roadmap, Tags...)
yarn db:seed
```

---

## 4. Cơ chế hoạt động trong Code (`lib/prisma.ts`)

```typescript
if (tursoUrl && tursoAuthToken) {
  const libsql = createClient({
    url: tursoUrl,
    authToken: tursoAuthToken,
  });
  const adapter = new PrismaLibSQL(libsql);
  return new PrismaClient({ adapter });
}

// Fallback local dev.db nếu không có Turso env
return new PrismaClient();
```
- Khi deploy lên **Vercel**: Nhận diện `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN` -> Kết nối Cloud DB (không bị mất dữ liệu khi Vercel restart/redeploy).
- Khi dev ở **Local**: Có thể test offline với SQLite thông thường hoặc kết nối Turso tuỳ ý.
