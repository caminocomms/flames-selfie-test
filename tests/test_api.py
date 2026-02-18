from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import create_app


def _seed_ready_result(app, result_id: str, expires_at: str):
    now = datetime.now(timezone.utc).isoformat()
    app.state.repo.create_processing_result(
        result_id=result_id,
        created_at=now,
        expires_at=expires_at,
        prompt_version="v1",
        user_agent_hash=None,
        client_request_id=None,
        ip_hash=None,
    )
    app.state.repo.mark_ready(
        result_id=result_id,
        upload_object_key=f"selfies/{result_id}/upload.png",
        generated_object_key=f"selfies/{result_id}/generated.png",
        final_object_key=f"selfies/{result_id}/final.png",
        public_image_url=f"https://cdn.example.com/selfies/{result_id}/final.png",
    )


def test_get_result_ready(monkeypatch, tmp_path):
    monkeypatch.setenv("RESULTS_DB_PATH", str(tmp_path / "results.db"))
    app = create_app(validate_env=False)

    with TestClient(app) as client:
        expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        _seed_ready_result(app, "ready-1", expires)

        response = client.get("/api/selfie/result/ready-1")
        assert response.status_code == 200
        payload = response.json()
        assert payload["result_id"] == "ready-1"
        assert payload["status"] == "ready"
        assert payload["share_url"].endswith("/r/ready-1")
        assert payload["image_url"].endswith("/api/selfie/result/ready-1/image")


def test_get_result_expired(monkeypatch, tmp_path):
    monkeypatch.setenv("RESULTS_DB_PATH", str(tmp_path / "results.db"))
    app = create_app(validate_env=False)

    with TestClient(app) as client:
        expires = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        _seed_ready_result(app, "expired-1", expires)

        response = client.get("/api/selfie/result/expired-1")
        assert response.status_code == 200
        assert response.json()["status"] == "expired"


def test_share_page_renders(monkeypatch, tmp_path):
    monkeypatch.setenv("RESULTS_DB_PATH", str(tmp_path / "results.db"))
    app = create_app(validate_env=False)

    with TestClient(app) as client:
        response = client.get("/r/demo-123")
        assert response.status_code == 200
        assert 'data-result-id="demo-123"' in response.text
