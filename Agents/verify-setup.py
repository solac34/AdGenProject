#!/usr/bin/env python3
"""
Setup verification script for AdGen Agents.
Run this script to verify that your setup is ready for Cloud Run deployment.
"""

import os
import sys
import subprocess
from pathlib import Path

def check_command(command: str) -> bool:
    """Check if a command is available."""
    try:
        subprocess.run([command, '--version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def check_file(file_path: str) -> bool:
    """Check if a file exists."""
    return Path(file_path).exists()

def check_env_var(var_name: str) -> str:
    """Check if an environment variable is set."""
    return os.getenv(var_name, '')

def main():
    """Main verification function."""
    print("🔍 AdGen Agents Setup Verification")
    print("=" * 40)
    
    all_good = True
    
    # Check required files
    print("\n📁 Checking required files...")
    required_files = [
        'main.py',
        'requirements.txt',
        'Dockerfile',
        'MasterAgent/agent.py',
        'MasterAgent/__init__.py',
        'DataAnalyticAgent/agent.py',
        'DataAnalyticAgent/__init__.py',
        'CreativeAgent/agent.py',
        'CreativeAgent/__init__.py',
    ]
    
    for file_path in required_files:
        if check_file(file_path):
            print(f"   ✅ {file_path}")
        else:
            print(f"   ❌ {file_path} - Missing!")
            all_good = False
    
    # Check required commands
    print("\n🛠️  Checking required commands...")
    commands = {
        'python': 'Python interpreter',
        'gcloud': 'Google Cloud CLI',
        'docker': 'Docker (optional, for local testing)',
    }
    
    for cmd, description in commands.items():
        if check_command(cmd):
            print(f"   ✅ {cmd} - {description}")
        else:
            print(f"   ❌ {cmd} - {description} - Not found!")
            if cmd in ['python', 'gcloud']:
                all_good = False
    
    # Check ADK installation
    print("\n🤖 Checking ADK installation...")
    try:
        import google.adk
        print("   ✅ google-adk - ADK library installed")
    except ImportError:
        print("   ❌ google-adk - Not installed! Run: pip install google-adk")
        all_good = False
    
    # Check environment variables
    print("\n🔧 Checking environment variables...")
    env_vars = {
        'GOOGLE_CLOUD_PROJECT': 'Required - Your GCP project ID',
        'GOOGLE_CLOUD_LOCATION': 'Optional - Defaults to us-central1',
        'GOOGLE_GENAI_USE_VERTEXAI': 'Optional - Defaults to True',
    }
    
    for var, description in env_vars.items():
        value = check_env_var(var)
        if value:
            print(f"   ✅ {var}={value}")
        else:
            if var == 'GOOGLE_CLOUD_PROJECT':
                print(f"   ❌ {var} - {description}")
                all_good = False
            else:
                print(f"   ⚠️  {var} - {description}")
    
    # Check Python imports
    print("\n🐍 Checking Python imports...")
    try:
        sys.path.insert(0, str(Path.cwd()))
        from MasterAgent.agent import root_agent
        print("   ✅ MasterAgent imports successfully")
        print(f"   ✅ Root agent: {root_agent.name}")
    except Exception as e:
        print(f"   ❌ Import error: {e}")
        all_good = False
    
    # Check gcloud authentication
    print("\n🔐 Checking gcloud authentication...")
    try:
        result = subprocess.run(
            ['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'],
            capture_output=True, text=True, check=True
        )
        if result.stdout.strip():
            print(f"   ✅ Authenticated as: {result.stdout.strip()}")
        else:
            print("   ❌ Not authenticated! Run: gcloud auth login")
            all_good = False
    except subprocess.CalledProcessError:
        print("   ❌ gcloud authentication check failed")
        all_good = False
    
    # Final result
    print("\n" + "=" * 40)
    if all_good:
        print("🎉 All checks passed! You're ready to deploy.")
        print("\nNext steps:")
        print("1. Set GOOGLE_CLOUD_PROJECT if not already set")
        print("2. Run ./deploy-adk.sh (recommended) or ./deploy.sh")
    else:
        print("❌ Some checks failed. Please fix the issues above before deploying.")
        return 1
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
