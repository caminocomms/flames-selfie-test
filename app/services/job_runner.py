import asyncio
import io
import logging
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from app.clients.fal_client import FalAPIClient
from app.services.image_pipeline import build_final_campaign_image, download_generated_image

logger = logging.getLogger(__name__)


def _to_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


async def run_generation_job(app, result_id: str, temp_path: str, extension: str, content_type: str) -> None:
    settings = app.state.settings
    repo = app.state.repo
    storage = app.state.storage
    semaphore = app.state.gen_semaphore

    await semaphore.acquire()
    try:
        started_at = datetime.now(timezone.utc).isoformat()
        repo.mark_processing_started(result_id, started_at=started_at)
        logger.info("job_started result_id=%s", result_id)

        upload_key = f"selfies/{result_id}/upload.{extension}"
        generated_key = f"selfies/{result_id}/generated.png"
        final_key = f"selfies/{result_id}/final.png"

        path = Path(temp_path)
        try:
            await asyncio.to_thread(_run_generation_sync, repo, storage, settings.frame_asset_path, path, content_type, upload_key, generated_key, final_key, result_id)
            logger.info("job_finished result_id=%s", result_id)
        finally:
            path.unlink(missing_ok=True)
    except Exception:
        logger.exception("job_failed result_id=%s", result_id)
        try:
            repo.mark_failed(result_id, "Generation failed. Please try again.", internal_error_code="GENERATION_FAILED")
        except Exception:
            logger.exception("job_failed_mark_failed result_id=%s", result_id)
    finally:
        semaphore.release()
        async with app.state.gen_inflight_lock:
            app.state.gen_inflight = max(0, app.state.gen_inflight - 1)


def _run_generation_sync(repo, storage, frame_asset_path: str, photo_path: Path, content_type: str, upload_key: str, generated_key: str, final_key: str, result_id: str) -> None:
    with photo_path.open("rb") as f:
        photo_bytes = f.read()
    storage.upload_bytes(upload_key, photo_bytes, content_type or "application/octet-stream")

    fal_client = FalAPIClient()
    generated_url = fal_client.generate_firefighter_image(photo_path)

    generated_image = download_generated_image(generated_url)
    generated_png = _to_png_bytes(generated_image)
    storage.upload_bytes(generated_key, generated_png, "image/png")

    final_bytes = build_final_campaign_image(generated_image, frame_asset_path)
    public_url = storage.upload_bytes(final_key, final_bytes, "image/png")

    repo.mark_ready(
        result_id=result_id,
        upload_object_key=upload_key,
        generated_object_key=generated_key,
        final_object_key=final_key,
        public_image_url=public_url,
    )

