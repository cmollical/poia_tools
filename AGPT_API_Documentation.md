# Athena GPT API Integration Documentation

## Overview

This documentation provides a complete guide for integrating with the Athena GPT API service used at athenahealth. This is based on the working implementation from the HTML Prototype Bot and can be reused across projects.

## API Configuration

### Endpoints

```python
api_endpoints = {
    "prod": "https://athenagpt.tools.athenahealth.com/api/public/oai",
    "uat": "https://athenagpt-uat.tools.athenahealth.com/api/public/oai"
}
```

### Supported Models

Based on testing, the following models are confirmed to work:
- `gpt-4o-mini-2024-07-18` ✅ (Recommended for most use cases)
- `gpt-4o` ✅ (Higher capability, more expensive)

**Note**: `gpt-4.1` is NOT supported by the Athena GPT service despite being available in standard OpenAI API.

### Token Limits

- **Context Window**: 128K tokens (input)
- **Output Limit**: 16,384 tokens maximum per response
- **Recommended max_tokens**: 16000 (stay slightly under limit)

## Authentication

### Environment Variables (Recommended)

The API looks for authentication in this order:

1. `AGPT_API` environment variable
2. `ATHENAGPT_API_KEY` environment variable
3. Fallback to credential file (see below)

**Setting Environment Variable:**
```powershell
# PowerShell - User level
[Environment]::SetEnvironmentVariable("ATHENAGPT_API_KEY", "your_api_key_here", "User")

# PowerShell - System level (requires admin)
[Environment]::SetEnvironmentVariable("ATHENAGPT_API_KEY", "your_api_key_here", "Machine")
```

### Credential File Fallback

If environment variables are not found, the system looks for:
```
C:\Users\[Username]\OneDrive - athenahealth\Desktop\test_app\agpt_api_docs\cred.txt
```

**Format:**
```
athenagpt:your_api_key_here
```

## Python Implementation

### Required Dependencies

```python
pip install openai streamlit python-dotenv
```

### Basic Configuration Class

```python
import os
from typing import Dict, Any, Optional
from openai import AzureOpenAI
from pathlib import Path

def load_agpt_config() -> Dict[str, Any]:
    """Load Athena GPT configuration from environment variables or default values."""
    config = {
        "api_version": "2025-01-01-preview",
        "model": "gpt-4o-mini-2024-07-18",  # Recommended model
        "environment": "uat",  # or "prod"
        "max_history": 5,  # Conversation history limit
    }
    
    # API endpoints
    api_endpoints = {
        "prod": "https://athenagpt.tools.athenahealth.com/api/public/oai",
        "uat": "https://athenagpt-uat.tools.athenahealth.com/api/public/oai"
    }
    
    # Override from environment variables if present
    config["environment"] = os.environ.get("ATHENAGPT_ENVIRONMENT", "uat")
    config["api_key"] = os.environ.get("AGPT_API") or os.environ.get("ATHENAGPT_API_KEY")
    
    # If API key not in environment, try to load from cred.txt
    if not config["api_key"]:
        desktop_path = Path.home() / "OneDrive - athenahealth" / "Desktop"
        cred_file = desktop_path / "test_app" / "agpt_api_docs" / "cred.txt"
        if cred_file.exists():
            config["api_key"] = read_api_key(cred_file)
    
    config["api_endpoint"] = api_endpoints.get(config["environment"], api_endpoints["uat"])
    return config

def read_api_key(cred_file_path: Path) -> Optional[str]:
    """Read API key from credentials file."""
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
```

### Client Initialization

```python
class AthenaGPTClient:
    """Athena GPT API Client"""
    
    def __init__(self):
        self.config = load_agpt_config()
        self.client = None
        
    def initialize_client(self) -> bool:
        """Initialize the Azure OpenAI client."""
        if not self.config["api_key"]:
            print("❌ No API key found. Check environment variables or credential file.")
            return False
            
        try:
            self.client = AzureOpenAI(
                api_key=self.config["api_key"],
                api_version=self.config["api_version"],
                azure_endpoint=self.config["api_endpoint"]
            )
            return True
        except Exception as e:
            print(f"❌ Failed to initialize client: {e}")
            return False
```

### Making API Calls

```python
def send_message(self, message: str, conversation_history: list = None, system_prompt: str = None) -> str:
    """Send a message to Athena GPT and get response."""
    if not self.client:
        if not self.initialize_client():
            return "❌ Unable to connect to Athena GPT. Please check your API configuration."
    
    try:
        # Prepare messages
        messages = []
        
        # Add system prompt if provided
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        # Add conversation history (limit to max_history)
        if conversation_history:
            messages.extend(conversation_history[-self.config["max_history"]:])
        
        # Add current message
        messages.append({"role": "user", "content": message})
        
        # Call Athena GPT
        response = self.client.chat.completions.create(
            model=self.config["model"],
            messages=messages,
            temperature=0.7,
            max_tokens=16000  # Stay within model limits
        )
        
        # Validate response
        if not response or not response.choices or len(response.choices) == 0:
            return "❌ API Error: Received empty response from Athena GPT."
        
        if not response.choices[0].message or not response.choices[0].message.content:
            return "❌ API Error: Received invalid response structure from Athena GPT."
        
        return response.choices[0].message.content
        
    except Exception as e:
        error_str = str(e).lower()
        
        # Handle specific error types
        if "expecting value" in error_str:
            return "❌ API Response Error: The request was too complex and the response was truncated."
        elif "token" in error_str and "limit" in error_str:
            return "❌ Token Limit Error: Your request is too long. Try using fewer words."
        elif "rate limit" in error_str:
            return "❌ Rate Limit Error: Too many requests. Please wait a moment and try again."
        elif "model not supported" in error_str:
            return f"❌ Model Error: The model '{self.config['model']}' is not supported by Athena GPT service."
        else:
            return f"❌ Error communicating with Athena GPT: {str(e)}"
```

