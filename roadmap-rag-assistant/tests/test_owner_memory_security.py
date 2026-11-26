from rag_service.pii import contains_secret, has_meaningful_text, is_placeholder_only, mask_pii


def test_contains_secret_catches_sensitive_tokens_and_avoids_false_positives():
    assert contains_secret("sk-proj-abcdefghijklmnopqrstuvwxyz123456") is True
    assert contains_secret("-----BEGIN PRIVATE KEY-----\nabc") is True
    assert contains_secret("postgres://admin:superSecretPass@db.internal:5432/app") is True
    assert contains_secret("Bearer mF_9.B5f-4.1JqM99") is True
    assert contains_secret("ADMIN_KEY=super_secret_token_999") is True

    assert contains_secret("Dùng Bearer JWT trong Authorization header") is False
    assert contains_secret("Local URL postgres://localhost:5432/app") is False
    assert contains_secret("Ưu tiên Next.js App Router và FastAPI") is False


def test_placeholder_only_rejects_masked_pii_only_strings():
    masked = mask_pii("Email: owner@example.com")
    assert masked == "Email: [email]"
    assert is_placeholder_only(masked) is True
    assert has_meaningful_text(mask_pii("0912345678")) is False
    assert has_meaningful_text("Học Go") is True
    assert has_meaningful_text(mask_pii("Dùng email owner@example.com cho staging")) is True
