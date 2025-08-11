"""
Test script for athenaGPT API

This script tests your connection to the athenaGPT API using your API token.
"""

import os
from pathlib import Path
from openai import AzureOpenAI
import sys

# The script will use the AGPT_API environment variable that is already set in your system
# No need to set it here as it's already configured

# Import the ChatAgent from your module
try:
    from chat_agent import ChatAgent
except ImportError:
    print("Error: Could not import ChatAgent. Make sure chat_agent.py is in the same directory.")
    sys.exit(1)

def test_direct_api_call():
    """Test a direct API call to Azure OpenAI without using the ChatAgent class."""
    print("\n=== Testing Direct API Call ===")
    
    try:
        # Load configuration from config.py
        from config import load_config
        config = load_config()
        
        print(f"Using model: {config['model']}")
        print(f"API version: {config['api_version']}")
        print(f"Environment: {config['environment']}")
        print(f"API endpoint: {config['api_endpoint']}")
        
        # Initialize the client
        client = AzureOpenAI(
            api_version=config["api_version"],
            api_key=config["api_key"],
            azure_endpoint=config["api_endpoint"],
        )
        
        # Make a simple API call
        completion = client.chat.completions.create(
            model=config["model"],
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": "Hello, is my API connection working?"}
            ]
        )
        
        # Extract and print the response
        response = completion.choices[0].message.content
        print(f"API Response: {response}")
        print("✅ Direct API call successful!")
        return True
        
    except Exception as e:
        print(f"❌ Error in direct API call: {str(e)}")
        return False

def test_chat_agent():
    """Test the ChatAgent class."""
    print("\n=== Testing ChatAgent Class ===")
    
    try:
        # Create a chat agent with a system message
        agent = ChatAgent(system_message="You are a helpful assistant for testing API connectivity.")
        
        # Send a test message
        response = agent.send_message("Hello, is my API connection working correctly?")
        
        # Print the response
        print(f"ChatAgent Response: {response}")
        print("✅ ChatAgent test successful!")
        return True
        
    except Exception as e:
        print(f"❌ Error in ChatAgent test: {str(e)}")
        return False

if __name__ == "__main__":
    print("AthenaGPT API Connection Test")
    print("=============================")
    
    # Check if API key is set in any of the possible sources
    api_key_agpt = os.environ.get("AGPT_API")
    api_key_athenagpt = os.environ.get("ATHENAGPT_API_KEY")
    
    if api_key_agpt:
        print("✅ Found API key in AGPT_API environment variable")
    elif api_key_athenagpt:
        print("✅ Found API key in ATHENAGPT_API_KEY environment variable")
    else:
        print("⚠️ Warning: No API key found in environment variables")
        script_dir = Path(__file__).parent.absolute()
        cred_file = script_dir / "cred.txt"
        if cred_file.exists():
            print(f"Checking for API key in {cred_file}...")
        else:
            print(f"cred.txt file not found at {cred_file}")
            print("   Create this file with a line like: athenagpt:your_api_key")
    
    # Run tests
    direct_test = test_direct_api_call()
    agent_test = test_chat_agent()
    
    # Summarize results
    print("\n=== Test Summary ===")
    print(f"Direct API Call: {'✅ Passed' if direct_test else '❌ Failed'}")
    print(f"ChatAgent Test: {'✅ Passed' if agent_test else '❌ Failed'}")
    
    if direct_test and agent_test:
        print("\n🎉 All tests passed! Your API token is working correctly.")
    else:
        print("\n⚠️ Some tests failed. Check the error messages above.")
        print("Common issues:")
        print("  - Incorrect API key")
        print("  - Wrong API endpoint")
        print("  - Incorrect API version")
        print("  - Incorrect model name")