## Usage Examples

### Basic Usage

```python
# Initialize client
client = AthenaGPTClient()

# Send a simple message
response = client.send_message("Hello, can you help me write a Python function?")
print(response)
```

### With System Prompt

```python
system_prompt = """You are a helpful Python developer assistant. 
Provide clean, well-documented code examples."""

response = client.send_message(
    "Create a function to calculate fibonacci numbers",
    system_prompt=system_prompt
)
print(response)
```

### With Conversation History

```python
conversation_history = [
    {"role": "user", "content": "I need help with Python"},
    {"role": "assistant", "content": "I'd be happy to help! What specifically do you need?"},
    {"role": "user", "content": "How do I read a CSV file?"}
]

response = client.send_message(
    "Can you show me an example with pandas?",
    conversation_history=conversation_history
)
print(response)
```

## Best Practices

### Token Management

1. **Stay within limits**: Use max_tokens=16000 or less
2. **Limit conversation history**: Keep to 5-10 previous messages
3. **Handle complex requests**: Break large requests into smaller parts

### Error Handling

```python
def robust_api_call(client, message, max_retries=3):
    """Make API call with retry logic"""
    for attempt in range(max_retries):
        try:
            response = client.send_message(message)
            if not response.startswith("❌"):
                return response
            else:
                print(f"Attempt {attempt + 1} failed: {response}")
        except Exception as e:
            print(f"Attempt {attempt + 1} error: {e}")
        
        if attempt < max_retries - 1:
            time.sleep(2 ** attempt)  # Exponential backoff
    
    return "❌ Failed after multiple attempts"
```

### System Prompt Guidelines

For complex applications, include token awareness in your system prompt:

```python
system_prompt = """You are an expert assistant.

**CRITICAL TOKEN LIMIT AWARENESS:**
- You have a MAXIMUM of 16,000 output tokens per response
- If a request seems too complex, break it down or simplify
- NEVER attempt to generate responses that will exceed the token limit

[Your specific instructions here...]
"""
```

## PM2 Integration

When using with PM2, ensure environment variables are properly set:

```bash
# Check if PM2 has access to environment variables
pm2 describe your-app-name

# Set environment variables for PM2 if needed
pm2 set PM2_ENV_VAR ATHENAGPT_API_KEY your_api_key_here
```

## Troubleshooting

### Common Issues

1. **"Model not supported" error**
   - Stick to tested models: `gpt-4o-mini-2024-07-18` or `gpt-4o`
   - Avoid `gpt-4.1` - not supported by Athena GPT service

2. **Empty responses**
   - Check token limits (max_tokens should be ≤ 16000)
   - Verify API key is correctly set
   - Try simpler requests first

3. **Environment variable not found**
   - Verify variable name: `ATHENAGPT_API_KEY` or `AGPT_API`
   - For PM2: Check if process has access to user environment variables
   - Consider using credential file as fallback

4. **Rate limiting**
   - Implement exponential backoff
   - Reduce request frequency
   - Check your API tier limits

### Debug Mode

Add debug logging to troubleshoot issues:

```python
def debug_api_call(self, message):
    """Debug version with detailed logging"""
    print(f"DEBUG: API Endpoint: {self.config['api_endpoint']}")
    print(f"DEBUG: Model: {self.config['model']}")
    print(f"DEBUG: API Key Present: {'Yes' if self.config['api_key'] else 'No'}")
    print(f"DEBUG: Message Length: {len(message)}")
    
    # Make the API call...
```

## Security Considerations

1. **Never hardcode API keys** in source code
2. **Use environment variables** or secure credential files
3. **Rotate API keys** regularly
4. **Limit API key permissions** to minimum required scope
5. **Monitor API usage** for unusual activity

## Rate Limits and Pricing

- **Rate Limits**: Vary by tier (see Athena GPT service documentation)
- **Pricing**: Based on token usage (input + output tokens)
- **Monitoring**: Track usage to avoid unexpected costs

## Support and Resources

- **Internal Documentation**: Check athenahealth internal wiki for updates
- **API Status**: Monitor service status pages
- **Support**: Contact internal IT/DevOps for API access issues

---

**Last Updated**: January 2025
**Based on**: HTML Prototype Bot implementation
**Tested Models**: gpt-4o-mini-2024-07-18, gpt-4o
**API Version**: 2025-01-01-preview
