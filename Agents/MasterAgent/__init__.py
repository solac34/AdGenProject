import sys
import os
from pathlib import Path

# Add parent directory to path for cross-agent imports
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from .agent import master_agent, root_agent