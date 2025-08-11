# HTML Prototype Bot 🔧

A powerful AI-powered Streamlit application that helps you quickly create HTML prototypes for internal tools and designs using Athena GPT.

## Features ✨

### Core Capabilities
- **AI-Powered HTML Generation**: Uses Athena GPT to create modern, responsive HTML prototypes
- **Interactive Chat Interface**: Natural language conversation for prototype requirements
- **Live Preview**: See your generated HTML in real-time within the app
- **Browser Launch**: Instantly open prototypes in your default web browser
- **Template Library**: Quick-start templates for common internal tools

### Supported Prototype Types
- 📊 **Admin Dashboards** - Metrics, charts, navigation panels
- 📝 **Data Forms** - Complex forms with validation and multiple input types
- 📋 **Data Tables** - Sortable, filterable tables with pagination
- 👥 **User Management** - Admin panels for user CRUD operations
- 📈 **Report Generators** - Interfaces with filters and export options
- 🌐 **Landing Pages** - Professional landing pages with modern design
- 🔐 **Login Screens** - Secure authentication interfaces
- 📊 **Charts & Graphs** - Data visualization components

### Technical Features
- **Modern CSS**: Uses flexbox, grid, animations, and responsive design
- **Professional Styling**: Beautiful gradients, shadows, and typography
- **Interactive Elements**: JavaScript functionality when needed
- **Semantic HTML**: Proper HTML structure and accessibility
- **Mobile-Friendly**: Responsive design for all devices
- **Production-Ready**: Polished, professional appearance

## Installation & Setup 🚀

### Prerequisites
- Python 3.8+
- Access to Athena GPT API (via `test_app/agpt_api_docs/cred.txt` or environment variables)

### Quick Start
1. **Navigate to the prototype_bot folder:**
   ```bash
   cd prototype_bot
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application:**
   ```bash
   streamlit run html_prototype_bot.py
   ```

4. **Open your browser** to the displayed URL (typically `http://localhost:8501`)

## Configuration 🔧

### API Key Setup
The application will automatically look for your Athena GPT API key in this order:
1. Environment variable `AGPT_API`
2. Environment variable `ATHENAGPT_API_KEY`
3. File: `../test_app/agpt_api_docs/cred.txt`

### Environment Variables (Optional)
- `ATHENAGPT_ENVIRONMENT`: "prod" or "uat" (default: "uat")
- `ATHENAGPT_API_VERSION`: API version (default: "2025-01-01-preview")
- `ATHENAGPT_MODEL`: Model name (default: "gpt-4o-mini-2024-07-18")

## Usage Guide 📖

### Quick Templates
Use the sidebar quick templates for instant prototypes:
- Click any template button (Dashboard, Form Builder, etc.)
- The bot will generate a complete HTML prototype
- View the live preview in the right panel
- Launch in browser for full experience

### Custom Prototypes
1. **Describe your needs** in the chat input:
   ```
   "Create a user management dashboard with a table of users, 
   search functionality, and add/edit buttons"
   ```

2. **Get AI-generated HTML** with:
   - Complete HTML structure
   - Modern CSS styling
   - Interactive JavaScript (when needed)
   - Professional design

3. **Preview and launch**:
   - View code in the expandable sections
   - See live preview in the right panel
   - Launch in browser for full functionality
   - Download the HTML file

### Example Prompts
- "Build a project management dashboard with task cards, progress bars, and team member avatars"
- "Create a customer feedback form with rating stars, text areas, and file upload"
- "Design a data analytics interface with charts, filters, and export buttons"
- "Make a product catalog page with grid layout, search, and category filters"

## Features Deep Dive 🔍

### Chat Interface
- **Conversation History**: Maintains context across multiple exchanges
- **Clear Chat**: Reset conversation and start fresh
- **Professional Styling**: Beautiful gradient chat bubbles

### HTML Generation
- **Complete Files**: Always generates runnable HTML files
- **Modern Standards**: Uses current HTML5, CSS3, and ES6+ JavaScript
- **Responsive Design**: Mobile-first approach with breakpoints
- **Professional Themes**: Business-appropriate color schemes and fonts

### Preview & Launch
- **Live Preview**: In-app HTML rendering (basic)
- **Browser Launch**: Full-featured preview in default browser
- **Download**: Save HTML files locally
- **Copy Code**: Easy clipboard access

### Quick Actions
- **Template Gallery**: Pre-built prototypes for common use cases
- **One-Click Launch**: Instant browser preview
- **Code Export**: Multiple export options

## Technical Architecture 🏗️

### Core Components
- **HTMLPrototypeBot**: Main bot class handling Athena GPT communication
- **Streamlit UI**: Modern web interface with custom CSS
- **Configuration Management**: Flexible API key and settings handling
- **HTML Processing**: Code extraction and preview generation

### API Integration
- Uses Azure OpenAI client for Athena GPT
- Robust error handling and connection management
- Conversation history management
- System prompt optimization for HTML generation

## Troubleshooting 🔧

### Common Issues

**❌ "No API key found"**
- Check that `cred.txt` exists in `../test_app/agpt_api_docs/`
- Verify the API key format in the file: `athenagpt:your_key_here`
- Set environment variable `AGPT_API` as alternative

**❌ "Preview error"**
- Some complex HTML may not render in Streamlit's preview
- Use "Launch in Browser" for full functionality
- Check browser console for JavaScript errors

**❌ "Unable to connect to Athena GPT"**
- Verify your network connection
- Check if using correct environment (prod/uat)
- Ensure API key is valid and not expired

### Performance Tips
- **Clear chat history** periodically to improve response times
- **Use specific prompts** for better HTML generation
- **Test in browser** for accurate preview of complex prototypes

## Examples Gallery 🎨

### Dashboard Example
```
"Create an executive dashboard with KPI cards, 
revenue chart, recent activities feed, and quick actions menu"
```

### Form Example
```
"Build an employee onboarding form with personal info, 
job details, document uploads, and progress tracker"
```

### Table Example
```
"Design a customer database table with sorting, filtering, 
pagination, and inline edit capabilities"
```

## Contributing 🤝

This tool is designed for athenahealth internal use. For enhancements or bug reports, please reach out to the development team.

## Version History 📋

- **v1.0.0** - Initial release with core HTML generation capabilities
- Full Athena GPT integration
- Template library and chat interface
- Browser launch and preview features

---

**Built with ❤️ for athenahealth internal tool prototyping**
