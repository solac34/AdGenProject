from google.adk.agents.llm_agent import Agent


from google import genai
from google.cloud import storage
from google.oauth2 import service_account
import os
from pathlib import Path
from uuid import uuid4
from datetime import datetime
import io
from typing import List, Dict, Any
from MasterAgent.firestore_helper import get_firestore_client


def save_content_to_gcs(content: bytes, object_name: str, *, content_type: str = "application/octet-stream", bucket_name: str | None = None) -> str:
    """
    Save arbitrary content bytes to Google Cloud Storage.
    - bucket is resolved from env var GCS_CONTENT_BUCKET or defaults to 'ecommerce-ads-contents'
    - object_name supports folder paths, e.g. 'segmentation_location/image_0.jpg'
    Returns gs:// URI of the uploaded object.
    """
    
    bucket = bucket_name or os.getenv("GCS_CONTENT_BUCKET") or "ecommerce-ads-contents"
    
    # Use service account credentials from env if available
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_AI")
    if creds_path and os.path.exists(creds_path):
        credentials = service_account.Credentials.from_service_account_file(creds_path)
        client = storage.Client(credentials=credentials)
    else:
        client = storage.Client()
    
    bucket_obj = client.bucket(bucket)
    # Ensure a subfolder path is used and uniqueness if plain name provided
    if "/" not in object_name:
        # place inside folder with the given name for neat organization
        base = object_name.replace(".jpg", "")
        object_name = f"{base}/{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid4().hex}.jpg"
    blob = bucket_obj.blob(object_name)
    blob.upload_from_string(content, content_type=content_type)
    # Optionally you can make public or set cache-control later
    return f"gs://{bucket}/{object_name}"


def read_pairs_to_create_content():
    """
    Reads segmentation_location_pairs from Firestore and returns an array of [segmentation_result, location] pairs.
    Output: List of [segmentation_result, city] pairs. If not found, returns empty list.
    """
    db = get_firestore_client()
    doc_ref = db.collection('segmentation_location_pairs').document('latest')
    doc = doc_ref.get()
    pairs = []
    if doc.exists:
        data = doc.to_dict()
        raw_pairs = data.get("pairs", [])
        for item in raw_pairs:
            segm = item.get("segmentation_result")
            # Try city, fallback to main_location, fallback to user_location, fallback to country if city not present
            city = item.get("city")
            if not city:
                city = item.get("main_location") or item.get("user_location") or item.get("country", "")
            if segm is not None and city is not None:
                pairs.append([segm, city])
    return pairs


def create_marketing_image(
    prompt: str,
    *,
    number_of_images: int = 1,
    aspect_ratio: str = "1:1",
    output_dir: str = "generated",
    name: str = "segmentation_location",
):
    """
    Generate marketing image(s) using Google's Imagen through google-genai.

    Args:
        prompt: The generation prompt to guide the image.
        number_of_images: How many images to create (demo default 1).
        aspect_ratio: Imagen aspect ratio, e.g. \"1:1\", \"16:9\".
        output_dir: Directory to save images into.

    Returns:
        A list of saved image file paths.
    """
    # Use Vertex AI (project/location) to avoid 404s on the Imagen predict route
    project_id = (
        os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
        or os.environ.get("VERTEX_PROJECT")
        or os.environ.get("PROJECT_ID")
    )
    location = (
        os.environ.get("GOOGLE_CLOUD_LOCATION")
        or os.environ.get("VERTEX_LOCATION")
        or "us-central1"
    )
    if not project_id:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT (or GCLOUD_PROJECT/PROJECT_ID) is not set. "
            "Set your GCP project for Vertex AI image generation."
        )
    client = genai.Client(
        vertexai=True,
        project=project_id,
        location=location,
    )

    result = client.models.generate_images(
        model="publishers/google/models/imagen-4.0-generate-001",
        prompt=prompt,
        config=dict(
            number_of_images=number_of_images,
            output_mime_type="image/jpeg",
            person_generation="ALLOW_ALL",
            aspect_ratio=aspect_ratio,
            image_size="1K",
        ),
    )
    print("================================================")
    print(result)
    print("================================================")

    if not getattr(result, "generated_images", None):
        return []

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    saved_paths = []
    for n, generated_image in enumerate(result.generated_images):
        # Get image bytes directly from the response
        content_bytes = generated_image.image.image_bytes
        # Save to GCS with provided name (e.g., 'segmentation_location')
        gcs_uri = save_content_to_gcs(content_bytes, f"{name}_{n}.jpg", content_type="image/jpeg")
        saved_paths.append(gcs_uri)

    return saved_paths



def create_marketing_images_batch(items: List[Dict[str, Any]]):
    """
    Batch helper to generate multiple marketing images.
    Args:
        items: List of {"prompt": str, "name": str, optional overrides...}
    Returns:
        List of {"name": str, "uris": ["gs://..."] }
    """
    results = []
    for item in items or []:
        prompt = item.get("prompt", "").strip()
        name = item.get("name", "segmentation_location")
        if not prompt:
            results.append({"name": name, "uris": [], "error": "empty prompt"})
            continue
        uris = create_marketing_image(
            prompt=prompt,
            number_of_images=item.get("number_of_images", 1),
            aspect_ratio=item.get("aspect_ratio", "1:1"),
            output_dir=item.get("output_dir", "generated"),
            name=name,
        )
        results.append({"name": name, "uris": uris})
    return results





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
Your given input for each segmentation and location pair:
{"segmentation_result": "segmentation_result_1",
"location": "City, USA"}

YOUR SKILLS:
> You will use main  location to have a strategy on how to create content for the given segment.
> Use segment & location to create location and segment specific prompt. 
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

=== YOUR WORKFLOW ===
> WHEN MASTER AGENT TELLS YOU TO CREATE CONTENT FOR THE GIVEN SEGMENT TO WEBSITE:
1.read read_pairs_to_create_content tool to get the pairs to create content. 
2. for each pair in the array, use create_marketing_image tool to create a marketing image for the given pair. 
2.1. Follow the instructions for create_marketing_image tool to write the best prompt for the given pair.
2.2. provide the prompt to tool. 

"""


creative_agent = Agent(
    model='gemini-2.5-pro', 
    name='creative_agent',
    description=CREATIVE_AGENT_DESCRIPTION,
    instruction=CREATIVE_AGENT_INSTRUCTION,
    tools=[
    read_pairs_to_create_content,
    create_marketing_image,
    create_marketing_images_batch,
    create_marketing_video
    ],
)