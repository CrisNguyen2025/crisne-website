# RAG / Chatbot — Production Readiness Backlog

> Trạng thái: **chưa thực hiện**, đây là backlog để làm dần.
> Cập nhật: 2026-10-15 · Branch: `feat/chat-rag-observability`
> Đã có 2 commit liên quan: `6118ffe` (refactor AI layer) và `6bce2f2` (P0 triage).

Ký hiệu: ✅ đã có · 🟡 có một phần · ❌ chưa có

---

## 0. Đã hoàn thành (để đối chiếu)

| Commit | Nội dung |
|---|---|
| `6118ffe` | Middleware (`wrapProvider`, `quotaMiddleware`), `ModelRef` + bảng `PROVIDERS`, circuit breaker key theo `provider:model`, `ChatMessage` trung lập (`toAlternatingTurns`), `streamParts()`, `generateJson` / `generateJsonWithFallback`, triage có fallback |
| `6bce2f2` | Mask PII khi lưu triage, `GET /triage` bắt buộc xác thực và bỏ seed, gỡ `NEXT_PUBLIC_ADMIN_KEY`, approve/generate idempotent (409), bài học lưu dạng HTML đã sanitize (`marked` + `sanitize-html`), `description` lấy từ bản nháp, drawer hiển thị lỗi |

---

## 🚨 Blocker: Roadmap Assistant cho phép người ẩn danh ghi dữ liệu với quyền admin

**Bằng chứng (đã đọc code, chưa thử tấn công thật):**
- [`roadmap-rag-assistant/rag_service/api/routes.py`](../roadmap-rag-assistant/rag_service/api/routes.py): `/chat`, `/chat/stream`, `/chat/confirm` **không có xác thực**.
- [`server.py`](../roadmap-rag-assistant/rag_service/api/server.py): `allow_origins=["*"]`; `HttpApiAdapter` được khởi tạo với `settings.admin_api_key`.
- [`adapters/http_adapter.py`](../roadmap-rag-assistant/rag_service/adapters/http_adapter.py): có `create_*`, `update_*` và `delete_*` cho topic, layer, group và item.
- `/chat/confirm` chỉ kiểm tra `thread_id`, mà `thread_id` do client tự đặt. `session_store` nằm trong bộ nhớ.

**Kịch bản tấn công:** người ẩn danh gửi "xoá topic X" tới `/chat`, rồi gọi `/chat/confirm` với cùng `thread_id`. Service sẽ chạy lệnh bằng `ADMIN_API_KEY`. Đây là lỗi **confused deputy**.

**Cần làm:**
- [ ] Chỉ owner đã đăng nhập mới được gọi tool ghi. Next.js chuyển tiếp request kèm token có chữ ký (ví dụ JWT ngắn hạn); service Python kiểm tra token ở cả `/chat` (khi có tool ghi) và `/chat/confirm`.
- [ ] Gắn `thread_id` với user. Khi confirm, kiểm tra user trùng với người đã tạo pending action.
- [ ] Giới hạn CORS về đúng domain production và preview.
- [ ] Visitor chỉ được dùng tool đọc. Tool ghi bị tắt hẳn khi không có xác thực.
- [ ] Test: không có token thì không chạy được `confirm`; thread của user A không bị user B confirm.

---

## 1. Bảo mật

| Hạng mục | Trạng thái | Việc cần làm |
|---|---|---|
| Xác thực cho tool ghi và service Python | ❌ | Xem 🚨 |
| Prompt injection (input người dùng, nội dung KB, `comment` triage) | ❌ | Bọc input của người dùng thành khối dữ liệu riêng trong prompt; quét output; tool ghi bắt buộc qua bước owner xác nhận |
| Lọc HTML đầu ra | 🟡 bài học từ triage đã sanitize | Dùng `sanitize-html` cho cả `contentToHtml` (nội dung editor đang chỉ lọc bằng regex `sanitizeDangerousHtml`) |
| Chống bot / lạm dụng endpoint public | 🟡 rate limit theo IP | Turnstile/hCaptcha; giới hạn token hoặc chi phí theo phiên |
| Quản lý secret | 🟡 | Lịch xoay vòng key; mỗi môi trường một key; kiểm tra Vercel không còn `NEXT_PUBLIC_ADMIN_KEY` |

## 2. Độ tin cậy

| Hạng mục | Trạng thái | Việc cần làm |
|---|---|---|
| Fallback model + circuit breaker | ✅ | Bật fallback sang provider khác (Gemini → Groq) qua `getChatModelRefs` |
| Trạng thái trong bộ nhớ: rate limit, circuit, response cache, `session_store` (Python) | ❌ | Trên Vercel mỗi instance giữ một bản riêng, mất khi cold start. Chuyển sang Redis/Upstash |
| Timeout, xử lý khi client huỷ, phản hồi dự phòng khi lỗi | ✅ | — |
| Service Python ngủ trên Render free | ❌ | Gói trả phí hoặc health check; đặt SLO cho Roadmap Assistant |
| `streamParts` không đi qua middleware | 🟡 | Middleware cần chuyển tiếp `streamParts` khi có adapter tự cài |

## 3. Chất lượng câu trả lời

| Hạng mục | Trạng thái | Việc cần làm |
|---|---|---|
| Eval retrieval (`yarn eval:rag`) + Langfuse dataset | ✅ | — |
| Eval câu trả lời (độ bám nguồn, liên quan câu hỏi, từ chối đúng lúc) | ❌ | LLM judge chạy trên dataset; chặn merge trong CI khi điểm giảm |
| Trích dẫn nguồn trong câu trả lời | ❌ | Hiển thị chunk hoặc bài nguồn |
| Vòng feedback | 🟡 P0 xong | P1–P3 (mục 8) |

