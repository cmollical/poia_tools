# AI-Driven Project Management Suite

A web-based tool that enables users to speak project updates, which are parsed by AI to create Jira stories/bugs with intelligent epic matching and auto-generate structured Confluence summaries.

## Features
- 🎤 Voice-to-text using Web Speech API
- ✏️ Manual text input/editing capabilities
- 🤖 AI-powered intent classification and processing
- 📋 Automated Jira story/bug creation with intelligent epic matching
- 🔄 Context-aware epic selection based on user information
- 🏷️ Automatic keyword extraction for better epic matching
- 📊 Epic relevance scoring based on activity and content
- 📝 Confluence summary generation
- 🔐 OAuth 2.0 authentication
- 🌐 Fully browser-based (no .exe required)
- 🧪 Comprehensive test suite with unit, component and E2E tests

## 🚀 Current Status: **Phase 4 Complete - Full Integration Suite**

The AI-Driven Project Management Suite is now fully implemented with comprehensive Jira and Confluence integrations:

### ✅ Completed Features
- Intelligent epic matching and selection
- Automated Jira issue creation with proper epic linking
- Confluence page matching and content updating
- User-friendly interfaces for epic and page selection
- Comprehensive error handling and validation

## Tech Stack
- **Frontend**: React, Tailwind CSS, Web Speech API
- **Backend**: Python FastAPI
- **AI**: AthenaGPT (Azure OpenAI) / OpenAI API
- **Integrations**: Jira REST API, Confluence REST API
- **Deployment**: Vercel (frontend), Render/AWS Lambda (backend)

## Getting Started

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Project Structure
```
ProjectManagement/
├── frontend/          # React application
├── backend/           # FastAPI application
├── Spec.md           # Project specification
└── README.md         # This file
```

## Environment Variables

Create a `.env` file in the **project root directory** with the following variables:

### AI Configuration (AthenaGPT is preferred)
- `AGPT_API` - Your AthenaGPT API key
- `ATHENAGPT_API_VERSION` - API version (default: 2025-01-01-preview)
- `ATHENAGPT_MODEL` - Model to use (default: gpt-4o-mini-2024-07-18)
- `ATHENAGPT_ENVIRONMENT` - Environment to use (uat or prod, default: uat)
- `ATHENAGPT_MAX_HISTORY` - Maximum chat history to maintain

### Alternative AI Configuration
- `OPENAI_API_KEY` - Only needed if not using AthenaGPT

### Jira Integration Configuration
- `JIRA` - Jira API token for authentication
- `JIRA_SERVER` - URL of your Jira server (default: https://athenajira.athenahealth.com/)
- `JIRA_VERIFY_SSL` - Whether to verify SSL certificates (default: false)

### Confluence Configuration (Phase 4 - COMPLETED)
- `CONFLUENCE_PAT` - Confluence Personal Access Token
- `CONFLUENCE_BASE_URL` - Confluence instance URL
- `CONFLUENCE_VERIFY_SSL` - Whether to verify SSL certificates (default: false)

## Development Phases
1. ✅ Voice to Text (Web Speech API)
2. ✅ Manual Text Input/Paste
3. ✅ Transcript to Intent (AthenaGPT/LLM processing)
4. ✅ Jira Integration with Epic Matching
5. ✅ Confluence Integration with Page Matching
6. 📝 Confluence Sync
7. 🎨 UI Enhancements
8. 🔐 Authentication & Deployment
9. 📊 Observability & Logging
10. 🚀 Expansion & Refinement

## Jira Integration Features

### Intelligent Epic Matching
The system uses a sophisticated algorithm to match classified intents with existing epics in Jira. The matching considers:

- **Keyword Analysis**: Extracts and matches keywords from intent with epic descriptions
- **Recent Activity**: Prioritizes epics with recent activity in the last 30 days
- **Issue Count**: Considers the current workload of epics (prioritizes active but not overloaded epics)
- **User Context**: Takes into account the current user's assignments and team

### User-Friendly Epic Selection
The UI provides a clear, ranked list of matching epics with:

- **Match Score**: Displayed as a percentage to show confidence level
- **Epic Status**: Visual indicators of epic status (In Progress, Done, etc.)
- **Activity Indicator**: Shows if the epic has had recent activity
- **Issue Count**: Shows how many issues are currently linked to the epic

### Customizable Creation Flow
Users can:

- Choose to create standalone issues or link to epics
- Override automated epic matching with manual selection
- See detailed epic information before making a decision
- View newly created issues with direct links to Jira

## Testing

The project includes a comprehensive testing suite:

```bash
# Run all tests
.\run-all-tests.ps1 -All

# Run specific test types
.\run-all-tests.ps1 -Backend -Frontend
.\run-all-tests.ps1 -E2E

# Run tests in parallel
.\run-all-tests.ps1 -All -Parallel
```

See TESTING.md for more details on the testing framework.
