---
status: accepted
---

# Provenance gắn theo từng câu trong Lesson, chỉ Owner thấy

Khi Owner đưa nội dung từ một News Item vào Lesson, nguồn gốc của từng câu cần được giữ lại, để sau này biết câu đó lấy từ đâu và căn cứ nào, kể cả khi trang gốc bị gỡ. Từ 2026-11-23, mỗi câu có nguồn gắn một marker rỗng `<span data-provenance-ref="…">` ngay trong nội dung Lesson. Metadata của nguồn (tên nguồn, URL, tiêu đề, đoạn trích, thời điểm thu thập, người viết) nằm trong bảng `KnowledgeProvenance` trên Turso (ADR-0005). Provenance là dữ liệu riêng của Owner: Visitor không bao giờ thấy, kể cả qua Roadmap Assistant (ADR-0002, ADR-0015).

## Quyết định

- **Marker không mang ý nghĩa**: `claimRefKey` là UUID ngẫu nhiên, duy nhất toàn cục; marker rỗng text và không có thuộc tính nào khác. Nội dung Lesson đi qua HTML, RSC payload và `full-export`, nên marker không được để lộ gì về nguồn.
- **Nạp phía client, chỉ cho Owner**: trang Lesson và `full-export` không bao giờ đọc bảng provenance. Provenance chỉ được tải qua một API tự kiểm quyền Owner, sau khi trang đã hiển thị.
- **Không vào index của Roadmap Assistant**: index dùng chung cho mọi Actor (ADR-0006), nên provenance chỉ được ghép vào câu trả lời sau bước retrieval, khi Actor là Owner. Vì index chỉ giữ văn bản thuần, truy ngược ở chat dừng ở cấp Lesson.
- **Đối chiếu lúc đọc, không chặn lúc ghi**: Owner sửa bài hoặc Roadmap Assistant ghi đè nội dung có thể làm mất marker. Hệ thống không chặn lưu và không xoá provenance; bản ghi mất marker được hiện trong mục "Nguồn tham khảo của bài".
- **Không phải Knowledge Triage mới** (ADR-0011): đầu vào là feed do Owner khai báo, và Owner tự chọn từng ý để đưa vào Lesson. Không có hàng đợi gợi ý tự động.

## Considered Options

- Tách nội dung Lesson thành các bảng câu riêng: phá bỏ rich-text Lexical đang dùng cho mọi Lesson.
- Provenance ở cấp Lesson (một danh sách nguồn cho cả bài): không biết câu nào dựa trên nguồn nào.
- Render provenance phía server: trang Lesson dùng ISR, cache chung cho mọi người xem, nên chỉ an toàn khi trông vào middleware.
- Chặn lưu khi marker mất: làm hỏng luồng Preview → `ok` của Roadmap Assistant, vốn ghi nội dung qua cùng API.

## Consequences

- Editor Lexical phải biết node provenance; nếu không, lần lưu đầu tiên sẽ xoá hết marker.
- Một câu bị sửa nội dung vẫn giữ marker cũ; hệ thống không kiểm câu còn đúng với nguồn hay không.
- Toàn văn của nguồn (khi có) chỉ được lưu ở nơi không có public URL, và không bao giờ được phục vụ ra ngoài.
