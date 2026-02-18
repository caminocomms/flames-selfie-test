import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    fal_key: str
    s3_endpoint_url: str
    s3_bucket: str
    s3_region: str
    s3_access_key_id: str
    s3_secret_access_key: str
    s3_public_base_url: str
    s3_signed_url_ttl_seconds: int
    rate_limit_per_min: int
    rate_limit_per_day: int
    gen_max_concurrency: int
    gen_max_queue: int
    processing_timeout_seconds: int
    allowed_origins: tuple[str, ...]
    allowed_hosts: tuple[str, ...]
    trust_proxy_headers: bool
    selfie_ttl_days: int
    frame_asset_path: str
    db_path: str

    @classmethod
    def load(cls, validate: bool = True) -> "Settings":
        fal_key = os.getenv("FAL_KEY", "")
        s3_bucket = os.getenv("S3_BUCKET", "")
        s3_region = os.getenv("S3_REGION", "")
        s3_access_key_id = os.getenv("S3_ACCESS_KEY", "")
        s3_secret_access_key = os.getenv("S3_SECRET_KEY", "")
        s3_endpoint_url = f"https://s3.{s3_region}.amazonaws.com" if s3_region else ""
        s3_public_base_url = f"https://{s3_bucket}.s3.{s3_region}.amazonaws.com" if s3_bucket and s3_region else ""

        required = {
            "FAL_KEY": fal_key,
            "S3_BUCKET": s3_bucket,
            "S3_REGION": s3_region,
            "S3_ACCESS_KEY": s3_access_key_id,
            "S3_SECRET_KEY": s3_secret_access_key,
        }

        if validate:
            missing = [name for name, value in required.items() if not value]
            if missing:
                joined = ", ".join(missing)
                raise RuntimeError(f"Missing required environment variables: {joined}")

        selfie_ttl_days = int(os.getenv("SELFIE_TTL_DAYS", "30"))
        s3_signed_url_ttl_seconds = int(os.getenv("S3_QR_EXPIRY", "3600"))
        rate_limit_per_min = int(os.getenv("RATE_LIMIT_PER_MIN", "3"))
        rate_limit_per_day = int(os.getenv("RATE_LIMIT_PER_DAY", "20"))
        gen_max_concurrency = int(os.getenv("GEN_MAX_CONCURRENCY", "5"))
        gen_max_queue = int(os.getenv("GEN_MAX_QUEUE", "50"))
        processing_timeout_seconds = int(os.getenv("PROCESSING_TIMEOUT_SECONDS", "600"))
        trust_proxy_headers = os.getenv("TRUST_PROXY_HEADERS", "false").lower() in {"1", "true", "yes"}

        default_origins = (
            "https://www.encephalitis.info",
            "https://encephalitis.info",
            "https://flames.caminocomms.com",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        )
        raw_origins = os.getenv("ALLOWED_ORIGINS", "")
        allowed_origins = tuple(o.strip().rstrip("/") for o in raw_origins.split(",") if o.strip()) or default_origins

        default_hosts = (
            "www.encephalitis.info",
            "encephalitis.info",
            "flames.caminocomms.com",
            "localhost",
            "127.0.0.1",
            "testserver",
        )
        raw_hosts = os.getenv("ALLOWED_HOSTS", "")
        allowed_hosts = tuple(h.strip() for h in raw_hosts.split(",") if h.strip()) or default_hosts

        frame_asset_path = os.getenv("FRAME_ASSET_PATH", "app/static/campaign/frame_v1.png")
        if validate:
            if selfie_ttl_days <= 0:
                raise RuntimeError("SELFIE_TTL_DAYS must be greater than zero")
            if s3_signed_url_ttl_seconds <= 0:
                raise RuntimeError("S3_QR_EXPIRY must be greater than zero")
            if rate_limit_per_min <= 0 or rate_limit_per_day <= 0:
                raise RuntimeError("Rate limits must be greater than zero")
            if gen_max_concurrency <= 0 or gen_max_queue <= 0:
                raise RuntimeError("Generation limits must be greater than zero")
            if processing_timeout_seconds <= 0:
                raise RuntimeError("PROCESSING_TIMEOUT_SECONDS must be greater than zero")
            if not Path(frame_asset_path).exists():
                raise RuntimeError(f"FRAME_ASSET_PATH does not exist: {frame_asset_path}")

        return cls(
            fal_key=fal_key,
            s3_endpoint_url=s3_endpoint_url,
            s3_bucket=s3_bucket,
            s3_region=s3_region,
            s3_access_key_id=s3_access_key_id,
            s3_secret_access_key=s3_secret_access_key,
            s3_public_base_url=s3_public_base_url,
            s3_signed_url_ttl_seconds=s3_signed_url_ttl_seconds,
            rate_limit_per_min=rate_limit_per_min,
            rate_limit_per_day=rate_limit_per_day,
            gen_max_concurrency=gen_max_concurrency,
            gen_max_queue=gen_max_queue,
            processing_timeout_seconds=processing_timeout_seconds,
            allowed_origins=allowed_origins,
            allowed_hosts=allowed_hosts,
            trust_proxy_headers=trust_proxy_headers,
            selfie_ttl_days=selfie_ttl_days,
            frame_asset_path=frame_asset_path,
            db_path=os.getenv("RESULTS_DB_PATH", "app/data/results.db"),
        )
