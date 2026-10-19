"""Export the roadmap knowledge in prisma/dev.db to the static corpus (DB stays the source of truth).

    python -m evals.corpus_export                 # refuses if content changed and --version is not bumped
    python -m evals.corpus_export --version 1.1   # write a new corpus version

doc_ids are assigned once: a re-export keeps the id of every document it can match by source_id,
then by title, and only mints ids for new documents.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

from evals.kit.corpus import content_hash
from rag_service.adapters.sqlite_adapter import SqliteAdapter
from rag_service.rag.ingestion import DatabaseIngestionWorker, KnowledgeDocument

DEV_DB = Path(__file__).resolve().parents[2] / "prisma" / "dev.db"
CORPUS_DIR = Path(__file__).parent / "corpus" / "public" / "roadmap"


def load_knowledge() -> list[KnowledgeDocument]:
    return asyncio.run(DatabaseIngestionWorker(adapter=SqliteAdapter(str(DEV_DB))).ingest_all())


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.replace("đ", "d").replace("Đ", "D"))
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "doc"


def to_document(kd: KnowledgeDocument, doc_id: str = "") -> dict:
    """One corpus document per indexed roadmap entity; its single section carries the text RAG indexes."""
    return {
        "doc_id": doc_id,
        "source_id": kd.id,
        "title": kd.title,
        "doc_type": kd.doc_type,
        "acl": ["everyone"],
        "sections": [{"section_id": doc_id, "text": kd.description or kd.content_text or ""}],
        "metadata": {
            "topic": kd.topic_slug,
            "layer": kd.layer_tag,
            "layer_title": kd.layer_title,
            "level": kd.level,
        },
    }


def _new_id(kd: KnowledgeDocument) -> str:
    if kd.doc_type == "topic":
        return kd.topic_slug
    layer = f"{kd.topic_slug}/{(kd.layer_tag or 'layer').lower()}"
    return layer if kd.doc_type == "layer" else f"{layer}/{slugify(kd.title)}"


def read_existing() -> tuple[list[dict], dict]:
    docs_path, meta_path = CORPUS_DIR / "documents.jsonl", CORPUS_DIR / "meta.json"
    if not docs_path.exists():
        return [], {}
    lines = docs_path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()], json.loads(meta_path.read_text(encoding="utf-8"))


def build_documents(knowledge: list[KnowledgeDocument], previous: list[dict]) -> list[dict]:
    by_source = {doc["source_id"]: doc["doc_id"] for doc in previous if doc.get("source_id")}
    by_title = {doc["title"]: doc["doc_id"] for doc in previous}
    taken = set(by_source.values()) | set(by_title.values())
    documents = []
    for kd in sorted(knowledge, key=lambda d: (d.topic_slug, d.layer_tag or "", d.doc_type, d.title)):
        doc_id = by_source.get(kd.id) or by_title.get(kd.title)
        if doc_id is None:
            base = doc_id = _new_id(kd)
            suffix = 2
            while doc_id in taken:
                doc_id, suffix = f"{base}-{suffix}", suffix + 1
            taken.add(doc_id)
        documents.append(to_document(kd, doc_id))
    return documents


def main() -> int:
    parser = argparse.ArgumentParser(prog="evals.corpus_export")
    parser.add_argument("--version", help="corpus version to write, e.g. 1.1; required when content changed")
    args = parser.parse_args()

    previous, previous_meta = read_existing()
    documents = build_documents(load_knowledge(), previous)
    digest = content_hash(documents)
    if previous_meta.get("sha256") == digest and args.version in (None, previous_meta.get("version")):
        print(f"Corpus unchanged (version {previous_meta['version']}, {len(documents)} docs)")
        return 0
    if previous_meta and args.version in (None, previous_meta.get("version")):
        print(f"Content changed since {previous_meta['version']}; pass --version with a new number", file=sys.stderr)
        return 1

    meta = {
        "owner": "roadmap-rag-assistant",
        "acl_tier": "public",
        "version": args.version or "1.0",
        "source": "prisma/dev.db",
        "doc_count": len(documents),
        "sha256": digest,
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    CORPUS_DIR.mkdir(parents=True, exist_ok=True)
    (CORPUS_DIR / "documents.jsonl").write_text(
        "".join(json.dumps(doc, ensure_ascii=False) + "\n" for doc in documents), encoding="utf-8"
    )
    (CORPUS_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote corpus {meta['version']} ({len(documents)} docs) to {CORPUS_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
