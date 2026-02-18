import io
import time

from fastapi.testclient import TestClient
from PIL import Image

from app.main import create_app


class DummyStorage:
    def upload_bytes(self, key: str, data: bytes, content_type: str) -> str:
        return f"https://example.com/{key}"

    def delete_object(self, key: str) -> None:
        return None

    def presigned_get_url(self, key: str, expires_in: int, download_filename: str | None = None) -> str:
        return "https://signed.example.com/object"


def _png_bytes(size=(700, 700), color=(20, 30, 40)) -> bytes:
    # Generate a non-flat image so variance-based validation passes.
    w, h = size
    img = Image.new("RGB", size)
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            pixels[x, y] = ((x * 3 + y) % 255, (x + y * 2) % 255, (x * 2 + y * 5) % 255)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_security_headers_present(monkeypatch, tmp_path):
    monkeypatch.setenv("RESULTS_DB_PATH", str(tmp_path / "results.db"))
    app = create_app(validate_env=False)
    with TestClient(app) as client:
        response = client.get("/")
        assert response.status_code == 200
        assert "Content-Security-Policy" in response.headers
        assert "blob:" in response.headers["Content-Security-Policy"]
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
        assert response.headers.get("X-Frame-Options") == "DENY"


def test_origin_enforced_on_generate(monkeypatch, tmp_path):
    monkeypatch.setenv("RESULTS_DB_PATH", str(tmp_path / "results.db"))
    app = create_app(validate_env=False)
    with TestClient(app) as client:
        app.state.storage = DummyStorage()
        response = client.post(
            "/api/selfie/generate",
            headers={"Origin": "https://evil.example"},
            data={"client_request_id": "req-1"},
            files={"photo": ("photo.png", _png_bytes(), "image/png")},
        )
        assert response.status_code == 403


def test_generate_returns_202_and_becomes_ready(monkeypatch, tmp_path):
    monkeypatch.setenv("RESULTS_DB_PATH", str(tmp_path / "results.db"))
    app = create_app(validate_env=False)

    def fake_run(repo, storage, frame_asset_path, photo_path, content_type, upload_key, generated_key, final_key, result_id):
        repo.mark_ready(
            result_id=result_id,
            upload_object_key=upload_key,
            generated_object_key=generated_key,
            final_object_key=final_key,
            public_image_url="https://example.com/final.png",
        )

    monkeypatch.setattr("app.services.job_runner._run_generation_sync", fake_run)

    with TestClient(app) as client:
        app.state.storage = DummyStorage()
        response = client.post(
            "/api/selfie/generate",
            headers={"Origin": "http://localhost:8000"},
            data={"client_request_id": "req-2"},
            files={"photo": ("photo.png", _png_bytes(), "image/png")},
        )
        assert response.status_code == 202
        payload = response.json()
        assert payload["status"] == "processing"
        result_id = payload["result_id"]

        deadline = time.time() + 2.0
        last = None
        while time.time() < deadline:
            r = client.get(f"/api/selfie/result/{result_id}")
            assert r.status_code == 200
            last = r.json()
            if last["status"] == "ready":
                break
            time.sleep(0.05)

        assert last is not None
        assert last["status"] == "ready"
        assert last["image_url"].endswith(f"/api/selfie/result/{result_id}/image")


def test_idempotency_returns_same_result(monkeypatch, tmp_path):
    monkeypatch.setenv("RESULTS_DB_PATH", str(tmp_path / "results.db"))
    app = create_app(validate_env=False)

    def fake_run(repo, storage, frame_asset_path, photo_path, content_type, upload_key, generated_key, final_key, result_id):
        repo.mark_ready(
            result_id=result_id,
            upload_object_key=upload_key,
            generated_object_key=generated_key,
            final_object_key=final_key,
            public_image_url="https://example.com/final.png",
        )

    monkeypatch.setattr("app.services.job_runner._run_generation_sync", fake_run)

    with TestClient(app) as client:
        app.state.storage = DummyStorage()
        req_id = "same-req"
        r1 = client.post(
            "/api/selfie/generate",
            headers={"Origin": "http://localhost:8000"},
            data={"client_request_id": req_id},
            files={"photo": ("photo.png", _png_bytes(), "image/png")},
        )
        assert r1.status_code == 202
        id1 = r1.json()["result_id"]

        r2 = client.post(
            "/api/selfie/generate",
            headers={"Origin": "http://localhost:8000"},
            data={"client_request_id": req_id},
            files={"photo": ("photo.png", _png_bytes(), "image/png")},
        )
        assert r2.status_code == 200 or r2.status_code == 202
        assert r2.json()["result_id"] == id1


def test_rate_limit_triggers(monkeypatch, tmp_path):
    monkeypatch.setenv("RESULTS_DB_PATH", str(tmp_path / "results.db"))
    monkeypatch.setenv("RATE_LIMIT_PER_MIN", "3")
    monkeypatch.setenv("RATE_LIMIT_PER_DAY", "20")
    app = create_app(validate_env=False)

    def fake_run(repo, storage, frame_asset_path, photo_path, content_type, upload_key, generated_key, final_key, result_id):
        repo.mark_ready(
            result_id=result_id,
            upload_object_key=upload_key,
            generated_object_key=generated_key,
            final_object_key=final_key,
            public_image_url="https://example.com/final.png",
        )

    monkeypatch.setattr("app.services.job_runner._run_generation_sync", fake_run)

    with TestClient(app) as client:
        app.state.storage = DummyStorage()
        for i in range(3):
            r = client.post(
                "/api/selfie/generate",
                headers={"Origin": "http://localhost:8000"},
                data={"client_request_id": f"req-{i}"},
                files={"photo": ("photo.png", _png_bytes(), "image/png")},
            )
            assert r.status_code == 202

        r4 = client.post(
            "/api/selfie/generate",
            headers={"Origin": "http://localhost:8000"},
            data={"client_request_id": "req-4"},
            files={"photo": ("photo.png", _png_bytes(), "image/png")},
        )
        assert r4.status_code == 429
        assert "Retry-After" in r4.headers
