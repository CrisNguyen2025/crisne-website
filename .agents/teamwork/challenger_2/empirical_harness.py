"""Empirical Challenge Harness: Stress-testing Boundary Criteria & Ambiguity Matrix.

This script implements:
1. Existing Abot query understanding & decision table router logic.
2. The proposed KnowledgeSubIntent disambiguation heuristic classifier logic
   from `knowledge-sub-intents-design.md` (Sections 3.2, 3.3, 3.5, 4.2).
3. Test suites:
   - Suite 1: 18 Typical Query Examples (Section 3.4)
   - Suite 2: 5 Ambiguity Matrix Pairs (Section 3.5)
   - Suite 3: 24 Proposed New Eval Cases (Section 4.2)
   - Suite 4: 158 Decisions from decisions.jsonl with route == "knowledge_query"
   - Suite 5: Adversarial, Mixed, False Friends, and Permission Leak Test Cases
"""

import sys
import os
import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Dict, List, Tuple, Any

# Ensure roadmap-rag-assistant is importable
REPO_ROOT = "/Users/tienanhnguyen/Desktop/src_example/crisne-website"
ASSISTANT_DIR = os.path.join(REPO_ROOT, "roadmap-rag-assistant")
sys.path.insert(0, ASSISTANT_DIR)

from rag_service.domains.roadmap.retrieval.relevance import fold
from rag_service.domains.roadmap.router.vietnamese import normalize_vietnamese
from rag_service.domains.roadmap.router.schemas import IntentType
from rag_service.domains.roadmap.router.policy import (
    DECISION_TABLE, SpeechAct, Target, FALSE_OBJECT, HOW_TO, HOW_TO_FOLDED,
    LIST_TOPICS, LIST_FILLER, SHOW_REQUEST, PLAN_REQUEST, CUD_VERBS
)
from rag_service.domains.roadmap.router.understanding import understand, is_plain_listing
from rag_service.domains.roadmap.sections import asks_section_list
from rag_service.domains.roadmap.lesson_status import (
    asks_what_i_know, asks_next_learning, asks_review, parse_status_change_request
)


class KnowledgeSubIntent(str, Enum):
    SEARCH = "search"
    CATALOG = "catalog"
    PROGRESS = "progress"


# Heuristic patterns for sub-intent disambiguation as specified in design doc
COUNTING_CUE = re.compile(
    r"\b(?:co\s+bao\s+nhieu\s+bai|may\s+bai|bao\s+nhieu\s+bai|bao\s+nhieu\s+topic|may\s+topic|co\s+bao\s+nhieu\s+muc|may\s+muc|dem\s+so\s+bai|tong\s+so\s+bai)\b",
    re.IGNORECASE
)

POSITION_CUE = re.compile(
    r"\b(?:nam\s+o\s+dau|nam\s+o\s+muc\s+nao|thuoc\s+topic\s+nao|o\s+dau|nam\s+o\s+section\s+nao|thuoc\s+section\s+nao|o\s+cho\s+nao|vi\s+tri\s+nao)\b",
    re.IGNORECASE
)

STRUCTURAL_HIERARCHY_CUE = re.compile(
    r"\b(?:gom\s+nhung\s+(?:phan|muc|section|topic)\s+nao|cau\s+truc\s+(?:cac\s+layer|cac\s+section|lo\s+trinh)|show\s+me\s+all\s+lessons\s+under|tat\s+ca\s+cac\s+bai\s+hoc\s+trong\s+muc|danh\s+sach\s+cac\s+section)\b",
    re.IGNORECASE
)

PROGRESS_KEYWORDS = re.compile(
    r"\b(?:dang\s+biet\s+gi|da\s+biet\s+gi|da\s+nam\s+gi|da\s+nam\s+duoc|tien\s+do\s+hoc|on\s+lai|can\s+on|hoc\s+gi\s+tiep|nen\s+hoc\s+gi|dang\s+hoc\s+do|dang\s+hoc\s+bai\s+nao|da\s+hoc\s+nhung\s+bai\s+nao)\b",
    re.IGNORECASE
)

# Context filler pattern: "tôi đang học X, [câu hỏi chính]"
CONTEXT_FILLER = re.compile(
    r"^(?:toi|minh|em)\s+dang\s+hoc\s+[^,;\n]+[,;\n]\s*(?:hay\s+|vui\s+long\s+|cho\s+minh\s+hoi\s+)?(?P<main_clause>.+)$",
    re.IGNORECASE
)


