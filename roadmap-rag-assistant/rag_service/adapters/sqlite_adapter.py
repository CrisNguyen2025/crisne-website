"""SQLite Adapter — direct access to prisma/dev.db (or Turso).

Bypasses the Next.js API layer entirely. Useful for:
- CLI scripts and offline development
- Testing without starting the Next.js server
- Bulk import / migration pipelines

Schema matches the Prisma models: Roadmap and RoadmapItem (with roadmapId and section, ADR-0009).
All IDs use UUID v7 for time-ordered uniqueness.
"""

from __future__ import annotations

import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import aiosqlite
import uuid_utils

from rag_service.adapters.errors import DuplicateEntityError, find_duplicate, normalize_title
from rag_service.adapters.sections import resolve_section, sections_in_order
from rag_service.auth import owner_only
from rag_service.write_grant import guard_writes


def _uuid7() -> str:
    return str(uuid_utils.uuid7())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    slug = re.sub(r"^-+|-+$", "", slug)
    return slug or f"topic-{int(datetime.now(timezone.utc).timestamp())}"


@guard_writes
class SqliteAdapter:
    """Adapter that reads/writes directly to the SQLite database file."""

    def __init__(self, db_path: str = "../prisma/dev.db") -> None:
        from pathlib import Path

        p = Path(db_path)
        if not p.exists() and "dev.db" in db_path:
            root_prisma = Path(__file__).resolve().parent.parent.parent.parent / "prisma" / "dev.db"
            cwd_prisma = Path("prisma/dev.db")
            if root_prisma.exists():
                self._db_path = str(root_prisma)
            elif cwd_prisma.exists():
                self._db_path = str(cwd_prisma)
            else:
                self._db_path = db_path
        else:
            self._db_path = db_path

    @asynccontextmanager
    async def _connect(self):
        async with aiosqlite.connect(self._db_path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA foreign_keys=ON")
            yield db

    async def _find_topic(self, db, identifier: str):
        """The topic by slug, then by title (case-insensitive), or None."""
        cursor = await db.execute(
            "SELECT * FROM Roadmap WHERE slug = ? OR lower(slug) = lower(?) OR lower(title) = lower(?)",
            (identifier, identifier, identifier),
        )
        return await cursor.fetchone()

    async def _items_of(self, db, roadmap_id: str) -> list[dict]:
        cursor = await db.execute(
            'SELECT * FROM RoadmapItem WHERE roadmapId = ? ORDER BY "order" ASC', (roadmap_id,)
        )
        return [dict(r) for r in await cursor.fetchall()]

    # ── Topics ───────────────────────────────────────────────────────────

    async def list_topics(self) -> list[dict]:
        async with self._connect() as db:
            cursor = await db.execute(
                """
                SELECT r.id, r.slug, r.title, r.description, r.icon, r."order", r.isLocked,
                       COUNT(i.id) AS item_count
                FROM Roadmap r
                LEFT JOIN RoadmapItem i ON i.roadmapId = r.id
                GROUP BY r.id
                ORDER BY r."order" ASC
                """
            )
            rows = await cursor.fetchall()
            return [
                {
                    "id": row["id"],
                    "slug": row["slug"],
                    "title": row["title"],
                    "description": row["description"],
                    "icon": row["icon"],
                    "order": row["order"],
                    "isLocked": bool(row["isLocked"]),
                    "_count": {"items": row["item_count"]},
                }
                for row in rows
            ]

    async def export_full_hierarchy(self) -> list[dict]:
        """Every topic with its lessons, in page order."""
        results = []
        for topic in await self.list_topics():
            full = await self.get_topic(topic["slug"])
            if full:
                results.append(full)
        return results

    async def get_topic(self, slug: str) -> dict | None:
        async with self._connect() as db:
            row = await self._find_topic(db, slug)
            if not row:
                return None
            topic = dict(row)
            items = await self._items_of(db, topic["id"])
            topic["items"] = items
            topic["sections"] = sections_in_order(items)
            return topic

    @owner_only
    async def create_topic(self, title: str, description: str = "") -> dict:
        topic_id = _uuid7()
        slug = _slugify(title)
        now = _now_iso()

        async with self._connect() as db:
            cursor = await db.execute("SELECT id, slug, title FROM Roadmap")
            topics = [dict(r) for r in await cursor.fetchall()]
            dup = find_duplicate(topics, title) or next((t for t in topics if t["slug"] == slug), None)
            if dup:
                raise DuplicateEntityError("topic", dup["title"], dup)

            order = len(topics) + 1
            await db.execute(
                """
                INSERT INTO Roadmap (id, slug, title, description, icon, "order", isLocked, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, 'Layers', ?, 0, ?, ?)
                """,
                (topic_id, slug, title.strip(), description.strip() or None, order, now, now),
            )
            await db.commit()

        return {"id": topic_id, "slug": slug, "title": title.strip(), "description": description.strip()}

    @owner_only
    async def update_topic(self, slug: str, **kwargs: object) -> dict:
        async with self._connect() as db:
            row = await self._find_topic(db, slug)
            if not row:
                raise ValueError(f"Topic '{slug}' not found")
            sets, args = ["updatedAt = ?"], [_now_iso()]
            if kwargs.get("title") is not None:
                sets.append("title = ?")
                args.append(str(kwargs["title"]).strip())
            if kwargs.get("description") is not None:
                sets.append("description = ?")
                args.append(str(kwargs["description"]).strip() or None)
            if kwargs.get("isLocked") is not None:
                sets.append("isLocked = ?")
                args.append(1 if kwargs["isLocked"] else 0)
            await db.execute(f"UPDATE Roadmap SET {', '.join(sets)} WHERE id = ?", (*args, row["id"]))
            await db.commit()
            cursor = await db.execute("SELECT * FROM Roadmap WHERE id = ?", (row["id"],))
            return dict(await cursor.fetchone())

    @owner_only
    async def delete_topic(self, slug: str) -> bool:
        async with self._connect() as db:
            row = await self._find_topic(db, slug)
            if not row:
                return False
            await db.execute("DELETE FROM Roadmap WHERE id = ?", (row["id"],))
            await db.commit()
            return True

    # ── Lessons ──────────────────────────────────────────────────────────

    @owner_only
    async def create_item(
        self,
        topic_slug: str,
        section: str | None,
        title: str,
        description: str = "",
        content: str = "",
    ) -> dict:
        async with self._connect() as db:
            topic = await self._find_topic(db, topic_slug)
            if not topic:
                raise ValueError(f"Topic '{topic_slug}' not found")
            items = await self._items_of(db, topic["id"])
            dup = find_duplicate(items, title)
            if dup:
                raise DuplicateEntityError("item", dup["title"], {**dup, "roadmapSlug": topic["slug"]})

            used = resolve_section([i.get("section") for i in items], section)
            order = max((i["order"] for i in items), default=0) + 1
            item_id, now = _uuid7(), _now_iso()
            await db.execute(
                """
                INSERT INTO RoadmapItem (id, roadmapId, section, title, description, content, "order", createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (item_id, topic["id"], used, title.strip(), description.strip(), content or None, order, now, now),
            )
            await db.commit()
        return {
            "id": item_id,
            "roadmapSlug": topic["slug"],
            "section": used,
            "title": title.strip(),
            "description": description.strip(),
            "order": order,
        }

    @owner_only
    async def update_item(self, item_id: str, **kwargs: object) -> dict:
        async with self._connect() as db:
            cursor = await db.execute("SELECT * FROM RoadmapItem WHERE id = ?", (item_id,))
            current = await cursor.fetchone()
            if not current:
                raise ValueError(f"Lesson '{item_id}' not found")
            sets, args = ["updatedAt = ?"], [_now_iso()]
            if kwargs.get("title") is not None:
                title = str(kwargs["title"]).strip()
                siblings = await self._items_of(db, current["roadmapId"])
                dup = find_duplicate([s for s in siblings if s["id"] != item_id], title)
                if dup:
                    raise DuplicateEntityError("item", dup["title"], dup)
                sets.append("title = ?")
                args.append(title)
            if kwargs.get("description") is not None:
                sets.append("description = ?")
                args.append(str(kwargs["description"]).strip())
            if "section" in kwargs:
                siblings = await self._items_of(db, current["roadmapId"])
                others = [s.get("section") for s in siblings if s["id"] != item_id]
                sets.append("section = ?")
                args.append(resolve_section(others, kwargs["section"]))  # type: ignore[arg-type]
            await db.execute(f"UPDATE RoadmapItem SET {', '.join(sets)} WHERE id = ?", (*args, item_id))
            await db.commit()
            cursor = await db.execute("SELECT * FROM RoadmapItem WHERE id = ?", (item_id,))
            return dict(await cursor.fetchone())

    @owner_only
    async def delete_item(self, item_id: str) -> bool:
        async with self._connect() as db:
            cursor = await db.execute("DELETE FROM RoadmapItem WHERE id = ?", (item_id,))
            await db.commit()
            return cursor.rowcount > 0

    @owner_only
    async def update_section(self, topic_slug: str, from_name: str, to_name: str) -> dict:
        async with self._connect() as db:
            topic = await self._find_topic(db, topic_slug)
            if not topic:
                raise ValueError(f"Topic '{topic_slug}' not found")
            items = await self._items_of(db, topic["id"])
            wanted = normalize_title(from_name)
            moving = [i for i in items if i.get("section") and normalize_title(i["section"]) == wanted]
            if not moving:
                raise ValueError(f"No section '{from_name}' in '{topic_slug}'")
            target = resolve_section([i.get("section") for i in items], to_name)
            for item in moving:
                await db.execute("UPDATE RoadmapItem SET section = ?, updatedAt = ? WHERE id = ?", (target, _now_iso(), item["id"]))
            await db.commit()
        return {"renamed": len(moving), "section": target}

    @owner_only
    async def update_item_order(self, topic_slug: str, ordered_ids: list[str]) -> bool:
        async with self._connect() as db:
            topic = await self._find_topic(db, topic_slug)
            if not topic:
                raise ValueError(f"Topic '{topic_slug}' not found")
            for index, item_id in enumerate(ordered_ids, start=1):
                await db.execute(
                    "UPDATE RoadmapItem SET \"order\" = ? WHERE id = ? AND roadmapId = ?",
                    (index, item_id, topic["id"]),
                )
            await db.commit()
        return True
