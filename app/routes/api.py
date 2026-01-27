import os
from pathlib import Path
import tempfile

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.clients.fal_client import FalAPIClient

router = APIRouter()
logger = logging.getLogger(__name__)

CHAR_DIR = "app/static/characters"

@router.post("/generate")
async def generate_image(
    photo: UploadFile = File(...),
    character: str = Form("groc"),
    prompt: str | None = Form(None),
) -> dict:
    ref_path = f"{CHAR_DIR}/{character}.png"
    if not os.path.exists(ref_path):
        raise HTTPException(status_code=400, detail="Unknown character")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_file:
        temp_file.write(await photo.read())
        temp_path = Path(temp_file.name)

    try:
        client = FalAPIClient()
        image_url = client.generate_image(temp_path, Path(ref_path), prompt=prompt)
    finally:
        temp_path.unlink(missing_ok=True)

    return {"image_url": image_url}


@router.post("/log")
async def log_client_event(payload: dict) -> dict:
    logger.info("client_event %s", payload)
    return {"ok": True}
