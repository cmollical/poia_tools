"""
Chat Agent for athenaGPT API Integration

This module provides a ChatAgent class for interacting with the athenaGPT API
using Azure OpenAI client.
"""

from typing import List, Dict, Any, Optional
from openai import AzureOpenAI
from .config import load_config

class ChatAgent:
    """A chat agent for interacting with athenaGPT API."""
    
    def __init__(self, system_message: str = "You are a helpful assistant."):
        """Initialize the chat agent.
        
        Args:
            system_message: The system message to set the behavior of the assistant
        """
        self.config = load_config()
        self.client = AzureOpenAI(
            api_version=self.config["api_version"],
            api_key=self.config["api_key"],
            azure_endpoint=self.config["api_endpoint"],
        )
        self.messages = [{"role": "system", "content": system_message}]
        self.max_history = self.config["max_history"]
    
    def send_message(self, message: str) -> str:
        """Send a message to the chat agent and get the response.
        
        Args:
            message: The user message to send
            
        Returns:
            The assistant's response
        """
        # Add user message to history
        self.messages.append({"role": "user", "content": message})
        
        # Ensure we don't exceed max history (keep system message plus max_history messages)
        if len(self.messages) > self.max_history + 1:
            # Keep system message (first one) and trim oldest messages
            self.messages = [self.messages[0]] + self.messages[-(self.max_history):]
        
        try:
            # Call the API
            completion = self.client.chat.completions.create(
                model=self.config["model"],
                messages=self.messages
            )
            
            # Extract the response
            response = completion.choices[0].message.content
            
            # Add assistant response to history
            self.messages.append({"role": "assistant", "content": response})
            
            return response
        except Exception as e:
            error_msg = f"Error calling athenaGPT API: {str(e)}"
            print(error_msg)
            return error_msg
    
    def get_history(self) -> List[Dict[str, str]]:
        """Get the conversation history.
        
        Returns:
            List of message dictionaries with 'role' and 'content' keys
        """
        return self.messages
    
    def clear_history(self, keep_system_message: bool = True) -> None:
        """Clear the conversation history.
        
        Args:
            keep_system_message: Whether to keep the system message
        """
        if keep_system_message and self.messages:
            self.messages = [self.messages[0]]
        else:
            self.messages = []
