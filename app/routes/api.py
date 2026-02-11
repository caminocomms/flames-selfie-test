import base64
import io
import os
from pathlib import Path
import tempfile

import logging

import httpx
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from PIL import Image

from app.clients.fal_client import FalAPIClient
from app.services.composite import build_composite_image

router = APIRouter()
logger = logging.getLogger(__name__)

CHAR_DIR = "app/static/characters"
STATIC_DIR = Path("app/static")

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
        image_url = client.generate_image_with_background_removed(temp_path, Path(ref_path), prompt=prompt)
    finally:
        temp_path.unlink(missing_ok=True)



    return {"image_url": image_url}

class CompositeRequest(BaseModel):
    center_url: str
    left_path: str
    right_path: str


def resolve_static_path(path: str) -> Path:
    if not path.startswith("/static/"):
        raise HTTPException(status_code=400, detail="Invalid static path")
    candidate = (STATIC_DIR / path.replace("/static/", "", 1)).resolve()
    if not str(candidate).startswith(str(STATIC_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid static path")
    if not candidate.exists():
        raise HTTPException(status_code=400, detail="Static asset not found")
    return candidate


async def load_image_from_source(source: str) -> Image.Image:
    if source.startswith("/static/"):
        return Image.open(resolve_static_path(source)).convert("RGBA")
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(source)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to fetch image")
        return Image.open(io.BytesIO(resp.content)).convert("RGBA")


@router.post("/composite")
async def composite_image(payload: CompositeRequest) -> dict:
    center = await load_image_from_source(payload.center_url)
    left = Image.open(resolve_static_path(payload.left_path))
    right = Image.open(resolve_static_path(payload.right_path))

    canvas = build_composite_image(center, left, right)
    buffer = io.BytesIO()
    canvas.save(buffer, format="PNG")
    data = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return {"image_data": f"data:image/png;base64,{data}"}


@router.post("/log")
async def log_client_event(payload: dict) -> dict:
    logger.info("client_event %s", payload)
    return {"ok": True}
