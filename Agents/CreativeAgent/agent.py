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
    - bucket is resolved from env var GCS_EC_BUCKET_NAME (or GCS_CONTENT_BUCKET for backward compatibility)
      and defaults to 'ecommerce-ad-contents'
    - object_name supports folder paths, e.g. 'segmentation_location/image_0.jpg'
    Returns a public HTTPS URL if possible (or a signed URL), else gs:// URI.
    """
    
    bucket = (
        bucket_name
        or os.getenv("GCS_EC_BUCKET_NAME")
        or os.getenv("GCS_CONTENT_BUCKET")
        or "ecommerce-ad-contents"
    )
    
    # Try environment-based service account JSON first (Cloud Run compatible)
    sa_json = os.getenv('GCP_SERVICE_ACCOUNT_JSON') or os.getenv('GCP_SERVICE_ACCOUNT_JSON_BQ')
    if sa_json:
        try:
            import json
            import base64
            info = json.loads(sa_json) if sa_json.strip().startswith('{') else json.loads(base64.b64decode(sa_json).decode('utf-8'))
            credentials = service_account.Credentials.from_service_account_info(
                info,
                scopes=[
                    'https://www.googleapis.com/auth/cloud-platform',
                    'https://www.googleapis.com/auth/devstorage.read_write',
                ],
            )
            client = storage.Client(credentials=credentials)
        except Exception:
            # Fall back to default ADC
            client = storage.Client()
    else:
        # Fallback to file-based credentials or default ADC
        creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_AI")
        if creds_path and os.path.exists(creds_path):
            credentials = service_account.Credentials.from_service_account_file(creds_path)
            client = storage.Client(credentials=credentials)
        else:
            # Use default ADC (Application Default Credentials)
            client = storage.Client()
    
    bucket_obj = client.bucket(bucket)
    # Ensure a subfolder path is used and uniqueness if plain name provided
    if "/" not in object_name:
        # place inside folder with the given name for neat organization
        base = object_name.replace(".jpg", "")
        object_name = f"{base}/{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid4().hex}.jpg"
    blob = bucket_obj.blob(object_name)
    blob.upload_from_string(content, content_type=content_type)
    # Try to make the object publicly accessible and return its public URL.
    try:
        blob.make_public()
        return blob.public_url
    except Exception:
        # Fallback: signed URL (7 days). If this fails, return gs:// URI.
        try:
            return blob.generate_signed_url(expiration=3600 * 24 * 7, method="GET")
        except Exception:
            return f"gs://{bucket}/{object_name}"


def read_segmentations_to_generate(limit: int = 50):
    """
    Read 'segmentations' collection and return items with empty imageUrl.
    Output: List[Dict] having: segmentation_name, city, country, doc_id, name
    - doc_id is a normalized 'segmentation_city_country' (underscores)
    - name is used for grouping objects in GCS
    """
    def normalize(s: str) -> str:
        return str(s).strip().replace("/", "_").replace("\\", "_").replace(",", "").replace(" ", "_")

        
    db = get_firestore_client()
    col = db.collection('segmentations')
    # Fetch a page and filter locally for simplicity
    docs = col.limit(limit).stream()
    items: List[Dict[str, Any]] = []
    for d in docs:
        data = d.to_dict() or {}
        seg_name = data.get("segmentation_name") or data.get("segmentation") or ""
        city = data.get("city") or ""
        country = data.get("country") or ""
        image_url = data.get("imageUrl") or ""
        if not seg_name or not city:
            continue
        if image_url:
            continue
        # Use underscore-based ID format for consistency with API
        doc_id = f"{normalize(seg_name)}_{normalize(city)}_{normalize(country)}"
        name = f"{normalize(seg_name)}_{normalize(city)}_{normalize(country)}"
        items.append({"segmentation_name": seg_name, "city": city, "country": country, "doc_id": doc_id, "name": name})
    return items


def create_marketing_image(
    prompt: str,
    *,
    number_of_images: int = 1,
    aspect_ratio: str = "16:9",
    output_dir: str = "generated",
    name: str = "segmentation_location",
    object_name: str | None = None,
):
    """
    Generate marketing image(s) using Google's Imagen through google-genai.

    Args:
        prompt: The generation prompt to guide the image.
        number_of_images: How many images to create (demo default 1).
        aspect_ratio: Imagen aspect ratio, e.g. \"16:9\".
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
        # Save to GCS using provided nested object path if present
        target_object = object_name or f"{name}/{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid4().hex}_{n}.jpg"
        gcs_uri = save_content_to_gcs(content_bytes, target_object, content_type="image/jpeg")
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
    def norm_folder(s: str) -> str:
        return str(s or "").strip().replace("/", "_").replace("\\", "_").replace(" ", "_")

    results = []
    for item in items or []:
        prompt = item.get("prompt", "").strip()
        name = item.get("name", "segmentation_location")
        segmentation_name = item.get("segmentation_name", "") or item.get("segmentation_result", "")
        city = item.get("city", "")
        country = item.get("country", "")
        # Build nested folder path following rule in DataAnalyticAgent (line ~609)
        # segmentation parts are split by '-' and appended sequentially as folders
        seg_parts = [p.strip() for p in str(segmentation_name).split("-") if p.strip()]
        nested_parts = seg_parts + ([norm_folder(country)] if country else []) + ([norm_folder(city)] if city else [])
        base_prefix = "/".join(nested_parts)
        # Final object path under the deepest folder
        object_name = f"{base_prefix}/{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid4().hex}.jpg"
        if not prompt:
            results.append({"name": name, "uris": [], "error": "empty prompt"})
            continue
        uris = create_marketing_image(
            prompt=prompt,
            number_of_images=item.get("number_of_images", 1),
            aspect_ratio=item.get("aspect_ratio", "16:9"),
            output_dir=item.get("output_dir", "generated"),
            name=name,
            object_name=object_name,
        )
        # Assign back to Firestore if doc_id provided
        try:
            doc_id = item.get("doc_id")
            if doc_id and uris:
                db = get_firestore_client()
                seg_doc = db.collection("segmentations").document(str(doc_id))
                payload = {
                    "imageUrl": uris[0],
                    "updated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                }
                for k in ("segmentation_name", "city", "country"):
                    if item.get(k):
                        payload[k] = item[k]
                seg_doc.set(payload, merge=True)
        except Exception as e:
            results.append({"name": name, "uris": uris, "warning": f"firestore_update_failed: {e}"})
            continue
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
1. use 16:9 aspect ratio (e.g., 1920x1080).
2. This ad will be seen as a banner ad in the main page of the website.
3. When user sees this ad, user must want to buy products and spend more money.

=== YOUR WORKFLOW ===
> WHEN MASTER AGENT TELLS YOU TO CREATE CONTENT FOR THE GIVEN SEGMENT TO WEBSITE:
1. Use read_segmentations_to_generate to list segmentations missing imageUrl from the 'segmentations' collection.
2. For each item, craft a detailed prompt and call create_marketing_image (16:9, 1K).
3. Provide doc_id when calling create_marketing_images_batch so the generated image URL is written back to 'segmentations/<doc_id>.imageUrl'.

"""


creative_agent = Agent(
    model='gemini-2.5-pro', 
    name='creative_agent',
    description=CREATIVE_AGENT_DESCRIPTION,
    instruction=CREATIVE_AGENT_INSTRUCTION,
    tools=[
    read_segmentations_to_generate,
    create_marketing_image,
    create_marketing_images_batch,
    create_marketing_video
    ],
)