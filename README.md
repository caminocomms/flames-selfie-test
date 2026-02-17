# EI FLAMES Selfie Generator

One-page FastAPI app for Encephalitis International's FLAMES campaign.

Users can upload a photo or use their camera, generate a stylized image, and share it via a unique URL.

## Features

- Upload or camera capture workflow
- Locked AI prompt for consistent campaign styling
- Python post-processing pipeline:
  - normalize to 1024x1024
  - campaign frame overlay
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
- `FRAME_ASSET_PATH` (default: `app/static/campaign/frame_v1.png`)
- `RESULTS_DB_PATH` (default: `app/data/results.db`)

## API

- `POST /api/selfie/generate`
  - multipart form field: `photo`
- `GET /api/selfie/result/{result_id}`
- `GET /api/selfie/result/{result_id}/download`
- `GET /r/{result_id}`

## Tests

```bash
pytest
```
