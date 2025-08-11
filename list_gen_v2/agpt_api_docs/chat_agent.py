"""
Chat Agent for athenaGPT API

This module handles communication with the athenaGPT API,
manages conversation context, and processes messages and responses.
"""

import json
from typing import List, Dict, Any, Optional
from openai import AzureOpenAI

from .config import load_config

class Message:
    """Represents a message in the conversation."""
    
    def __init__(self, role: str, content: str):
        """
        Initialize a message.
        
        Args:
            role: The role of the message sender (user, assistant, system)
            content: The content of the message
        """
        self.role = role
        self.content = content
    
    def to_dict(self) -> Dict[str, str]:
        """Convert message to dictionary format for API."""
        return {
            "role": self.role,
            "content": self.content
        }


class ChatAgent:
    """Main chat agent that interacts with the athenaGPT API."""
    
    def __init__(self, system_message: Optional[str] = None):
        """
        Initialize the chat agent.
        
        Args:
            system_message: Optional system message to set the behavior of the assistant
        """
        # Load configuration
        self.config = load_config()
        
        # Initialize client
        self.client = AzureOpenAI(
            api_version=self.config["api_version"],
            api_key=self.config["api_key"],
            azure_endpoint=self.config["api_endpoint"],
        )
        
        # Initialize conversation history
        self.history: List[Message] = []
        
        # Add system message if provided
        if system_message:
            self.add_message("system", system_message)
    
    def add_message(self, role: str, content: str) -> None:
        """
        Add a message to the conversation history.
        
        Args:
            role: The role of the message sender (user, assistant, system)
            content: The content of the message
        """
        self.history.append(Message(role, content))
        
        # Trim history if it exceeds max_history
        if len(self.history) > self.config["max_history"]:
            # Keep system messages and trim the oldest messages
            system_messages = [msg for msg in self.history if msg.role == "system"]
            other_messages = [msg for msg in self.history if msg.role != "system"]
            
            # Calculate how many messages to keep
            to_keep = self.config["max_history"] - len(system_messages)
            
            # Keep only the most recent messages
            if to_keep > 0:
                other_messages = other_messages[-to_keep:]
            else:
                other_messages = []
            
            # Rebuild history with system messages first, then other messages
            self.history = system_messages + other_messages
    
    def get_messages(self) -> List[Dict[str, str]]:
        """
        Get all messages in the format required by the API.
        
        Returns:
            List of message dictionaries
        """
        return [msg.to_dict() for msg in self.history]
    
    def send_message(self, content: str) -> str:
        """
        Send a user message and get a response from the API.
        
        Args:
            content: The message content to send
            
        Returns:
            The assistant's response
            
        Raises:
            Exception: If there's an error communicating with the API
        """
        # Add user message to history
        self.add_message("user", content)
        
        try:
            # Send request to API
            completion = self.client.chat.completions.create(
                model=self.config["model"],
                messages=self.get_messages(),
            )
            
            # Extract and add assistant response to history
            response = completion.choices[0].message.content
            self.add_message("assistant", response)
            
            return response
        except Exception as e:
            error_msg = f"Error communicating with API: {str(e)}"
            print(error_msg)
            raise Exception(error_msg)
    
    def clear_history(self, keep_system: bool = True) -> None:
        """
        Clear conversation history.
        
        Args:
            keep_system: Whether to keep system messages
        """
        if keep_system:
            self.history = [msg for msg in self.history if msg.role == "system"]
        else:
            self.history = []
    
    def get_history_text(self) -> str:
        """
        Get conversation history as formatted text.
        
        Returns:
            Formatted conversation history
        """
        result = []
        for msg in self.history:
            if msg.role == "system":
                continue  # Skip system messages in the display
            prefix = "You: " if msg.role == "user" else "Assistant: "
            result.append(f"{prefix}{msg.content}")
        return "\n\n".join(result)


# Example usage
if __name__ == "__main__":
    # Create chat agent with a system message
    agent = ChatAgent(system_message="You are a helpful assistant.")
    
    # Send a message and print the response
    response = agent.send_message("Hello, who are you?")
    print(f"Assistant: {response}")
    
    # Print conversation history
    print("\nConversation History:")
    print(agent.get_history_text())
