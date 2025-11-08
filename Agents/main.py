#!/usr/bin/env python3
"""
Main entry point for AdGen Agents Cloud Run deployment.
This file serves the MasterAgent (which includes sub-agents) via ADK API server
and provides Pub/Sub push endpoint integration.
"""

import os
import sys
import json
import base64
import logging
from pathlib import Path
from flask import Flask, request, jsonify

# Add the current directory to Python path for imports
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Import the root agent (MasterAgent with all sub-agents)
from MasterAgent.agent import root_agent

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Verify that sub-agents are properly loaded
print(f"🤖 Root Agent: {root_agent.name}")
print(f"📊 Sub-agents: {[agent.name for agent in root_agent.sub_agents]}")
print(f"🔔 Pub/Sub integration: Enabled")

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

def start_pubsub_server():
    """Start the Pub/Sub Flask server in a separate thread."""
    try:
        pubsub_app = create_pubsub_app()
        pubsub_port = int(os.getenv('PUBSUB_PORT', 8081))
        print(f"🔔 Starting Pub/Sub server on port {pubsub_port}")
        pubsub_app.run(host='0.0.0.0', port=pubsub_port, debug=False, use_reloader=False)
    except Exception as e:
        print(f"❌ Error starting Pub/Sub server: {e}")

def main():
    """Main function to start both ADK and Pub/Sub servers."""
    setup_environment()
    
    # Check if we should run in Pub/Sub only mode
    pubsub_only = os.getenv('PUBSUB_ONLY', 'false').lower() == 'true'
    
    if pubsub_only:
        print("🔔 Running in Pub/Sub only mode")
        start_pubsub_server()
    else:
        print("🚀 Running in hybrid mode (ADK + Pub/Sub)")
        
        # Start Pub/Sub server in a separate thread
        pubsub_thread = threading.Thread(target=start_pubsub_server, daemon=True)
        pubsub_thread.start()
        
        # Import ADK server after environment setup
        from google.adk.server import start_server
        
        # Start the ADK server with the root agent (main thread)
        start_server(
            agent=root_agent,
            port=int(os.getenv('PORT', 8080)),
            host='0.0.0.0'  # Required for Cloud Run
        )

if __name__ == '__main__':
    main()
