"""
Configuration module for AdGen Agents.
Handles environment variables and default settings.
"""

import os
from typing import Optional

class Config:
    """Configuration class for AdGen Agents."""
    
    # Google Cloud Configuration
    GOOGLE_CLOUD_PROJECT: str = os.getenv('GOOGLE_CLOUD_PROJECT', '')
    GOOGLE_CLOUD_LOCATION: str = os.getenv('GOOGLE_CLOUD_LOCATION', 'us-central1')
    
    # Authentication
    GOOGLE_GENAI_USE_VERTEXAI: bool = os.getenv('GOOGLE_GENAI_USE_VERTEXAI', 'True').lower() == 'true'
    GOOGLE_API_KEY: Optional[str] = os.getenv('GOOGLE_API_KEY')
    
    # Cloud Run Configuration
    PORT: int = int(os.getenv('PORT', 8080))
    
    # BigQuery Configuration
    BQ_DATASET: str = os.getenv('BQ_DATASET', 'adgen_bq')
    BQ_LOCATION: str = os.getenv('BQ_LOCATION', 'US')
    
    # Firestore Configuration
    FIRESTORE_DATABASE: str = os.getenv('FIRESTORE_DATABASE', '(default)')
    
    # ADK Configuration
    ADK_DEBUG: bool = os.getenv('ADK_DEBUG', 'False').lower() == 'true'
    ADK_LOG_LEVEL: str = os.getenv('ADK_LOG_LEVEL', 'INFO')
    
    @classmethod
    def validate(cls) -> bool:
        """Validate required configuration."""
        if not cls.GOOGLE_CLOUD_PROJECT:
            print("❌ GOOGLE_CLOUD_PROJECT is required")
            return False
        
        if cls.GOOGLE_GENAI_USE_VERTEXAI:
            print("✅ Using Vertex AI for authentication")
        elif cls.GOOGLE_API_KEY:
            print("✅ Using API key for authentication")
        else:
            print("❌ Either GOOGLE_GENAI_USE_VERTEXAI=True or GOOGLE_API_KEY must be set")
            return False
        
        return True
    
    @classmethod
    def print_config(cls):
        """Print current configuration (without sensitive data)."""
        print("🔧 AdGen Agents Configuration:")
        print(f"   Project: {cls.GOOGLE_CLOUD_PROJECT}")
        print(f"   Location: {cls.GOOGLE_CLOUD_LOCATION}")
        print(f"   Port: {cls.PORT}")
        print(f"   Using Vertex AI: {cls.GOOGLE_GENAI_USE_VERTEXAI}")
        print(f"   BQ Dataset: {cls.BQ_DATASET}")
        print(f"   Debug Mode: {cls.ADK_DEBUG}")

# Global config instance
config = Config()
