from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

from news_worker import summarizer
from news_worker.config import Settings
from news_worker.schemas import ClaimedJob, NewsSummaryOutput


def make_job() -> ClaimedJob:
    return ClaimedJob(
        jobId="job-sum-1",
        newsItemId="news-sum-1",
        sourceUrl="https://github.com/vercel/next.js",
        canonicalUrl="https://github.com/vercel/next.js",
        domain="github.com",
        platform="article",
        origin="manual",
        forceDeep=False,
        attempts=1,
    )


async def test_gemini_summarizer_returns_validated_json_without_tools(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expected = NewsSummaryOutput(
        title="Next.js cập nhật mới",
        tldr="Bản phát hành cải thiện hiệu năng build và trải nghiệm phát triển ứng dụng React.",
        takeaways=["Build nhanh hơn với Turbopack.", "Ổn định App Router."],
        tags=["NextJS", "React"],
        language="en",
    )

    generate_mock = MagicMock(return_value=SimpleNamespace(parsed=expected, text=""))
    fake_client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_mock))
    monkeypatch.setattr(summarizer.genai, "Client", lambda api_key: fake_client)

    settings = Settings(gemini_api_key="test-gemini", groq_api_key="")
    result = await summarizer.summarize_content(make_job(), "Some long article text.", settings)

    assert result.title == "Next.js cập nhật mới"
    assert result.tags == ["nextjs", "react"]

    call_kwargs = generate_mock.call_args.kwargs
    config = call_kwargs["config"]
    assert config.response_mime_type == "application/json"
    assert getattr(config, "tools", None) in (None, [])


async def test_falls_back_to_groq_without_tools_when_gemini_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    failing_client = SimpleNamespace(
        models=SimpleNamespace(
            generate_content=MagicMock(side_effect=RuntimeError("Gemini 429 quota"))
        )
    )
    monkeypatch.setattr(summarizer.genai, "Client", lambda api_key: failing_client)

    groq_json = (
        '{"title": "Tóm tắt từ Groq", '
        '"tldr": "Groq fallback xử lý JSON có cấu trúc khi Gemini hết quota tạm thời.", '
        '"takeaways": ["Không dùng agent hay tool gọi ngoài."], '
        '"tags": ["ai", "groq"], '
        '"language": "vi"}'
    )
    groq_create = MagicMock(
        return_value=SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=groq_json))]
        )
    )
    fake_groq = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=groq_create)))
    monkeypatch.setattr(summarizer, "Groq", lambda api_key: fake_groq)

    settings = Settings(gemini_api_key="test-gemini", groq_api_key="test-groq")
    result = await summarizer.summarize_content(make_job(), "Fallback text", settings)

    assert result.title == "Tóm tắt từ Groq"
    assert result.language == "vi"
    assert "tools" not in groq_create.call_args.kwargs
    assert groq_create.call_args.kwargs["response_format"] == {"type": "json_object"}


async def test_rejects_invalid_json_schema_from_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    invalid_json = '{"title": "No", "tldr": "short", "takeaways": [], "tags": [], "language": "fr"}'
    groq_create = MagicMock(
        return_value=SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=invalid_json))]
        )
    )
    fake_groq = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=groq_create)))
    monkeypatch.setattr(summarizer, "Groq", lambda api_key: fake_groq)

    settings = Settings(gemini_api_key="", groq_api_key="test-groq")
    with pytest.raises(ValidationError):
        await summarizer.summarize_content(make_job(), "Some text", settings)


async def test_rotates_multiple_gemini_keys_and_strips_json_fences(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen_keys: list[str] = []
    fenced_json = (
        "```json\n"
        '{"title": "Tổng hợp bản cập nhật mới", '
        '"tldr": "Xoay vòng key Gemini giúp tránh 429 và vẫn parse được JSON.", '
        '"takeaways": ["Giữ nội dung đầu và cuối bài dài."], '
        '"tags": ["ai"], "contentType": "tip", "language": "vi"}\n'
        "```"
    )

    def client_factory(api_key: str):
        seen_keys.append(api_key)
        if api_key == "key-1":
            return SimpleNamespace(
                models=SimpleNamespace(
                    generate_content=MagicMock(side_effect=RuntimeError("429 Resource Exhausted"))
                )
            )
        return SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(return_value=SimpleNamespace(parsed=None, text=fenced_json))
            )
        )

    monkeypatch.setattr(summarizer.genai, "Client", client_factory)
    settings = Settings(gemini_api_keys="key-1, key-2", gemini_api_key="", groq_api_key="")
    long_text = ("HEAD " * 3000) + ("MIDDLE " * 2000) + ("TAIL_CONCLUSION " * 300)

    result = await summarizer.summarize_content(make_job(), long_text, settings)

    assert seen_keys == ["key-1", "key-2"]
    assert result.tags == ["tip", "ai"]
    prompt = summarizer._build_user_prompt(make_job(), long_text)
    assert "HEAD" in prompt and "TAIL_CONCLUSION" in prompt
