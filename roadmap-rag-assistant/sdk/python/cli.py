#!/usr/bin/env python3
"""Interactive CLI chat for the Roadmap RAG Assistant.

Run:
    python -m sdk.python.cli

Requires the FastAPI server to be running at http://localhost:8000.
"""

from __future__ import annotations

import sys

from roadmap_sdk.client import RoadmapAssistantClient


def main() -> None:
    base_url = "http://localhost:8000"
    if len(sys.argv) > 1:
        base_url = sys.argv[1]

    client = RoadmapAssistantClient(base_url=base_url)

    # Health check
    try:
        health = client.health()
        print(
            f"🤖 Roadmap Assistant CLI "
            f"(model: {health.get('llm_model', '?')}, "
            f"adapter: {health.get('adapter_mode', '?')}, "
            f"tools: {health.get('tools_count', '?')})"
        )
    except Exception as exc:
        print(f"⚠️  Không thể kết nối tới server tại {base_url}: {exc}")
        print("    Hãy chắc chắn server đang chạy:")
        print("    uvicorn rag_service.api.server:app --reload --port 8000")
        sys.exit(1)

    print("Gõ 'quit' hoặc 'exit' để thoát.\n")

    thread_id = "cli-session"

    while True:
        try:
            prompt = input("👤 > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n👋 Tạm biệt!")
            break

        if not prompt:
            continue
        if prompt.lower() in ("quit", "exit", "q"):
            print("👋 Tạm biệt!")
            break

        try:
            response = client.chat(prompt, thread_id=thread_id)
        except Exception as exc:
            print(f"❌ Lỗi: {exc}")
            continue

        # Show tool calls
        if response.tool_calls:
            for tc in response.tool_calls:
                print(f"   🔧 {tc.name}")
                if tc.result:
                    print(f"      → {tc.result}")

        # Show final message
        print(f"\n🤖 {response.message}\n")

    client.close()


if __name__ == "__main__":
    main()
