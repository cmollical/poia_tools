"""
Configuration management for the chat agent.

This module handles loading API keys and other configuration settings
from environment variables or files.
"""

import os
from pathlib import Path
from typing import Optional, Dict, Any

# Default configuration
DEFAULT_CONFIG = {
    "api_version": "2025-01-01-preview",
    "model": "gpt-4o-mini-2024-07-18",
    "environment": "uat",  # "prod" or "uat"
    "max_history": 10,  # Number of messages to keep in history
}

# API endpoints
API_ENDPOINTS = {
    "prod": "https://athenagpt.tools.athenahealth.com/api/public/oai",
    "uat": "https://athenagpt-uat.tools.athenahealth.com/api/public/oai"
}

def read_api_key(cred_file_path: str) -> Optional[str]:
    """Read API key from credentials file.
    
    Args:
        cred_file_path: Path to the credentials file
        
    Returns:
        The API key if found, None otherwise
    """
    try:
        with open(cred_file_path, 'r') as f:
            for line in f:
                if line.strip():
                    try:
                        service, key = line.strip().split(':', 1)
                        if service.lower() == 'athenagpt':
                            return key.strip()
                    except ValueError:
                        continue
        return None
    except Exception as e:
        print(f"Error reading API key: {e}")
        return None

def load_config() -> Dict[str, Any]:
    """Load configuration from environment variables or default values.
    
    Returns:
        Dictionary containing configuration values
    """
    config = DEFAULT_CONFIG.copy()
    
    # Override from environment variables if present
    if os.environ.get("ATHENAGPT_API_VERSION"):
        config["api_version"] = os.environ.get("ATHENAGPT_API_VERSION")
    
    if os.environ.get("ATHENAGPT_MODEL"):
        config["model"] = os.environ.get("ATHENAGPT_MODEL")
    
    if os.environ.get("ATHENAGPT_ENVIRONMENT"):
        config["environment"] = os.environ.get("ATHENAGPT_ENVIRONMENT")
    
    if os.environ.get("ATHENAGPT_MAX_HISTORY"):
        config["max_history"] = int(os.environ.get("ATHENAGPT_MAX_HISTORY"))
    
    # Load API key - first check AGPT_API (user's environment variable)
    config["api_key"] = os.environ.get("AGPT_API")
    
    # If not found, check ATHENAGPT_API_KEY
    if not config["api_key"]:
        config["api_key"] = os.environ.get("ATHENAGPT_API_KEY")
    
    # If API key still not found, try to load from cred.txt
    if not config["api_key"]:
        script_dir = Path(__file__).parent.absolute()
        cred_file = script_dir / "cred.txt"
        config["api_key"] = read_api_key(cred_file)
    
    # Set the API endpoint based on environment
    config["api_endpoint"] = API_ENDPOINTS.get(
        config["environment"], 
        API_ENDPOINTS["uat"]
    )
    
    return config
