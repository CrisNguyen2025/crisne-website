"""Knowledge corpus: the static, versioned documents that datasets point into.

Layout: <root>/<acl_tier>/<topic>/{documents.jsonl, meta.json}. Every document has a stable doc_id
and sections with corpus-wide unique section_ids; dataset contexts reference those section_ids.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from evals.kit.source import ACL_RANK, ACL_TIERS, Dataset, check_schema, load_schema

# Identity fields are left out of the content hash: re-assigning ids is not a content change
_ID_FIELDS = {"doc_id", "source_id", "section_id"}


@dataclass
class Corpus:
    path: str  # relative to the corpus root, e.g. "public/roadmap"
    acl_tier: str
    meta: dict
    documents: list[dict]


class CorpusSource(Protocol):
    """Seam for other backends (e.g. the data-source API); FileCorpusSource reads corpus/ on disk."""

    def load(self) -> list[Corpus]: ...

    def version(self) -> str:
        """Names the exact corpus snapshot a run used, e.g. "public/roadmap@1.0"."""
        ...


class FileCorpusSource:
    def __init__(self, root: Path):
        self.root = Path(root)

    def load(self) -> list[Corpus]:
        return load_corpus(self.root)

    def version(self) -> str:
        return ", ".join(f"{corpus.path}@{corpus.meta.get('version')}" for corpus in self.load())


def load_corpus(root: Path) -> list[Corpus]:
    corpora = []
    for meta_path in sorted(Path(root).glob("**/meta.json")):
        folder = meta_path.parent
        parts = folder.relative_to(root).parts
        lines = (folder / "documents.jsonl").read_text(encoding="utf-8").splitlines()
        documents = [json.loads(line) for line in lines if line.strip()]
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        corpora.append(Corpus("/".join(parts), parts[0], meta, documents))
    return corpora


def _strip_ids(value):
    if isinstance(value, dict):
        return {k: _strip_ids(v) for k, v in value.items() if k not in _ID_FIELDS}
    if isinstance(value, list):
        return [_strip_ids(v) for v in value]
    return value


def content_hash(documents: list[dict]) -> str:
    """Order-independent hash of document content. A Target's corpus_fingerprint() must use the same
    function over the documents it serves, so drift between the live system and the corpus shows up."""
    lines = sorted(json.dumps(_strip_ids(doc), ensure_ascii=False, sort_keys=True) for doc in documents)
    return hashlib.sha256("\n".join(lines).encode()).hexdigest()


def section_acl(corpora: list[Corpus]) -> dict[str, list[str]]:
    """section_id -> roles allowed to read it."""
    return {
        section["section_id"]: doc["acl"]
        for corpus in corpora
        for doc in corpus.documents
        for section in doc["sections"]
    }


def section_index(corpora: list[Corpus]) -> dict[str, tuple[str, str]]:
    """section_id -> (doc_id, acl_tier)."""
    return {
        section["section_id"]: (doc["doc_id"], corpus.acl_tier)
        for corpus in corpora
        for doc in corpus.documents
        for section in doc["sections"]
    }


def validate_corpus(corpora: list[Corpus]) -> list[str]:
    document_schema, meta_schema = load_schema("document.schema.json"), load_schema("corpus-meta.schema.json")
    errors: list[str] = []
    seen_docs: set[str] = set()
    seen_sections: set[str] = set()
    for corpus in corpora:
        errors += check_schema(corpus.meta, meta_schema, f"{corpus.path}/meta.json")
        if corpus.acl_tier not in ACL_TIERS or corpus.meta.get("acl_tier") != corpus.acl_tier:
            errors.append(f"{corpus.path}: meta.acl_tier must match its folder {corpus.acl_tier!r}")
        for n, doc in enumerate(corpus.documents, 1):
            where = f"{corpus.path}/documents.jsonl:{n}"
            errors += check_schema(doc, document_schema, where)
            if doc.get("doc_id") in seen_docs:
                errors.append(f"{where}: duplicate doc_id {doc['doc_id']!r}")
            seen_docs.add(doc.get("doc_id"))
            for section in doc.get("sections", []):
                if section.get("section_id") in seen_sections:
                    errors.append(f"{where}: duplicate section_id {section['section_id']!r}")
                seen_sections.add(section.get("section_id"))
        if corpus.meta.get("doc_count") != len(corpus.documents):
            errors.append(f"{corpus.path}: meta.doc_count does not match documents.jsonl")
        if corpus.meta.get("sha256") != content_hash(corpus.documents):
            errors.append(f"{corpus.path}: documents.jsonl changed without re-export (meta.sha256 mismatch)")
    return errors


def validate_references(datasets: list[Dataset], corpora: list[Corpus]) -> list[str]:
    """Every context must exist in the corpus, and a dataset may not cite documents above its ACL tier."""
    index = section_index(corpora)
    errors: list[str] = []
    for ds in datasets:
        for n, sample in enumerate(ds.samples, 1):
            for context in sample.get("expected", {}).get("contexts", []):
                where = f"{ds.path}/samples.jsonl:{n}"
                found = index.get(context["section_id"])
                if found is None:
                    errors.append(f"{where}: section_id {context['section_id']!r} not in corpus")
                    continue
                doc_id, tier = found
                if context.get("doc_id") not in (None, doc_id):
                    errors.append(f"{where}: section {context['section_id']!r} belongs to {doc_id!r}")
                if ds.acl_tier in ACL_RANK and ACL_RANK[tier] > ACL_RANK[ds.acl_tier]:
                    errors.append(f"{where}: cites a {tier} document from a {ds.acl_tier} dataset")
    return errors