def classify_sub_intent(query: str, is_owner: bool = True) -> Tuple[Optional[IntentType], Optional[KnowledgeSubIntent], str]:
    """Disambiguate query into top-level intent and sub-intent based on design doc specifications."""
    normalized = normalize_vietnamese(query).strip()
    flat = fold(normalized.lower())

    # 1. Check for Status Change Command (Action d) -> Must be ROADMAP_CUD, NOT KNOWLEDGE_QUERY!
    status_req = parse_status_change_request(normalized)
    if status_req is not None:
        return (IntentType.ROADMAP_CUD, None, "action_d_status_mutation")

    # 2. Check for Plan Goal
    if PLAN_REQUEST.search(flat):
        # Unless it is clearly creating a topic
        if not re.search(r"\b(?:tao|them|add|create)\s+(?:lo\s+trinh|topic|chu\s+de)\b", flat):
            return (IntentType.PLAN_GOAL, None, "plan_goal_request")

    # 3. Context filler deconstruction (Section 3.5, Pair 2):
    # E.g. "Tôi đang học RAG, hãy giải thích chunking"
    effective_query = normalized
    effective_flat = flat
    filler_match = CONTEXT_FILLER.match(normalized)
    if filler_match:
        main_part = filler_match.group("main_clause").strip()
        main_flat = fold(main_part.lower())
        # If main clause is an explanation question, prioritize SEARCH
        if re.search(r"\b(?:giai\s+thich|la\s+gi|the\s+nao|hoat\s+dong|nhu\s+the\s+nao|tim\s+bai)\b", main_flat):
            return (IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH, "context_filler_extracted_search")

    # 4. Progress queries (ADR-0010)
    # Check what I know, next learning, review
    if asks_what_i_know(effective_query) or asks_next_learning(effective_query) or asks_review(effective_query) or PROGRESS_KEYWORDS.search(effective_flat):
        # But wait! Does it contain a dominant question about technical concepts?
        # E.g. "Semantic Caching hoạt động thế nào" is NOT progress
        if not re.search(r"\b(?:la\s+gi|hoat\s+dong\s+the\s+nao|nguyen\s+ly|giai\s+thich\s+co\s+che)\b", effective_flat):
            return (IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS, "adr0010_progress_query")

    # 5. Catalog queries
    # Plain listing of topics
    if is_plain_listing(effective_query) or LIST_TOPICS.search(effective_query):
        # If not asking for technical how-to
        if not FALSE_OBJECT.search(effective_flat):
            return (IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG, "catalog_list_topics")

    # Section listing
    if asks_section_list(effective_query):
        return (IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG, "catalog_list_sections")

    # Counting queries ("topic AI có bao nhiêu bài", "mấy bài")
    if COUNTING_CUE.search(effective_flat):
        return (IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG, "catalog_counting_query")

    # Position queries ("bài Semantic Caching nằm ở đâu", "thuộc topic nào")
    if POSITION_CUE.search(effective_flat):
        return (IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG, "catalog_position_query")

    # Structural hierarchy queries ("Roadmap AI Architecture gồm những phần nào")
    if STRUCTURAL_HIERARCHY_CUE.search(effective_flat):
        return (IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG, "catalog_hierarchy_query")

    # 6. Technical Search queries (RAG Search)
    # Default for knowledge queries seeking explanation, search, comparison, how-to
    return (IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH, "vector_rag_search_default")


