# Misc context — config sau khi deploy code mới (auth + guard ghi dữ liệu)

> Ghi chú cho lần deploy tiếp theo. Chưa áp dụng; chủ repo sẽ cấu hình trong phiên làm việc khác.

## 1. Biến môi trường trên Vercel (Production và Preview)

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `AUTH_SECRET` | Chuỗi ngẫu nhiên | Tạo bằng `npx auth secret`. Không dùng chung với local |
| `AUTH_GOOGLE_ID` | Client ID từ Google Cloud | |
| `AUTH_GOOGLE_SECRET` | Client secret từ Google Cloud | |
| `AUTH_OWNER_EMAILS` | Email của chủ site | Phân tách bằng dấu phẩy. Trống = không ai đăng nhập được |
| `ADMIN_API_KEY` | Chuỗi bí mật | Dùng cho Chrome clipper; nhập cùng giá trị vào extension |
| `AUTH_URL` | `https://crisne.blog` | Nên thêm để callback không sai domain khi có preview |

Các biến đã có (Notion, Gemini, Turso, R2, Langfuse) giữ nguyên. Sau khi thêm hoặc sửa biến phải redeploy.

## 2. Google Cloud Console (OAuth client, loại Web)

- Authorized JavaScript origins: `https://crisne.blog`, `http://localhost:3334`
- Authorized redirect URIs:
  - `https://crisne.blog/api/auth/callback/google`
  - `http://localhost:3334/api/auth/callback/google`
- Nếu dùng `www.crisne.blog`: thêm redirect URI tương ứng, hoặc chuyển hướng `www` về apex.
- Nếu app ở chế độ Testing: thêm email chủ site vào **Test users**.

## 3. Domain (Hostinger)

- DNS trỏ về Vercel theo hướng dẫn Vercel (bản ghi A hoặc CNAME).
- Trong Vercel Domains: đặt một domain chính (`crisne.blog`), chuyển hướng domain còn lại về đó.
- Chờ DNS lan truyền rồi mới kiểm tra đăng nhập.

## 4. Vercel project

- Bật Fluid compute (mặc định 300 giây cho route).
- Function region: `sin1` (Singapore) hoặc region gần người dùng.
- Build command: giữ mặc định (`postinstall` chạy `prisma generate`).

## 5. Dữ liệu

- Code giai đoạn 0 không thêm bảng nào; không cần chạy lại `db:turso:init`.
- Chrome clipper: cập nhật `ADMIN_API_KEY` trong cài đặt extension.

## 6. Kiểm tra sau deploy

1. `GET https://crisne.blog/api/v1/roadmaps` → 200.
2. `POST` lên route ghi khi không đăng nhập → 401.
3. `https://crisne.blog/workflows` → chuyển sang đăng nhập Google.
4. Đăng nhập bằng email trong `AUTH_OWNER_EMAILS` → vào được.
5. Đăng nhập bằng email khác → bị từ chối.

Nếu bước 3 báo `Configuration` hoặc `MissingSecret`: kiểm tra lại `AUTH_SECRET`, rồi redeploy.

## 7. Lưu ý

- Site chưa có nút đăng nhập: chủ site mở `/workflows` để đăng nhập, sau đó các thao tác ghi mới hoạt động.
- Các nút tạo/sửa/xoá vẫn hiển thị với khách; khách bấm sẽ nhận 401. Cần ẩn khỏi khách ở bước sau.