## 4. Observability

| Hạng mục | Trạng thái | Việc cần làm |
|---|---|---|
| Tracing Langfuse, mask PII, gắn release và môi trường | ✅ (Next.js) | — |
| Trace id thật cho Roadmap Assistant | ❌ | [`RoadmapAssistantChatbot.tsx`](../components/roadmap/RoadmapAssistantChatbot.tsx) đang hex-encode `msgId` làm trace id. Service Python cần trả trace id thật |
| Cảnh báo: tỉ lệ lỗi, quota, độ trễ p95, `no-context` tăng | ❌ | Đặt SLO và kênh cảnh báo (Slack/email) |
| Dashboard chi phí | 🟡 usage đã được ghi | Ngân sách theo ngày, cảnh báo khi vượt |
| Dashboard đọc `input.contents` của generation `answer` | ⚠️ | Từ `6118ffe`, input đổi sang `ChatMessage[]`. Kiểm tra lại dashboard |

## 5. Dữ liệu và tuân thủ

| Hạng mục | Trạng thái | Việc cần làm |
|---|---|---|
| Mask PII | 🟡 Langfuse + triage mới | Script mask các row triage cũ; regex chưa bắt được tên hay địa chỉ |
| Thời gian lưu và xoá dữ liệu theo yêu cầu | ❌ | Chính sách lưu cho trace và triage; cách xoá theo `sessionId` |
| Đồng ý của người dùng | 🟡 Cookiebot | Thông báo rõ rằng hội thoại được ghi lại |

## 6. Knowledge base

| Hạng mục | Trạng thái | Việc cần làm |
|---|---|---|
| Index tĩnh + `check:knowledge-index` trong CI | ✅ | — |
| Index tự cập nhật khi nội dung đổi (gồm bài approve từ triage) | ❌ / chưa xác nhận | Kiểm tra bài approve có vào index RAG không; cập nhật index theo phần thay đổi |
| Vector DB | ❌ cosine trong bộ nhớ | Ổn với KB nhỏ. Khi lớn thì dùng pgvector, Turso vector hoặc Qdrant |

## 7. Hạ tầng và quy trình

| Hạng mục | Trạng thái | Việc cần làm |
|---|---|---|
| CI: tsc, test, kiểm tra index, build, eval | ✅ | — |
| Test ghi vào `prisma/dev.db` | ❌ | Từ khi `prisma generate` chạy lại, các test workflow ghi thật vào DB. Dùng `DATABASE_URL=file:./test.db` cho test |
| Migration Prisma trên Turso | 🟡 | Đưa bước migrate vào quy trình deploy |
| Đánh version cho prompt/model, feature flag, rollback | ❌ | Version cho prompt; tách lưu lượng một phần để thử model mới |
| `prisma/dev.db-shm` / `-wal` | ❌ | Thêm vào `.gitignore` |
| Hook AI review trước commit | ⚠️ | Đang báo "Invalid API key" và vẫn cho commit đi qua; cần đăng nhập lại |

## 8. Feedback loop (👎 → triage)

- [ ] **P1**: gộp feedback trùng bằng embedding (cosine ≥ ~0.9), đếm số lần, lấy tín hiệu `no-context` từ trace, sắp xếp theo số lần × tín hiệu × độ mới. Cần migration (`count`).
- [ ] **P2**: generate trả về `review` có cấu trúc (`isActionable`, `missingPoints`, `suggestedLayer/Level`, `notes`) cùng bản nháp trong một lần gọi; thêm coverage check thay cho `verifyScore = 95` cố định; ghi rõ "chưa kiểm chứng tính đúng kỹ thuật". Cần migration (`review` dạng JSON).
- [ ] **P3**: sau khi approve, đưa `query` + `missingPoints` vào Langfuse dataset rồi chạy lại eval.
- [ ] Đưa 👎 của Cris AI vào triage ([`use-floating-chat.ts`](../hooks/use-floating-chat.ts) đang chỉ gửi `{ traceId, value }`).
- [ ] Ẩn nút triage với visitor (cần endpoint kiểm tra quyền owner).
- [ ] `description` rỗng khi bản nháp bắt đầu bằng heading hoặc list: fallback sang `draftTitle`.

## 9. Chưa kiểm chứng

- Groq chạy thật (chưa có `GROQ_API_KEY`); mới chỉ test bằng fake.
- Triage generate và approve trên DB thật; transaction trên libsql/Turso.
- Kịch bản tấn công ở 🚨 mới đọc từ code, chưa thử thật.
- Hành vi của instance Vercel và Render khi ngủ dựa trên cách nền tảng vận hành, chưa đo trên deploy thực tế.

---

## Thứ tự đề xuất

1. 🚨 Khoá thao tác ghi của Roadmap Assistant. **Chưa xong thì chưa coi là production.**
2. Chuyển trạng thái trong bộ nhớ sang Redis/Upstash, dùng DB riêng cho test, thêm `.gitignore` cho các file `-shm` / `-wal`.
3. Trace id thật, cảnh báo, ngân sách chi phí.
4. Eval câu trả lời trong CI, trích dẫn nguồn.
5. Feedback loop P1 → P2 → P3, chính sách lưu dữ liệu.
