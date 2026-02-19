import asyncio
import hashlib
import io
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import RedirectResponse
from PIL import Image

from app.services.job_runner import run_generation_job
from app.services.image_pipeline import (
    ValidationError,
    MAX_UPLOAD_BYTES,
    validate_upload_bytes,
)
from app.services.ratelimit import RateLimitExceeded

router = APIRouter()
PROMPT_VERSION = "v1-fireman-1970s-ei"
RETRY_AFTER_SECONDS = 2
MIME_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def _is_expired(expires_at: str) -> bool:
    expires = datetime.fromisoformat(expires_at)
    return datetime.now(timezone.utc) >= expires


def _get_client_ip(request: Request) -> str:
    settings = request.app.state.settings
    if settings.trust_proxy_headers:
        cf_ip = request.headers.get("cf-connecting-ip")
        if cf_ip:
            return cf_ip.strip()
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        # Handle common "Z" suffix (older data / different serializers).
        if raw.endswith("Z"):
            try:
                dt = datetime.fromisoformat(raw[:-1] + "+00:00")
            except ValueError:
                return None
        else:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _enforce_origin(request: Request) -> None:
    origin = (request.headers.get("origin") or "").rstrip("/")
    if not origin:
        return
    settings = request.app.state.settings

    # Prefer exact origin match if configured.
    allowed_origins = set(settings.allowed_origins)
    if origin in allowed_origins:
        return

    # Fall back to host-based allow (handles http/https mismatches behind TLS-terminating proxies).
    parsed = urlparse(origin)
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=403, detail="Origin not allowed")
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=403, detail="Origin not allowed")
    if host not in set(settings.allowed_hosts):
        raise HTTPException(status_code=403, detail="Origin not allowed")


def _build_result_payload(request: Request, row) -> dict:
    base = str(request.base_url).rstrip("/")
    if _is_expired(row.expires_at):
        return {
            "result_id": row.id,
            "status": "expired",
            "share_url": f"{base}/r/{row.id}",
            "expires_at": row.expires_at,
        }

    payload: dict = {
        "result_id": row.id,
        "share_url": f"{base}/r/{row.id}",
        "expires_at": row.expires_at,
    }

    if row.status == "ready" and row.final_object_key:
        payload.update(
            {
                "status": "ready",
                "download_url": f"{base}/api/selfie/result/{row.id}/download",
                "image_url": f"{base}/api/selfie/result/{row.id}/image",
            }
        )
        return payload

    if row.status == "failed":
        payload.update({"status": "failed", "error_message": row.error_message or "Generation failed."})
        return payload

    payload.update({"status": "processing", "retry_after_seconds": RETRY_AFTER_SECONDS})
    return payload


@router.post("/selfie/generate", status_code=202)
async def generate_selfie(
    request: Request,
    photo: UploadFile = File(...),
    client_request_id: str | None = Form(None),
) -> dict:
    settings = request.app.state.settings
    repo = request.app.state.repo
    storage = request.app.state.storage
    if storage is None:
        raise HTTPException(status_code=503, detail="Storage is not configured")

    _enforce_origin(request)
    client_ip = _get_client_ip(request)

    scheduled = False
    try:
        if not client_request_id:
            # Backwards compatibility: allow missing idempotency, but strongly prefer client-provided IDs.
            client_request_id = str(uuid.uuid4())

        ip_hash = _hash_ip(client_ip)
        existing = repo.get_by_client_request_id(ip_hash, client_request_id)
        if existing:
            return _build_result_payload(request, existing)

        try:
            request.app.state.rate_limiter.check(client_ip)
        except RateLimitExceeded as exc:
            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded",
                headers={"Retry-After": str(exc.retry_after_seconds)},
            ) from exc

        async with request.app.state.gen_inflight_lock:
            if request.app.state.gen_inflight >= settings.gen_max_queue:
                raise HTTPException(status_code=429, detail="Too many requests, please try again soon")
            request.app.state.gen_inflight += 1

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > int(MAX_UPLOAD_BYTES) + (1024 * 1024):
                    raise HTTPException(status_code=413, detail="Image is too large. Maximum size is 10MB.")
            except ValueError:
                pass

        # Read with a hard cap to avoid unbounded memory usage.
        photo_buffer = bytearray()
        while True:
            chunk = await photo.read(1024 * 1024)
            if not chunk:
                break
            photo_buffer.extend(chunk)
            if len(photo_buffer) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Image is too large. Maximum size is 10MB.")
        photo_bytes = bytes(photo_buffer)
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
            client_request_id=client_request_id,
            ip_hash=ip_hash,
        )

        extension = MIME_EXT.get(content_type or "", "png")
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{extension}") as tmp:
            tmp.write(photo_bytes)
            tmp_path = tmp.name

        row = repo.get_result(result_id)
        if not row:
            raise HTTPException(status_code=500, detail="Result save failed")
        # Background job continues even if the user refreshes.
        asyncio.create_task(
            run_generation_job(
                request.app,
                result_id,
                tmp_path,
                extension,
                content_type or "application/octet-stream",
            )
        )
        scheduled = True
        return _build_result_payload(request, row)
    finally:
        if not scheduled:
            async with request.app.state.gen_inflight_lock:
                request.app.state.gen_inflight = max(0, request.app.state.gen_inflight - 1)


@router.get("/selfie/result/{result_id}")
async def get_result(request: Request, result_id: str) -> dict:
    repo = request.app.state.repo
    settings = request.app.state.settings
    row = repo.get_result(result_id)
    if not row:
        raise HTTPException(status_code=404, detail="Result not found")
    if row.status == "processing":
        age_start = _parse_iso_datetime(row.started_at) or _parse_iso_datetime(row.created_at)
        if age_start:
            if datetime.now(timezone.utc) - age_start > timedelta(seconds=settings.processing_timeout_seconds):
                repo.mark_failed(result_id, "Timed out. Please try again.", internal_error_code="TIMED_OUT")
                row = repo.get_result(result_id) or row
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
    if _is_expired(row.expires_at):
        raise HTTPException(status_code=410, detail="Result link has expired")
    if row.status != "ready" or not row.final_object_key:
        raise HTTPException(status_code=409, detail="Result not ready")
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
    if _is_expired(row.expires_at):
        raise HTTPException(status_code=410, detail="Result link has expired")
    if row.status != "ready" or not row.final_object_key:
        raise HTTPException(status_code=409, detail="Result not ready")
    signed_url = storage.presigned_get_url(
        row.final_object_key,
        expires_in=settings.s3_signed_url_ttl_seconds,
    )
    return RedirectResponse(url=signed_url, status_code=307)
