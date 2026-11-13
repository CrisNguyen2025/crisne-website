# Bản nháp: mục "Context Engineering" (topic AI & LLM Architecture)

Bản nháp để Owner duyệt trước khi nạp vào DB (TASK-context-engineering-001, Phụ lục A). Mỗi bài có `title`, `description` (một câu, theo văn phong seed) và `content` (ngắn, viết cho người học).

**Mục (section):** `Context Engineering`

**Gom 5 bài đã có vào mục này (không viết lại):** Context Window · In-Context Learning · Model Context Protocol (MCP) · Conversational Memory · Prompt Caching.

**Cách nạp:** nhờ Abot (Owner) tạo từng bài theo luồng Preview → Confirm, hoặc thêm qua editor. Cả hai tự reindex. Chưa nạp gì tự động.

---

## 1. Context Engineering là gì

**description:** Nghệ thuật chọn đúng thông tin đưa vào context của mô hình, đúng lúc và đúng lượng, thay vì chỉ viết một prompt hay.

**content:**
Prompt engineering tập trung vào cách *diễn đạt* một yêu cầu. Context engineering rộng hơn: nó quyết định *toàn bộ những gì mô hình nhìn thấy* ở mỗi lượt gọi, gồm system prompt, định nghĩa tool, kết quả tool, tài liệu truy xuất, lịch sử hội thoại và memory.

Context là tài nguyên hữu hạn. Cửa sổ có giới hạn token, và dù chưa đầy, thêm thông tin không liên quan vẫn làm câu trả lời kém đi. Vì vậy câu hỏi đúng không phải "nhồi được bao nhiêu" mà là "tập token nhỏ nhất nào giúp mô hình làm đúng việc".

Các đòn bẩy chính: chọn cái gì vào (retrieval, memory), nén cái gì (compaction), chia việc cho ai (sub-agent), và nạp lúc nào (just-in-time).

## 2. Token Budget và phân bổ context

**description:** Chia ngân sách token của cửa sổ context cho từng thành phần và theo dõi phần nào đang chiếm nhiều nhất.

**content:**
Một lượt gọi LLM thường gồm: system prompt, định nghĩa tool (kể cả tool MCP), memory file, lịch sử hội thoại, tài liệu truy xuất, câu hỏi hiện tại, và phần chừa cho câu trả lời. Tất cả cộng lại phải nằm trong context window.

Làm việc với ngân sách nghĩa là đo được từng phần. Ví dụ: panel Context của Claude Code chia thành Messages, System tools, MCP tools, System prompt, Skills, Memory files và một buffer dành cho auto-compact. Mục Context trong menu ⋮ của Abot làm điều tương tự cho một lượt trả lời: System prompt, Lịch sử, Tài liệu truy xuất, Câu hỏi.

Cách dùng: nếu một phần cố định (system prompt, tool schema) ăn nhiều chỗ, hãy rút gọn hoặc nạp theo nhu cầu; nếu lịch sử phình, nén lại; luôn chừa chỗ cho đầu ra.

## 3. Context Rot và Lost-in-the-Middle

**description:** Hiện tượng chất lượng giảm khi context dài ra, và việc thông tin nằm giữa context dễ bị bỏ sót hơn đầu và cuối.

**content:**
Context rot: càng nhiều token trong context, mô hình càng khó giữ chính xác từng chi tiết, kể cả khi chưa chạm giới hạn. Độ dài nhận được không đồng nghĩa với độ chú ý đều nhau.

Lost-in-the-middle: nhiều mô hình dùng tốt thông tin ở đầu và cuối context, và kém hơn với thông tin ở giữa.

Hệ quả thiết kế: đặt chỉ dẫn quan trọng ở đầu, câu hỏi và dữ liệu cần dùng ngay ở cuối; giảm số đoạn tài liệu đưa vào, ưu tiên đoạn liên quan nhất; tránh tích lũy kết quả tool cũ không còn cần. Ít hơn nhưng đúng thường tốt hơn nhiều nhưng lẫn.

## 4. Compaction và tóm tắt hội thoại

**description:** Nén lịch sử hội thoại dài thành bản tóm tắt gọn khi gần đầy context, giữ lại quyết định và việc đang dở.

**content:**
Hội thoại dài sớm muộn chạm giới hạn. Có hai cách thường dùng: cửa sổ trượt (chỉ giữ N lượt gần nhất, Abot giữ 4 lượt) và compaction (tóm tắt phần cũ thành một đoạn ngắn rồi thay thế).

