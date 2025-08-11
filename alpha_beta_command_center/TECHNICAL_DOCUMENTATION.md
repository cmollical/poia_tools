# Alpha Beta Command Center - Technical Documentation

## Project Overview

The Alpha Beta Command Center is a comprehensive web application built for managing athenahealth's Alpha/Beta testing program. It provides tools for generating client lists, managing opt-in/opt-out surveys, creating Qualtrics surveys, generating content for communications, and pulling final client lists with comprehensive reporting capabilities.

---

## Architecture Overview

### **Technology Stack**
- **Backend**: Node.js with Express.js framework
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla JS)
- **Database**: Snowflake Data Warehouse
- **Database Connectivity**: ODBC via `odbc` npm package
- **File Processing**: ExcelJS for Excel generation, PowerShell scripts for data processing
- **External Integrations**: Qualtrics API, Jira API
- **Authentication**: Session-based authentication with bcrypt password hashing
- **Process Management**: PM2 for production deployment

### **Core Components**

#### **1. Web Server (`server.js`)**
- Express.js application serving static files and API endpoints
- Session management with secure authentication
- RESTful API endpoints for all major functionality
- Database connection management via `dbUtils.js`
- Comprehensive logging and error handling

#### **2. Database Layer**
- **`dbUtils.js`**: Snowflake query execution with connection pooling
- **`dbAuth.js`**: Authentication-related database operations
- ODBC connection string management with environment variables

#### **3. PowerShell Automation**
- **`list_generation_power_shell.ps1`**: Core list generation logic
- **`list_filter_power_shell.ps1`**: Client list filtering and processing
- Dynamic SQL generation and execution
- Excel file generation and database logging

#### **4. External Integrations**
- **Qualtrics Integration**: `create_qualtrics_survey.py`
- **Jira Integration**: `JiraIssueCreation/` directory
- **SQL Generation**: `sql_generator_bridge.py`

---

## Database Schema

### **Tables This Project READS FROM**

#### **Primary Data Sources**
| Table Name | Purpose | Key Columns |
|------------|---------|-------------|
| `corpanalytics_business_prod.scratchpad_prdpf.alpha_beta_list_generation` | Core alpha/beta client data repository | contextid, client_relationship_type, feature_key, interested |
| `corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys` | Survey configuration and metadata | feature_number, alpha_beta, qualtrics_survey_id, final_survey_name, qualtrics_survey_url |
| `corpanalytics_business_prod.scratchpad_prdpf.cr_client_list` | Client list data for final pulls | Context_ID, Practice_Name, Username, Email_Address, feature_key, Account_Name, Full_Name, Email, CSM_Tier, CS_Team, CSM_Name, Alpha_Beta_Status, Opt_In_Out |

#### **Survey Response Tables**
| Table Name | Purpose | Key Columns |
|------------|---------|-------------|
| `corpanalytics_business_prod.scratchpad_prdpf.CR_Q_OPT_OUT_SURVEY_RESPONSES` | Opt-out survey responses | q2_practice_id, q3_organization_name, q4_username, q5_email_address, q7_opt_out_reason, q7_opt_out_reason_other_text, response_end_date, qualtrics_survey_id |
| `corpanalytics_business_prod.scratchpad_prdpf.cr_q_opt_in_survey_responses` | Opt-in survey responses | q4_practice_id, q5_organization_name, q6_username, q7_email_address, q3_opt_in_choice, response_end_date, qualtrics_survey_id |
| `corpanalytics_business_prod.scratchpad_prdpf.CR_Q_OPT_IN_SURVEY_RESPONSES` | Opt-in survey responses (alternate case) | Same as above with case variations |

#### **Integration & Reference Tables**
| Table Name | Purpose | Key Columns |
|------------|---------|-------------|
| `corpanalytics_business_prod.scratchpad_prdpf.CR_APP_USERS` | Application user authentication | USER_NAME, PASSWORD_HASH, LAST_LOGIN |
| `corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_content` | Content templates and alpha information | feature_number, alpha_beta_stage, content_type, ALPHA_NAME, CLIENT_FACING_FEATURE_NAME, PRACTICE_IDS, OPT_IN_DEADLINE, ALPHA_START_DATE, RELEASE_NOTE_URL, ADDITIONAL_NOTES, FEEDBACK_METHOD |
| `corpanalytics_business_prod.scratchpad_prdpf.temp_feature_master_6_13_2022` | Feature master data | feature_number, feature_description |
| `CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.SALESFORCE_ACCOUNT_MASTER` | Account master data from Salesforce | account details |
| `CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.SALESFORCE_MARKETINGCLOUD_CR` | Marketing Cloud integration data | emailaddress, emailname, jobid |
| `corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests` | Historical user request log (also read for analysis) | USER, PROMPT, GENERATED_SQL, FILE_NAME, SQL_EXPLANATION, OPTIN_OUT |

