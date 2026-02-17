import io
from pathlib import Path

import httpx
from PIL import Image, ImageOps, ImageStat

ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MIN_DIMENSION = 512
OUTPUT_SIZE = 1024


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
    frame = Image.open(Path(frame_path)).convert("RGBA")
    frame = ImageOps.fit(frame, (OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS)
    base = image.convert("RGBA")
    base.alpha_composite(frame)
    return base


def build_final_campaign_image(generated: Image.Image, frame_path: str) -> bytes:
    normalized = normalize_to_output_size(generated)
    framed = apply_frame_overlay(normalized, frame_path)

    output = io.BytesIO()
    framed.save(output, format="PNG")
    return output.getvalue()
