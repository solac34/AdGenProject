# AdGen Agents Package
# This file makes the Agents directory a Python package and exports the root agent

import sys
import os
from pathlib import Path

# Add the current directory to Python path for imports
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Import the root agent from MasterAgent
from MasterAgent.agent import root_agent

# Export the root agent for ADK CLI deployment
__all__ = ['root_agent']
