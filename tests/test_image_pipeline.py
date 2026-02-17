import io

from PIL import Image

from app.services.image_pipeline import ValidationError, build_final_campaign_image, validate_upload_bytes


def _make_image_bytes(size=(600, 600), color=(120, 90, 40), fmt="PNG"):
    image = Image.new("RGB", size, color)
    buf = io.BytesIO()
    image.save(buf, format=fmt)
    return buf.getvalue()


def test_validate_rejects_bad_mime():
    data = _make_image_bytes()
    try:
        validate_upload_bytes(data, "application/pdf")
    except ValidationError as exc:
        assert "Unsupported image format" in str(exc)
    else:
        raise AssertionError("Expected ValidationError")


def test_validate_rejects_small_image():
    data = _make_image_bytes(size=(400, 400))
    try:
        validate_upload_bytes(data, "image/png")
    except ValidationError as exc:
        assert "Minimum size" in str(exc)
    else:
        raise AssertionError("Expected ValidationError")


def test_build_final_campaign_image_outputs_1024_square(tmp_path):
    frame_path = tmp_path / "frame.png"
    frame = Image.new("RGBA", (1024, 1024), (255, 128, 0, 40))
    frame.save(frame_path)

    source = Image.new("RGB", (1600, 900), (10, 120, 160))
    output = build_final_campaign_image(source, str(frame_path))

    result = Image.open(io.BytesIO(output))
    assert result.size == (1024, 1024)
    assert result.mode == "RGBA"
