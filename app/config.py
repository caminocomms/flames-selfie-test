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
        frame_asset_path = os.getenv("FRAME_ASSET_PATH", "app/static/campaign/frame_v1.png")
        if validate:
            if selfie_ttl_days <= 0:
                raise RuntimeError("SELFIE_TTL_DAYS must be greater than zero")
            if s3_signed_url_ttl_seconds <= 0:
                raise RuntimeError("S3_QR_EXPIRY must be greater than zero")
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
            selfie_ttl_days=selfie_ttl_days,
            frame_asset_path=frame_asset_path,
            db_path=os.getenv("RESULTS_DB_PATH", "app/data/results.db"),
        )
