from pathlib import Path
from dotenv import load_dotenv
import fal_client

load_dotenv()


OUTPUT_FORMAT = "png"
NUM_IMAGES = 1
FAL_MODEL = "fal-ai/nano-banana/edit"
PROMPT = "Turn the guest into a comic stylised version of the supplied reference character"


class FalAPIClient:
    def generate_image(self, base_image: Path, ref_char_path: Path, prompt: str | None = None) -> str:
        base_image_url = fal_client.upload_file(base_image)
        ref_char_url = fal_client.upload_file(ref_char_path)

        result = fal_client.subscribe(
            FAL_MODEL,
            arguments={
                "prompt": prompt or PROMPT,
                "num_images": NUM_IMAGES,
                "output_format": OUTPUT_FORMAT,
                "image_urls": [base_image_url, ref_char_url],      
            },
            with_logs=True,
            on_queue_update=lambda status: print(f"Status: {status}")
        )

        return result["images"][0]["url"]

# import { fal } from "@fal-ai/client";

# const result = await fal.subscribe("fal-ai/imageutils/rembg", {
#   input: {
#     image_url: "https://storage.googleapis.com/falserverless/model_tests/remove_background/elephant.jpg"
#   },
#   logs: true,
#   onQueueUpdate: (update) => {
#     if (update.status === "IN_PROGRESS") {
#       update.logs.map((log) => log.message).forEach(console.log);
#     }
#   },
# });
# console.log(result.data);
# console.log(result.requestId);