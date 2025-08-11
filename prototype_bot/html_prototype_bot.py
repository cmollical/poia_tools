"""
HTML Prototype Bot - Streamlit Interface

A powerful chatbot-like tool that helps generate HTML prototypes for internal tools and designs.
Uses Athena GPT to create modern, responsive HTML with CSS styling.
"""

import streamlit as st
import json
import os
from typing import Dict, Any, Optional
from openai import AzureOpenAI
from pathlib import Path
import time
import base64
import webbrowser
import tempfile
import subprocess

# Page configuration
st.set_page_config(
    page_title="HTML Prototype Bot",
    page_icon="🔧",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for athenahealth primary palette styling
st.markdown("""
<style>
    .main-header {
        text-align: center;
        color: #4E2D82;
        font-size: 2.5rem;
        margin-bottom: 1rem;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
    }
    .chat-message {
        padding: 1rem;
        border-radius: 0.8rem;
        margin-bottom: 1rem;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .user-message {
        background: linear-gradient(135deg, #4E2D82 0%, #6B4BAE 100%);
        color: white;
        border-left: 4px solid #4E2D82;
    }
    .assistant-message {
        background: linear-gradient(135deg, #F2ECDE 0%, #F8F4EC 100%);
        color: #4E2D82;
        border-left: 4px solid #F3A61C;
        border: 1px solid #E5DDD0;
    }
    .code-preview {
        background-color: #1e1e1e;
        color: #d4d4d4;
        padding: 1rem;
        border-radius: 0.5rem;
        font-family: 'Courier New', monospace;
        border: 1px solid #333;
        max-height: 300px;
        overflow-y: auto;
    }
    .tool-card {
        background: white;
        border: 2px solid #4E2D82;
        border-radius: 1rem;
        padding: 1.5rem;
        margin: 1rem 0;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .feature-badge {
        background: linear-gradient(45deg, #4E2D82, #6B4BAE);
        color: white;
        padding: 0.3rem 0.8rem;
        border-radius: 20px;
        font-size: 0.8rem;
        display: inline-block;
        margin: 0.2rem;
    }
    .stButton > button {
        background: linear-gradient(45deg, #4E2D82, #6B4BAE);
        color: white;
        border: none;
        border-radius: 0.5rem;
        font-weight: 600;
        transition: all 0.3s;
    }
    .stButton > button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(78,45,130,0.3);
    }
    .honey-button {
        background: linear-gradient(45deg, #F3A61C, #FFB84D) !important;
        color: white !important;
    }
    .honey-button:hover {
        box-shadow: 0 4px 8px rgba(243,166,28,0.4) !important;
    }
</style>
""", unsafe_allow_html=True)

# Configuration for Athena GPT
def load_config() -> Dict[str, Any]:
    """Load configuration from environment variables or default values."""
    config = {
        "api_version": "2025-01-01-preview",
        "model": "gpt-4o-mini-2024-07-18",
        "environment": "uat",
        "max_history": 5,  # Reduced to prevent token limit issues
    }
    
    # API endpoints
    api_endpoints = {
        "prod": "https://athenagpt.tools.athenahealth.com/api/public/oai",
        "uat": "https://athenagpt-uat.tools.athenahealth.com/api/public/oai"
    }
    
    # Override from environment variables if present
    config["environment"] = os.environ.get("ATHENAGPT_ENVIRONMENT", "uat")
    config["api_key"] = os.environ.get("AGPT_API") or os.environ.get("ATHENAGPT_API_KEY")
    
    # Debug: Print environment variable status
    print(f"DEBUG: AGPT_API found: {'Yes' if os.environ.get('AGPT_API') else 'No'}")
    print(f"DEBUG: ATHENAGPT_API_KEY found: {'Yes' if os.environ.get('ATHENAGPT_API_KEY') else 'No'}")
    print(f"DEBUG: Environment: {config['environment']}")
    print(f"DEBUG: API Endpoint: {api_endpoints.get(config['environment'], api_endpoints['uat'])}")
    
    # If API key not in environment, try to load from cred.txt
    if not config["api_key"]:
        # Look for cred.txt in test_app/agpt_api_docs folder
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
        st.error(f"Error reading API key: {e}")
        return None

class HTMLPrototypeBot:
    """HTML Prototype Generation Bot using Athena GPT."""
    
    def __init__(self):
        self.config = load_config()
        self.client = None
        self.system_prompt = """You are an expert HTML/CSS/JavaScript developer specializing in creating modern, responsive prototypes for internal business tools and applications.

**CRITICAL TOKEN LIMIT AWARENESS:**
- You have a MAXIMUM of 16,000 output tokens per response
- If a request seems too complex for one response, you MUST break it down or simplify
- NEVER attempt to generate responses that will exceed the token limit
- If asked for very complex features, provide a simplified version or suggest breaking into phases

**For Complex Requests (like full Kanban boards with many features):**
1. Acknowledge the complexity and suggest a phased approach
2. Offer to create a basic version first, then add features in follow-up requests
3. Prioritize core functionality over advanced features in the initial response
4. Use concise, efficient code without excessive comments

**Your HTML prototypes should be:**
- Modern and professional looking
- Responsive and mobile-friendly
- Include core interactive elements
- Use modern CSS (flexbox, grid)
- Include minimal but realistic sample data
- Follow UI/UX best practices
- Suitable for internal business tools

**When generating HTML:**
1. Provide complete, runnable HTML files within token limits
2. Include CSS styling within <style> tags (concise)
3. Add essential JavaScript functionality
4. Use professional color schemes
5. Include proper semantic HTML structure
6. Add minimal comments for key sections only
7. Prioritize functionality over extensive features

**If a request is too complex:** Suggest breaking it into phases like:
- Phase 1: Basic structure and core functionality
- Phase 2: Advanced features (drag/drop, etc.)
- Phase 3: Additional features (import/export, etc.)

Always stay within token limits and provide working, complete solutions."""

    def initialize_client(self):
        """Initialize the Azure OpenAI client."""
        if not self.config["api_key"]:
            return False
            
        try:
            self.client = AzureOpenAI(
                api_key=self.config["api_key"],
                api_version=self.config["api_version"],
                azure_endpoint=self.config["api_endpoint"]
            )
            return True
        except Exception as e:
            st.error(f"Failed to initialize client: {e}")
            return False

    def send_message(self, message: str, conversation_history: list) -> str:
        """Send a message to Athena GPT and get response."""
        if not self.client:
            if not self.initialize_client():
                return "❌ Unable to connect to Athena GPT. Please check your API configuration."
        
        try:
            # Prepare messages with conversation history
            messages = [{"role": "system", "content": self.system_prompt}]
            
            # Add conversation history (limit to max_history)
            if conversation_history:
                messages.extend(conversation_history[-self.config["max_history"]:])
            
            # Add current message
            messages.append({"role": "user", "content": message})
            
            print(f"DEBUG: Making API call to {self.config['api_endpoint']}")
            print(f"DEBUG: Using model: {self.config['model']}")
            print(f"DEBUG: API key present: {'Yes' if self.config['api_key'] else 'No'}")
            print(f"DEBUG: Message count: {len(messages)}")
            print(f"DEBUG: Last message length: {len(messages[-1]['content']) if messages else 0}")
            
            # Use GPT-4o's maximum output limit of 16K tokens
            max_tokens_to_use = 16000  # GPT-4o's maximum output token limit
            print(f"DEBUG: Using max_tokens: {max_tokens_to_use}")
            
            # Call Athena GPT
            response = self.client.chat.completions.create(
                model=self.config["model"],
                messages=messages,
                temperature=0.7,
                max_tokens=max_tokens_to_use
            )
            
            print(f"DEBUG: Response object type: {type(response)}")
            print(f"DEBUG: Response has choices: {hasattr(response, 'choices') and response.choices is not None}")
            if hasattr(response, 'choices') and response.choices:
                print(f"DEBUG: Number of choices: {len(response.choices)}")
                if len(response.choices) > 0:
                    print(f"DEBUG: First choice has message: {hasattr(response.choices[0], 'message') and response.choices[0].message is not None}")
                    if hasattr(response.choices[0], 'message') and response.choices[0].message:
                        print(f"DEBUG: Message has content: {hasattr(response.choices[0].message, 'content') and response.choices[0].message.content is not None}")
                        if hasattr(response.choices[0].message, 'content') and response.choices[0].message.content:
                            print(f"DEBUG: Content length: {len(response.choices[0].message.content)}")
            
            # Check if response is valid
            if not response or not response.choices or len(response.choices) == 0:
                return "❌ API Error: Received empty response from Athena GPT. This might be due to content filtering or service issues. Try breaking your request into smaller parts."
            
            if not response.choices[0].message or not response.choices[0].message.content:
                return "❌ API Error: Received invalid response structure from Athena GPT. The request might have been filtered or blocked. Try simplifying your request."
            
            return response.choices[0].message.content
            
        except Exception as e:
            print(f"DEBUG: Full error details: {type(e).__name__}: {str(e)}")
            error_str = str(e).lower()
            
            # Check for specific error types
            if "expecting value" in error_str:
                return f"❌ API Response Error: The request was too complex and the response was truncated. Try breaking your request into smaller, simpler parts."
            elif "token" in error_str and "limit" in error_str:
                return f"❌ Token Limit Error: Your request is too long. Try using fewer words or break it into smaller requests."
            elif "rate limit" in error_str:
                return f"❌ Rate Limit Error: Too many requests. Please wait a moment and try again."
            elif "timeout" in error_str:
                return f"❌ Timeout Error: The request took too long. Try a simpler request."
            else:
                return f"❌ Error communicating with Athena GPT: {str(e)}"

def extract_html_from_response(response: str) -> Optional[str]:
    """Extract HTML code from the bot response."""
    import re
    
    # Look for HTML code blocks
    html_pattern = r'```html\s*(.*?)\s*```'
    html_match = re.search(html_pattern, response, re.DOTALL | re.IGNORECASE)
    
    if html_match:
        return html_match.group(1).strip()
    
    # Look for any code blocks that might be HTML
    code_pattern = r'```\s*(.*?)\s*```'
    code_match = re.search(code_pattern, response, re.DOTALL)
    
    if code_match:
        code = code_match.group(1).strip()
        if '<!DOCTYPE html>' in code or '<html' in code or '<head>' in code:
            return code
    
    return None

def clean_response_for_chat(response: str) -> str:
    """Remove HTML code blocks from response for clean chat display."""
    import re
    
    # Remove HTML code blocks but keep the explanation
    html_pattern = r'```html\s*(.*?)\s*```'
    cleaned = re.sub(html_pattern, '[HTML code generated - view in Live Preview panel]', response, flags=re.DOTALL | re.IGNORECASE)
    
    # Remove any other code blocks that might be HTML
    code_pattern = r'```\s*(.*?)\s*```'
    
    def check_and_replace(match):
        code = match.group(1).strip()
        if '<!DOCTYPE html>' in code or '<html' in code or '<head>' in code:
            return '[HTML code generated - view in Live Preview panel]'
        return match.group(0)  # Keep non-HTML code blocks
    
    cleaned = re.sub(code_pattern, check_and_replace, cleaned, flags=re.DOTALL)
    
    return cleaned.strip()

def create_download_link(html_content: str, filename: str = "prototype.html"):
    """Create a download link for the HTML content."""
    try:
        # Encode HTML content for download
        b64_html = base64.b64encode(html_content.encode()).decode()
        href = f'data:text/html;base64,{b64_html}'
        return href, filename
    except Exception as e:
        st.error(f"Error creating download link: {e}")
        return None, None

def main():
    """Main Streamlit application."""
    
    # Header
    st.markdown('<h1 class="main-header">🔧 HTML Prototype Bot</h1>', unsafe_allow_html=True)
    st.markdown('<p style="text-align: center; color: #4E2D82; font-size: 1.2rem; font-weight: 500;">AI-powered HTML prototype generator for athenahealth internal tools</p>', unsafe_allow_html=True)
    
    # Initialize session state
    if 'conversation_history' not in st.session_state:
        st.session_state.conversation_history = []
    if 'bot' not in st.session_state:
        st.session_state.bot = HTMLPrototypeBot()
    if 'generated_html' not in st.session_state:
        st.session_state.generated_html = None
    
    # Sidebar with tools and options
    with st.sidebar:
        st.markdown("### 🛠️ Prototype Tools")
        
        # Quick prototype templates
        st.markdown("#### Quick Templates")
        template_options = {
            "Dashboard": "Create a modern dashboard interface with charts, metrics cards, and navigation",
            "Form Builder": "Build a comprehensive form with validation, multiple input types, and submission handling",
            "Data Table": "Generate a sortable, filterable data table with pagination and actions",
            "Admin Panel": "Create an admin interface with user management, settings, and controls",
            "Report Generator": "Build a report interface with filters, date pickers, and export options",
            "Landing Page": "Design a professional landing page with hero section, features, and CTA",
            "Login Screen": "Create a secure login interface with modern styling and validation"
        }
        
        for template_name, template_prompt in template_options.items():
            if st.button(f"🚀 {template_name}", key=f"template_{template_name}", help=f"Generate a {template_name.lower()} prototype"):
                # Add template message to conversation
                st.session_state.conversation_history.append({"role": "user", "content": template_prompt})
                
                # Get bot response
                with st.spinner(f"Generating {template_name} prototype..."):
                    response = st.session_state.bot.send_message(template_prompt, st.session_state.conversation_history)
                    st.session_state.conversation_history.append({"role": "assistant", "content": response})
                    
                    # Extract HTML if present
                    html_content = extract_html_from_response(response)
                    if html_content:
                        st.session_state.generated_html = html_content
                
                st.rerun()
        
        st.markdown("---")
        
        # HTML Preview and Launch
        if st.session_state.generated_html:
            st.markdown("#### 🌐 HTML Actions")
            
            if st.button("🚀 Launch in Browser", key="launch_browser"):
                temp_file = launch_html_locally(st.session_state.generated_html)
                if temp_file:
                    st.success("HTML launched in browser!")
                    st.info(f"Temp file: {temp_file}")
            
            if st.button("📋 Copy HTML", key="copy_html"):
                st.code(st.session_state.generated_html, language="html")
            
            if st.button("💾 Download HTML", key="download_html"):
                st.download_button(
                    label="📁 Download prototype.html",
                    data=st.session_state.generated_html,
                    file_name="prototype.html",
                    mime="text/html"
                )
        
        st.markdown("---")
        
        # Settings
        st.markdown("#### ⚙️ Settings")
        if st.button("🗑️ Clear Chat", key="clear_chat"):
            st.session_state.conversation_history = []
            st.session_state.generated_html = None
            st.rerun()
        
        # Connection status
        st.markdown("#### 🔗 Connection Status")
        config = st.session_state.bot.config
        if config["api_key"]:
            st.success("✅ Connected to Athena GPT")
            st.info(f"Environment: {config['environment']}")
            st.info(f"Model: {config['model']}")
        else:
            st.error("❌ No API key found")
            st.warning("Check environment variables or cred.txt file")
    
    # Main chat interface
    col1, col2 = st.columns([2, 1])
    
    with col1:
        st.markdown("### 💬 Chat with HTML Prototype Bot")
        
        # Display conversation history
        chat_container = st.container()
        with chat_container:
            for message in st.session_state.conversation_history:
                role = message["role"]
                content = message["content"]
                
                if role == "user":
                    st.markdown(f'<div class="chat-message user-message"><strong>You:</strong><br>{content}</div>', unsafe_allow_html=True)
                else:
                    # Clean the response to remove HTML code blocks for chat display
                    cleaned_content = clean_response_for_chat(content)
                    st.markdown(f'<div class="chat-message assistant-message"><strong>🤖 Prototype Bot:</strong><br>{cleaned_content}</div>', unsafe_allow_html=True)
        
        # Context-aware chat input
        has_conversation = len(st.session_state.conversation_history) > 0
        has_generated_html = st.session_state.generated_html is not None
        
        if has_generated_html:
            st.info("🎨 **Prototype generated!** You can request modifications, styling changes, or create something entirely new.")
            input_label = "Request changes or create a new prototype:"
            input_placeholder = "Example: Make the buttons bigger, change colors to blue, add a sidebar menu, or create a new login page"
            button_text = "🔄 Update Prototype"
        elif has_conversation:
            st.info("💬 **Conversation active** - You can continue discussing, make changes, or start fresh.")
            input_label = "Continue the conversation or request changes:"
            input_placeholder = "Example: Make it more modern, add dark mode, change the layout, or create something different"
            button_text = "💬 Continue Chat"
        else:
            input_label = "What kind of prototype would you like to create?"
            input_placeholder = "Example: Create a user management dashboard with a table of users, search functionality, and add/edit buttons"
            button_text = "🚀 Generate Prototype"
        
        user_input = st.text_area(
            input_label,
            placeholder=input_placeholder,
            height=100,
            key="user_input"
        )
        
        col_btn1, col_btn2 = st.columns([1, 3])
        with col_btn1:
            button_help = "Generate HTML prototype from your description" if not has_conversation else "Update your prototype or continue the conversation"
            if st.button(button_text, key="send_message", help=button_help):
                if user_input.strip():
                    # Add user message to conversation
                    st.session_state.conversation_history.append({"role": "user", "content": user_input})
                    
                    # Get bot response
                    with st.spinner("Generating your prototype..."):
                        response = st.session_state.bot.send_message(user_input, st.session_state.conversation_history)
                        st.session_state.conversation_history.append({"role": "assistant", "content": response})
                        
                        # Extract HTML if present
                        html_content = extract_html_from_response(response)
                        if html_content:
                            st.session_state.generated_html = html_content
                    
                    st.rerun()
        with col_btn2:
            if st.session_state.generated_html:
                # Create download link for the HTML
                href, filename = create_download_link(st.session_state.generated_html, "prototype.html")
                if href:
                    st.markdown(
                        f'<a href="{href}" download="{filename}" style="display: inline-block; padding: 0.5rem 1rem; background: linear-gradient(45deg, #F3A61C, #FFB84D); color: white; text-decoration: none; border-radius: 0.5rem; font-weight: 600; margin-top: 0.5rem;">📥 Download HTML File</a>',
                        unsafe_allow_html=True
                    )
                    st.info("💡 Download the HTML file and open it in your local browser for the full experience!")
    
    with col2:
        st.markdown("### 🎨 Live Preview")
        
        if st.session_state.generated_html:
            # Show HTML preview
            st.markdown("#### Generated HTML:")
            with st.expander("View Raw HTML", expanded=False):
                st.code(st.session_state.generated_html, language="html")
            
            # Render HTML (with safety warning)
            st.markdown("#### Live Preview:")
            st.warning("⚠️ Preview shows basic rendering. Use 'Launch in Browser' for full experience.")
            
            # Create a simple iframe-like preview
            try:
                # Basic HTML rendering (limited by Streamlit)
                st.components.v1.html(st.session_state.generated_html, height=400, scrolling=True)
            except Exception as e:
                st.error(f"Preview error: {e}")
                st.info("Use 'Launch in Browser' for full preview")
        else:
            st.info("💡 Generate a prototype to see the live preview here!")
            
            # Show feature highlights
            st.markdown("""
            <div class="tool-card">
                <h4 style="color: #4E2D82;">🎯 What I can help you build:</h4>
                <span class="feature-badge">Admin Dashboards</span>
                <span class="feature-badge">Data Forms</span>
                <span class="feature-badge">Report Tools</span>
                <span class="feature-badge">User Interfaces</span>
                <span class="feature-badge">Landing Pages</span>
                <span class="feature-badge">Login Screens</span>
                <span class="feature-badge">Data Tables</span>
                <span class="feature-badge">Charts & Graphs</span>
            </div>
            """, unsafe_allow_html=True)

if __name__ == "__main__":
    main()
