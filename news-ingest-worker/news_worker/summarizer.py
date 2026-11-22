from __future__ import annotations

import asyncio
from typing import Any

from google import genai
from google.genai import types
from groq import Groq

from news_worker.config import Settings
from news_worker.schemas import ClaimedJob, NewsSummaryOutput


SYSTEM_PROMPT = """Bạn là bộ tóm tắt tin tức kỹ thuật cho một đọc giả cá nhân.
Chỉ dùng thông tin có thật trong văn bản đầu vào. Không bịa thêm chi tiết, số liệu hay nguồn không có trong nội dung.
Viết súc tích bằng tiếng Việt tự nhiên (giữ nguyên thuật ngữ chuyên môn tiếng Anh).
Trả về JSON đúng schema yêu cầu:
- title: Tiêu đề rõ nghĩa, trung thực, bỏ câu view (3-180 ký tự).
- tldr: 1-2 câu cốt lõi nhất (10-400 ký tự).
- takeaways: 1-6 gạch đầu dòng ý chính quan trọng (mỗi ý 5-240 ký tự).
- tags: 1-4 tag chủ đề ngắn, chữ thường không dấu hoặc tiếng Anh chuẩn (ví dụ: ai, llm, nextjs, backend, devops). Không đưa tag loại nội dung vào đây.
- contentType: Đúng một loại nội dung:
  - "tip": mẹo, thủ thuật áp dụng được ngay.
  - "tutorial": hướng dẫn từng bước, giải thích cách làm hoặc cách hoạt động.
  - "tin-moi": tin tức, ra mắt, cập nhật phiên bản, sự kiện; chủ yếu để biết.
  - "quan-diem": ý kiến, nhận định, tranh luận, dự đoán.
- language: Ngôn ngữ gốc của nội dung ("vi", "en", hoặc "other")."""

GROQ_JSON_INSTRUCTION = (
    '\nChỉ trả về đúng một JSON object hợp lệ (không markdown fence) với các key: '
    '"title", "tldr", "takeaways", "tags", "contentType", "language".'
)

MAX_INPUT_CHARS = 18_000


def _build_user_prompt(
    job: ClaimedJob,
    extracted_text: str,
    fallback_title: str | None = None,
) -> str:
    clipped = extracted_text.strip()[:MAX_INPUT_CHARS]
    lines = [
        f"URL: {job.canonicalUrl}",
        f"Domain: {job.domain}",
        f"Platform: {job.platform}",
    ]
    if fallback_title:
        lines.append(f"Tiêu đề gốc: {fallback_title}")
    lines.append("")
    lines.append("Nội dung trích xuất:")
    lines.append(clipped)
    return "\n".join(lines)


def _summarize_with_gemini_sync(prompt: str, settings: Settings) -> NewsSummaryOutput:
    client = genai.Client(api_key=settings.gemini_api_key)
    response = client.models.generate_content(
        model=settings.llm_model,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=NewsSummaryOutput,
        ),
    )

    parsed: Any = getattr(response, "parsed", None)
    if isinstance(parsed, NewsSummaryOutput):
        return parsed
    if parsed is not None:
        return NewsSummaryOutput.model_validate(parsed)

    raw_text = (getattr(response, "text", None) or "").strip()
    if not raw_text:
        raise ValueError("Gemini trả về nội dung rỗng.")
    return NewsSummaryOutput.model_validate_json(raw_text)


def _summarize_with_groq_sync(prompt: str, settings: Settings) -> NewsSummaryOutput:
    client = Groq(api_key=settings.groq_api_key)
    completion = client.chat.completions.create(
        model=settings.groq_llm_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT + GROQ_JSON_INSTRUCTION},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    raw_text = (completion.choices[0].message.content or "").strip()
    if not raw_text:
        raise ValueError("Groq trả về nội dung rỗng.")
    return NewsSummaryOutput.model_validate_json(raw_text)


async def summarize_content(
    job: ClaimedJob,
    extracted_text: str,
    settings: Settings,
    fallback_title: str | None = None,
) -> NewsSummaryOutput:
    prompt = _build_user_prompt(job, extracted_text, fallback_title=fallback_title)

    gemini_error: Exception | None = None
    if settings.gemini_api_key:
        try:
            return await asyncio.to_thread(_summarize_with_gemini_sync, prompt, settings)
        except Exception as exc:
            gemini_error = exc

    if settings.groq_api_key:
        return await asyncio.to_thread(_summarize_with_groq_sync, prompt, settings)

    if gemini_error is not None:
        raise gemini_error
    raise RuntimeError("Thiếu cả GEMINI_API_KEY lẫn GROQ_API_KEY để tóm tắt.")
