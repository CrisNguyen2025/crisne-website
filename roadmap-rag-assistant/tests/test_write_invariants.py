"""Invariants that keep any new code path from writing roadmap data without a decision.

Rules fixed message by message (word lists, special cases) leave the next wording uncovered. These tests
check the structure instead, so a new adapter, a new write call or a new shortcut fails here first:

1. every data adapter guards its writes (@guard_writes)
2. adapter writes are called only from the write layer (tools, executor)
3. write grants are issued only at decision points (commands, the confirm endpoint)
4. a guarded write without a grant raises, even for the owner
5. the held-out set (evals/router/holdout.jsonl) never writes at once where it must not
"""

from __future__ import annotations

import ast
import asyncio
import importlib
import inspect
import pkgutil
from pathlib import Path

import pytest

import rag_service.adapters as adapters_pkg
from rag_service.write_grant import WriteNotGranted, guard_writes, is_write_method, write_granted

ROOT = Path(__file__).resolve().parents[1] / "rag_service"

# Modules allowed to call adapter.create_* / update_* / delete_*: the write layer
WRITE_LAYER = {"rag_service/execution/executor.py"} | {
    f"rag_service/tools/{p.name}" for p in (ROOT / "tools").glob("*.py")
}
# Modules allowed to issue a write grant: the decision points
DECISION_POINTS = {"rag_service/domains/roadmap/commands.py", "rag_service/api/routes.py"}


def _modules():
    for path in ROOT.rglob("*.py"):
        yield f"rag_service/{path.relative_to(ROOT).as_posix()}", ast.parse(path.read_text(encoding="utf-8"))


def _adapter_classes():
    for info in pkgutil.iter_modules(adapters_pkg.__path__):
        module = importlib.import_module(f"rag_service.adapters.{info.name}")
        for _, cls in inspect.getmembers(module, inspect.isclass):
            # BaseAdapter is a Protocol: an interface with no code that writes
            if cls.__module__ != module.__name__ or getattr(cls, "_is_protocol", False):
                continue
            writes = [n for n, fn in vars(cls).items() if is_write_method(n) and inspect.iscoroutinefunction(fn)]
            if writes:
                yield cls


def test_every_adapter_with_writes_is_guarded():
    classes = list(_adapter_classes())
    assert {c.__name__ for c in classes} >= {"HttpApiAdapter", "SqliteAdapter"}
    unguarded = [c.__name__ for c in classes if not getattr(c, "__write_guarded__", False)]
    assert not unguarded, f"add @guard_writes to {unguarded}"


def _adapter_write_calls(tree: ast.AST):
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        if not is_write_method(node.func.attr):
            continue
        owner = node.func.value
        name = owner.attr if isinstance(owner, ast.Attribute) else getattr(owner, "id", "")
        called = isinstance(owner, ast.Call) and getattr(owner.func, "id", "") == "get_adapter"
        if called or "adapter" in name.lower():
            yield node.lineno, node.func.attr


def test_adapter_writes_are_called_only_from_the_write_layer():
    stray = [
        f"{path}:{line} {attr}"
        for path, tree in _modules()
        if path not in WRITE_LAYER and not path.startswith("rag_service/adapters/")
        for line, attr in _adapter_write_calls(tree)
    ]
    assert not stray, f"adapter writes outside the write layer: {stray}"


def test_write_grants_are_issued_only_at_decision_points():
    issued = {
        path
        for path, tree in _modules()
        if path != "rag_service/write_grant.py"
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "write_granted"
    }
    assert issued <= DECISION_POINTS, f"grants issued outside decision points: {issued - DECISION_POINTS}"
    assert issued == DECISION_POINTS


@guard_writes
class _Adapter:
    async def create_topic(self, title: str) -> dict:
        return {"title": title}

    async def list_topics(self) -> list:
        return []


def test_guarded_write_without_a_grant_raises_even_for_the_owner():
    with pytest.raises(WriteNotGranted):
        asyncio.run(_Adapter().create_topic("X"))


def test_guarded_write_runs_inside_a_grant_and_reads_need_none():
    async def run():
        with write_granted("test"):
            return await _Adapter().create_topic("X")

    assert asyncio.run(run()) == {"title": "X"}
    assert asyncio.run(_Adapter().list_topics()) == []


def test_a_grant_is_never_issued_to_a_visitor():
    from rag_service.auth import current_actor

    token = current_actor.set("visitor")
    try:
        with pytest.raises(PermissionError):
            with write_granted("test"):
                pass
    finally:
        current_actor.reset(token)


def test_held_out_messages_never_write_at_once_where_they_must_not():
    from evals.router.holdout import run

    report = asyncio.run(run(use_llm=False))
    assert report["metrics"]["write_now_violations"] == 0, [l for l in report["lines"] if l.startswith("WRITE_NOW")]
    assert report["metrics"]["missed_writes"] == 0, [l for l in report["lines"] if l.startswith("MISSED")]
