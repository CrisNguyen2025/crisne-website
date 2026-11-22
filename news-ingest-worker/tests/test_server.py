from __future__ import annotations

from fastapi.testclient import TestClient

from news_worker.config import Settings
from news_worker.server import create_app


def test_health_returns_ok() -> None:
    app = create_app(
        custom_settings=Settings(internal_api_key="secret-123"),
        enable_worker_loop=False,
    )
    with TestClient(app) as client:
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}


def test_wake_endpoint_enforces_fail_closed_internal_key() -> None:
    app_missing_secret = create_app(
        custom_settings=Settings(internal_api_key=""),
        enable_worker_loop=False,
    )
    with TestClient(app_missing_secret) as client:
        res = client.post("/internal/wake", headers={"x-internal-key": "anything"})
        assert res.status_code == 401

    app = create_app(
        custom_settings=Settings(internal_api_key="secret-123"),
        enable_worker_loop=False,
    )
    with TestClient(app) as client:
        assert client.post("/internal/wake").status_code == 401
        assert client.post("/internal/wake", headers={"x-internal-key": "wrong"}).status_code == 401

        ok_res = client.post("/internal/wake", headers={"x-internal-key": "secret-123"})
        assert ok_res.status_code == 202
        assert ok_res.json() == {"accepted": True}
        assert app.state.wake_event.is_set() is True
