"""Tests for adapters — verify HTTP and SQLite adapters work correctly."""

from __future__ import annotations

import pytest

from rag_service.adapters.http_adapter import HttpApiAdapter
from rag_service.adapters.sqlite_adapter import SqliteAdapter


class TestHttpAdapterInit:
    """Test HttpApiAdapter initialisation."""

    def test_creates_with_default_url(self):
        adapter = HttpApiAdapter()
        assert adapter._base_url == "http://localhost:3000"

    def test_creates_with_custom_url(self):
        adapter = HttpApiAdapter("http://my-server:4000")
        assert adapter._base_url == "http://my-server:4000"

    def test_strips_trailing_slash(self):
        adapter = HttpApiAdapter("http://localhost:3000/")
        assert adapter._base_url == "http://localhost:3000"


class TestSqliteAdapterInit:
    """Test SqliteAdapter initialisation."""

    def test_creates_with_default_path(self):
        adapter = SqliteAdapter()
        assert adapter._db_path.endswith("prisma/dev.db")

    def test_creates_with_custom_path(self):
        adapter = SqliteAdapter("/tmp/test.db")
        assert adapter._db_path == "/tmp/test.db"


class TestSqliteAdapterHelpers:
    """Test SQLite adapter helper functions."""

    def test_slugify_basic(self):
        from rag_service.adapters.sqlite_adapter import _slugify

        assert _slugify("AI Engineering") == "ai-engineering"
        assert _slugify("Hello World!") == "hello-world"
        assert _slugify("  spaces  ") == "spaces"

    def test_slugify_special_chars(self):
        from rag_service.adapters.sqlite_adapter import _slugify

        assert _slugify("AI & LLM Architecture") == "ai-llm-architecture"
        assert _slugify("C++ Programming") == "c-programming"

    def test_uuid7_format(self):
        from rag_service.adapters.sqlite_adapter import _uuid7

        uid = _uuid7()
        assert len(uid) == 36
        assert uid.count("-") == 4


def test_tests_never_reach_the_live_roadmap_api():
    """conftest installs an offline adapter: a test that forgets mock_adapter fails loudly instead of writing to Next.js."""
    import asyncio

    from conftest import LiveApiBlocked
    from rag_service.tools import get_adapter

    with pytest.raises(LiveApiBlocked):
        asyncio.run(get_adapter().create_topic(title="should never be created"))


def test_mock_adapter_replaces_the_offline_default(mock_adapter):
    from rag_service.tools import get_adapter

    assert get_adapter() is mock_adapter
