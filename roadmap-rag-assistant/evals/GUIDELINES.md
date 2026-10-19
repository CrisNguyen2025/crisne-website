# Hướng dẫn gán nhãn (rulebook)

Quy tắc chung để mọi người viết sample và bảo trì corpus theo cùng một chuẩn.
Contract kỹ thuật (field, lệnh chạy) nằm ở [README.md](README.md); file này trả lời **viết gì, gán nhãn thế nào**.

Nguyên tắc gốc: mỗi sample phải trả lời được câu hỏi *"nếu hệ thống fail câu này, ta học được gì?"*.
Không trả lời được thì không thêm.

## 1. Corpus (`corpus/`): "thư viện"

- Corpus là **bản export** từ `prisma/dev.db`; DB vẫn là nguồn gốc. Không sửa tay `documents.jsonl`
  (validate sẽ báo `meta.sha256 mismatch`).
- Nội dung trong DB đổi thì chạy `python -m evals.corpus_export --version <mới>`. Bump **minor** (`1.0 → 1.1`) khi
  thêm/sửa nội dung; bump **major** (`1.x → 2.0`) khi xoá hoặc tách/gộp document.
- `doc_id` / `section_id` gán **một lần** và giữ nguyên qua mọi lần export (khớp theo `source_id`, rồi theo title).
  Không đổi tên id có sẵn để "cho đẹp".
- Corpus chỉ chứa tri thức thật. Dữ liệu test/probe/rác không được nằm trong DB lúc export.
- `acl` mỗi document và thư mục `<acl_tier>/` phải khớp với quyền thật của nội dung.

## 2. Điều kiện bắt buộc cho mỗi sample

| Điều kiện | Đạt | Không đạt |
|---|---|---|
| Đáp án nằm trong corpus đã khóa | `section_id` có trong `corpus/`, validate pass | Đáp án dựa trên kiến thức chung |
| Kỳ vọng rõ ràng | Biết chính xác section nào đúng, hoặc phải từ chối | "Có lẽ A hoặc B tùy cách hiểu" |
| Kiểm tra một hành vi | Câu off-topic chỉ để kiểm tra từ chối | Một câu vừa test routing vừa test retrieval |
| Ổn định theo thời gian | Câu hỏi về khái niệm | "Hôm nay có gì mới" |
| Không có dữ liệu nhạy cảm thật | Câu hư cấu hoặc đã ẩn danh | Email, tên khách, API key copy từ log |
| Không trùng ý | Một cách hỏi mới làm hệ thống lỗi | Đổi một từ, hệ thống xử lý y hệt |

## 3. Gán `expected`

| Tình huống | Cách gán |
|---|---|
| Có một section đúng | `contexts: [{section_id}]` |
| Có nhiều section đều chấp nhận được (trúng 1 là đủ) | liệt kê tất cả, **không** đặt `required` |
| Câu cần **đủ** nhiều section (so sánh, kết hợp) | mỗi section đặt `"required": true`, tag `multi-section` |
| Corpus không có đáp án | `behavior: "refuse"`, `contexts: []`, tag `out-of-corpus` |
| Routing | chỉ `behavior` (+ `route` nếu cần); `route: []` = để LLM router quyết định |

Không chắc đáp án: đặt `metadata.status: "needs_review"` cho tới khi người khác xác nhận.

## 4. Tag: khi nào dùng tag nào

Mỗi sample retrieval có **ít nhất một** tag mô tả cách hỏi hoặc loại câu.

| Tag | Dùng khi |
|---|---|
| `canonical` | Hỏi đúng tên khái niệm như trong corpus ("Chunking Strategy là gì") |
| `paraphrase` | Diễn đạt lại, không dùng tên khái niệm |
| `no-diacritics` | Tiếng Việt không dấu |
| `typo` | Có lỗi chính tả rõ ràng |
| `code-switch` | Trộn Anh–Việt một cách tự nhiên ("setup rate limit cho API") |
| `multi-section` / `comparison` | Cần đủ nhiều section / câu so sánh |
| `out-of-corpus` | Corpus không có đáp án |
| `near-topic` | Cùng lĩnh vực nhưng corpus không có bài (luôn đi kèm `out-of-corpus`) |
| `sensitive` / `injection` | Đòi bí mật hệ thống / cố bẻ chỉ dẫn (thuộc `_routing/`) |

Tag riêng của domain thêm vào `datasets/tags.json`; tag không có trong danh sách sẽ bị validate chặn.

## 5. Phân bố mục tiêu (mỗi dataset retrieval)

| Nhóm | Tỷ lệ gợi ý |
|---|---|
| `canonical` | ~25% |
| `paraphrase` | ~25% |
| `no-diacritics` + `typo` + `code-switch` | ~10% |
| `out-of-corpus` | ≥ 20% (trong đó `near-topic` ~10%) |
| `multi-section` | ~10% |

Ưu tiên phủ đủ nhóm và phủ section chưa có sample hơn là tăng số lượng.
Đích tiếp theo: 100–150 sample, mỗi nhóm ≥ 10.

## 6. Nguồn sample (ưu tiên giảm dần)

1. Lỗi thật trên production (đã ẩn danh).
2. Sample fail sau khi đổi pipeline: giữ lại làm regression test.
3. Người viết bổ sung theo nhóm còn thiếu ở mục 5.
4. LLM sinh: chỉ khi người đã duyệt từng câu; LLM hay sinh câu quá giống tên section, làm retrieval pass giả.

## 7. Không đưa vào

- Câu test logic không thuộc RAG (trích entity, tạo topic): đã có `tests/benchmark_eval.py`.
- Hàng loạt biến thể gần giống nhau của một câu.
- Sample trích document có tầng ACL cao hơn thư mục dataset (validate sẽ chặn).
- Câu có đáp án thay đổi theo thời gian mà chưa có tag `temporal` và cách cập nhật.

## 8. Vòng đời

- **Không xoá sample.** Bỏ dùng thì đặt `status: "deprecated"`; không tái sử dụng `id`.
- Corpus đổi (`run` exit 2): export version mới, rà sample trỏ vào section đã đổi, đặt `needs_review` nếu chưa sửa kịp.
- Đổi ngưỡng trong `meta.json` phải kèm lý do trong PR. Không nâng ngưỡng khi chưa có cải tiến thật.

## 9. Checklist trước khi merge sample mới

- [ ] `python -m evals validate` pass (schema, tag, `section_id` có trong corpus, ACL)
- [ ] `id` mới, nối tiếp số lớn nhất, không tái sử dụng
- [ ] Có tag đúng theo mục 4; `refuse` không kèm `contexts` / `facts`
- [ ] Không chứa PII hay bí mật thật, không trùng ý sample cũ
- [ ] Đã chạy `python -m evals run --opt mode=fts` và ghi lại sample nào fail (fail là dữ liệu tốt, không phải lỗi dataset)
