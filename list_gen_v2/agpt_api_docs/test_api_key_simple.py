#!/usr/bin/env python3
"""
Simple API Key Test Script for athenaGPT

This script tests whether the provided API key for athenaGPT is valid
by making a simple HTTP request to the API.
"""

import os
import sys
import json
import argparse
import http.client
import urllib.parse
from pathlib import Path
from datetime import datetime

# ANSI color codes for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
BOLD = "\033[1m"
RESET = "\033[0m"

# API endpoints
ENDPOINTS = {
    "prod": "athenagpt.tools.athenahealth.com",
    "uat": "athenagpt-uat.tools.athenahealth.com"
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
    host = ENDPOINTS.get(environment, ENDPOINTS["prod"])
    path = "/api/public/oai/openai/deployments/gpt-4o-mini-2024-07-18/chat/completions"
    query_params = urllib.parse.urlencode({"api-version": "2025-01-01-preview"})
    
    print_info(f"Testing API key against {environment} environment")
    print_info(f"Endpoint: https://{host}{path}?{query_params}")
    print_info(f"API Key: {api_key[:5]}...{api_key[-5:]} (masked for security)")
    print_info(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    headers = {
        "Content-Type": "application/json",
        "api-key": api_key
    }
    
    payload = {
        "messages": [
            {
                "role": "user",
                "content": "Hello, this is a test message. Please respond with a single word."
            }
        ],
        "max_tokens": 10
    }
    
    try:
        print_info("Sending test request...")
        conn = http.client.HTTPSConnection(host)
        conn.request("POST", f"{path}?{query_params}", json.dumps(payload), headers)
        response = conn.getresponse()
        
        status = response.status
        response_data = response.read().decode()
        
        if verbose:
            print_info(f"Status code: {status}")
            print_info(f"Response headers: {response.getheaders()}")
            
        try:
            response_json = json.loads(response_data)
            if verbose:
                print_info("Full API response:")
                print(json.dumps(response_json, indent=2))
        except json.JSONDecodeError:
            response_json = None
            if verbose:
                print_info("Raw response (not JSON):")
                print(response_data)
        
        if status == 200:
            print_success("API key is valid!")
            if response_json and "choices" in response_json and len(response_json["choices"]) > 0:
                content = response_json["choices"][0]["message"]["content"]
                print_info("Response preview:")
                print(f"{BLUE}{content}{RESET}")
            return True
        elif status == 401:
            print_error("Authentication failed: Invalid API key")
            print_info("Please check your API key and make sure it's correctly formatted")
            if response_json and "message" in response_json:
                print_info(f"Error message: {response_json['message']}")
            return False
        elif status == 404:
            print_error("Endpoint not found (404)")
            print_info("The requested endpoint or model was not found. The API endpoint may be incorrect.")
            return False
        elif status == 429:
            print_error("Rate limit exceeded (429)")
            print_info("Too many requests. Please try again later.")
            return False
        else:
            print_error(f"API request failed with status code: {status}")
            if response_json and "message" in response_json:
                print_info(f"Error message: {response_json['message']}")
            return False
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        if verbose:
            import traceback
            print_info("Traceback:")
            print(traceback.format_exc())
        return False
    finally:
        conn.close()

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
