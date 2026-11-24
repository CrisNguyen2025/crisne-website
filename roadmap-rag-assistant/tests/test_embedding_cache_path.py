"""The embedding cache can live on a persistent disk (EMBEDDING_CACHE_PATH), is written atomically, and is not
re-parsed while the file is unchanged."""

from __future__ import annotations

from pathlib import Path

import pytest

from rag_service.core.retrieval import hybrid


@pytest.fixture
def cache_file(tmp_path, monkeypatch):
    path = tmp_path / "disk" / "embedding_cache.json"
    monkeypatch.setenv("EMBEDDING_CACHE_PATH", str(path))
    monkeypatch.setattr(hybrid, "_cache_state", {"path": None, "mtime": None, "data": {}})
    return path


def test_the_environment_moves_the_cache(cache_file):
    assert hybrid.embedding_cache_path() == cache_file
    hybrid._save_embedding_cache({"k": [0.1, 0.2]})
    assert cache_file.exists()
    assert hybrid._load_embedding_cache() == {"k": [0.1, 0.2]}


def test_without_the_variable_the_cache_stays_in_the_image(monkeypatch):
    monkeypatch.delenv("EMBEDDING_CACHE_PATH", raising=False)
    assert hybrid.embedding_cache_path() == hybrid.EMBEDDING_CACHE_PATH


def test_writes_leave_no_temporary_file(cache_file):
    hybrid._save_embedding_cache({"a": [1.0]})
    hybrid._save_embedding_cache({"a": [1.0], "b": [2.0]})
    assert sorted(p.name for p in cache_file.parent.iterdir()) == ["embedding_cache.json"]


def test_an_unchanged_file_is_not_parsed_again(cache_file, monkeypatch):
    hybrid._save_embedding_cache({"a": [1.0]})
    first = hybrid._load_embedding_cache()

    def no_read(self, *args, **kwargs):
        raise AssertionError("the unchanged cache file was read again")

    monkeypatch.setattr(Path, "read_text", no_read)
    assert hybrid._load_embedding_cache() is first


def test_a_file_written_by_another_process_is_read(cache_file):
    hybrid._save_embedding_cache({"a": [1.0]})
    hybrid._load_embedding_cache()
    cache_file.write_text('{"a": [1.0], "z": [9.0]}', encoding="utf-8")
    import os

    stat = cache_file.stat()
    os.utime(cache_file, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
    assert "z" in hybrid._load_embedding_cache()