### **Tables This Project WRITES TO**

#### **Activity Logging**
| Table Name | Purpose | Key Columns | Triggers |
|------------|---------|-------------|----------|
| `corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests` | Logs all user requests and generated SQL | USER, PROMPT, GENERATED_SQL, FILE_NAME, SQL_EXPLANATION, OPTIN_OUT | Every list generation, SQL query |
| `corpanalytics_business_prod.scratchpad_prdpf.CR_FINAL_LIST_PULL` | Logs final client list downloads | USER_NAME, FEATURE_NUMBER, STAGE, WAVE, TOTAL_CLIENTS, TOTAL_OPT_OUTS, PULL_TIMESTAMP | Final client list downloads |
| `corpanalytics_business_prod.scratchpad_prdpf.cr_template_management_log` | Template management activity log | activity logging data | Template operations |

#### **Results Storage**
| Table Name | Purpose | Key Columns | Triggers |
|------------|---------|-------------|----------|
| `corpanalytics_business_prod.scratchpad_prdpf.alpha_beta_list_generation_results` | Stores generated client list results | Dynamic columns based on query results, FILE_NAME | PowerShell list generation |
| `corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_beta_content_creation` | Content creation results | content creation data | Content generation workflows |

---

## Core Functionality

### **1. List Generation Module**
**Location**: `/public/list_generation.html`
**Backend**: PowerShell scripts + Node.js endpoints

**Workflow**:
1. User provides natural language prompt describing desired client list
2. Frontend sends prompt to `/api/generate-client-list`
3. Node.js calls `list_generation_power_shell.ps1`
4. PowerShell script:
   - Calls Python bridge (`sql_generator_bridge.py`) for SQL generation
   - Executes generated SQL against `alpha_beta_list_generation` table
   - Stores results in `alpha_beta_list_generation_results`
   - Logs request in `cr_user_requests`
   - Generates Excel file with results

**Key Features**:
- Natural language to SQL conversion
- Dynamic column detection and Excel formatting
- Comprehensive activity logging
- Error handling with metadata file generation

### **2. List Filtering Module** 
**Location**: `/public/list_filtering.html`
**Backend**: `list_filter_power_shell.ps1`

**Workflow**:
1. User uploads Excel file with contextid and client_relationship_type
2. System generates filtered SQL using uploaded data as filter criteria
3. Results filtered against `alpha_beta_list_generation` table
4. Filtered results stored and exported to Excel

### **3. Final Client List Module**
**Location**: `/public/final_client_list.html`
**Backend**: Multiple endpoints with opt-out processing

**Workflow**:
1. User specifies feature number, stage, and wave
2. System queries `cr_client_list` for client data
3. **Opt-out Processing**:
   - Queries `CR_Q_OPT_OUT_SURVEY_RESPONSES` for survey responses
   - Joins with `cr_opt_in_out_surveys` for metadata
   - Creates separate "opt-outs" worksheet in Excel
4. **Download Handling**:
   - Small datasets (&lt;200 clients): Direct download via POST endpoint
   - Large datasets (≥200 clients): Store data with downloadId, serve via GET endpoint
5. **Activity Logging**: Records pull details in `CR_FINAL_LIST_PULL`

**Key Features**:
- Dual endpoint architecture for performance optimization
- Comprehensive opt-out survey integration
- Form reset timing to preserve metadata
- Excel generation with multiple worksheets

### **4. Survey Management**
**Location**: `/public/survey_creation.html`
**Backend**: Python Qualtrics integration

**Workflow**:
1. Survey configuration through web interface
2. Python script (`create_qualtrics_survey.py`) creates Qualtrics survey
3. Survey metadata stored in `cr_opt_in_out_surveys`
4. Integration with list generation for targeted surveys

### **5. Content Creation**
**Location**: `/public/content_creation.html`
**Backend**: Template-based content generation

**Features**:
- Alpha/Beta communication content generation
- Template management with `cr_alpha_content` integration
- Dynamic content based on feature and stage

### **6. Authentication System**
**Backend**: `dbAuth.js` + session management

**Features**:
- bcrypt password hashing
- Session-based authentication
- User data stored in `CR_APP_USERS`
- Last login tracking

---

## API Endpoints

### **Core Endpoints**