Một bản tóm tắt tốt giữ: mục tiêu của người dùng, quyết định đã chốt, trạng thái hiện tại, việc còn dở, và các chi tiết cần chính xác (tên file, lỗi, số liệu). Bỏ: lời qua lại, kết quả tool đã dùng xong, thử nghiệm thất bại không còn liên quan.

Rủi ro: tóm tắt làm mất chi tiết. Nên nén sớm hơn khi còn chỗ, kiểm tra bản tóm tắt giữ được những điều cần thiết, và lưu thông tin bền vững ra ngoài (memory file) thay vì chỉ trông vào tóm tắt.

## 5. Just-in-time Retrieval

**description:** Nạp dữ liệu vào context đúng lúc cần, qua tool hoặc truy xuất, thay vì nhồi sẵn mọi thứ từ đầu.

**content:**
Thay vì đưa cả kho tài liệu vào prompt, giữ các tham chiếu nhẹ (đường dẫn file, id, truy vấn) và để mô hình hoặc hệ thống lấy nội dung khi cần: tìm kiếm, đọc file, gọi API. Cách này giữ context gọn và luôn lấy được dữ liệu mới.

Đi kèm là cắt gọn kết quả tool: chỉ trả về phần mô hình cần (vài dòng khớp, không phải cả file), cắt bớt kết quả quá dài, và bỏ kết quả cũ khi không còn dùng.

Đánh đổi: thêm một bước gọi nên chậm hơn, và mô hình phải biết nên tìm gì. Kết hợp được với nạp trước một phần nhỏ dữ liệu luôn cần (ví dụ file cấu hình) rồi để phần còn lại nạp theo nhu cầu.

## 6. Sub-agent và cô lập context

**description:** Giao một việc cho agent phụ có context riêng để nó làm nặng, chỉ trả về kết luận gọn cho agent chính.

**content:**
Một tác vụ như "tìm hiểu cả codebase" hay "đọc 20 trang tài liệu" sẽ làm đầy context của agent chính bằng dữ liệu thô. Sub-agent nhận việc đó trong context sạch của nó, làm xong chỉ trả về bản tóm tắt vài đoạn.

Lợi ích: context của agent chính không phình, các việc độc lập chạy song song được, mỗi agent chuyên một việc với chỉ dẫn và tool riêng.

Lưu ý: sub-agent không thấy hội thoại của agent chính, nên phải giao đủ thông tin trong lời giao việc; và kết quả trả về mất chi tiết, nên chỉ dùng khi chỉ cần kết luận, không cần dữ liệu gốc.

## 7. Memory file

**description:** File văn bản (như CLAUDE.md, AGENTS.md) lưu hướng dẫn và kiến thức bền vững, được nạp vào context ở đầu mỗi phiên.

**content:**
Mô hình không nhớ gì giữa các phiên. Memory file giải quyết việc đó bằng cách ghi những điều cần nhớ ra file, rồi nạp lại vào đầu phiên sau: lệnh build và test, quy ước code, quyết định kiến trúc, sở thích của người dùng.

Ví dụ: `CLAUDE.md` và `AGENTS.md` của dự án (rule dùng chung cho agent), hoặc bộ nhớ cá nhân gồm các file nhỏ kèm một chỉ mục.

Nguyên tắc: file nằm trong context mỗi phiên nên tốn token, vì vậy giữ ngắn, chỉ ghi điều không suy ra được từ code, cập nhật khi sai, và tách thành nhiều file nhỏ có chỉ mục thay vì một file dài.

## 8. Deferred Tool Loading

**description:** Chỉ nạp schema đầy đủ của tool khi cần dùng, để định nghĩa tool không chiếm sẵn một phần lớn context.

**content:**
Mỗi tool (nhất là tool từ nhiều MCP server) kèm mô tả và schema, tốn token ở mọi lượt dù chưa dùng. Với hàng trăm tool, phần này có thể chiếm đáng kể cửa sổ.

Deferred loading: ban đầu chỉ đưa tên (và mô tả ngắn) của tool; khi mô hình cần, nó tìm và nạp schema đầy đủ của đúng tool đó rồi mới gọi. Panel Context của Claude Code tách riêng "MCP tools (deferred)" và "System tools (deferred)" chính vì lý do này.

Đánh đổi: thêm một bước tìm tool trước khi gọi, và mô hình phải đoán đúng tên tool cần. Đổi lại context gọn hơn nhiều, nhất là khi số tool lớn.
