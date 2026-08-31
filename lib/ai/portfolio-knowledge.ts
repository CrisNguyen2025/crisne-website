export interface KnowledgeChunk {
  id: string;
  title: string;
  category: "bio" | "experience" | "project" | "skill" | "service" | "faq" | "contact";
  content: string;
  keywords: string[];
  embedding?: number[];
}

export const PORTFOLIO_KNOWLEDGE_BASE: KnowledgeChunk[] = [
  // --- BIO & OVERVIEW ---
  {
    id: "bio-overview",
    title: "About Cris Nguyen - Overview & Role",
    category: "bio",
    keywords: ["cris nguyen", "ai là ai", "developer", "profile", "giới thiệu", "kinh nghiệm"],
    content: `Cris Nguyen là một Software Engineer / Frontend Developer (FE Strong) với hơn 5 năm kinh nghiệm thực chiến.
Cris chuyên sâu về React, Next.js và TypeScript, xây dựng các giải pháp web hiệu năng cao, chuẩn SEO, responsive cho các sản phẩm SaaS đa người dùng (multi-tenant), Enterprise CMS, CRM, HRM và các hệ thống Booking quy mô lớn.
Cris sống và làm việc tại Thành phố Hồ Chí Minh, Việt Nam.`,
  },
  {
    id: "bio-summary-stats",
    title: "Cris Nguyen Key Highlights & Stats",
    category: "bio",
    keywords: ["stats", "thống kê", "nổi bật", "kinh nghiệm", "năm"],
    content: `Các chỉ số và kinh nghiệm nổi bật của Cris Nguyen:
- 5+ năm kinh nghiệm trong phát triển phần mềm và xây dựng giao diện người dùng.
- Đã bàn giao và vận hành hơn 10+ dự án lớn nhỏ cho các khách hàng tại Việt Nam và quốc tế (US, Nhật Bản).
- Thành thạo hơn 20+ công nghệ hiện đại trong hệ sinh thái React, Next.js, TypeScript, Node.js và Mobile.
- Định hướng kỹ thuật: Code sạch, Performance cao, Tối ưu SEO, Khả năng mở rộng kiến trúc component, Trải nghiệm người dùng (UX) mượt mà.`,
  },

  // --- EXPERIENCES ---
  {
    id: "exp-smartbit",
    title: "Kinh nghiệm tại Smartbit Technology (3/2024 - Hiện tại)",
    category: "experience",
    keywords: ["smartbit", "công việc hiện tại", "saas", "multi-tenant", "rbac", "ekyc", "paystack"],
    content: `Vai trò: Middle Frontend Developer tại Smartbit Technology (Tháng 3/2024 - Hiện tại, TP. Hồ Chí Minh).
Trọng tâm công việc:
- Front Office (FO): Phát triển các trang web khách hàng tối ưu SEO bằng Next.js App Router, cải thiện tỷ lệ chuyển đổi, tích hợp quy trình xác thực danh tính điện tử eKYC và cổng thanh toán Paystack.
- Content Management System (CMS): Xây dựng các module quản trị dữ liệu động, form cấu hình linh hoạt và phân quyền chi tiết RBAC (Role-Based Access Control) cho người dùng nội bộ.
- Back Office (BO): Phát triển các tính năng quản trị quy trình kinh doanh, màn hình giám sát và công cụ xử lý dữ liệu quy mô lớn.
- Nền tảng SaaS / Multi-tenant: Triển khai các luồng nghiệp vụ tùy biến theo từng tổ chức khách hàng (tenant) nhưng vẫn đảm bảo kiến trúc dùng chung tối ưu, dễ bảo trì.
- Công nghệ sử dụng: ReactJS, Next.js 13+, TypeScript, Tailwind CSS, React Query, Zustand, Axios, Ant Design, React Hook Form, Yup, eKYC, Paystack, RBAC.`,
  },
  {
    id: "exp-bearabyte-zelene",
    title: "Kinh nghiệm tại BearaByte - Dự án Zelene Spa (7/2024 - 5/2025)",
    category: "experience",
    keywords: ["bearabyte", "zelene", "spa", "booking", "clover", "react native", "expo"],
    content: `Vai trò: Software Engineer (Frontend & Mobile) tại BearaByte (Tháng 7/2024 - Tháng 5/2025, Remote US).
Dự án trọng điểm: Hệ sinh thái Zelene Head Spa Booking (Mỹ).
- Phase 1 (Web & CMS): Phát triển website đặt lịch chăm sóc tóc/spa cho khách hàng và CMS Dashboard cho quản trị viên vận hành spa. Tích hợp cổng thanh toán Clover, Socket.io cho thông báo thời gian thực và đo lường sự kiện GA4.
- Phase 2 (Mobile App): Xây dựng ứng dụng di động đa nền tảng bằng React Native & Expo cho phép người dùng tìm kiếm dịch vụ, đặt lịch và thanh toán tiện lợi trên điện thoại.
- Công nghệ sử dụng: ReactJS, Next.js, React Native, Expo, React Query, Zustand, NativeWind, TypeScript, NestJS, Strapi CMS, Socket.io, Clover Payment Gateway, GA4.`,
  },
  {
    id: "exp-kamala",
    title: "Kinh nghiệm tại Kamala (1/2023 - 6/2024)",
    category: "experience",
    keywords: ["kamala", "jewelry", "tour", "đá quý", "strapi", "mantine"],
    content: `Vai trò: Software Engineer (Frontend & Mobile) tại Kamala (Tháng 1/2023 - Tháng 6/2024, TP. Hồ Chí Minh).
Dự án: Nền tảng Thương mại Trang sức Đá phong thủy & Đặt tour trải nghiệm Kamala.
- Phase 1: Xây dựng cổng nội dung Kamala News và ứng dụng di động hỗ trợ đội ngũ Sales tra cứu nhanh thông tin sản phẩm khi tư vấn cho khách hàng.
- Phase 2: Phát triển website đặt tour du lịch trải nghiệm Kamala, tập trung vào giao diện responsive, tích hợp API Strapi CMS v4, quản lý bảng dữ liệu lớn với TanStack Table và tối ưu SEO.
- Công nghệ sử dụng: Next.js, ReactJS, React Native Expo, Mantine UI, Tailwind CSS, TypeScript, TanStack Table, Strapi CMS, Tiptap Editor, React Query, Zustand.`,
  },
  {
    id: "exp-javis",
    title: "Kinh nghiệm tại JAVIS (6/2025 - 8/2025)",
    category: "experience",
    keywords: ["javis", "3d", "tile", "gạch", "unity"],
    content: `Vai trò: Middle Frontend Developer tại JAVIS (Tháng 6/2025 - Tháng 8/2025, Remote Hà Nội).
Trọng tâm: Xây dựng ứng dụng web mô phỏng ốp lát gạch 3D. Người dùng có thể trực quan hóa các mẫu gạch trên mô hình nhà tích hợp công nghệ Unity, tự động tính toán diện tích bề mặt cần lát, số lượng gạch và xuất báo giá tức thì ngay trên giao diện web.
- Công nghệ: Next.js 13+, Unity WebGL, React Query, Zustand, Ant Design, Tailwind CSS, TypeScript, Yup.`,
  },
  {
    id: "exp-early-career",
    title: "Kinh nghiệm ban đầu tại R2S Academy & Fujinet Systems (2022)",
    category: "experience",
    keywords: ["r2s", "fujinet", "intern", "học vấn", "bắt đầu", "chung cư", "quản lý chung cư", "apartment"],
    content: `Kinh nghiệm khởi đầu sự nghiệp:
1. R2S Academy (5/2022 - 12/2022): Phát triển hệ thống web quản lý chung cư (quản lý cư dân, đăng ký sự kiện, thông báo nhận bưu phẩm) bằng ReactJS, Ant Design, Node.js, PostgreSQL.
2. FUJINET SYSTEMS JSC (1/2022 - 4/2022): Backend Developer Intern, tùy biến template phần mềm và cấu trúc cơ sở dữ liệu theo tiêu chuẩn khắt khe của khách hàng Nhật Bản với VB.NET, SQL Server.`,
  },

  // --- KEY PROJECTS ---
  {
    id: "proj-kamala",
    title: "Dự án nổi bật: Kamala Jewelry & Tour Platform",
    category: "project",
    keywords: ["kamala", "dự án", "jewelry", "tour", "trang sức", "ecommerce"],
    content: `Dự án Kamala Jewelry & Tour Platform (2024):
- Mô tả: Nền tảng thương mại điện tử kết hợp cổng nội dung về trang sức đá quý tự nhiên và trải nghiệm Tour Kamala.
- Đóng góp: Xây dựng toàn bộ giao diện phía khách hàng và các luồng làm việc CMS, thiết kế component hướng dữ liệu (data-driven), tối ưu hóa SEO và tốc độ tải trang.
- Tech Stack: Next.js, ReactJS, TypeScript, Mantine UI, Tailwind CSS, React Query, Strapi CMS, TanStack Table.
- Live Website: https://kamala.vn/`,
  },
  {
    id: "proj-zelene",
    title: "Dự án nổi bật: Zelene Head Spa Booking Ecosystem",
    category: "project",
    keywords: ["zelene", "spa", "booking", "đặt lịch", "clover", "mobile app"],
    content: `Dự án Zelene Head Spa Booking (2025):
- Mô tả: Hệ sinh thái đặt lịch chăm sóc tóc và spa cao cấp tại Mỹ, bao gồm trang đích marketing, luồng đặt chỗ, dashboard quản trị vận hành và ứng dụng di động.
- Đóng góp: Thiết kế giao diện đặt lịch hẹn trực tuyến, tích hợp thanh toán thẻ với Clover Gateway, cập nhật trạng thái đơn hẹn realtime bằng Socket.io và hỗ trợ phiên bản Mobile App React Native Expo.
- Tech Stack: Next.js, React Native, Expo, TypeScript, React Query, Zustand, NestJS, Strapi, Clover API, GA4.`,
  },

  // --- SKILLS & TECH STACK ---
  {
    id: "skills-frontend",
    title: "Kỹ năng Frontend & Mobile của Cris Nguyen",
    category: "skill",
    keywords: ["kỹ năng", "skills", "tech stack", "frontend", "react", "nextjs", "typescript", "tailwind"],
    content: `Kỹ năng chuyên môn Frontend & Mobile:
- Core Languages: TypeScript, JavaScript (ES6+), HTML5, CSS3/PostCSS.
- Frameworks & Libraries: React 19, Next.js 16/15/14 (App Router & Pages Router), React Native, Expo.
- State Management: TanStack Query (React Query), Zustand, Redux Toolkit, Context API.
- Styling & UI Systems: Tailwind CSS v4, Framer Motion, Mantine UI, Ant Design, Shadcn UI, Radix UI, NativeWind.
- Form & Validation: React Hook Form, Yup, Zod.
- Data Presentation: TanStack Table, Virtualized Lists, Lexical Rich Text Editor, Tiptap.`,
  },
  {
    id: "skills-backend-tools",
    title: "Kỹ năng Backend, Database & Công cụ phát triển",
    category: "skill",
    keywords: ["backend", "database", "tools", "prisma", "nodejs", "nestjs", "git", "cloud"],
    content: `Kỹ năng Backend, Cơ sở dữ liệu & Công cụ:
- Backend: Node.js, NestJS, Express, Next.js Route Handlers.
- Database & ORM: Prisma ORM, PostgreSQL, SQLite, Supabase, Strapi CMS v4.
- Storage & Cloud: Cloudflare R2 Storage, AWS S3 SDK.
- Integrations: Google Gemini AI SDK, Clover Payment, Paystack, eKYC, Socket.io, Notion API.
- Testing & Analytics: Google Analytics 4 (GA4), Google Tag Manager (GTM), Core Web Vitals Optimization.
- Version Control & CI/CD: Git, GitHub, GitLab, SourceTree, Postman.`,
  },

  // --- SERVICES & PROCESS ---
  {
    id: "services-offerings",
    title: "Dịch vụ & Năng lực cung cấp của Cris Nguyen",
    category: "service",
    keywords: ["dịch vụ", "services", "thuê", "freelance", "hợp tác", "nhận dự án"],
    content: `Cris Nguyen cung cấp các dịch vụ phát triển phần mềm chuyên nghiệp:
1. Phát triển Website & Web Application theo yêu cầu: Xây dựng các ứng dụng SaaS, trang quản trị CMS/CRM, nền tảng đặt lịch Booking, E-commerce từ đầu với kiến trúc hiện đại.
2. Tối ưu hóa hiệu năng & SEO: Tăng tốc độ tải trang (PageSpeed / Core Web Vitals), cấu trúc lại component, tối ưu SEO On-page cho Next.js.
3. Chuyển đổi thiết kế Figma sang Code (Figma to Pixel-Perfect UI): Chuyển đổi mọi bản thiết kế Figma/XD thành giao diện sống động, chuẩn responsive và animation mượt mà.
4. Phát triển ứng dụng di động đa nền tảng (React Native & Expo): Xây dựng app iOS & Android dùng chung logic với web.
5. Tư vấn kiến trúc Frontend & Tích hợp AI: Tích hợp RAG, Chatbot AI, LLMs vào hệ thống có sẵn.`,
  },

  // --- FAQS & WORK PROCESS ---
  {
    id: "faq-timeline-process",
    title: "Quy trình làm việc & Thời gian bàn giao dự án",
    category: "faq",
    keywords: ["quy trình", "process", "thời gian", "timeline", "bao lâu", "tiến độ"],
    content: `Quy trình và thời gian làm việc của Cris Nguyen:
- Quy trình: Lập kế hoạch & Thấu hiểu yêu cầu → Đánh giá thiết kế UI/UX → Các Sprint phát triển tính năng → Kiểm thử & QA → Triển khai & Bàn giao.
- Thời gian: Một trang Landing Page chất lượng cao thường hoàn thiện trong 1-2 tuần; một Web App / SaaS hoàn chỉnh dao động từ 4-12 tuần tùy thuộc độ phức tạp.
- Cam kết: Báo cáo tiến độ minh bạch, code có tài liệu đầy đủ, hỗ trợ bảo hành và bảo trì sau khi bàn giao.`,
  },
  {
    id: "faq-freelance-availability",
    title: "Khả năng nhận việc Freelance / Hợp đồng của Cris Nguyen",
    category: "faq",
    keywords: ["freelance", "contract", "nhận việc", "fulltime", "parttime", "remote"],
    content: `Cris Nguyen luôn cởi mở với các cơ hội hợp tác:
- Vị trí Full-time / Middle - Senior Frontend Developer.
- Dự án hợp đồng (Contract), Dự án Freelance từ cá nhân và doanh nghiệp.
- Tư vấn giải pháp kỹ thuật và tối ưu dự án sẵn có.
- Hình thức làm việc: Linh hoạt (Remote, Hybrid hoặc Onsite tại TP. Hồ Chí Minh).`,
  },

  // --- CONTACT & SOCIAL ---
  {
    id: "contact-info",
    title: "Thông tin liên hệ với Cris Nguyen",
    category: "contact",
    keywords: ["liên hệ", "contact", "email", "zalo", "github", "cv", "số điện thoại"],
    content: `Cách liên hệ trực tiếp với Cris Nguyen:
- Portfolio Website: https://crisne.blog
- GitHub: https://github.com/crisne
- Tải CV trực tiếp: Bạn có thể tải CV của Cris qua liên kết "/cris-nguyen-cv.pdf" trên website hoặc bấm nút Download CV ở trang chủ.
- Kết nối Zalo: Bạn có thể bấm nút "Connect Zalo" ở phần Contact cuối trang để trao đổi nhanh.
- Địa điểm: Thành phố Hồ Chí Minh, Việt Nam.`,
  },
];
