import hashlib
import io
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse
from PIL import Image

from app.clients.fal_client import FalAPIClient
from app.services.image_pipeline import (
    ValidationError,
    build_final_campaign_image,
    download_generated_image,
    validate_upload_bytes,
)

router = APIRouter()
PROMPT_VERSION = "v1-fireman-1970s-ei"
MIME_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _to_png_bytes(image: Image.Image) -> bytes:
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def _is_expired(expires_at: str) -> bool:
    expires = datetime.fromisoformat(expires_at)
    return datetime.now(timezone.utc) >= expires


def _build_result_payload(request: Request, row) -> dict:
    if _is_expired(row.expires_at):
        raise HTTPException(status_code=410, detail="Result link has expired")
    if row.status != "ready" or not row.final_object_key:
        raise HTTPException(status_code=404, detail="Result not available")

    base = str(request.base_url).rstrip("/")
    return {
        "result_id": row.id,
        "share_url": f"{base}/r/{row.id}",
        "download_url": f"{base}/api/selfie/result/{row.id}/download",
        "image_url": f"{base}/api/selfie/result/{row.id}/image",
        "expires_at": row.expires_at,
    }


@router.post("/selfie/generate")
async def generate_selfie(request: Request, photo: UploadFile = File(...)) -> dict:
    settings = request.app.state.settings
    repo = request.app.state.repo
    storage = request.app.state.storage
    if storage is None:
        raise HTTPException(status_code=503, detail="Storage is not configured")

    photo_bytes = await photo.read()
    content_type = photo.content_type

    try:
        validate_upload_bytes(photo_bytes, content_type)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta(days=settings.selfie_ttl_days)
    user_agent = request.headers.get("user-agent", "")
    user_agent_hash = hashlib.sha256(user_agent.encode("utf-8")).hexdigest()[:32] if user_agent else None

    repo.create_processing_result(
        result_id=result_id,
        created_at=created_at.isoformat(),
        expires_at=expires_at.isoformat(),
        prompt_version=PROMPT_VERSION,
        user_agent_hash=user_agent_hash,
    )

    extension = MIME_EXT.get(content_type or "", "png")
    upload_key = f"selfies/{result_id}/upload.{extension}"
    generated_key = f"selfies/{result_id}/generated.png"
    final_key = f"selfies/{result_id}/final.png"

    try:
        storage.upload_bytes(upload_key, photo_bytes, content_type or "application/octet-stream")

        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{extension}") as tmp:
            tmp.write(photo_bytes)
            tmp_path = Path(tmp.name)

        try:
            fal_client = FalAPIClient()
            generated_url = fal_client.generate_firefighter_image(tmp_path)
        finally:
            tmp_path.unlink(missing_ok=True)

        generated_image = download_generated_image(generated_url)
        generated_png = _to_png_bytes(generated_image)
        storage.upload_bytes(generated_key, generated_png, "image/png")

        final_bytes = build_final_campaign_image(generated_image, settings.frame_asset_path)
        final_public_url = storage.upload_bytes(final_key, final_bytes, "image/png")

        repo.mark_ready(
            result_id=result_id,
            upload_object_key=upload_key,
            generated_object_key=generated_key,
            final_object_key=final_key,
            public_image_url=final_public_url,
        )
    except Exception as exc:
        repo.mark_failed(result_id, "Generation failed")
        raise HTTPException(status_code=500, detail="Failed to generate selfie") from exc

    row = repo.get_result(result_id)
    if not row:
        raise HTTPException(status_code=500, detail="Result save failed")
    return _build_result_payload(request, row)


@router.get("/selfie/result/{result_id}")
async def get_result(request: Request, result_id: str) -> dict:
    repo = request.app.state.repo
    row = repo.get_result(result_id)
    if not row:
        raise HTTPException(status_code=404, detail="Result not found")
    return _build_result_payload(request, row)


@router.get("/selfie/result/{result_id}/download")
async def download_result(request: Request, result_id: str):
    repo = request.app.state.repo
    storage = request.app.state.storage
    settings = request.app.state.settings
    if storage is None:
        raise HTTPException(status_code=503, detail="Storage is not configured")
    row = repo.get_result(result_id)
    if not row:
        raise HTTPException(status_code=404, detail="Result not found")
    _build_result_payload(request, row)
    signed_url = storage.presigned_get_url(
        row.final_object_key,
        expires_in=settings.s3_signed_url_ttl_seconds,
        download_filename=f"flames-selfie-{result_id}.png",
    )
    return RedirectResponse(url=signed_url, status_code=307)


@router.get("/selfie/result/{result_id}/image")
async def image_result(request: Request, result_id: str):
    repo = request.app.state.repo
    storage = request.app.state.storage
    settings = request.app.state.settings
    if storage is None:
        raise HTTPException(status_code=503, detail="Storage is not configured")
    row = repo.get_result(result_id)
    if not row:
        raise HTTPException(status_code=404, detail="Result not found")
    _build_result_payload(request, row)
    signed_url = storage.presigned_get_url(
        row.final_object_key,
        expires_in=settings.s3_signed_url_ttl_seconds,
    )
    return RedirectResponse(url=signed_url, status_code=307)
