from PIL import Image


def _trim_to_alpha(image: Image.Image, padding: int = 0) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.split()[3]
    bbox = alpha.getbbox()
    if not bbox:
        return image
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    return image.crop((left, top, right, bottom))


def build_composite_image(center: Image.Image, left: Image.Image, right: Image.Image) -> Image.Image:
    center = _trim_to_alpha(center, padding=6)
    left = _trim_to_alpha(left, padding=6)
    right = _trim_to_alpha(right, padding=6)

    target_height = center.height

    def resize_to_height(image: Image.Image, height: int) -> Image.Image:
        if image.height == height:
            return image
        width = int(image.width * (height / image.height))
        return image.resize((width, height), Image.LANCZOS)

    left = resize_to_height(left, target_height)
    right = resize_to_height(right, target_height)
    center = resize_to_height(center, target_height)

    left_overlap = int(center.width * 0.45)
    right_overlap = int(center.width * 0.55)
    canvas_width = left.width + center.width + right.width - left_overlap - right_overlap
    canvas_height = target_height

    canvas = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))

    top = 0
    left_x = 0
    center_x = left.width - left_overlap
    right_x = center_x + center.width - right_overlap

    # Draw left and right behind, center on top
    canvas.alpha_composite(left, (left_x, top))
    canvas.alpha_composite(right, (right_x, top))
    canvas.alpha_composite(center, (center_x, top))

    return canvas
