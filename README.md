# EI FLAMES Selfie Generator

One-page FastAPI app for Encephalitis International's FLAMES campaign.

Users can upload a photo or use their camera, generate a stylized image, and share it via a unique URL.

## Features

- Upload or camera capture workflow
- Locked AI prompt for consistent campaign styling
- Python post-processing pipeline:
  - normalize to 1024x1024
  - campaign frame overlay
- Refresh-safe async jobs (submit once, poll status)
- Basic hardening (origin checks, security headers, rate limits)
- S3-backed storage for upload/generated/final images
- Public result URL (`/r/{result_id}`)
- Download endpoint
- 30-day default retention with automatic cleanup

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.app:app --host 0.0.0.0 --port 8000 --reload
```

## Required environment variables

- `FAL_KEY`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`

## Optional environment variables

- `SELFIE_TTL_DAYS` (default: `30`)
- `S3_QR_EXPIRY` (default: `3600`)
- `RATE_LIMIT_PER_MIN` (default: `3`)
- `RATE_LIMIT_PER_DAY` (default: `20`)
- `GEN_MAX_CONCURRENCY` (default: `5`)
- `GEN_MAX_QUEUE` (default: `50`)
- `PROCESSING_TIMEOUT_SECONDS` (default: `600`)
- `ALLOWED_ORIGINS` (comma-separated; defaults include `encephalitis.info` and `http://localhost:8000`)
- `ALLOWED_HOSTS` (comma-separated; defaults include `encephalitis.info`, `localhost`, and `testserver`)
- `TRUST_PROXY_HEADERS` (default: `false`)
- `FRAME_ASSET_PATH` (default: `app/static/campaign/frame_v1.png`)
- `RESULTS_DB_PATH` (default: `app/data/results.db`)

## API

- `POST /api/selfie/generate`
  - multipart form field: `photo`
  - multipart form field: `client_request_id` (recommended for idempotency)
- `GET /api/selfie/result/{result_id}`
- `GET /api/selfie/result/{result_id}/download`
- `GET /api/selfie/result/{result_id}/image`
- `GET /r/{result_id}`

## Tests

```bash
pytest
```
