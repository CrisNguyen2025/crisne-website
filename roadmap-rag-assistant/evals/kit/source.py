"""Dataset loading and validation.

DatasetSource is the seam for other backends (e.g. an ApiSource for the data-source service);
FileSource reads the on-disk layout: <root>/<acl_tier>/<topic>/{meta.json,samples.jsonl}
and <root>/_<suite>/{meta.json,samples.jsonl} for cross-topic suites.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

SCHEMA_DIR = Path(__file__).parent / "schema"
ACL_TIERS = ("public", "internal", "confidential")
ACL_RANK = {tier: i for i, tier in enumerate(ACL_TIERS)}


@dataclass
class Dataset:
    path: str  # relative to the source root, e.g. "public/roadmap"
    topic: str
    acl_tier: str
    meta: dict
    samples: list[dict]


class DatasetSource(Protocol):
    def load(self) -> list[Dataset]: ...

    def version(self) -> str:
        """Identifies the exact dataset content a run used, so runs are reproducible."""
        ...


class FileSource:
    def __init__(self, root: Path):
        self.root = Path(root)

    def load(self) -> list[Dataset]:
        datasets = []
        for meta_path in sorted(self.root.glob("**/meta.json")):
            folder = meta_path.parent
            parts = folder.relative_to(self.root).parts
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            lines = (folder / "samples.jsonl").read_text(encoding="utf-8").splitlines()
            samples = [json.loads(line) for line in lines if line.strip()]
            topic = parts[-1]
            # Cross-topic suites (_routing, _acl) sit outside the tier folders and declare their tier in meta
            acl_tier = meta.get("acl_tier") if topic.startswith("_") else parts[0]
            datasets.append(Dataset("/".join(parts), topic, acl_tier, meta, samples))
        return datasets

    def version(self) -> str:
        digest = hashlib.sha256()
        for path in sorted(self.root.glob("**/*.json*")):
            digest.update(str(path.relative_to(self.root)).encode())
            digest.update(path.read_bytes())
        return f"sha256:{digest.hexdigest()[:16]}"


def load_schema(name: str) -> dict:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


def check_schema(value, schema: dict, where: str = "$") -> list[str]:
    """Validates the JSON Schema subset our schema files use: type, enum, required, properties,
    additionalProperties (bool), items, pattern, minLength. Stdlib only so the kit stays portable."""
    errors: list[str] = []
    types = schema.get("type")
    if types is not None:
        allowed = types if isinstance(types, list) else [types]
        if not any(_is_type(value, t) for t in allowed):
            return [f"{where}: expected {types}, got {type(value).__name__}"]
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{where}: {value!r} not in {schema['enum']}")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            errors.append(f"{where}: shorter than {schema['minLength']}")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            errors.append(f"{where}: {value!r} does not match {schema['pattern']}")
    if isinstance(value, dict):
        props = schema.get("properties", {})
        errors += [f"{where}: missing {key!r}" for key in schema.get("required", []) if key not in value]
        for key, item in value.items():
            if key in props:
                errors += check_schema(item, props[key], f"{where}.{key}")
            elif schema.get("additionalProperties") is False:
                errors.append(f"{where}: unexpected {key!r}")
    if isinstance(value, list) and "items" in schema:
        for i, item in enumerate(value):
            errors += check_schema(item, schema["items"], f"{where}[{i}]")
    return errors


_TYPES = {"object": dict, "array": list, "string": str, "boolean": bool, "null": type(None)}


def _is_type(value, name: str) -> bool:
    if name in ("integer", "number"):
        # bool is a subclass of int in Python, but not a number in JSON Schema
        return not isinstance(value, bool) and isinstance(value, int if name == "integer" else (int, float))
    return isinstance(value, _TYPES[name])


def validate(datasets: list[Dataset], extra_tags: list[str] | None = None) -> list[str]:
    """Schema + cross-field rules. Returns human-readable errors; empty means valid."""
    sample_schema, meta_schema = load_schema("sample.schema.json"), load_schema("meta.schema.json")
    known_tags = set(load_schema("tags.json")["tags"]) | set(extra_tags or [])
    errors: list[str] = []
    seen_ids: dict[str, str] = {}
    for ds in datasets:
        errors += check_schema(ds.meta, meta_schema, f"{ds.path}/meta.json")
        if ds.acl_tier not in ACL_TIERS:
            errors.append(f"{ds.path}: unknown acl tier {ds.acl_tier!r}")
        elif not ds.topic.startswith("_") and ds.meta.get("acl_tier") != ds.acl_tier:
            errors.append(f"{ds.path}: meta.acl_tier must match its folder {ds.acl_tier!r}")
        for n, sample in enumerate(ds.samples, 1):
            where = f"{ds.path}/samples.jsonl:{n}"
            errors += check_schema(sample, sample_schema, where)
            sid = sample.get("id")
            if sid in seen_ids:
                errors.append(f"{where}: duplicate id {sid!r} (first in {seen_ids[sid]})")
            seen_ids[sid] = where
            expected = sample.get("expected", {})
            if expected.get("behavior") == "refuse" and (expected.get("contexts") or expected.get("facts")):
                errors.append(f"{where}: refuse samples must not expect contexts or facts")
            unknown = set(sample.get("metadata", {}).get("tags", [])) - known_tags
            if unknown:
                errors.append(f"{where}: unknown tags {sorted(unknown)} (add them to datasets/tags.json)")
    return errors
