"""Quick-add: bulk list parsing for item import."""

from rag_service.tools.item_tools import parse_item_list


def test_parses_bullets_and_numbers():
    text = "thêm các bài sau:\n- Docker\n* Kubernetes\n• Helm\n1. Terraform\n2) Ansible"
    assert parse_item_list(text) == ["Docker", "Kubernetes", "Helm", "Terraform", "Ansible"]


def test_ignores_plain_lines():
    assert parse_item_list("tạo cho tôi bài Docker và Kubernetes") == []


def test_skips_empty_bullets():
    assert parse_item_list("- \n-   \n- Docker") == ["Docker"]
