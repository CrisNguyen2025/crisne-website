// Seed data keeps the old Layer → Group → Item tree as written by the author. prisma/seed.ts flattens it into
// topic lessons with sections (ADR-0009) using the same rule as the migration.
export interface SeedItem {
  id: string;
  title: string;
  description: string;
  content?: string;
}

export interface SeedGroup {
  id: string;
  title: string;
  items: SeedItem[];
}

export interface SeedLayer {
  id: string;
  order: number;
  shortTag: string;
  title: string;
  subtitle: string;
  groups: SeedGroup[];
}

export const INITIAL_ROADMAP_DATA: SeedLayer[] = [
  {
    id: 'layer-01',
    order: 1,
    shortTag: '01-DB',
    title: '01. Tầng Dữ liệu & Tri thức (Knowledge Base)',
    subtitle: 'Nền tảng thu thập, làm sạch, quản lý phiên bản và bảo mật tri thức tổ chức',
    groups: [
      {
        id: 'layer-01-core',
        title: 'Core',
        items: [
          {
            id: 'kb-core-01',
            title: 'Knowledge Base (KB)',
            description: 'Kho tri thức nền tảng chứa toàn bộ tài liệu, dữ liệu nghiệp vụ của tổ chức.',
          },
          {
            id: 'kb-core-02',
            title: 'Unstructured vs. Structured Data',
            description: 'Phân biệt dữ liệu phi cấu trúc (văn bản, video, âm thanh) và dữ liệu có cấu trúc (SQL, JSON).',
          },
          {
            id: 'kb-core-03',
            title: 'Data Ingestion Pipeline',
            description: 'Đường ống tự động thu thập và nạp dữ liệu từ nhiều nguồn phân mảnh về hệ thống.',
          },
          {
            id: 'kb-core-04',
            title: 'ETL / ELT Pipeline',
            description: 'Quy trình Extract–Transform–Load để đưa dữ liệu thô về dạng dùng được.',
          },
          {
            id: 'kb-core-05',
            title: 'Data Cleaning & Normalization',
            description: 'Làm sạch dữ liệu (loại bỏ ký tự rác, mã HTML, chuẩn hóa định dạng ngày/tháng/tiền tệ).',
          },
          {
            id: 'kb-core-06',
            title: 'Document Parsing / OCR',
            description: 'Kỹ thuật bóc tách cấu trúc văn bản từ tài liệu phức tạp (PDF, ảnh scan, bảng biểu, sơ đồ).',
          },
          {
            id: 'kb-core-07',
            title: 'Single Source of Truth (SSOT)',
            description: 'Nguồn dữ liệu gốc duy nhất được coi là chuẩn xác nhất khi có xung đột thông tin.',
          },
          {
            id: 'kb-core-08',
            title: 'Grounding Data',
            description: 'Dữ liệu sự thật dùng làm "mỏ neo" để kiểm chứng và ép AI trả lời đúng thực tế, không chém gió.',
          },
        ],
      },
      {
        id: 'layer-01-intermediate',
        title: 'Trung cấp',
        items: [
          {
            id: 'kb-mid-01',
            title: 'Metadata Enrichment',
            description: 'Gắn thêm nhãn thông tin cho tài liệu (tác giả, ngày tạo, phòng ban, độ bảo mật) để lọc dữ liệu sau này.',
          },
          {
            id: 'kb-mid-02',
            title: 'Deduplication',
            description: 'Loại bỏ tài liệu/đoạn văn bản trùng lặp trong KB để tránh nhiễu và lãng phí index.',
          },
          {
            id: 'kb-mid-03',
            title: 'PII Redaction / Masking',
            description: 'Tự động phát hiện và che giấu thông tin cá nhân nhạy cảm (CCCD, email, số thẻ) trước khi đưa vào AI.',
          },
          {
            id: 'kb-mid-04',
            title: 'Taxonomy',
            description: 'Hệ thống phân loại thứ bậc (cha-con) để gắn nhãn và tổ chức tài liệu theo chủ đề.',
          },
          {
            id: 'kb-mid-05',
            title: 'Content Freshness / Staleness',
            description: 'Mức độ "mới" của dữ liệu; cơ chế phát hiện và cập nhật tài liệu đã lỗi thời.',
          },
          {
            id: 'kb-mid-06',
            title: 'Data Versioning',
            description: 'Quản lý phiên bản của tập dữ liệu/tài liệu để rollback hoặc so sánh khi KB thay đổi theo thời gian.',
          },
          {
            id: 'kb-mid-07',
            title: 'Data Contract',
            description: 'Thỏa thuận về schema/định dạng dữ liệu giữa bên cung cấp và bên tiêu thụ, tránh vỡ pipeline khi có thay đổi.',
          },
        ],
      },
      {
        id: 'layer-01-advanced',
        title: 'Nâng cao',
        items: [
          {
            id: 'kb-adv-01',
            title: 'Knowledge Graph / Ontology',
            description: 'Đồ thị tri thức biểu diễn mạng lưới quan hệ logic giữa các thực thể (người, địa điểm, sự kiện).',
          },
          {
            id: 'kb-adv-02',
            title: 'Data Lineage',
            description: 'Truy vết nguồn gốc và lịch sử biến đổi của một mẩu dữ liệu từ lúc thu thập đến khi đưa vào hệ thống.',
          },
          {
            id: 'kb-adv-03',
            title: 'Access Control List (ACL) trên dữ liệu',
            description: 'Phân quyền xem/truy xuất theo tài liệu, đảm bảo AI không trả lời vượt quyền hạn người hỏi.',
          },
          {
            id: 'kb-adv-04',
            title: 'Data Sovereignty & Residency',
            description: 'Ràng buộc dữ liệu phải lưu trữ/xử lý trong lãnh thổ/khu vực pháp lý cụ thể.',
          },
          {
            id: 'kb-adv-05',
            title: 'Synthetic Data Generation',
            description: 'Tạo dữ liệu nhân tạo (bằng LLM hoặc mô phỏng) để bổ sung khi dữ liệu thật khan hiếm.',
          },
          {
            id: 'kb-adv-06',
            title: 'Data Catalog',
            description: 'Hệ thống mục lục tra cứu cho biết dữ liệu nào tồn tại, ở đâu, ai sở hữu, dùng để làm gì.',
          },
          {
            id: 'kb-adv-07',
            title: 'Schema-on-Read vs. Schema-on-Write',
            description: 'Phân biệt cách áp schema: lúc đọc dữ liệu (linh hoạt, data lake) hay lúc viết vào (chặt chẽ, data warehouse).',
          },
        ],
      },
    ],
  },
  {
    id: 'layer-02',
    order: 2,
    shortTag: '02-LLM',
    title: '02. Tầng LLM Application Layer',
    subtitle: 'Kỹ thuật prompt engineering, định dạng cấu trúc, gọi hàm và cơ chế bảo vệ LLM',
    groups: [
      {
        id: 'layer-02-core',
        title: 'Core',
        items: [
          {
            id: 'llm-core-01',
            title: 'System Prompt / Persona',
            description: 'Câu lệnh hệ thống cấp cao nhất, quy định vai trò, giọng điệu, phong cách và ranh giới hành vi của AI.',
          },
          {
            id: 'llm-core-02',
            title: 'Token & Tokenization',
            description: 'Đơn vị nhỏ nhất mô hình xử lý (không phải luôn là 1 từ); quá trình băm văn bản thành các token.',
          },
          {
            id: 'llm-core-03',
            title: 'Context Window',
            description: 'Giới hạn số lượng token tối đa mà một mô hình có thể tiếp nhận và xử lý trong một lần gọi.',
          },
          {
            id: 'llm-core-04',
            title: 'Zero-shot Prompting',
            description: 'Đưa ra yêu cầu trực tiếp mà không kèm ví dụ mẫu, dựa hoàn toàn vào khả năng hiểu sẵn có của mô hình.',
          },
          {
            id: 'llm-core-05',
            title: 'Few-shot Prompting',
            description: 'Kỹ thuật mớm sẵn một vài cặp ví dụ mẫu (Input ➡️ Output mong muốn) ngay trong prompt để AI bắt chước.',
          },
          {
            id: 'llm-core-06',
            title: 'System vs. User vs. Assistant Role',
            description: 'Ba vai trò tin nhắn chuẩn trong API chat, quyết định mức độ ưu tiên và ý nghĩa của nội dung.',
          },
          {
            id: 'llm-core-07',
            title: 'Temperature & Top-P',
            description: 'Siêu tham số điều khiển độ sáng tạo, ngẫu nhiên (gần 0: chặt chẽ, chính xác; gần 1: phong phú, sáng tạo).',
          },
          {
            id: 'llm-core-08',
            title: 'Prompt Template / Prompt Engineering',
            description: 'Bộ khung prompt tái sử dụng, có biến số, được thiết kế và tinh chỉnh có hệ thống.',
          },
        ],
      },
      {
        id: 'layer-02-intermediate',
        title: 'Trung cấp',
        items: [
          {
            id: 'llm-mid-01',
            title: 'Chain-of-Thought (CoT) Prompting',
            description: 'Kỹ thuật yêu cầu mô hình trình bày từng bước suy luận trước khi đưa ra câu trả lời cuối.',
          },
          {
            id: 'llm-mid-02',
            title: 'In-Context Learning',
            description: 'Khả năng mô hình "học" cách làm nhiệm vụ chỉ từ thông tin/ví dụ nằm trong prompt, không cần train lại.',
          },
          {
            id: 'llm-mid-03',
            title: 'Structured Output / JSON Mode',
            description: 'Tính năng ép mô hình trả về đúng chuẩn JSON theo schema định nghĩa sẵn.',
          },
          {
            id: 'llm-mid-04',
            title: 'Schema Validation',
            description: 'Quá trình kiểm tra đầu ra của LLM bằng thư viện như Pydantic (Python) hoặc Zod (TypeScript).',
          },
          {
            id: 'llm-mid-05',
            title: 'Function / Tool Calling',
            description: 'Cơ chế LLM phát hiện câu hỏi cần dữ liệu ngoài và sinh ra lệnh gọi hàm kèm tham số tương ứng.',
          },
          {
            id: 'llm-mid-06',
            title: 'Multi-turn Conversation Handling',
            description: 'Kỹ thuật quản lý và truyền lại lịch sử hội thoại nhiều lượt sao cho mô hình vẫn hiểu ngữ cảnh.',
          },
          {
            id: 'llm-mid-07',
            title: 'Stop Sequence',
            description: 'Chuỗi ký tự đặc biệt báo hiệu mô hình dừng sinh output tại điểm đó.',
          },
          {
            id: 'llm-mid-08',
            title: 'Output Parsing / Post-processing',
            description: 'Xử lý hậu kỳ văn bản do LLM sinh ra (strip markdown, extract field, validate format).',
          },
        ],
      },
      {
        id: 'layer-02-advanced',
        title: 'Nâng cao',
        items: [
          {
            id: 'llm-adv-01',
            title: 'Guardrails',
            description: 'Lớp bộ lọc bảo vệ ở cả đầu vào và đầu ra để chặn các nội dung độc hại, vi phạm pháp luật hoặc vi phạm quy tắc công ty.',
          },
          {
            id: 'llm-adv-02',
            title: 'Prompt Injection / Jailbreak',
            description: 'Kỹ thuật tấn công của người dùng nhằm lừa LLM phá vỡ các quy tắc bảo mật được cài đặt trong System Prompt.',
          },
          {
            id: 'llm-adv-03',
            title: 'Content Moderation API',
            description: 'Dịch vụ/lớp kiểm duyệt riêng biệt quét nội dung đầu vào-đầu ra để chặn vi phạm chính sách.',
          },
          {
            id: 'llm-adv-04',
            title: 'Logit Bias / Constrained Decoding',
            description: 'Kỹ thuật can thiệp vào xác suất chọn token để ép/loại một số từ nhất định khỏi output.',
          },
          {
            id: 'llm-adv-05',
            title: 'Model Card',
            description: 'Tài liệu mô tả năng lực, giới hạn, dữ liệu huấn luyện và rủi ro đã biết của một mô hình cụ thể.',
          },
          {
            id: 'llm-adv-06',
            title: 'Speculative Decoding',
            description: 'Kỹ thuật dùng một mô hình nhỏ đoán trước nhiều token để mô hình lớn xác nhận song song, tăng tốc sinh văn bản.',
          },
        ],
      },
    ],
  },
  {
    id: 'layer-03',
    order: 3,
    shortTag: '03-RAG',
    title: '03. Tầng RAG + Agent Layer',
    subtitle: 'Truy xuất thông tin vector, tìm kiếm lai, lập kế hoạch tác tử và Model Context Protocol',
    groups: [
      {
        id: 'layer-03-core',
        title: 'Core',
        items: [
          {
            id: 'rag-core-01',
            title: 'Retrieval-Augmented Generation (RAG)',
            description: 'Kiến trúc tổng quát kết hợp truy xuất tài liệu ngoài + sinh văn bản để trả lời có căn cứ.',
          },
          {
            id: 'rag-core-02',
            title: 'Embedding Model',
            description: 'Mô hình chuyên dụng chuyển đổi văn bản thành các vector số học nhiều chiều trong không gian ngữ nghĩa.',
          },
          {
            id: 'rag-core-03',
            title: 'Vector Database',
            description: 'Cơ sở dữ liệu tối ưu hóa cho việc lưu trữ vector và tra cứu độ tương đồng không gian (Qdrant, Pinecone, pgvector).',
          },
          {
            id: 'rag-core-04',
            title: 'Chunking Strategy',
            description: 'Chiến lược cắt nhỏ tài liệu thành từng đoạn (fixed size, recursive character, hay semantic chunking).',
          },
          {
            id: 'rag-core-05',
            title: 'Top-K / Similarity Threshold',
            description: 'Tham số quy định số lượng và độ tương đồng tối thiểu của các đoạn văn bản được truy xuất.',
          },
          {
            id: 'rag-core-06',
            title: 'Sliding Window / Overlap Chunking',
            description: 'Kỹ thuật cắt chunk có phần chồng lấn giữa các đoạn để không mất ngữ cảnh ở ranh giới.',
          },
          {
            id: 'rag-core-07',
            title: 'Grounding Verification / Citation',
            description: 'Cơ chế gắn nguồn trích dẫn cụ thể vào câu trả lời để người dùng kiểm chứng được thông tin lấy từ đâu.',
          },
        ],
      },
      {
        id: 'layer-03-intermediate',
        title: 'Trung cấp',
        items: [
          {
            id: 'rag-mid-01',
            title: 'Hybrid Search',
            description: 'Kỹ thuật tìm kiếm kết hợp cả tìm từ khóa truyền thống (Keyword/BM25) lẫn tìm theo ngữ nghĩa (Dense Vector Search).',
          },
          {
            id: 'rag-mid-02',
            title: 'Sparse vs. Dense Retrieval',
            description: 'Phân biệt tìm kiếm dựa trên từ khóa (sparse, BM25/TF-IDF) và tìm kiếm dựa trên vector ngữ nghĩa (dense).',
          },
          {
            id: 'rag-mid-03',
            title: 'Reranking (Cross-Encoder)',
            description: 'Mô hình chấm điểm và sắp xếp lại danh sách tài liệu tìm thấy để đưa tài liệu chuẩn xác nhất lên đầu.',
          },
          {
            id: 'rag-mid-04',
            title: 'Query Rewriting / Expansion',
            description: 'Tự động viết lại hoặc mở rộng câu hỏi của người dùng cho rõ nghĩa hơn trước khi gửi vào Vector DB tìm kiếm.',
          },
          {
            id: 'rag-mid-05',
            title: 'Query Decomposition',
            description: 'Chia một câu hỏi phức tạp thành nhiều câu hỏi con để Agent/RAG xử lý tuần tự rồi tổng hợp.',
          },
          {
            id: 'rag-mid-06',
            title: 'Approximate Nearest Neighbor (ANN)',
            description: 'Thuật toán tìm kiếm vector gần đúng (HNSW, IVF) để tăng tốc độ tra cứu trên tập dữ liệu lớn.',
          },
          {
            id: 'rag-mid-07',
            title: 'Tool/Function Schema',
            description: 'Định nghĩa chuẩn (thường JSON Schema) mô tả tên, tham số, kiểu dữ liệu của một công cụ để LLM gọi đúng cách.',
          },
          {
            id: 'rag-mid-08',
            title: 'Model Context Protocol (MCP)',
            description: 'Giao thức mở chuẩn hóa kết nối an toàn giữa AI App với các công cụ (Tools), dữ liệu (Resources) và Prompts.',
          },
        ],
      },
      {
        id: 'layer-03-advanced',
        title: 'Nâng cao',
        items: [
          {
            id: 'rag-adv-01',
            title: 'ReAct Framework (Reason + Act)',
            description: 'Mô hình tư duy của Agent: luân phiên giữa Suy luận (Thinking) ➡️ Hành động (Action) ➡️ Quan sát kết quả (Observation).',
          },
          {
            id: 'rag-adv-02',
            title: 'Agent Loop',
            description: 'Vòng lặp tự hành cho phép Agent thực hiện chuỗi tác vụ nhiều bước cho tới khi hoàn thành mục tiêu hoặc chạm ngưỡng dừng.',
          },
          {
            id: 'rag-adv-03',
            title: 'Planning / Task Decomposition (Agent)',
            description: 'Khả năng Agent tự lập kế hoạch, chia nhỏ mục tiêu lớn thành các bước thực thi cụ thể.',
          },
          {
            id: 'rag-adv-04',
            title: 'Tool Selection / Router Agent',
            description: 'Thành phần quyết định nên gọi công cụ nào trong số nhiều công cụ có sẵn cho một tác vụ.',
          },
          {
            id: 'rag-adv-05',
            title: 'Memory Module (Short-term & Long-term)',
            description: 'Cơ chế lưu trữ ngữ cảnh tạm thời (trong phiên) và lâu dài (qua nhiều phiên) cho Agent.',
          },
          {
            id: 'rag-adv-06',
            title: 'Self-Reflection / Self-Correction',
            description: 'Kỹ thuật Agent tự đánh giá lại kết quả của chính mình và sửa sai trước khi trả lời cuối.',
          },
          {
            id: 'rag-adv-07',
            title: 'Multi-Agent System',
            description: 'Kiến trúc chia nhỏ bài toán lớn cho nhiều Agent chuyên trách phối hợp với nhau (ví dụ: Agent nghiên cứu, Agent viết code, Agent review).',
          },
          {
            id: 'rag-adv-08',
            title: 'Orchestration Framework',
            description: 'Các framework (LangChain, LlamaIndex, LangGraph) giúp lắp ráp pipeline RAG/Agent một cách có cấu trúc.',
          },
          {
            id: 'rag-adv-09',
            title: 'GraphRAG',
            description: 'Biến thể RAG dùng Knowledge Graph thay/kèm vector search để truy xuất theo quan hệ thực thể, tốt cho câu hỏi đa bước.',
          },
        ],
      },
    ],
  },
  {
    id: 'layer-04',
    order: 4,
    shortTag: '04-OPS',
    title: '04. Tầng Ops & Đánh giá (LLMOps)',
    subtitle: 'Đo lường TTFT, đánh giá tự động bằng LLM-as-a-Judge, RAGAS, bộ đệm Semantic Caching',
    groups: [
      {
        id: 'layer-04-core',
        title: 'Core',
        items: [
          {
            id: 'ops-core-01',
            title: 'LLMOps',
            description: 'Tập hợp các quy trình, công cụ quản lý vòng đời từ thử nghiệm, đánh giá đến triển khai ứng dụng LLM.',
          },
          {
            id: 'ops-core-02',
            title: 'Golden Dataset / Benchmark Suite',
            description: 'Bộ dữ liệu kiểm thử chuẩn gồm các câu hỏi thực tế và câu trả lời mẫu chính xác (Ground Truth).',
          },
          {
            id: 'ops-core-03',
            title: 'Human Evaluation / Annotation',
            description: 'Con người trực tiếp chấm điểm chất lượng output theo rubric, dùng làm ground truth đối chiếu.',
          },
          {
            id: 'ops-core-04',
            title: 'Latency & TTFT (Time to First Token)',
            description: 'Tổng thời gian phản hồi và thời gian tính từ lúc bấm gửi đến khi token đầu tiên xuất hiện trên màn hình.',
          },
          {
            id: 'ops-core-05',
            title: 'Token Burn Rate & Cost Tracking',
            description: 'Tốc độ tiêu hao token và hệ thống theo dõi ngân sách chi phí gọi API theo thời gian thực.',
          },
          {
            id: 'ops-core-06',
            title: 'Data Drift & Hallucination Rate',
            description: 'Sự trôi dạt trong hành vi/ngữ cảnh câu hỏi của người dùng và tỷ lệ phần trăm mô hình trả lời bịa đặt.',
          },
        ],
      },
      {
        id: 'layer-04-intermediate',
        title: 'Trung cấp',
        items: [
          {
            id: 'ops-mid-01',
            title: 'LLM-as-a-Judge',
            description: 'Sử dụng mô hình LLM lớn, thông minh (như GPT-4o, Claude Sonnet) để tự động chấm điểm và đánh giá output của hệ thống.',
          },
          {
            id: 'ops-mid-02',
            title: 'RAGAS (RAG Assessment)',
            description: 'Framework đo lường chuyên biệt cho RAG với 4 chỉ số: Faithfulness, Answer Relevance, Context Precision, Context Recall.',
          },
          {
            id: 'ops-mid-03',
            title: 'Precision / Recall / F1 (cho Retrieval)',
            description: 'Các chỉ số đo độ chính xác và độ đầy đủ của kết quả truy xuất trong RAG.',
          },
          {
            id: 'ops-mid-04',
            title: 'Tracing & Observability',
            description: 'Khả năng ghi lại và trực quan hóa chi tiết từng mắt xích trong chuỗi xử lý (dùng Langfuse, LangSmith, Arize Phoenix).',
          },
          {
            id: 'ops-mid-05',
            title: 'A/B Testing (Prompt/Model)',
            description: 'So sánh hiệu quả giữa hai phiên bản prompt/model khác nhau trên tập người dùng thật.',
          },
          {
            id: 'ops-mid-06',
            title: 'Regression Testing (cho Prompt)',
            description: 'Kiểm tra prompt/mô hình mới không làm hỏng các case đã pass trước đó khi có thay đổi.',
          },
          {
            id: 'ops-mid-07',
            title: 'Prompt Versioning & Registry',
            description: 'Quản lý phiên bản prompt như code, có thể rollback, review, và theo dõi lịch sử thay đổi.',
          },
          {
            id: 'ops-mid-08',
            title: 'Cost per Query / Unit Economics',
            description: 'Chi phí tính toán trung bình cho mỗi lượt truy vấn, dùng để đánh giá tính khả thi kinh tế.',
          },
        ],
      },
      {
        id: 'layer-04-advanced',
        title: 'Nâng cao',
        items: [
          {
            id: 'ops-adv-01',
            title: 'Semantic Caching',
            description: 'Bộ nhớ đệm thông minh lưu lại câu trả lời cho các câu hỏi tương đồng về mặt ý nghĩa để giảm token gọi lại.',
          },
          {
            id: 'ops-adv-02',
            title: 'Model Routing / Cascading',
            description: 'Bộ định tuyến tự động chuyển câu hỏi dễ cho model nhỏ/rẻ xử lý, chỉ gửi câu khó cho model lớn/đắt.',
          },
          {
            id: 'ops-adv-03',
            title: 'Embedding Drift',
            description: 'Hiện tượng phân bố vector embedding thay đổi theo thời gian khiến retrieval kém chính xác dần.',
          },
          {
            id: 'ops-adv-04',
            title: 'Shadow Deployment',
            description: 'Chạy song song model/prompt mới với model cũ trên traffic thật nhưng không trả kết quả cho user, để so sánh.',
          },
          {
            id: 'ops-adv-05',
            title: 'Red Teaming',
            description: 'Chủ động thử tấn công/khai thác lỗ hổng của hệ thống AI trước khi kẻ xấu làm điều đó.',
          },
          {
            id: 'ops-adv-06',
            title: 'Alerting & SLA Monitoring',
            description: 'Thiết lập ngưỡng cảnh báo và cam kết chất lượng dịch vụ (uptime, latency) cho hệ thống AI production.',
          },
          {
            id: 'ops-adv-07',
            title: 'Canary Analysis cho Model',
            description: 'Phân tích thống kê tự động so sánh chất lượng/latency giữa phiên bản model mới và cũ trên một phần nhỏ traffic.',
          },
        ],
      },
    ],
  },
  {
    id: 'layer-05',
    order: 5,
    shortTag: '05-PROD',
    title: '05. Tầng Sản phẩm Production (Triển khai & Vận hành)',
    subtitle: 'Stream SSE, Circuit Breaker, Idempotency, Multi-tenancy và Human-in-the-loop',
    groups: [
      {
        id: 'layer-05-core',
        title: 'Core',
        items: [
          {
            id: 'prod-core-01',
            title: 'Streaming / SSE (Server-Sent Events)',
            description: 'Cơ chế truyền dữ liệu dạng luồng liên tục về client để hiển thị hiệu ứng chữ chạy theo thời gian thực.',
          },
          {
            id: 'prod-core-02',
            title: 'Session & State Management',
            description: 'Hệ thống lưu trữ và quản lý ngữ cảnh lịch sử trò chuyện theo từng phiên của từng người dùng.',
          },
          {
            id: 'prod-core-03',
            title: 'Conversational Memory',
            description: 'Các chiến lược quản lý bộ nhớ hội thoại (Window Buffer, Conversation Summary, Vector Memory) để không bị tràn context.',
          },
          {
            id: 'prod-core-04',
            title: 'Rate Limiting & Concurrency',
            description: 'Cơ chế kiểm soát số lượng request trên mỗi phút và xử lý tải khi có hàng nghìn người dùng cùng lúc.',
          },
          {
            id: 'prod-core-05',
            title: 'API Gateway / BFF (Backend for Frontend)',
            description: 'Lớp trung gian điều phối request giữa client và các service AI/backend khác nhau.',
          },
          {
            id: 'prod-core-06',
            title: 'Autonomous Agent vs. AI Copilot',
            description: 'Phân biệt giải pháp: AI tự làm từ A đến Z (Tác tử tự hành) vs. AI đóng vai trợ lý ngồi cạnh hỗ trợ con người.',
          },
        ],
      },
      {
        id: 'layer-05-intermediate',
        title: 'Trung cấp',
        items: [
          {
            id: 'prod-mid-01',
            title: 'Human-in-the-loop (HITL)',
            description: 'Quy trình bắt buộc phải có sự xác nhận của con người trước khi Agent kích hoạt các hành động nhạy cảm hoặc rủi ro cao.',
          },
          {
            id: 'prod-mid-02',
            title: 'Graceful Degradation / Fallback',
            description: 'Cơ chế tự động hạ cấp tính năng hoặc chuyển sang model dự phòng khi hệ thống chính gặp sự cố hay bị nghẽn mạng.',
          },
          {
            id: 'prod-mid-03',
            title: 'Feedback Loop (Implicit & Explicit)',
            description: 'Vòng phản hồi thu thập dữ liệu qua nút Like/Dislike của user hoặc qua hành vi người dùng copy/sửa text của bot.',
          },
          {
            id: 'prod-mid-04',
            title: 'Prompt Caching',
            description: 'Lưu đệm phần prompt cố định (system prompt, context tĩnh) để giảm chi phí và độ trễ ở các lần gọi sau.',
          },
          {
            id: 'prod-mid-05',
            title: 'Personalization Layer',
            description: 'Lớp tùy biến câu trả lời/hành vi AI dựa trên hồ sơ, lịch sử của từng người dùng cụ thể.',
          },
          {
            id: 'prod-mid-06',
            title: 'Cold Start Problem',
            description: 'Vấn đề hệ thống thiếu dữ liệu/ngữ cảnh ban đầu để cá nhân hóa hoặc phản hồi tốt cho user mới.',
          },
          {
            id: 'prod-mid-07',
            title: 'Production Readiness Checklist',
            description: 'Danh sách tiêu chí kiểm định (bảo mật, chịu tải, độ chính xác, chi phí) cần đạt trước khi chính thức bấm nút Go-Live.',
          },
        ],
      },
      {
        id: 'layer-05-advanced',
        title: 'Nâng cao',
        items: [
          {
            id: 'prod-adv-01',
            title: 'Multi-tenancy & Data Isolation',
            description: 'Kiến trúc cô lập dữ liệu tuyệt đối giữa các khách hàng/doanh nghiệp khác nhau dùng chung một hệ thống AI.',
          },
          {
            id: 'prod-adv-02',
            title: 'Idempotency (cho Agent Actions)',
            description: 'Đảm bảo một hành động (ví dụ gọi API thanh toán) không bị lặp lại gây hậu quả khi retry.',
          },
          {
            id: 'prod-adv-03',
            title: 'Circuit Breaker Pattern',
            description: 'Cơ chế tự động ngắt tạm thời việc gọi đến một service/model đang lỗi để tránh sập dây chuyền.',
          },
          {
            id: 'prod-adv-04',
            title: 'Blue-Green / Canary Deployment',
            description: 'Chiến lược triển khai phiên bản mới dần dần (một phần nhỏ traffic trước) để giảm rủi ro go-live.',
          },
          {
            id: 'prod-adv-05',
            title: 'Audit Log (cho Agent Actions)',
            description: 'Ghi lại đầy đủ hành động, quyết định của Agent để phục vụ truy vết và tuân thủ (compliance).',
          },
          {
            id: 'prod-adv-06',
            title: 'Kill Switch',
            description: 'Cơ chế tắt khẩn cấp một tính năng AI/Agent khi phát hiện hành vi bất thường hoặc rủi ro cao.',
          },
          {
            id: 'prod-adv-07',
            title: 'Compliance & Explainability',
            description: 'Yêu cầu hệ thống phải giải thích được quyết định của AI để đáp ứng quy định pháp lý (GDPR, AI Act...).',
          },
        ],
      },
    ],
  },
];
