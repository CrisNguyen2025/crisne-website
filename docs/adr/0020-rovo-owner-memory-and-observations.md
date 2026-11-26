---
status: accepted
---

# Nâng cấp Owner Memory theo mô hình Rovo (Explicit + Observation, Kill-switch & OwnerActivityEvent)

Thay và mở rộng ADR-0015. Khi tập `Owner Memory` và phạm vi theo dõi học tập của `Owner` mở rộng trên toàn site, việc chỉ giữ 3 tab theo trạng thái DB (`Đang nhớ / Chờ duyệt / Đã gỡ`) và bắt từng câu chat rời rạc không phản ánh đủ thói quen học qua `Topic`, `Lesson Status`, `Quiz` và `News Item`. Từ 2026-11-26, hệ thống tách bạch rõ 4 lớp ngữ cảnh theo mô hình Rovo Memory nhưng vẫn giữ nguyên hạ tầng Turso (`ADR-0005`), dịch vụ Python riêng (`ADR-0001`), cách ly `Actor` (`ADR-0002`, `ADR-0019`), và không dùng Vector DB ngoài (`ADR-0006`).

## Quyết định

- **Tách bạch 4 lớp ngữ cảnh:**
  1. `ThreadMessage` / `ThreadState` (`ADR-0012`): lịch sử ngắn hạn trong phiên (tiếp tục hoãn `Thread Summary` tới khi eval chứng minh thiếu ngữ cảnh).
  2. **Explicit Memory (`source = "explicit"`)** — Tab *Bạn chia sẻ trực tiếp*: quy tắc, hồ sơ, techstack, mục tiêu, ghi chú học tập do `Owner` chủ động nhập qua UI hoặc lệnh chat (`Preview -> ok`). Luôn ghim đầu `<owner_memory>` theo thứ tự cố định (`scope`, `kind`, `id`) để bảo toàn prefix caching và ưu tiên cao hơn mọi quan sát suy luận.
  3. **Observation Memory (`source = "suggested" | "observed"`)** — Tab *Abot quan sát*:
     - Gợi ý tức thời từ chat/Quiz (`source = "suggested"`, debounced 1.5–2.5s per-thread) tiếp tục vào hàng đợi `pending` chờ `Owner` duyệt 1 chạm.
     - Bản tổng hợp định kỳ từ hoạt động học tập (`source = "observed"`, kích hoạt lười/lazy khi quá 7 ngày hoặc theo nút làm mới trên UI) đi thẳng vào trạng thái mềm `active` khi `autoObserveEnabled = true`, chịu `Threshold Gate` + `Time Decay` + `useCount` và nằm ở phần sau của `<owner_memory>` với ngân sách ký tự tách biệt (không bao giờ đẩy bật quy tắc `explicit`).
     - `Owner` có quyền **1 chạm từ chối / sửa / gỡ** trên từng quan sát; hành động từ chối hoặc sửa được ghi nhận làm tín hiệu âm cho lần tổng hợp kế tiếp.
  4. **`OwnerActivityEvent` (Lớp 4 append-only, lưu giữ 90 ngày):** chỉ ghi các tín hiệu thưa chưa có chỗ lưu sẵn (`quiz_completed`, `memory_rejected`, `memory_edited`, `observation_feedback`). Tuyệt đối **không** nạp raw `OwnerActivityEvent` vào prompt chat.
- **Bảo mật, Chống đầu độc & Kill-switch (`OwnerPreference`):**
  - Từ chối (reject) mọi secrets/API keys/DB credentials và che PII trước khi lưu vào `OwnerMemory` ở cả Next.js API lẫn Python; thoát XML control tags ở mọi lớp tiêm prompt và trong prompt trích xuất.
  - Cô lập hoàn toàn việc tạo nháp nội dung `Lesson` (`lesson_content.py`): mặc định `include_owner_memory = false` và không bao giờ đưa `learning_note` hay thông tin cá nhân vào `RoadmapItem.content`.
  - Bảng `OwnerPreference` giữ 2 công tắc tức thì (`memoryEnabled`, `autoObserveEnabled`), đồng bộ cache tức thời qua `notifyOwnerMemoryChanged()` và bắt buộc kiểm tra ở cả retrieval, chat commands, background extractor, Quiz và observation synthesis.
- **Vòng đời dữ liệu & Xoá `Topic`:**
  - `lastUsedAt` và `useCount` chỉ được cập nhật cho đúng các `OwnerMemory` thực sự được tiêm vào prompt sau khi cắt ngân sách.
  - Chỉ tự động chuyển `archived` (`auto-archive`) các mục `Observation` (`suggested` | `observed`) hết hạn `validTo` hoặc quá 60 ngày ít dùng (`useCount < 2`); không bao giờ tự archive/xoá mục `explicit`.
  - Khi xoá một `Topic` (`DELETE /api/v1/roadmaps/[slug]`), **xoá hẳn (`deleteMany`)** toàn bộ `OwnerMemory` có `scopeTopicSlug` trùng slug đó và vô hiệu hoá cache RAM Python.

## Considered Options

- **Giữ chặt `pending`-only cho cả Observation tổng hợp định kỳ (giữ nguyên ADR-0015):** an toàn tuyệt đối nhưng khiến Tab *Abot quan sát* luôn trống nếu Owner không bấm duyệt định kỳ, lệch trải nghiệm Rovo Observations.
- **Xoá `OwnerMemory` sang `archived` khi xoá `Topic`:** giữ lại lịch sử nhưng để lại `scopeTopicSlug` trỏ vào Topic không còn tồn tại; Owner chọn xoá hẳn để kho bộ nhớ sạch theo vòng đời Topic.
- **Tạo Vercel Cron `/api/memory/synthesize` riêng + dùng vector embedding riêng cho `OwnerMemory`:** rủi ro timeout Render Free khi cold-start, đụng `middleware.ts`, tăng chi phí/rate-limit embedding ở quy mô một `Owner` (nên tiếp tục dùng lexical + decay + scope trong RAM).

## Consequences

- `prisma/schema.prisma`, `prisma/init-turso.sql` và `roadmap-rag-assistant/tests/fixtures/schema.sql` được cập nhật thêm các cột vòng đời của `OwnerMemory`, bảng `OwnerPreference` và `OwnerActivityEvent`; cần chạy `yarn db:rovo-owner-memory --apply` lên Turso trước khi deploy bản mới.
- Các bất biến cách ly `Visitor` của `ADR-0002`, `ADR-0015` và `ADR-0019` vẫn giữ nguyên toàn bộ cho cả `OwnerPreference`, `OwnerActivityEvent` và endpoint `/memories/observations/refresh`.
