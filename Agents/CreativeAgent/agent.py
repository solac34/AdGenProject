from google.adk.agents.llm_agent import Agent
from google import genai
import os
from pathlib import Path


def create_marketing_image(
    prompt: str,
    *,
    number_of_images: int = 1,
    aspect_ratio: str = "1:1",
    image_size: str = "1K",
    output_dir: str = "generated",
):
    """
    Generate marketing image(s) using Google's Imagen through google-genai.

    Args:
        prompt: The generation prompt to guide the image.
        number_of_images: How many images to create (demo default 1).
        aspect_ratio: Imagen aspect ratio, e.g. \"1:1\", \"16:9\".
        image_size: Imagen size label, e.g. \"1K\", \"2K\".
        output_dir: Directory to save images into.

    Returns:
        A list of saved image file paths.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set.")

    client = genai.Client(api_key=api_key)

    result = client.models.generate_images(
        model="models/imagen-4.0-generate-001",
        prompt=prompt,
        config=dict(
            number_of_images=number_of_images,
            output_mime_type="image/jpeg",
            person_generation="ALLOW_ALL",
            aspect_ratio=aspect_ratio,
            image_size=image_size,
        ),
    )

    if not getattr(result, "generated_images", None):
        return []

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    saved_paths = []
    for n, generated_image in enumerate(result.generated_images):
        # Result object exposes a PIL image via .image
        path = out_dir / f"marketing_image_{n}.jpg"
        generated_image.image.save(path.as_posix())
        saved_paths.append(path.as_posix())

    return saved_paths




def create_marketing_video(prompt: str):
    """
    Creates a marketing video for the adgen e-commerce project. Aspect ratio is the aspect ratio of the video.
    """
    return "video"



CREATIVE_AGENT_DESCRIPTION = """
Creative agent. Creates content for the adgen project.
"""


CREATIVE_AGENT_INSTRUCTION = """
You are the Creative Agent for the AdGen project. You are responsible for creating content for the adgen project.

You will be given a segmentation by master agent and you will write a detailed, engaging, creative and marketingly valuable prompt for the given segment to create content.
Your given input for each user:

{"user_id": "user_123",
"segmentation": "segmentation_result_1",
"main_location": "City, USA",
"target_location": "City,France"}

YOUR SKILLS:
> You will blend main and target location to have a strategy on how to create content for the given segment.
> Use segment & locations to create location and segment specific prompt. 
> Write the prompt using all details and write every single detail. 

A. If master agent asks you to create an ad for e-commerce website:
> This ad for adg-ecommerce.com website, websites details are given below:
1.Selling products from different categories.
2. Products are: electronics, clothing, home & kitchen, sports & outdoors, books, beauty, toys, automotive, and more.
3. Use users segmentation to magnet user to buy products and spend more money. 
4. User may have more than one segmentation, blend them the best way possible. 

INSTRUCTIONS:
1. use 1024x1024 resolution.
2. This ad will be seen as a banner ad in the main page of the website.
3. When user sees this ad, user must want to buy products and spend more money.


"""


creative_agent = Agent(
    model='gemini-2.5-pro', 
    name='creative_agent',
    description=CREATIVE_AGENT_DESCRIPTION,
    instruction=CREATIVE_AGENT_INSTRUCTION,
    tools=[
    create_marketing_image, 
    create_marketing_video
    ],
)