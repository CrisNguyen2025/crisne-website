"""The service refuses a question longer than 2000 characters, and accepts exactly 2000."""

import pytest
from pydantic import ValidationError

from rag_service.api.schemas import ChatRequest


def test_accepts_exactly_the_limit():
    assert len(ChatRequest(message="x" * 2000).message) == 2000


def test_refuses_one_character_over_the_limit():
    with pytest.raises(ValidationError):
        ChatRequest(message="x" * 2001)
