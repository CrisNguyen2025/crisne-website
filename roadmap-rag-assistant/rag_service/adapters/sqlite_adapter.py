"""SQLite Adapter — direct access to prisma/dev.db (or Turso).

Bypasses the Next.js API layer entirely. Useful for:
- CLI scripts and offline development
- Testing without starting the Next.js server
- Bulk import / migration pipelines

Schema matches the Prisma models: Roadmap, RoadmapLayer, RoadmapGroup, RoadmapItem.
All IDs use UUID v7 for time-ordered uniqueness.
"""

from __future__ import annotations

import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import aiosqlite
import uuid_utils

from rag_service.adapters.errors import DuplicateEntityError, find_duplicate
from rag_service.adapters.levels import default_group_title, normalize_level
from rag_service.auth import owner_only
from rag_service.write_grant import guard_writes



async def _find_or_create_group(db, layer_id: str, level: str, now: str) -> str:
    """The layer's group for a level, created on first use; legacy groups match after normalizing."""
    level = normalize_level(level)
    cursor = await db.execute("SELECT id, level FROM RoadmapGroup WHERE layerId = ?", (layer_id,))
    for row in await cursor.fetchall():
        if normalize_level(row["level"]) == level:
            return row["id"]
    group_id = _uuid7()
    await db.execute(
        """
        INSERT INTO RoadmapGroup (id, layerId, level, title, "order", createdAt, updatedAt)
        VALUES (?, ?, ?, ?, 99, ?, ?)
        """,
        (group_id, layer_id, level, default_group_title(level), now, now),
    )
    return group_id

