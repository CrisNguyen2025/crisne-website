"""Change review: what one executed action actually changed, streamed to the UI as `event: change_review`.

Contract (data of each SSE `change_review` event, JSON):

    id        str    Unique per executed action.
    action    str    create | delete
    level     str    topic | layer | group | item
    parent    str    Optional. Where the entries were created (topic slug or layer id).
    added     int    Rows written, children included.
    removed   int    Rows deleted, children included (a delete cascades).
    entries   list   [{op, level, title, id*, code*, children*}]
                     children: [{level, title}] for a cascading delete, at most MAX_CHILDREN.
    skipped   list   Titles left alone because they already exist.
    truncated bool   Optional. True when children were cut at MAX_CHILDREN.

Sent only when something was written: a create whose entities all existed, a delete that found
nothing or a failed action sends no event. The `done` event repeats every change review of the
turn as `changes`; `/chat/confirm` returns it as `changes`.
"""

from __future__ import annotations

import uuid
from typing import Any, Optional

MAX_CHILDREN = 50


def _children(level: str, node: dict) -> list[dict]:
    """Rows under a topic or layer snapshot that a delete removes with it, parents first."""
    rows: list[dict] = []
    if level == "topic":
        for layer in node.get("layers") or []:
            rows.append({"level": "layer", "title": layer.get("title") or ""})
            rows.extend(_children("layer", layer))
    elif level == "layer":
        for group in node.get("groups") or []:
            rows.append({"level": "group", "title": group.get("title") or ""})
            rows.extend(_children("group", group))
    elif level == "group":
        rows.extend({"level": "item", "title": i.get("title") or ""} for i in node.get("items") or [])
    return rows


async def snapshot_before_delete(adapter: Any, level: str, ident: str) -> Optional[dict]:
    """The row (and its subtree) a delete is about to remove, or None when it cannot be read.

    Best effort: the review falls back to the identifier when the read fails.
    """
    try:
        if level == "topic":
            return await adapter.get_topic(ident)
        children_key = {"layer": "layers", "group": "groups", "item": "items"}
        for topic in await adapter.export_full_hierarchy():
            nodes = [topic]
            for key in ("layers", "groups", "items"):
                nodes = [child for n in nodes for child in n.get(key) or []]
                if key == children_key[level]:
                    break
            for node in nodes:
                if ident in (node.get("id"), node.get("shortTag"), node.get("title")):
                    return node
    except Exception as exc:
        print(f"[ChangeSet] Snapshot of {level} '{ident}' skipped: {exc}")
    return None


class ChangeSet:
    """Collects the rows one action created or deleted."""

    def __init__(self, action: str, level: str, parent: Optional[str] = None) -> None:
        self.id = uuid.uuid4().hex
        self.action = action
        self.level = level
        self.parent = parent
        self.entries: list[dict] = []
        self.skipped: list[str] = []

    @classmethod
    def of(cls, action: Any) -> "ChangeSet":
        """Empty change set for a StructuredRoadmapAction about to run."""
        return cls(action.action.value, action.entity_level.value, action.target_parent_identifier)

    def created(
        self, title: str, row: Optional[dict] = None, code: Optional[str] = None, level: Optional[str] = None
    ) -> None:
        """A row written; *level* defaults to the action's (a template writes a topic and its children)."""
        row = row or {}
        self.entries.append(
            {
                "op": "create",
                "level": level or self.level,
                "title": title,
                "id": row.get("id") or row.get("slug"),
                "code": code,
            }
        )

    def deleted(self, ident: str, snapshot: Optional[dict] = None) -> None:
        snapshot = snapshot or {}
        self.entries.append(
            {
                "op": "delete",
                "level": self.level,
                "title": snapshot.get("title") or ident,
                "id": snapshot.get("id") or ident,
                "children": _children(self.level, snapshot),
            }
        )

    def skip(self, title: str) -> None:
        self.skipped.append(title)

    def __bool__(self) -> bool:
        return bool(self.entries)

    def to_dict(self) -> dict:
        added = sum(1 for e in self.entries if e["op"] == "create")
        removed = sum(1 + len(e.get("children") or []) for e in self.entries if e["op"] == "delete")
        truncated = False
        entries = []
        for e in self.entries:
            e = {k: v for k, v in e.items() if v not in (None, [])}
            if len(e.get("children") or []) > MAX_CHILDREN:
                e["children"] = e["children"][:MAX_CHILDREN]
                truncated = True
            entries.append(e)
        data = {
            "id": self.id,
            "action": self.action,
            "level": self.level,
            "parent": self.parent,
            "added": added,
            "removed": removed,
            "entries": entries,
            "skipped": self.skipped,
            "truncated": truncated or None,
        }
        return {k: v for k, v in data.items() if v is not None}

    def event(self) -> dict:
        return {"type": "change_review", **self.to_dict()}