| Endpoint | Method | Purpose | Database Operations |
|----------|---------|---------|-------------------|
| `/api/generate-client-list` | POST | Generate client lists from natural language | READ: `alpha_beta_list_generation`<br>WRITE: `alpha_beta_list_generation_results`, `cr_user_requests` |
| `/api/pull-final-client-list` | POST | Pull final client list data | READ: `cr_client_list`, `cr_opt_in_out_surveys` |
| `/api/store-client-data-for-download` | POST | Store large dataset for download | In-memory storage with downloadId |
| `/api/download-final-client-list` | GET/POST | Download Excel with opt-out processing | READ: `CR_Q_OPT_OUT_SURVEY_RESPONSES`, `cr_opt_in_out_surveys`<br>WRITE: `CR_FINAL_LIST_PULL` |
| `/api/survey-check` | GET | Check survey configuration | READ: `cr_opt_in_out_surveys` |
| `/api/create-survey` | POST | Create Qualtrics survey | External Qualtrics API |

### **Authentication Endpoints**

| Endpoint | Method | Purpose |
|----------|---------|---------|
| `/login` | POST | User authentication |
| `/logout` | POST | Session termination |
| `/check-auth` | GET | Session validation |

---

## Configuration

### **Environment Variables**
```bash
# Snowflake Connection
SNOWFLAKE_ACCOUNT=athenahealth
SNOWFLAKE_USERNAME=SVC_JIR_PROPS
SNOWFLAKE_PASSWORD=[secured]
SNOWFLAKE_DATABASE=CORPANALYTICS_BUSINESS_PROD
SNOWFLAKE_SCHEMA=SCRATCHPAD_PRDPF
SNOWFLAKE_WAREHOUSE=CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD

# Application
NODE_ENV=production
SESSION_SECRET=[secured]

# External APIs
Jira=[API Token for Jira integration]
```

### **Key Configuration Files**
- **`dbUtils.js`**: Database connection configuration
- **`package.json`**: Node.js dependencies and scripts
- **PowerShell execution policies**: Required for script execution

---

## Deployment & Operations

### **Production Deployment**
- PM2 process manager for Node.js application
- Multiple worker processes for high availability
- Automatic restart on failure
- Log aggregation via PM2

### **Monitoring & Logging**
- Comprehensive console logging throughout application
- Database query logging with execution times
- Error tracking with stack traces
- PowerShell script execution logs
- Snowflake connection logs (`snowflake.log`)

### **File Management**
- Excel file generation in memory (no temporary files)
- PowerShell-generated files cleaned up automatically
- Static assets served from `/public` directory

---

## Security Considerations

### **Data Security**
- ODBC connection with service account credentials
- Password hashing with bcrypt (12 rounds)
- SQL injection prevention via parameterized queries
- Session-based authentication with secure cookies

### **Input Validation**
- User prompt sanitization for SQL generation
- File upload validation
- Parameter validation on all API endpoints

---

## Troubleshooting Guide

### **Common Issues**

#### **Database Connection Issues**
- **Symptoms**: "Database query failed" errors
- **Check**: Snowflake connection parameters in environment variables
- **Logs**: Check `snowflake.log` for connection details

#### **PowerShell Execution Issues**
- **Symptoms**: List generation failures
- **Check**: PowerShell execution policy
- **Command**: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

#### **Excel Generation Failures**
- **Symptoms**: Download failures, CSV fallback
- **Check**: ExcelJS dependency installation
- **Fallback**: System automatically generates CSV if Excel fails

#### **Opt-out Tab Missing**
- **Symptoms**: Excel downloads without opt-out worksheet
- **Check**: SQL syntax in opt-out queries
- **Verify**: Feature number and stage parameters match survey data

### **Log Locations**
- **Node.js logs**: Console output (PM2 captures)
- **Snowflake logs**: `./snowflake.log`
- **PowerShell logs**: Embedded in Node.js console output

---

## Development Notes

### **Code Organization**
- **Frontend**: Individual HTML files with embedded JavaScript
- **Backend**: Modular Node.js with separate utility files
- **Database**: Centralized connection management
- **Scripts**: PowerShell for heavy data processing

### **Key Design Decisions**
1. **Dual Download Architecture**: Small datasets use direct download, large datasets use stored downloadId
2. **PowerShell Integration**: Leverages existing PowerShell expertise and tools
3. **In-Memory Storage**: Large datasets stored temporarily in Node.js memory
4. **Session Authentication**: Simple, secure authentication without external dependencies

### **Future Enhancement Opportunities**
- Database connection pooling optimization
- Real-time progress indicators for long-running operations  
- Enhanced error reporting and user feedback
- API rate limiting and throttling
- Comprehensive audit logging

---

## Dependencies

### **Node.js Packages**
```json
{
  "express": "Web server framework",
  "express-session": "Session management", 
  "bcryptjs": "Password hashing",
  "odbc": "Snowflake database connectivity",
  "exceljs": "Excel file generation",
  "multer": "File upload handling"
}
```

### **System Dependencies**
- **PowerShell**: Core script execution
- **ODBC Drivers**: Snowflake connectivity
- **Python**: External integrations (Qualtrics, SQL generation)

---

*Last Updated: August 2025*  
*Version: 1.0 - Initial Production Release*
