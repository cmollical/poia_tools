# Alpha/Beta Command Center Technical Stack

This document outlines the complete technology stack used in the Alpha/Beta Command Center project.

## Overview

The Alpha/Beta Command Center is a comprehensive tool designed to manage client recruitment, content generation, and survey management for alpha/beta testing. The application follows a hybrid architecture that combines:

- Node.js web server (Backend)
- HTML/CSS/JavaScript (Frontend)
- PowerShell scripts (Automation)
- Python scripts (Qualtrics integration)
- Snowflake database (Data storage & retrieval)

## Backend Technologies

### Server Environment
- **Runtime**: Node.js
- **Framework**: Express.js
- **API Style**: RESTful

### Dependencies
- **express**: Web server framework
- **express-session**: Session management
- **body-parser**: Request parsing middleware
- **bcrypt**: Password hashing and security
- **odbc**: Database connectivity for Snowflake
- **docxtemplater**: Document template manipulation
- **pizzip**: ZIP handling for document generation
- **cheerio**: HTML parsing and manipulation

### Database
- **Platform**: Snowflake
- **Connectivity**: ODBC driver
- **Schema**: Multiple schemas used:
  - `corpanalytics_business_prod.scratchpad_prdpf`
  - `corpanalytics_salesforce_prod.clean`
  - `corpanalytics_business_prod.ent_product`

## Frontend Technologies

### Core Technologies
- **HTML5**: Structure
- **CSS3**: Styling
- **JavaScript (ES6+)**: Client-side interactivity

### UI Architecture
- **Style**: Custom CSS (no external frameworks)
- **Rendering**: Server-side HTML generation with client-side DOM manipulation
- **Features**:
  - Modal dialogs
  - Dynamic table generation
  - CSV export functionality
  - Form validation

## Automation Scripts

### PowerShell Scripts
- **list_generation_power_shell.ps1**: Generates initial client lists
- **list_filter_power_shell.ps1**: Filters client lists against criteria

### Python Scripts
- **create_qualtrics_survey.py**: Creates standardized Qualtrics surveys

### Python Dependencies
- **requests**: HTTP library for API calls
- **snowflake-connector-python**: Snowflake connectivity with Pandas support

## Authentication & Security

- **Session Management**: Express session with secure cookie configuration
- **Password Security**: bcrypt hashing
- **API Security**: Server-side validation and authentication middleware

## Data Flow Architecture

1. **Authentication Flow**:
   - Login credentials → Authentication → Session creation
   - Session verification for protected routes

2. **List Generation Flow**:
   - User selects criteria → PowerShell script execution → List generation → Snowflake storage
   - Results displayed to user

3. **Feature-Based Active Client Query Flow**:
   - User inputs feature key → Server executes Snowflake query → Results returned to client
   - Client-side rendering and export options

4. **Content Generation Flow**:
   - User selects template & data → Document generation → File download/storage
   - Document templates stored in templates directory

5. **Survey Creation Flow**:
   - User provides survey parameters → Python script execution → Qualtrics API integration
   - Survey link returned to user

## File Organization

- **server.js**: Main application entry point
- **authRoutes.js**: Authentication route handlers
- **dbUtils.js**: Database utility functions
- **public/**: Static frontend assets
  - HTML pages
  - CSS
  - Client-side JavaScript
- **templates/**: Document templates
- **PowerShell scripts**: Automation scripts
- **Python scripts**: Integration scripts

## Integration Points

- **Snowflake**: Primary data source for client information
- **Qualtrics**: Survey creation and management
- **File System**: Document storage and retrieval
- **OneDrive**: Output location for generated documents

## Environment Variables

- **API_USERNAME**: Snowflake username
- **API_PASSWORD**: Snowflake password
- **SESSION_SECRET**: Secret for session security
- **QUALTRICS_API_TOKEN**: Token for Qualtrics API
- **QUALTRICS_DATACENTER_ID**: Qualtrics datacenter identifier

## Deployment Considerations

- **Port**: 3000 (default)
- **Network**: Configurable to listen on all interfaces
- **Dependencies**: Node.js, Python, PowerShell, Snowflake ODBC driver
