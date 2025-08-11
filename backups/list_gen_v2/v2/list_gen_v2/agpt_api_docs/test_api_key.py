#!/usr/bin/env python3
"""
API Key Test Script for athenaGPT

This script tests whether the provided API key for athenaGPT is valid
by making a simple request to the API.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

try:
    from openai import AzureOpenAI
    from openai.types.error import APIError, APIConnectionError, AuthenticationError
except ImportError:
    print("Error: The 'openai' package is not installed.")
    print("Please install it using: pip install openai")
    sys.exit(1)

# ANSI color codes for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
BOLD = "\033[1m"
RESET = "\033[0m"

# API endpoints
ENDPOINTS = {
    "prod": "https://athenagpt.tools.athenahealth.com/api/public/oai",
    "uat": "https://athenagpt-uat.tools.athenahealth.com/api/public/oai"
}

def print_header(title):
    """Print a formatted header."""
    print(f"\n{BLUE}{BOLD}{'=' * 60}{RESET}")
    print(f"{BLUE}{BOLD} {title}{RESET}")
    print(f"{BLUE}{BOLD}{'=' * 60}{RESET}\n")

def print_success(message):
    """Print a success message."""
    print(f"{GREEN}{BOLD}✅ {message}{RESET}")

def print_error(message):
    """Print an error message."""
    print(f"{RED}{BOLD}❌ {message}{RESET}")

def print_warning(message):
    """Print a warning message."""
    print(f"{YELLOW}{BOLD}⚠️ {message}{RESET}")

def print_info(message):
    """Print an info message."""
    print(f"{BLUE}{BOLD}ℹ️ {message}{RESET}")

def read_api_key(cred_file):
    """Read API key from credentials file."""
    try:
        with open(cred_file, 'r') as f:
            for line in f:
                if line.strip():
                    try:
                        service, key = line.strip().split(':', 1)
                        if service.lower() == 'athenagpt':
                            return key.strip()
                    except ValueError:
                        print_warning(f"Invalid line format in {cred_file}: {line.strip()}")
                        print_info("Expected format: 'athenagpt:<your-api-key>'")
        
        print_error(f"No athenaGPT API key found in {cred_file}")
        print_info("Make sure the file contains a line with format: 'athenagpt:<your-api-key>'")
        return None
    except FileNotFoundError:
        print_error(f"Credentials file not found: {cred_file}")
        return None
    except Exception as e:
        print_error(f"Error reading credentials file: {e}")
        return None

def test_api_key(api_key, environment="prod", verbose=False):
    """Test if the API key is valid by making a simple request."""
    endpoint = ENDPOINTS.get(environment, ENDPOINTS["prod"])
    
    print_info(f"Testing API key against {environment} environment")
    print_info(f"Endpoint: {endpoint}")
    print_info(f"API Key: {api_key[:5]}...{api_key[-5:]} (masked for security)")
    print_info(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        client = AzureOpenAI(
            api_version='2025-01-01-preview',
            api_key=api_key,
            azure_endpoint=endpoint,
        )
        
        # Make a simple request
        print_info("Sending test request...")
        completion = client.chat.completions.create(
            model='gpt-4o-mini-2024-07-18',
            messages=[
                {
                    "role": "user",
                    "content": "Hello, this is a test message. Please respond with a single word.",
                },
            ],
            max_tokens=10  # Limit response size for testing
        )
        
        # If we get here, the API key is valid
        print_success("API key is valid!")
        print_info("Response preview:")
        print(f"{BLUE}{completion.choices[0].message.content}{RESET}")
        
        if verbose:
            print_info("Full API response:")
            print(json.dumps(completion.model_dump(), indent=2))
            
        return True
    except AuthenticationError as e:
        print_error(f"Authentication failed: Invalid API key")
        print_info("Please check your API key and make sure it's correctly formatted")
        if verbose:
            print_info(f"Error details: {e}")
        return False
    except APIConnectionError as e:
        print_error(f"Connection error: Could not connect to the API")
        print_info("Please check your internet connection and try again")
        if verbose:
            print_info(f"Error details: {e}")
        return False
    except APIError as e:
        print_error(f"API error: {e}")
        if "401" in str(e):
            print_info("This appears to be an authentication issue. Your API key may be invalid or expired.")
        elif "404" in str(e):
            print_info("The requested endpoint or model was not found. The API endpoint may be incorrect.")
        elif "429" in str(e):
            print_info("Rate limit exceeded. Please try again later.")
        if verbose:
            print_info(f"Error details: {e}")
        return False
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        if verbose:
            import traceback
            print_info("Traceback:")
            print(traceback.format_exc())
        return False

def main():
    parser = argparse.ArgumentParser(description="Test athenaGPT API key")
    parser.add_argument("--env", choices=["prod", "uat"], default="prod",
                        help="Environment to test against (prod or uat)")
    parser.add_argument("--cred-file", default=None,
                        help="Path to credentials file (default: cred.txt in script directory)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="Enable verbose output")
    
    args = parser.parse_args()
    
    print_header("athenaGPT API Key Test")
    
    # Get the directory of the current script
    script_dir = Path(__file__).parent.absolute()
    cred_file = args.cred_file or script_dir / "cred.txt"
    
    # Read API key
    api_key = read_api_key(cred_file)
    if not api_key:
        sys.exit(1)
    
    # Test API key
    if test_api_key(api_key, args.env, args.verbose):
        print_header("Test Completed Successfully")
        sys.exit(0)
    else:
        print_header("Test Failed")
        sys.exit(1)

if __name__ == "__main__":
    main()
