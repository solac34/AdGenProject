#!/usr/bin/env python3
"""
Main entry point for AdGen Agents Cloud Run deployment.
This file serves the MasterAgent (which includes sub-agents) via ADK API server.
"""

import os
import sys
from pathlib import Path

# Add the current directory to Python path for imports
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Import the root agent (MasterAgent with all sub-agents)
from MasterAgent.agent import root_agent

# Verify that sub-agents are properly loaded
print(f"🤖 Root Agent: {root_agent.name}")
print(f"📊 Sub-agents: {[agent.name for agent in root_agent.sub_agents]}")

# Environment configuration
def setup_environment():
    """Setup environment variables for Cloud Run deployment."""
    
    # Set default values if not provided
    if not os.getenv('GOOGLE_CLOUD_PROJECT'):
        # This should be set via Cloud Run environment variables
        print("Warning: GOOGLE_CLOUD_PROJECT not set")
    
    if not os.getenv('GOOGLE_CLOUD_LOCATION'):
        os.environ['GOOGLE_CLOUD_LOCATION'] = 'us-central1'
    
    # Enable Vertex AI by default for Cloud Run
    if not os.getenv('GOOGLE_GENAI_USE_VERTEXAI'):
        os.environ['GOOGLE_GENAI_USE_VERTEXAI'] = 'True'
    
    # Set port for Cloud Run (default 8080)
    port = int(os.getenv('PORT', 8080))
    os.environ['ADK_PORT'] = str(port)
    
    # Clear any file-based credential paths that might interfere with Cloud Run's default service account
    # This prevents the "File not found" error for local credential files
    if 'GOOGLE_APPLICATION_CREDENTIALS' in os.environ and not os.path.exists(os.environ['GOOGLE_APPLICATION_CREDENTIALS']):
        print(f"⚠️ Removing invalid GOOGLE_APPLICATION_CREDENTIALS path: {os.environ['GOOGLE_APPLICATION_CREDENTIALS']}")
        del os.environ['GOOGLE_APPLICATION_CREDENTIALS']
    
    print(f"🚀 Starting AdGen Agents on port {port}")
    print(f"📍 Project: {os.getenv('GOOGLE_CLOUD_PROJECT', 'Not set')}")
    print(f"🌍 Location: {os.getenv('GOOGLE_CLOUD_LOCATION', 'Not set')}")
    print(f"🤖 Using Vertex AI: {os.getenv('GOOGLE_GENAI_USE_VERTEXAI', 'False')}")
    print(f"🔐 Auth: {'Default Service Account (ADC)' if not os.getenv('GOOGLE_APPLICATION_CREDENTIALS') else 'Service Account Key'}")

def main():
    """Main function to start the ADK server."""
    setup_environment()
    
    # Import ADK server after environment setup
    from google.adk.server import start_server
    
    # Start the ADK server with the root agent
    start_server(
        agent=root_agent,
        port=int(os.getenv('PORT', 8080)),
        host='0.0.0.0'  # Required for Cloud Run
    )

if __name__ == '__main__':
    main()
