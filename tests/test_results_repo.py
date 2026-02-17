from datetime import datetime, timedelta, timezone

from app.services.results_repo import ResultsRepository


def test_result_persistence_and_expiry(tmp_path):
    db = tmp_path / "results.db"
    repo = ResultsRepository(str(db))
    repo.init_db()

    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=30)

    repo.create_processing_result(
        result_id="abc123",
        created_at=now.isoformat(),
        expires_at=expires.isoformat(),
        prompt_version="v1",
        user_agent_hash="deadbeef",
    )
    repo.mark_ready(
        result_id="abc123",
        upload_object_key="selfies/abc123/upload.png",
        generated_object_key="selfies/abc123/generated.png",
        final_object_key="selfies/abc123/final.png",
        public_image_url="https://cdn.example.com/selfies/abc123/final.png",
    )

    row = repo.get_result("abc123")
    assert row is not None
    assert row.status == "ready"
    assert row.public_image_url.endswith("final.png")

    expired_rows = repo.get_expired_results((now - timedelta(days=1)).isoformat())
    assert expired_rows == []
