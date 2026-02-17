from pathlib import Path

from dotenv import load_dotenv
import fal_client

load_dotenv()


OUTPUT_FORMAT = "png"
NUM_IMAGES = 1
FAL_MODEL = "fal-ai/nano-banana/edit"
ASPECT_RATIO = "1:1"

LOCKED_PROMPT = """Transform the person in the uploaded photo into a photorealistic classic 1970s firefighter portrait.
Preserve facial identity while changing clothing and styling.
Use an outfit palette inspired by Encephalitis International campaign colors: warm orange, deep navy, and light cream accents.
Apply the nostalgic treatment directly in the generated image: subtle film grain, warm faded color grading, soft contrast, and a slight vintage haze.
No logos or text.
No collage or mixed-media effects.
Return a single high-quality portrait image."""


class FalAPIClient:
    def generate_firefighter_image(self, source_path: Path) -> str:
        source_url = fal_client.upload_file(source_path)

        result = fal_client.subscribe(
            FAL_MODEL,
            arguments={
                "prompt": LOCKED_PROMPT,
                "num_images": NUM_IMAGES,
                "aspect_ratio": ASPECT_RATIO,
                "output_format": OUTPUT_FORMAT,
                "image_urls": [source_url],
            },
            with_logs=True,
            on_queue_update=lambda status: print(f"Status: {status}"),
        )

        return result["images"][0]["url"]
