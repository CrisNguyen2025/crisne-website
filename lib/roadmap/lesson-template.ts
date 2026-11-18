export type LessonTemplateKind = "standard" | "comparison" | "implementation";

export interface LessonTemplatePreset {
  kind: LessonTemplateKind;
  label: string;
  description: string;
  html: string;
}

export const LESSON_TEMPLATE_PRESETS: Record<
  LessonTemplateKind,
  LessonTemplatePreset
> = {
  standard: {
    kind: "standard",
    label: "Mẫu chuẩn (Khái niệm & Kiến trúc)",
    description:
      "Phù hợp cho đa số bài học: Tổng quan, Cơ chế, Ví dụ và Trade-off.",
    html: [
      "<h2>Tổng quan &amp; Bài toán</h2>",
      "<p>Khái niệm này giải quyết vấn đề gì và nằm ở đâu trong bức tranh tổng thể?</p>",
      "<h2>Cơ chế hoạt động</h2>",
      "<p>Luồng xử lý chính và cách các thành phần tương tác.</p>",
      "<h3>Thành phần chính</h3>",
      "<ul><li><strong>Thành phần A:</strong> Mô tả vai trò</li><li><strong>Thành phần B:</strong> Mô tả vai trò</li></ul>",
      "<h2>Ví dụ &amp; Áp dụng thực tế</h2>",
      "<p>Tình huống áp dụng hoặc đoạn cấu hình / code minh họa.</p>",
      "<h2>Lưu ý &amp; Trade-off</h2>",
      "<ul><li><strong>Khi nào nên dùng:</strong> Điều kiện phù hợp</li><li><strong>Lỗi thường gặp:</strong> Điểm cần tránh</li></ul>",
    ].join(""),
  },
  comparison: {
    kind: "comparison",
    label: "So sánh giải pháp",
    description: "Đối chiếu các lựa chọn kỹ thuật và tiêu chí chọn.",
    html: [
      "<h2>Bối cảnh &amp; Tiêu chí so sánh</h2>",
      "<p>Bài toán đặt ra và các tiêu chí đánh giá chính.</p>",
      "<h2>So sánh chi tiết</h2>",
      "<p>Đối chiếu cơ chế, hiệu năng và chi phí vận hành giữa các phương án.</p>",
      "<h3>Điểm mạnh &amp; Hạn chế</h3>",
      "<ul><li><strong>Phương án A:</strong> Ưu và nhược điểm</li><li><strong>Phương án B:</strong> Ưu và nhược điểm</li></ul>",
      "<h2>Khi nào chọn phương án nào?</h2>",
      "<p>Khuyến nghị lựa chọn theo quy mô và ràng buộc thực tế.</p>",
    ].join(""),
  },
  implementation: {
    kind: "implementation",
    label: "Hướng dẫn triển khai",
    description: "Checklist từng bước, cấu hình và lỗi hay gặp.",
    html: [
      "<h2>Mục tiêu &amp; Yêu cầu</h2>",
      "<p>Kết quả cần đạt và điều kiện tiên quyết trước khi làm.</p>",
      "<h2>Các bước triển khai</h2>",
      "<p>Trình tự thực hiện từ thiết lập nền tảng tới tích hợp.</p>",
      "<h3>Cấu hình &amp; Code mẫu</h3>",
      "<p>Các đoạn cấu hình hoặc mã nguồn trọng tâm.</p>",
      "<h2>Kiểm thử &amp; Lỗi thường gặp</h2>",
      "<ul><li><strong>Cách xác minh:</strong> Tiêu chí kiểm tra đầu ra</li><li><strong>Lỗi hay gặp:</strong> Nguyên nhân và cách xử lý</li></ul>",
    ].join(""),
  },
};

export const DEFAULT_LESSON_TEMPLATE_HTML =
  LESSON_TEMPLATE_PRESETS.standard.html;

export function getLessonTemplateHtml(
  kind: LessonTemplateKind = "standard"
): string {
  return (
    LESSON_TEMPLATE_PRESETS[kind]?.html ?? LESSON_TEMPLATE_PRESETS.standard.html
  );
}
