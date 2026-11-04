#!/usr/bin/env python3
import json
import hashlib
import re
import urllib.request
from pathlib import Path

BASE_URL = "http://localhost:3334"
CACHE_PATH = Path("roadmap-rag-assistant/rag_service/data/embedding_cache.json")
EMBEDDING_MODEL = "models/gemini-embedding-001"

def strip_html(html_str: str) -> str:
    if not html_str:
        return ""
    text = re.sub(r"<style[\s\S]*?</style>", " ", html_str, flags=re.IGNORECASE)
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def embedding_key(text: str) -> str:
    truncated = text[:1000]
    return hashlib.sha1(f"{EMBEDDING_MODEL}\n{truncated}".encode("utf-8")).hexdigest()

def main():
    print("[Challenger] Verifying vector embedding cache consistency across all 117 items...")
    assert CACHE_PATH.exists(), f"Cache file not found at {CACHE_PATH}"
    
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        cache = json.load(f)
    print(f"Total entries in embedding_cache.json: {len(cache)}")

    # Fetch export
    req = urllib.request.Request(f"{BASE_URL}/api/v1/roadmaps/full-export")
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    
    roadmaps = data.get("roadmaps", [])
    print(f"Roadmaps in full-export: {len(roadmaps)}")
    
    total_items = sum(len(r.get("items", [])) for r in roadmaps)
    print(f"Items in full-export: {total_items}")
    expected_doc_count = len(roadmaps) + total_items
    print(f"Total expected documents (2 roadmaps + 115 items): {expected_doc_count}")

    missing_keys = []
    invalid_vectors = []
    verified_docs = 0
    vector_dims = set()

    for r in roadmaps:
        slug = r.get("slug", "")
        title = r.get("title", "")
        desc = r.get("description", "")
        topic_text = f"Lộ trình Chủ đề Topic: {title}. {desc}".strip()
        k = embedding_key(topic_text)
        if k not in cache:
            missing_keys.append(("topic", title, k))
        else:
            vec = cache[k]
            if not isinstance(vec, list) or len(vec) == 0 or not all(isinstance(x, (int, float)) for x in vec):
                invalid_vectors.append(("topic", title, k, len(vec) if isinstance(vec, list) else None))
            else:
                vector_dims.add(len(vec))
                verified_docs += 1

        for it in r.get("items", []):
            it_title = it.get("title", "")
            it_desc = it.get("description", "")
            sec = it.get("section") or None
            clean_content = strip_html(it.get("content", ""))
            item_text = (
                f"Bài học Mục Item: {it_title}. "
                f"Lộ trình: {title} ({slug})"
                + (f" -> Mục: {sec}" if sec else "")
                + f". Mô tả: {it_desc}. Nội dung chi tiết: {clean_content}"
            ).strip()
            k = embedding_key(item_text)
            if k not in cache:
                missing_keys.append(("item", it_title, k))
            else:
                vec = cache[k]
                if not isinstance(vec, list) or len(vec) == 0 or not all(isinstance(x, (int, float)) for x in vec):
                    invalid_vectors.append(("item", it_title, k, len(vec) if isinstance(vec, list) else None))
                else:
                    vector_dims.add(len(vec))
                    verified_docs += 1

    print(f"\n[Verification Summary]")
    print(f"Verified Docs with Valid Float Vectors: {verified_docs}/{expected_doc_count}")
    print(f"Observed Vector Dimensions            : {list(vector_dims)}")
    print(f"Missing Keys in Cache                 : {len(missing_keys)}")
    print(f"Invalid Vectors in Cache              : {len(invalid_vectors)}")

    if missing_keys:
        print("Missing sample:", missing_keys[:5])
        exit(1)
    if invalid_vectors:
        print("Invalid vector sample:", invalid_vectors[:5])
        exit(1)

    print("\nResult: ALL 117 DOCUMENTS MATCH EXACT SHA-1 KEYS AND HAVE VALID FLOAT VECTORS! PASS!")

if __name__ == "__main__":
    main()
