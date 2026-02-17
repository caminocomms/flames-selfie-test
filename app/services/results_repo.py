import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class SelfieResult:
    id: str
    created_at: str
    expires_at: str
    status: str
    upload_object_key: str | None
    generated_object_key: str | None
    final_object_key: str | None
    public_image_url: str | None
    prompt_version: str
    moderation_status: str
    error_message: str | None
    user_agent_hash: str | None


class ResultsRepository:
    def __init__(self, db_path: str) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS selfie_results (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    upload_object_key TEXT,
                    generated_object_key TEXT,
                    final_object_key TEXT,
                    public_image_url TEXT,
                    prompt_version TEXT NOT NULL,
                    moderation_status TEXT NOT NULL,
                    error_message TEXT,
                    user_agent_hash TEXT
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_selfie_results_expires_at ON selfie_results(expires_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_selfie_results_created_at ON selfie_results(created_at)")
            conn.commit()

    def create_processing_result(
        self,
        result_id: str,
        created_at: str,
        expires_at: str,
        prompt_version: str,
        user_agent_hash: str | None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO selfie_results (
                    id, created_at, expires_at, status, prompt_version,
                    moderation_status, user_agent_hash
                ) VALUES (?, ?, ?, 'processing', ?, 'passed', ?)
                """,
                (result_id, created_at, expires_at, prompt_version, user_agent_hash),
            )
            conn.commit()

    def mark_ready(
        self,
        result_id: str,
        upload_object_key: str,
        generated_object_key: str,
        final_object_key: str,
        public_image_url: str,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE selfie_results
                SET status='ready',
                    upload_object_key=?,
                    generated_object_key=?,
                    final_object_key=?,
                    public_image_url=?,
                    error_message=NULL
                WHERE id=?
                """,
                (upload_object_key, generated_object_key, final_object_key, public_image_url, result_id),
            )
            conn.commit()

    def mark_failed(self, result_id: str, error_message: str, moderation_status: str = "passed") -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE selfie_results
                SET status='failed', error_message=?, moderation_status=?
                WHERE id=?
                """,
                (error_message, moderation_status, result_id),
            )
            conn.commit()

    def get_result(self, result_id: str) -> SelfieResult | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM selfie_results WHERE id = ?", (result_id,)).fetchone()
            if not row:
                return None
            return SelfieResult(**dict(row))

    def get_expired_results(self, now_iso: str) -> list[SelfieResult]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM selfie_results WHERE expires_at <= ?", (now_iso,)).fetchall()
            return [SelfieResult(**dict(row)) for row in rows]

    def delete_results(self, result_ids: list[str]) -> None:
        if not result_ids:
            return
        placeholders = ",".join("?" for _ in result_ids)
        with self._connect() as conn:
            conn.execute(f"DELETE FROM selfie_results WHERE id IN ({placeholders})", result_ids)
            conn.commit()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
