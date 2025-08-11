# athenaGPT Chat Agent

A lightweight, extensible chat agent interface for the athenaGPT API. This project provides a simple Streamlit-based UI for interacting with the athenaGPT API and testing its capabilities.

## Features

- Simple chat interface built with Streamlit
- Extensible plugin system for adding custom functionality
- Conversation history management
- API key management from environment or file
- UAT environment support

## Project Structure

```
chat-test/
├── app.py                 # Streamlit UI
├── chat_agent.py          # Core API interaction logic
├── config.py              # Configuration and API key handling
├── plugins/               # Plugin directory
│   ├── __init__.py        # Plugin registration
│   └── basic.py           # Basic plugins (help, clear, echo)
├── requirements.txt       # Dependencies
├── cred.txt               # API key storage (not tracked in git)
├── test_api_key.py        # API key validation script
└── README.md              # Documentation
```

## Setup Instructions

1. Make sure you have Python 3.8+ installed
2. Clone the repository or navigate to the project directory
3. Create a virtual environment:
   ```
   python -m venv venv
   ```
4. Activate the virtual environment:
   - On Windows: `venv\Scripts\activate`
   - On macOS/Linux: `source venv/bin/activate`
5. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
6. Set up your API key in `cred.txt`:
   - Create a file named `cred.txt` in the project directory
   - Add your API key in the format: `athenagpt:your_api_key_here`
7. Run the application:
   ```
   streamlit run app.py
   ```

## Using the Chat Agent

Once the application is running, you can:

1. Type messages in the chat input to interact with the athenaGPT API
2. Use special commands:
   - `/help` - Show help message
   - `/clear` - Clear conversation history
   - `/echo [text]` - Echo back text
3. Clear the conversation using the "Clear Conversation" button in the sidebar

## Extending with Plugins

You can create custom plugins to extend the functionality of the chat agent. Plugins can:

1. Process user messages before they are sent to the API
2. Process API responses before they are shown to the user

To create a new plugin:

1. Create a new Python file in the `plugins` directory
2. Use the `@register_message_processor` or `@register_response_processor` decorators
3. Implement your plugin logic

Example:

```python
from plugins import register_message_processor

@register_message_processor
def my_custom_plugin(message: str, context: dict) -> str:
    """Process custom commands."""
    if message.strip().lower() == "/custom":
        return "This is a custom response!"
    return None  # Return None to pass to the next plugin or API
```

## Environment Variables

The following environment variables can be used to configure the application:

- `ATHENAGPT_API_KEY` - API key for athenaGPT
- `ATHENAGPT_API_VERSION` - API version (default: 2025-01-01-preview)
- `ATHENAGPT_MODEL` - Model to use (default: gpt-4o-mini-2024-07-18)
- `ATHENAGPT_ENVIRONMENT` - Environment to use (prod or uat, default: uat)
- `ATHENAGPT_MAX_HISTORY` - Maximum number of messages to keep in history (default: 10)
