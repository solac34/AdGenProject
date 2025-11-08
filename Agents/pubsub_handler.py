#!/usr/bin/env python3
"""
Pub/Sub message handler for AdGen Agents.
This module handles incoming Pub/Sub push messages and triggers the MasterAgent.
"""

import os
import json
import base64
import logging
from typing import Dict, Any, Optional
from flask import Flask, request, jsonify
from google.cloud import pubsub_v1
from google.auth import default

# Import the root agent
from MasterAgent.agent import root_agent

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PubSubHandler:
    """Handles Pub/Sub messages and triggers the MasterAgent."""
    
    def __init__(self):
        self.agent = root_agent
        self.project_id = os.getenv('GOOGLE_CLOUD_PROJECT')
        
        if not self.project_id:
            logger.warning("GOOGLE_CLOUD_PROJECT not set, some features may not work")
    
    def decode_pubsub_message(self, envelope: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Decode a Pub/Sub push message envelope.
        
        Args:
            envelope: The Pub/Sub push message envelope
            
        Returns:
            Decoded message data or None if decoding fails
        """
        try:
            # Extract the message from the envelope
            if 'message' not in envelope:
                logger.error("No 'message' field in envelope")
                return None
            
            message = envelope['message']
            
            # Decode the base64-encoded data
            if 'data' in message:
                data = base64.b64decode(message['data']).decode('utf-8')
                try:
                    # Try to parse as JSON
                    decoded_data = json.loads(data)
                except json.JSONDecodeError:
                    # If not JSON, treat as plain text
                    decoded_data = {"message": data}
            else:
                decoded_data = {"message": "Empty message"}
            
            # Add message attributes if present
            if 'attributes' in message:
                decoded_data['attributes'] = message['attributes']
            
            # Add message metadata
            decoded_data['messageId'] = message.get('messageId', 'unknown')
            decoded_data['publishTime'] = message.get('publishTime', 'unknown')
            
            return decoded_data
            
        except Exception as e:
            logger.error(f"Error decoding Pub/Sub message: {str(e)}")
            return None
    
    def process_message(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a decoded Pub/Sub message with the MasterAgent.
        
        Args:
            message_data: Decoded message data
            
        Returns:
            Processing result
        """
        try:
            logger.info(f"Processing message: {message_data.get('messageId', 'unknown')}")
            
            # Create a prompt for the MasterAgent based on the message
            prompt = self._create_agent_prompt(message_data)
            
            # Execute the agent with the prompt
            result = self.agent.run(prompt)
            
            logger.info(f"Agent execution completed for message: {message_data.get('messageId', 'unknown')}")
            
            return {
                "status": "success",
                "messageId": message_data.get('messageId', 'unknown'),
                "result": result,
                "processed_at": message_data.get('publishTime', 'unknown')
            }
            
        except Exception as e:
            logger.error(f"Error processing message: {str(e)}")
            return {
                "status": "error",
                "messageId": message_data.get('messageId', 'unknown'),
                "error": str(e)
            }
    
    def _create_agent_prompt(self, message_data: Dict[str, Any]) -> str:
        """
        Create a prompt for the MasterAgent based on the Pub/Sub message.
        
        Args:
            message_data: Decoded message data
            
        Returns:
            Formatted prompt for the agent
        """
        # Extract the main message
        main_message = message_data.get('message', 'No message content')
        
        # Check for specific trigger patterns or use default
        if isinstance(main_message, str):
            if 'segmentation' in main_message.lower() or 'segment' in main_message.lower():
                return "Please perform user segmentation analysis. Do your task."
            elif 'analytics' in main_message.lower() or 'analysis' in main_message.lower():
                return "Please perform data analytics. Do your task."
            else:
                return f"Process this request: {main_message}. Do your task."
        else:
            # If message is structured data, extract relevant information
            if isinstance(main_message, dict):
                task_type = main_message.get('task', 'general')
                if task_type == 'segmentation':
                    return "Please perform user segmentation analysis. Do your task."
                elif task_type == 'analytics':
                    return "Please perform data analytics. Do your task."
                else:
                    return f"Process this request: {json.dumps(main_message)}. Do your task."
            
            return "Please perform your default task. Do your task."

# Create Flask app for Pub/Sub push endpoint
def create_pubsub_app() -> Flask:
    """Create Flask app with Pub/Sub push endpoint."""
    
    app = Flask(__name__)
    handler = PubSubHandler()
    
    @app.route('/pubsub/push', methods=['POST'])
    def pubsub_push():
        """Handle Pub/Sub push messages."""
        try:
            # Verify the request is from Pub/Sub
            if not request.is_json:
                logger.error("Request is not JSON")
                return jsonify({"error": "Request must be JSON"}), 400
            
            envelope = request.get_json()
            if not envelope:
                logger.error("Empty request body")
                return jsonify({"error": "Empty request body"}), 400
            
            # Decode the message
            message_data = handler.decode_pubsub_message(envelope)
            if not message_data:
                logger.error("Failed to decode message")
                return jsonify({"error": "Failed to decode message"}), 400
            
            # Process the message
            result = handler.process_message(message_data)
            
            # Return success response (Pub/Sub expects 2xx status)
            return jsonify(result), 200
            
        except Exception as e:
            logger.error(f"Error in pubsub_push endpoint: {str(e)}")
            return jsonify({"error": str(e)}), 500
    
    @app.route('/health', methods=['GET'])
    def health_check():
        """Health check endpoint."""
        return jsonify({
            "status": "healthy",
            "service": "adgen-agents",
            "pubsub_ready": True
        }), 200
    
    @app.route('/', methods=['GET'])
    def root():
        """Root endpoint with service information."""
        return jsonify({
            "service": "AdGen Agents",
            "version": "1.0.0",
            "endpoints": {
                "pubsub_push": "/pubsub/push",
                "health": "/health",
                "adk_ui": "/ui"
            },
            "description": "AdGen Agents with Pub/Sub integration"
        }), 200
    
    return app

# Export the handler for use in other modules
pubsub_handler = PubSubHandler()