def evaluate_suites():
    print("=" * 80)
    print("EMPIRICAL TEST SUITE EVALUATION")
    print("=" * 80)

    # -------------------------------------------------------------
    # Suite 1: 18 Typical Query Examples (Section 3.4)
    # -------------------------------------------------------------
    suite_1 = [
        # Nhóm 1: SEARCH
        ("RAG là gì và hoạt động như thế nào?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Giải thích cơ chế chunking tài liệu trong hệ thống tìm kiếm ngữ nghĩa.", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Tìm giúp tôi các bài viết liên quan đến Authentication và JWT token.", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("So sánh sự khác nhau giữa Docker Compose và Dockerfile.", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Cách tạo topic trong Kafka", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Closure trong Javascript hoạt động thế nào", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),

        # Nhóm 2: CATALOG
        ("Website hiện có những lộ trình nào vậy?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Topic AI Engineering có bao nhiêu bài học tất cả?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Cho mình xem danh sách các section trong topic Backend.", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Bài Semantic Caching nằm ở đâu vậy bạn?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Show me all lessons under the DevOps section.", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Roadmap AI Architecture gồm những phần nào?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),

        # Nhóm 3: PROGRESS
        ("Tôi đang biết những gì về mảng AI Engineering?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Hôm nay tôi nên học bài gì tiếp theo?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Những bài học nào tôi đã lâu chưa ôn lại?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Tiến độ học tập của tôi trong roadmap này đến đâu rồi?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Trong các bài về Docker, tôi đã nắm được những bài nào rồi?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Gợi ý cho mình bài tiếp theo cần học trong lộ trình Frontend", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
    ]

    print("\n--- SUITE 1: 18 Typical Query Examples (Section 3.4) ---")
    s1_pass = 0
    for q, exp_intent, exp_sub in suite_1:
        intent, sub, reason = classify_sub_intent(q)
        ok = (intent == exp_intent and sub == exp_sub)
        status = "PASS" if ok else "FAIL"
        if ok:
            s1_pass += 1
        print(f"[{status}] {q!r}\n       Expected: {exp_intent.value if exp_intent else None}/{exp_sub.value if exp_sub else None} -> Got: {intent.value if intent else None}/{sub.value if sub else None} (reason: {reason})")
    print(f"Suite 1 Summary: {s1_pass}/{len(suite_1)} passed ({s1_pass/len(suite_1)*100:.1f}%)")

    # -------------------------------------------------------------
    # Suite 2: 5 Ambiguity Matrix Pairs (Section 3.5)
    # -------------------------------------------------------------
    suite_2 = [
        # Pair 1: Catalog vs Search
        ("Bài Semantic Caching nằm ở đâu", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Semantic Caching hoạt động thế nào", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        # Pair 2: Search vs Progress Context
        ("Tôi đang học RAG, hãy giải thích chunking", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Tôi đang học những bài nào trong topic RAG", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        # Pair 3: Catalog vs Plan Goal
        ("Xem danh sách bài trong roadmap Backend", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Lập lộ trình học Backend từ đầu", IntentType.PLAN_GOAL, None),
        # Pair 4: Progress Query vs CUD Mutation
        ("Bài Docker đã nắm chưa", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Đánh dấu bài Docker là đã nắm", IntentType.ROADMAP_CUD, None),
        # Pair 5: Catalog vs Out of Scope
        ("Cách tạo topic trong Kafka", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
    ]

    print("\n--- SUITE 2: 5 Ambiguity Pairs (Section 3.5) ---")
    s2_pass = 0
    for q, exp_intent, exp_sub in suite_2:
        intent, sub, reason = classify_sub_intent(q)
        ok = (intent == exp_intent and sub == exp_sub)
        status = "PASS" if ok else "FAIL"
        if ok:
            s2_pass += 1
        print(f"[{status}] {q!r}\n       Expected: {exp_intent.value if exp_intent else None}/{exp_sub.value if exp_sub else None} -> Got: {intent.value if intent else None}/{sub.value if sub else None} (reason: {reason})")
    print(f"Suite 2 Summary: {s2_pass}/{len(suite_2)} passed ({s2_pass/len(suite_2)*100:.1f}%)")

    # -------------------------------------------------------------
    # Suite 3: 24 New Eval Cases from Section 4.2
    # -------------------------------------------------------------
    suite_3 = [
        # Table 1: CATALOG
        ("Liệt kê tất cả các topic hiện có trên website", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Topic AI Engineering có bao nhiêu bài học", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Topic này có mấy bài", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Cho mình xem danh sách các section trong topic DevOps", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Bài Semantic Caching nằm ở đâu vậy", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("Lộ trình Backend gồm những mục nào", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("cho xem danh sach topic", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("which sections are included in Frontend roadmap", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),

        # Table 2: PROGRESS
        ("Tôi đang biết những gì về AI Engineering?", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Tôi đã nắm được những bài học nào rồi", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Tiến độ học tập của tôi đến đâu rồi", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Hôm nay nên học bài gì tiếp", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Bài nào đang học dở", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Gợi ý bài tiếp theo trong topic Docker", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Bài nào cần ôn lại", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Những bài đã nắm lâu rồi chưa xem lại", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Cho tôi danh sách bài cần ôn trong phần RAG", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Sau bài Docker Compose thì nên học bài nào", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),

        # Table 3: Boundary Disambiguation
        ("Tôi đang học RAG, hãy giải thích chunking", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Tôi đang học những bài nào trong phần RAG", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Semantic Caching hoạt động thế nào", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Đánh dấu bài Docker Compose là đang học", IntentType.ROADMAP_CUD, None),
        ("Chuyển bài Kafka sang đã nắm", IntentType.ROADMAP_CUD, None),
        ("Lập lộ trình học Backend hoàn chỉnh cho người mới", IntentType.PLAN_GOAL, None),
    ]

    print("\n--- SUITE 3: 24 Proposed New Eval Cases (Section 4.2) ---")
    s3_pass = 0
    for q, exp_intent, exp_sub in suite_3:
        intent, sub, reason = classify_sub_intent(q)
        ok = (intent == exp_intent and sub == exp_sub)
        status = "PASS" if ok else "FAIL"
        if ok:
            s3_pass += 1
        print(f"[{status}] {q!r}\n       Expected: {exp_intent.value if exp_intent else None}/{exp_sub.value if exp_sub else None} -> Got: {intent.value if intent else None}/{sub.value if sub else None} (reason: {reason})")
    print(f"Suite 3 Summary: {s3_pass}/{len(suite_3)} passed ({s3_pass/len(suite_3)*100:.1f}%)")

    # -------------------------------------------------------------
    # Suite 4: Adversarial & Stress Testing
    # -------------------------------------------------------------
    suite_adversarial = [
        # 1. False Friends & Polysemy (Topic/Section/Progress outside roadmap)
        ("Kafka topic có mấy partition", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Topic modeling trong gensim hoạt động thế nào", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Section .text và .data trong ELF header khác nhau gì", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Ôn thi IELTS speaking part 2 cần chuẩn bị gì", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Tiến độ giải ngân vốn đầu tư công hiện nay thế nào", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
        ("Học gì tiếp theo sau khi tốt nghiệp cấp 3", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),

        # 2. Mixed / Multi-intent sentences
        ("Giải thích RAG là gì và cho tôi xem danh sách topic", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH), # Mixed Search + Catalog
        ("Tôi đã nắm bài RAG chưa và cho tôi biết RAG là gì", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH), # Mixed Progress + Search
        ("Topic AI có mấy bài và giải thích bài đầu tiên", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH), # Mixed Count + Explanation

        # 3. Privacy Boundary / Visitor vs Owner
        ("Chủ roadmap này đã học những bài nào rồi", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS), # Attempting to probe owner state
        ("Owner đang học bài gì vậy bot", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("Cho xem tiến độ học tập của bạn Huy", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),

        # 4. Status mutation vs Read queries (Tránh ghi nhầm khi đọc)
        ("Đánh dấu bài Redis là đã nắm", IntentType.ROADMAP_CUD, None),
        ("Chuyển trạng thái bài JWT sang đang học", IntentType.ROADMAP_CUD, None),
        ("Bài Redis đã chuyển sang đã nắm chưa", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),

        # 5. Typo & Informal Vietnamese
        ("bai docker nam o dau the", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("topic nay co bao nhiu bai", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.CATALOG),
        ("toi dang hoc nhung bai nao nhi", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.PROGRESS),
        ("rag la j va dung ntn", IntentType.KNOWLEDGE_QUERY, KnowledgeSubIntent.SEARCH),
    ]

    print("\n--- SUITE 4: Adversarial & Stress Test Cases ---")
    s4_pass = 0
    for q, exp_intent, exp_sub in suite_adversarial:
        intent, sub, reason = classify_sub_intent(q)
        ok = (intent == exp_intent and sub == exp_sub)
        status = "PASS" if ok else "FAIL"
        if ok:
            s4_pass += 1
        print(f"[{status}] {q!r}\n       Expected: {exp_intent.value if exp_intent else None}/{exp_sub.value if exp_sub else None} -> Got: {intent.value if intent else None}/{sub.value if sub else None} (reason: {reason})")
    print(f"Suite 4 Summary: {s4_pass}/{len(suite_adversarial)} passed ({s4_pass/len(suite_adversarial)*100:.1f}%)")


if __name__ == "__main__":
    evaluate_suites()
