"""Layer ID resolver — maps human-readable identifiers (shortTag, title, slug) to database UUIDs."""

from __future__ import annotations

import re


async def resolve_layer_id(layer_identifier: str) -> str:
    """Resolve a human-readable layer identifier (e.g. '01-GEN', 'mock 1', 'aaa') to a database UUID.

    Matching hierarchy:
      1. Exact match on layer UUID / ID
      2. Exact match on layer shortTag (case-insensitive, e.g. '02-MOC')
      3. Exact match on layer title (case-insensitive, e.g. 'mock 1')
      4. Suffix match on shortTag (e.g. '02-AAA' matched by 'aaa')
      5. Substring match in title
    """
    if not layer_identifier:
        return layer_identifier

    clean_id = layer_identifier.strip()

    try:
        from rag_service.tools import get_adapter

        adapter = get_adapter()
        topics = await adapter.list_topics()
        target_lower = clean_id.lower()

        candidate_layers: list[dict] = []
        for topic in topics:
            slug = topic.get("slug")
            if not slug:
                continue
            topic_detail = await adapter.get_topic(slug)
            layers = topic_detail.get("layers", [])
            candidate_layers.extend(layers)

        # 1. Exact match on id, shortTag, or title
        for layer in candidate_layers:
            lid = layer.get("id", "")
            short_tag = (layer.get("shortTag") or "").strip()
            title = (layer.get("title") or "").strip()

            if lid == clean_id:
                return lid
            if short_tag.lower() == target_lower:
                return lid
            if title.lower() == target_lower:
                return lid

        # 2. Suffix match on shortTag (e.g. "02-AAA" -> "aaa")
        for layer in candidate_layers:
            lid = layer.get("id", "")
            short_tag = (layer.get("shortTag") or "").strip()
            tag_suffix = short_tag.split("-", 1)[-1] if "-" in short_tag else short_tag
            if tag_suffix.lower() == target_lower:
                return lid

        # 3. Partial match in title
        for layer in candidate_layers:
            lid = layer.get("id", "")
            title = (layer.get("title") or "").strip()
            if target_lower in title.lower() or title.lower() in target_lower:
                return lid

    except Exception as exc:
        print(f"[resolve_layer_id] Error resolving '{layer_identifier}': {exc}")

    return clean_id
