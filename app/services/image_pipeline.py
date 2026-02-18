import io
import os
from pathlib import Path

import httpx
from PIL import Image, ImageChops, ImageOps, ImageStat

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MIN_DIMENSION = 512
OUTPUT_SIZE = 1024
_FRAME_CACHE: dict[str, tuple[float, Image.Image]] = {}


class ValidationError(Exception):
    pass


def validate_upload_bytes(data: bytes, mime_type: str | None) -> Image.Image:
    if mime_type not in ALLOWED_MIME_TYPES:
        raise ValidationError("Unsupported image format. Please upload JPG, PNG, or WebP.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValidationError("Image is too large. Maximum size is 10MB.")

    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as exc:
        raise ValidationError("Invalid image file.") from exc

    if image.width < MIN_DIMENSION or image.height < MIN_DIMENSION:
        raise ValidationError("Image is too small. Minimum size is 512x512.")

    # Basic quality guard: reject near-flat images likely to be blank or unusable.
    variance = ImageStat.Stat(image.convert("L")).var[0]
    if variance < 8:
        raise ValidationError("Image quality is too low. Please try another photo.")

    return image


def download_generated_image(url: str) -> Image.Image:
    with httpx.Client(timeout=30.0) as client:
        response = client.get(url)
        response.raise_for_status()
    return Image.open(io.BytesIO(response.content)).convert("RGB")


def _center_crop_to_square(image: Image.Image) -> Image.Image:
    size = min(image.width, image.height)
    left = (image.width - size) // 2
    top = (image.height - size) // 2
    return image.crop((left, top, left + size, top + size))


def normalize_to_output_size(image: Image.Image) -> Image.Image:
    square = _center_crop_to_square(image)
    return square.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS)


def apply_frame_overlay(image: Image.Image, frame_path: str) -> Image.Image:
    frame = _load_frame(frame_path)
    base = image.convert("RGBA")
    base.alpha_composite(frame)
    return base


def build_final_campaign_image(generated: Image.Image, frame_path: str) -> bytes:
    normalized = normalize_to_output_size(generated)
    framed = apply_frame_overlay(normalized, frame_path)

    output = io.BytesIO()
    framed.save(output, format="PNG")
    return output.getvalue()


def _load_frame(frame_path: str) -> Image.Image:
    """
    Load and resize the frame overlay with alpha-safe resampling.
    This avoids dark/incorrect edge halos when scaling transparent PNGs.
    """
    key = f"{frame_path}:{OUTPUT_SIZE}"
    try:
        mtime = os.path.getmtime(frame_path)
    except OSError:
        mtime = 0.0

    cached = _FRAME_CACHE.get(key)
    if cached and cached[0] == mtime:
        return cached[1]

    frame = Image.open(Path(frame_path)).convert("RGBA")
    target = (OUTPUT_SIZE, OUTPUT_SIZE)
    if frame.size != target:
        frame = _resize_rgba_premultiplied(frame, target, Image.Resampling.LANCZOS)

    _FRAME_CACHE[key] = (mtime, frame)
    return frame


def _resize_rgba_premultiplied(image: Image.Image, size: tuple[int, int], resample) -> Image.Image:
    r, g, b, a = image.convert("RGBA").split()
    rp = ImageChops.multiply(r, a)
    gp = ImageChops.multiply(g, a)
    bp = ImageChops.multiply(b, a)

    rp = rp.resize(size, resample=resample)
    gp = gp.resize(size, resample=resample)
    bp = bp.resize(size, resample=resample)
    a = a.resize(size, resample=resample)

    # Un-premultiply (one-time cost per frame path/size due to caching).
    rb = rp.tobytes()
    gb = gp.tobytes()
    bb = bp.tobytes()
    ab = a.tobytes()
    out_r = bytearray(len(ab))
    out_g = bytearray(len(ab))
    out_b = bytearray(len(ab))
    for i, alpha in enumerate(ab):
        if alpha == 0:
            out_r[i] = 0
            out_g[i] = 0
            out_b[i] = 0
        else:
            out_r[i] = min(255, (rb[i] * 255) // alpha)
            out_g[i] = min(255, (gb[i] * 255) // alpha)
            out_b[i] = min(255, (bb[i] * 255) // alpha)

    r2 = Image.frombytes("L", size, bytes(out_r))
    g2 = Image.frombytes("L", size, bytes(out_g))
    b2 = Image.frombytes("L", size, bytes(out_b))
    return Image.merge("RGBA", (r2, g2, b2, a))