def _uuid7() -> str:
    return str(uuid_utils.uuid7())


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(text: str) -> str:
    """Generate a URL-safe slug from text, matching the Next.js API logic."""
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
            root_prisma = (
                Path(__file__).resolve().parent.parent.parent.parent
                / "prisma"
                / "dev.db"
            )
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

    # ── Topics (Roadmaps) ────────────────────────────────────────────────

    async def list_topics(self) -> list[dict]:
        async with self._connect() as db:
            cursor = await db.execute(
                """
                SELECT r.id, r.slug, r.title, r.shortCode, r.description,
                       r.icon, r."order", r.isLocked,
                       COUNT(l.id) as layer_count
                FROM Roadmap r
                LEFT JOIN RoadmapLayer l ON l.roadmapId = r.id
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
                    "shortCode": row["shortCode"],
                    "description": row["description"],
                    "icon": row["icon"],
                    "order": row["order"],
                    "isLocked": bool(row["isLocked"]),
                    "_count": {"layers": row["layer_count"]},
                }
                for row in rows
            ]

    async def export_full_hierarchy(self) -> list[dict]:
        """Fetch all roadmaps with layers, groups, and items."""
        topics = await self.list_topics()
        results = []
        for t in topics:
            full = await self.get_topic(t["slug"])
            if full:
                results.append(full)
        return results

    async def get_topic(self, slug: str) -> dict | None:
        async with self._connect() as db:
            cursor = await db.execute(
                "SELECT * FROM Roadmap WHERE slug = ?", (slug,)
            )
            row = await cursor.fetchone()
            if not row:
                return None
            topic = dict(row)

            # Fetch layers
            cursor = await db.execute(
                'SELECT * FROM RoadmapLayer WHERE roadmapId = ? ORDER BY "order" ASC',
                (topic["id"],),
            )
            layers = [dict(r) for r in await cursor.fetchall()]
            for layer in layers:
                # Fetch groups
                cursor = await db.execute(
                    'SELECT * FROM RoadmapGroup WHERE layerId = ? ORDER BY "order" ASC',
                    (layer["id"],),
                )
                groups = [dict(r) for r in await cursor.fetchall()]
                for group in groups:
                    # Fetch items
                    cursor = await db.execute(
                        'SELECT * FROM RoadmapItem WHERE groupId = ? ORDER BY "order" ASC',
                        (group["id"],),
                    )
                    group["items"] = [dict(r) for r in await cursor.fetchall()]
                layer["groups"] = groups

            topic["layers"] = layers
            return topic

    @owner_only
    async def create_topic(
        self,
        title: str,
        short_code: str,
        description: str = "",
        layers: list[dict] | None = None,
    ) -> dict:
        topic_id = _uuid7()
        slug = _slugify(title)
        now = _now_iso()

        async with self._connect() as db:
            # Same title or slug means the topic exists: report it instead of minting a copy
            cursor = await db.execute("SELECT id, slug, title FROM Roadmap")
            topics = [dict(r) for r in await cursor.fetchall()]
            dup = find_duplicate(topics, title) or next((t for t in topics if t["slug"] == slug), None)
            if dup:
                raise DuplicateEntityError("topic", dup["title"], dup)

            # Get next order
            cursor = await db.execute("SELECT COUNT(*) as cnt FROM Roadmap")
            row = await cursor.fetchone()
            order = (row["cnt"] if row else 0) + 1

            await db.execute(
                """
                INSERT INTO Roadmap (id, slug, title, shortCode, description, icon, "order", isLocked, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, 'Layers', ?, 0, ?, ?)
                """,
                (topic_id, slug, title.strip(), short_code.strip().upper(),
                 description.strip() or None, order, now, now),
            )

            # Create initial layers
            # No default layer: a topic starts empty unless layers are given
            layer_list = layers or []
            for idx, layer in enumerate(layer_list):
                layer_id = _uuid7()
                await db.execute(
                    """
                    INSERT INTO RoadmapLayer (id, roadmapId, "order", shortTag, title, subtitle, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (layer_id, topic_id, idx + 1,
                     layer.get("shortTag", f"{idx + 1:02d}-GEN").strip().upper(),
                     layer.get("title", "General").strip(),
                     layer.get("subtitle", "").strip(),
                     now, now),
                )

            await db.commit()

        return {
            "id": topic_id,
            "slug": slug,
            "title": title.strip(),
            "shortCode": short_code.strip().upper(),
            "description": description.strip(),
        }

    @owner_only
    async def update_topic(self, slug: str, **kwargs: object) -> dict:
        now = _now_iso()
        async with self._connect() as db:
            sets: list[str] = ['updatedAt = ?']
            vals: list[object] = [now]

            if "title" in kwargs:
                sets.append("title = ?")
                vals.append(str(kwargs["title"]).strip())
            if "short_code" in kwargs:
                sets.append("shortCode = ?")
                vals.append(str(kwargs["short_code"]).strip().upper())
            if "description" in kwargs:
                sets.append("description = ?")
                vals.append(str(kwargs["description"]).strip())
            if "is_locked" in kwargs:
                sets.append("isLocked = ?")
                vals.append(1 if kwargs["is_locked"] else 0)

            vals.append(slug)
            await db.execute(
                f'UPDATE Roadmap SET {", ".join(sets)} WHERE slug = ?', vals
            )
            await db.commit()

            cursor = await db.execute(
                "SELECT * FROM Roadmap WHERE slug = ?", (slug,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else {}

    @owner_only
    async def delete_topic(self, slug: str) -> bool:
        norm_slug = _slugify(slug)
        async with self._connect() as db:
            cursor = await db.execute(
                """
                SELECT id, slug FROM Roadmap
                WHERE slug = ?
                   OR slug = ?
                   OR lower(slug) = lower(?)
                   OR lower(title) = lower(?)
                   OR upper(shortCode) = upper(?)
                """,
                (slug, norm_slug, slug, slug, slug),
            )
            row = await cursor.fetchone()
            if not row:
                return False
            await db.execute("DELETE FROM Roadmap WHERE id = ?", (row["id"],))
            await db.commit()
            return True


    # ── Layers ───────────────────────────────────────────────────────────

    @owner_only
    async def create_layer(
        self,
        topic_slug: str,
        title: str,
        short_tag: str,
        subtitle: str = "",
    ) -> dict:
        layer_id = _uuid7()
        now = _now_iso()

        async with self._connect() as db:
            # Find roadmap by slug
            cursor = await db.execute(
                "SELECT id FROM Roadmap WHERE slug = ?", (topic_slug,)
            )
            roadmap_row = await cursor.fetchone()
            if not roadmap_row:
                raise ValueError(f"Topic '{topic_slug}' not found")
            roadmap_id = roadmap_row["id"]

            cursor = await db.execute(
                "SELECT id, title, shortTag FROM RoadmapLayer WHERE roadmapId = ?", (roadmap_id,)
            )
            dup = find_duplicate([dict(r) for r in await cursor.fetchall()], title)
            if dup:
                raise DuplicateEntityError("layer", dup["title"], dup)

            # Get next order
            cursor = await db.execute(
                'SELECT COUNT(*) as cnt FROM RoadmapLayer WHERE roadmapId = ?',
                (roadmap_id,),
            )
            row = await cursor.fetchone()
            order = (row["cnt"] if row else 0) + 1

            await db.execute(
                """
                INSERT INTO RoadmapLayer (id, roadmapId, "order", shortTag, title, subtitle, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (layer_id, roadmap_id, order, short_tag.strip().upper(),
                 title.strip(), subtitle.strip(), now, now),
            )

            # No group yet: the first item of a level creates it, so empty layers stay empty

            await db.commit()

        return {
            "id": layer_id,
            "title": title.strip(),
            "shortTag": short_tag.strip().upper(),
            "subtitle": subtitle.strip(),
            "order": order,
        }

    @owner_only
    async def update_layer(self, layer_id: str, **kwargs: object) -> dict:
        now = _now_iso()
        async with self._connect() as db:
            sets: list[str] = ['updatedAt = ?']
            vals: list[object] = [now]

            if "title" in kwargs:
                sets.append("title = ?")
                vals.append(str(kwargs["title"]).strip())
            if "short_tag" in kwargs:
                sets.append("shortTag = ?")
                vals.append(str(kwargs["short_tag"]).strip().upper())
            if "subtitle" in kwargs:
                sets.append("subtitle = ?")
                vals.append(str(kwargs["subtitle"]).strip())

            vals.append(layer_id)
            await db.execute(
                f'UPDATE RoadmapLayer SET {", ".join(sets)} WHERE id = ?', vals
            )
            await db.commit()

            cursor = await db.execute(
                "SELECT * FROM RoadmapLayer WHERE id = ?", (layer_id,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else {}

    @owner_only
    async def delete_layer(self, layer_id: str) -> bool:
        async with self._connect() as db:
            await db.execute("DELETE FROM RoadmapLayer WHERE id = ?", (layer_id,))
            await db.commit()
            return True

    # ── Groups ───────────────────────────────────────────────────────────

    @owner_only
    async def create_group(
        self,
        layer_id: str,
        title: str,
        level: str = "",
    ) -> dict:
        group_id = _uuid7()
        now = _now_iso()
        group_level = normalize_level(level or re.sub(r"[^\w]", "-", title.lower())) or f"group-{int(datetime.now(timezone.utc).timestamp())}"

        async with self._connect() as db:
            cursor = await db.execute(
                "SELECT id, title, level FROM RoadmapGroup WHERE layerId = ?", (layer_id,)
            )
            siblings = [dict(r) for r in await cursor.fetchall()]
            # Items are filed by level, so two groups with one level would split them
            dup = find_duplicate(siblings, title) or (
                next((g for g in siblings if normalize_level(g["level"]) == group_level), None) if level else None
            )
            if dup:
                raise DuplicateEntityError("group", dup["title"], dup)
            order = len(siblings) + 1

            await db.execute(
                """
                INSERT INTO RoadmapGroup (id, layerId, level, title, "order", createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (group_id, layer_id, group_level, title.strip(), order, now, now),
            )
            await db.commit()

        return {
            "id": group_id,
            "layerId": layer_id,
            "level": group_level,
            "title": title.strip(),
            "order": order,
        }

    @owner_only
    async def update_group(self, group_id: str, title: str) -> dict:
        now = _now_iso()
        async with self._connect() as db:
            await db.execute(
                'UPDATE RoadmapGroup SET title = ?, updatedAt = ? WHERE id = ?',
                (title.strip(), now, group_id),
            )
            await db.commit()
            cursor = await db.execute(
                "SELECT * FROM RoadmapGroup WHERE id = ?", (group_id,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else {}

    @owner_only
    async def delete_group(self, group_id: str) -> bool:
        async with self._connect() as db:
            await db.execute(
                "DELETE FROM RoadmapGroup WHERE id = ?", (group_id,)
            )
            await db.commit()
            return True

    # ── Items ────────────────────────────────────────────────────────────

    @owner_only
    async def create_item(
        self,
        layer_id: str,
        level: str,
        title: str,
        description: str = "",
        content: str = "",
    ) -> dict:
        item_id = _uuid7()
        now = _now_iso()

        async with self._connect() as db:
            # A lesson title appears once per layer, whatever its level
            cursor = await db.execute(
                """
                SELECT i.id, i.title, g.level FROM RoadmapItem i
                JOIN RoadmapGroup g ON g.id = i.groupId WHERE g.layerId = ?
                """,
                (layer_id,),
            )
            dup = find_duplicate([dict(r) for r in await cursor.fetchall()], title)
            if dup:
                raise DuplicateEntityError("item", dup["title"], {**dup, "layerId": layer_id})

            level = normalize_level(level)
            group_id = await _find_or_create_group(db, layer_id, level, now)

            # Count existing items in group for order
            cursor = await db.execute(
                "SELECT COUNT(*) as cnt FROM RoadmapItem WHERE groupId = ?",
                (group_id,),
            )
            row = await cursor.fetchone()
            order = (row["cnt"] if row else 0) + 1

            await db.execute(
                """
                INSERT INTO RoadmapItem (id, groupId, title, description, content, "order", createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (item_id, group_id, title.strip(), description.strip(), content or None, order, now, now),
            )
            await db.commit()

        return {
            "id": item_id,
            "title": title.strip(),
            "description": description.strip(),
            "level": level,
            "layerId": layer_id,
            "createdAt": now,
            "updatedAt": now,
        }

    @owner_only
    async def update_item(self, item_id: str, **kwargs: object) -> dict:
        now = _now_iso()
        async with self._connect() as db:
            sets: list[str] = ['updatedAt = ?']
            vals: list[object] = [now]

            if "title" in kwargs:
                sets.append("title = ?")
                vals.append(str(kwargs["title"]).strip())
            if "description" in kwargs:
                sets.append("description = ?")
                vals.append(str(kwargs["description"]).strip())

            # Handle level change (cross-group movement)
            if "level" in kwargs:
                new_level = normalize_level(kwargs["level"])
                cursor = await db.execute(
                    """
                    SELECT i.groupId, g.layerId, g.level
                    FROM RoadmapItem i
                    JOIN RoadmapGroup g ON g.id = i.groupId
                    WHERE i.id = ?
                    """,
                    (item_id,),
                )
                item_row = await cursor.fetchone()
                if item_row and normalize_level(item_row["level"]) != new_level:
                    target_id = await _find_or_create_group(db, item_row["layerId"], new_level, now)
                    sets.append("groupId = ?")
                    vals.append(target_id)

            vals.append(item_id)
            await db.execute(
                f'UPDATE RoadmapItem SET {", ".join(sets)} WHERE id = ?', vals
            )
            await db.commit()

            cursor = await db.execute(
                "SELECT * FROM RoadmapItem WHERE id = ?", (item_id,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else {}

    @owner_only
    async def delete_item(self, item_id: str) -> bool:
        async with self._connect() as db:
            await db.execute("DELETE FROM RoadmapItem WHERE id = ?", (item_id,))
            await db.commit()
            return True
