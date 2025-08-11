
## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1874 - Implement "Pull List of Active Clients" Feature (Status: Done)

**Description:**
Add functionality to allow users to pull a list of active clients based on a feature number. This involves adding a button to the home screen, a popup for feature number input, a backend endpoint to execute a predefined Snowflake query with the provided feature number, and displaying the results to the user.

## Acceptance Criteria
- A button labeled "Pull List of Active Clients" is visible on the home screen.
- Clicking the button opens a modal/popup prompting the user to enter a feature number (e.g., FEATURE-123).
- The modal has a "Submit" button.
- Upon submitting a valid feature number, a request is sent to a new backend endpoint.
- The backend endpoint executes the specified Snowflake query, replacing `<FEATURE_KEY>` with the user-provided feature number.
- The query results are returned to the frontend.
- The frontend displays the query results in a user-friendly format (e.g., a table).
- Appropriate error handling is implemented for invalid feature numbers or query failures.
---
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1875 - Enhance Qualtrics Survey Creation for Missing Feature Names (Existing Lists) (Status: Done)

**Description:**
Modified the "Create Survey from Existing List" functionality in `qualtrics_survey.html`. Previously, if a client-facing feature name was not found for a selected list item, an error would be displayed, and survey creation would be blocked. This change ensures that if a feature name is not found, a placeholder text ("**PLEASE UPDATE WITH CLIENT FACING FEATURE NAME**") is used, allowing the user to proceed with creating the Qualtrics survey. This makes the behavior consistent with the "Create Survey with Manual Details" section.

## Acceptance Criteria
- When creating a Qualtrics survey from an "Existing List," if the client-facing feature name is not found, the system uses the placeholder "**PLEASE UPDATE WITH CLIENT FACING FEATURE NAME**".
- The user can proceed to the date selection modal and create the survey even with the placeholder.
- The `create_qualtrics_survey.py` script correctly receives and processes this placeholder text.
- The behavior is consistent with the manual survey creation flow.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1877 - Enhance User Greeting with First Name (Status: Done)

**Description:**
Modified the user authentication and display system to provide a more personalized greeting.
This involved:
1.  **Database Schema Update:** Added a `FIRST_NAME` column (VARCHAR(50)) to the `corpanalytics_business_prod.scratchpad_prdpf.CR_APP_USERS` table in Snowflake.
2.  **Backend Authentication Logic:**
    *   Updated `dbAuth.js` (`getUserByUsername`) to fetch the `FIRST_NAME`.
    *   Updated `authController.js` (`handleLogin`, `handleSetupPassword`) to store `FIRST_NAME` in the user's session and include it in login/setup API responses.
    *   Updated `authRoutes.js` (`/check-session`) to include `FIRST_NAME` in the session check API response.
3.  **Frontend UI Update:**
    *   Modified `home.html` to update the `showLoggedInUI` JavaScript function to accept and display the `firstName` (falling back to `username` if `firstName` is not available).
    *   Updated the `DOMContentLoaded` event listener in `home.html` to pass the `firstName` to `showLoggedInUI`.

## Acceptance Criteria
**
- The `CR_APP_USERS` table in Snowflake has a `FIRST_NAME` column.
- When a user logs in, their first name (if available in the database) is fetched and stored in the session.
- The `/auth/check-session` endpoint returns the user's first name.
- The home page displays "Hello, [First Name]" if the first name is available.
- If the first name is not available, the home page falls back to displaying "Hello, [Username]".
- Existing user login and session management functionality remains unaffected.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Bug: ROIA-1878 - Fix Snowflake SQL error in ALPHA_BETA_LIST_GENERATION SP due to aliased row numbers (RN) in GROUP BY ALL. (Status: Done)

**Description:**
Modified the JavaScript prompt within the `ALPHA_BETA_LIST_GENERATION` stored procedure. The prompt now instructs the LLM (Claude 3.5 Sonnet via `SNOWFLAKE.CORTEX.COMPLETE`) to explicitly exclude aliased row numbers (e.g., `AS rn`) from the selection passed to `GROUP BY ALL` when representative sampling is applied to a subquery that has already defined such an alias. This prevents the "SQL compilation error: column "RN" is ambiguous" error.

## Acceptance Criteria
- The stored procedure generates valid SQL that does not error out due to ambiguous `RN` columns in `GROUP BY ALL` clauses.
- List generation using the stored procedure completes successfully.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Bug: ROIA-1879 - Resolve "Object already exists" error and fix `table_exists` check for `CR_FINAL_LIST_PULL` table. (Status: Done)

**Description:**
Modified the `/api/log-top25-verification` endpoint in `server.js`. Changed `CREATE TABLE CR_FINAL_LIST_PULL` to `CREATE TABLE IF NOT EXISTS CR_FINAL_LIST_PULL` to prevent errors if the table already exists. Corrected a case-sensitive property access in the table existence check: changed `result[0].TABLE_EXISTS` to `result[0].table_exists` to match the SQL alias from the `SHOW TABLES LIKE ...` query.

## Acceptance Criteria
- The `/api/log-top25-verification` endpoint no longer errors if the `CR_FINAL_LIST_PULL` table already exists.
- The server correctly identifies if the table exists, preventing unnecessary creation attempts.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1880 - Improve performance of client list logging by implementing bulk INSERT for `CR_FINAL_LIST_PULL`. (Status: Done)

**Description:**
Refactored the `/api/log-top25-verification` endpoint in `server.js`. Instead of inserting client data row-by-row in a loop, the code now constructs a single multi-row `INSERT` statement. All client records for a given logging operation are now inserted in one database call.

## Acceptance Criteria
- Client list logging completes significantly faster, especially for large lists.
- All client records are correctly inserted into the `CR_FINAL_LIST_PULL` table.
- The server logs indicate a single bulk insert operation instead of multiple individual inserts.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1881 - Implement context-level opt-out for final client list generation. (Status: Done)

**Description:**
Modified the SQL query in the `/api/pull-final-client-list` endpoint in `server.js`. Added a Common Table Expression (CTE) `OptedOutContexts` to identify all `Context_ID`s that have at least one user submitting an opt-out response for the relevant survey. The main query's `WHERE` clause was updated: for "Opt-Out" tests that are not "CSM Sends Alpha/Beta Invites", it now excludes any `Context_ID` present in the `OptedOutContexts` CTE. The `oi.q3_opt_in_choice = 1` condition (for opt-in responses) was moved from the `LEFT JOIN ON` clause to the specific parts of the `WHERE` clause where it's relevant.

## Acceptance Criteria
- If any user within a `Context_ID` opts out of an "Opt-Out" test, the entire `Context_ID` is excluded from the final client list (unless `alpha_beta_status` is "CSM Sends Alpha/Beta Invites", which requires explicit opt-in).
- "Opt-In" tests and "CSM Sends Alpha/Beta Invites" (opt-out type) tests continue to function correctly based on individual opt-in responses.
- The query correctly identifies and pulls the final client list according to the new logic.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Bug: ROIA-1882 - Resolve PayloadTooLargeError by increasing body-parser limits. (Status: Done)

**Description:**
Modified `server.js` to increase the request body size limits for `body-parser` middleware. Changed `app.use(bodyParser.urlencoded({ extended: true }));` and `app.use(bodyParser.json());` to `app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));` and `app.use(bodyParser.json({ limit: '50mb' }));`.

## Acceptance Criteria
- The server no longer throws `PayloadTooLargeError` when handling large request bodies (e.g., during client list logging).
- Endpoints like `/api/log-top25-verification` can successfully process large client lists.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Bug: ROIA-1883 - Fix "Invalid regular expression" error in final client list query. (Status: Done)

**Description:**
Corrected the regular expression pattern used in `regexp_replace` functions within the `/api/pull-final-client-list` SQL query in `server.js`. The pattern was changed from `\\\\((.*` to `\\s*\\(([^)]*)\\)` to correctly match and remove parenthesized wave details (e.g., " (details)") including leading spaces and the parentheses themselves. This involved ensuring the correct number of backslashes in the JavaScript string literal for proper escaping in SQL.

## Acceptance Criteria
- The `/api/pull-final-client-list` endpoint executes without "Invalid regular expression" errors.
- Wave information is correctly parsed and displayed in the final client list.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Bug: ROIA-1884 - Refine Final Client List SQL to correctly handle CSMInvite and Wave filtering (Status: Done)

**Description:**
+The SQL query for the "Pull Final Client List" feature was producing incorrect client counts. 
+Initial attempts to include both standard and `CSMInviteBeta` lists resulted in either too few or too many clients due to issues with stage and wave number filtering logic in JOINs and WHERE clauses. 
+The query was iteratively refined to ensure:
+1. Both `Beta` and `CSMInviteBeta` lists are included for the specified stage.
+2. Only the specified wave number is included, preventing data from previous waves.
+3. JOIN conditions between `cr_user_requests` and `cr_client_list` correctly align feature, stage, and wave.
+4. Opt-in/opt-out logic remains consistent with existing requirements.

## Acceptance Criteria
**
+- When pulling the Final Client List for a feature, stage (e.g., Beta), and wave (e.g., 2):
+  - The query returns the correct number of unique clients (e.g., 986 for FEATURE-27343, Beta, Wave 2).
+  - Clients from both standard `_Beta_` lists and `_CSMInviteBeta_` lists are included.
+  - No clients from other wave numbers are included.
+  - The opt-in/opt-out logic correctly filters clients based on their survey responses and CSM-send status.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Bug: ROIA-1885 - Fix: Corrected SQL query for final client list to prevent over-pulling rows. (Status: Done)

**Description:**
The SQL query in `server.js` responsible for fetching the final client list was returning an incorrect number of rows (e.g., 1288 instead of an expected 986). This was due to improper backslash escaping in `REGEXP_REPLACE` functions within the JavaScript template literal. This caused the regular expression to not correctly strip parenthetical text from wave identifiers during comparisons. The escaping has been corrected to use double backslashes (`\\`) in the JS template literal, ensuring the Snowflake SQL engine receives the correctly formatted regular expression for accurate data filtering.

## Acceptance Criteria
- When querying the final client list (e.g., for FEATURE-27343, Beta, Wave 2), the server returns the correct number of rows (e.g., 986).
- The `REGEXP_REPLACE` functions within the final client list SQL query in `server.js` use `\\s*\\(([^)]*)\\)` in the JavaScript template literal for relevant patterns.
- Server logs for the final client list request show the executed SQL query containing the correctly escaped regex pattern `\s*\(([^)]*)\)` being sent to Snowflake.
---

## Epic: Research Ops Support [ROIA-1886]

### Story: ROIA-1887 - Node.js alerting system for duplicate Qualtrics survey usage (Status: Done)

**Description:**
Developed a Node.js application to identify Qualtrics surveys used across multiple studies. The application queries a Snowflake database daily using credentials and connection details stored in environment variables (or a .env file). Alerts for duplicate survey IDs are sent to a configurable Microsoft Teams channel via an incoming webhook URL (also from an environment variable). Alert messages detail the problematic Survey ID and a comma-separated list of associated Study IDs. A key feature is a dismissal mechanism: users can click a "dismiss" link in the Teams message, which calls an endpoint on a small, co-deployed Express.js web server. This server then updates an ignore list (SURVEY_ID_IGNORES table) in the Snowflake SCRATCHPAD_PRDPF schema, preventing future alerts for that survey ID. The main alert script leverages `node-cron` for daily scheduling (e.g., 10 AM ET), and the dismiss server listens on a configurable (or hardcoded) IP and port (e.g., 10.4.74.143:3100). Both components are designed to be managed by PM2 for persistence and process management. The system handles cases where no duplicates are found by not sending any Teams message.

## Acceptance Criteria
- Node.js script successfully queries Snowflake for Qualtrics survey IDs used in multiple studies, excluding those in the SURVEY_ID_IGNORES table.
- If active, non-dismissed duplicates are found, a formatted message is posted to the configured Teams channel.
- The Teams message correctly lists each duplicate Survey ID and the associated Study IDs.
- Each Survey ID in the Teams message includes a "dismiss" hyperlink.
- The "dismiss" link points to the dismiss server (e.g., http://10.4.74.143:3100/dismiss?survey_id=...).
- Clicking the "dismiss" link successfully calls the dismiss server endpoint.
- The dismiss server updates the SURVEY_ID_IGNORES table in Snowflake, marking the survey_id as active and recording the dismissal timestamp.
- Survey IDs marked as dismissed in Snowflake do not appear in subsequent alert messages.
- If no active, non-dismissed duplicates are found, no message is sent to Teams.
- The alert script is scheduled to run daily at 10 AM ET using `node-cron` when not in `RUN_MODE=once`.
- The dismiss server (dismissServer.js) listens on the specified IP and port (e.g., 10.4.74.143:3100).
- Both surveyAlert.js and dismissServer.js can be started and managed using PM2.
- Environment variables (API_USERNAME, API_PASSWORD, study_central_teams_webhook, SERVER_BASE_URL or hardcoded values) are correctly utilized.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Bug: ROIA-1888 - Debug and Fix Snowflake Query for Final Client List (Status: Done)

**Description:**
The Snowflake query for pulling the final client list was not returning results. Investigation revealed issues with Context_ID formatting (trailing ".0") and subquery evaluation (`NOT IN` vs `NOT EXISTS`). The query logic for opt-out conditions was also reviewed and confirmed.

## Acceptance Criteria
- Final client list query returns accurate results in Snowflake for various feature/stage/wave combinations.
- Context_ID comparisons correctly handle potential ".0" formatting differences.
- Subqueries using `NOT IN` are refactored to `NOT EXISTS` if they cause "Unsupported subquery type" errors.
- Opt-in/Opt-out logic correctly filters clients based on their status and survey responses.
---

## Epic: Research Ops Support [ROIA-1886]

### Bug: ROIA-1889 - Fix SQL syntax error in surveyAlert.js duplicate survey query (Status: Done)

**Description:**
The `DUPLICATE_SURVEY_QUERY` in `surveyAlert.js` contained a duplicated, partially-repeated SQL block. This caused a Snowflake "syntax error line 37 at position 4 unexpected 'SELECT'. syntax error line 43 at position 4 unexpected 'GROUP'." compilation error, preventing the job from running. The fix involved removing the duplicated SQL section to ensure the query is syntactically correct.

## Acceptance Criteria
- The `surveyAlert.js` job executes successfully when run manually or via cron.
- No SQL compilation errors are logged.
- If duplicate survey IDs are found, a message with the correct count and details is sent to the configured Teams channel.
- If no duplicate survey IDs are found, the job logs this and no message is sent to Teams.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1890 - Final Client List - Add Check for Missing Survey Responders (Status: Done)

**Description:**
Enhanced the 'Pull Final Client List' functionality to cross-reference generated lists with survey responses. This ensures that individuals who completed a survey but were not included in the final list are identified.

## Acceptance Criteria
- When the final client list is generated, a new query runs to identify any `Context_ID`s present in survey responses (opt-in or opt-out for the given feature/stage) but missing from the generated final client list.
- If such discrepancies are found, a pop-up alert is displayed to the user on the front-end, notifying them of potential missing clients and advising them to check data accuracy.
- If discrepancies are found, a separate Excel file containing these 'missing' clients is automatically downloaded for the user, in addition to the main final client list.
- The main client list download functionality remains unchanged.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1891 - Marketing Content - Add CSM Send Content (New fields in SQL, Updated placeholders in template, updated server code) (Status: Done)

**Description:**
Updated the marketing content generation process to include a new field for 'Roadmap Timeframe'. This allows the `release_timeframe` column from the `cr_alpha_content` table in Snowflake to populate the `{ROADMAP_TIMEFRAME}` placeholder in all four marketing content templates (Alpha Opt-In, Alpha Opt-Out, Beta Opt-In, Beta Opt-Out).

## Acceptance Criteria
- The `getFeatureContentData` function in `server.js` now selects the `release_timeframe` column from `corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_content`, aliasing it as `ROADMAP_TIMEFRAME`.
- The data preparation logic for docxtemplater now includes `ROADMAP_TIMEFRAME`, initializing it and sanitizing its value.
- When marketing content is generated, the `{ROADMAP_TIMEFRAME}` placeholder in the .docx templates is correctly populated with the value from the `release_timeframe` column for the corresponding feature/stage/wave.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1892 - Marketing Content - Add Opt-In/Opt-Out Form Link Fields (Status: Done)

**Description:**
Modified the marketing content generation to incorporate dynamic links for opt-in and opt-out forms. The `opt_in_form` and `opt_out_form` columns from the `cr_alpha_content` table in Snowflake will now populate the `{OPT_IN}` and `{OPT_OUT}` placeholders, respectively, in all four marketing content templates.

## Acceptance Criteria
- The `getFeatureContentData` function in `server.js` now selects the `opt_in_form` and `opt_out_form` columns from `corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_content`.
- The data preparation logic for docxtemplater includes `OPT_IN_FORM` and `OPT_OUT_FORM` in its defaults and sanitization steps.
- The values from `opt_in_form` are mapped to the `OPT_IN` template variable.
- The values from `opt_out_form` are mapped to the `OPT_OUT` template variable.
- When marketing content is generated, the `{OPT_IN}` and `{OPT_OUT}` placeholders in the .docx templates are correctly populated with the respective form links.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1893 - Enhanced Home Page Card Order and Final Client List Navigation (Status: Done)

**Description:**
Improved user experience on the home page by reordering tool cards and enhanced navigation on the "Pull Final Client List" page.
    - Moved the "Pull Final Client List" card to appear before the "Active Clients List" card on `home.html`.
    - Added a "Back to Home" button to the header of `final_client_list.html` for easier navigation.

## Acceptance Criteria
- On `home.html`, the "Pull Final Client List" card is displayed above the "Active Clients List" card.
- The `final_client_list.html` page has a "Back to Home" link in its header, styled consistently with other back buttons.
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1894 - Improved Clarity of Home Page Tool Card Buttons (Status: Done)

**Description:**
Updated the button text on several tool cards on `home.html` to be more action-oriented and descriptive.
    - "List Generation & Scrubbing" button changed from "Launch Tool" to "Get List".
    - "Marketing Content Generation" button changed from "Launch Tool" to "Generate Content".
    - "Create Opt-In or Opt-Out Survey" button changed from "Launch Tool" to "Create Survey".
    - "Pull Final Client List" button changed from "Launch Tool" to "Pull List".

## Acceptance Criteria
- The button for "List Generation & Scrubbing" on `home.html` reads "Get List".
- The button for "Marketing Content Generation" on `home.html` reads "Generate Content".
- The button for "Create Opt-In or Opt-Out Survey" on `home.html` reads "Create Survey".
- The button for "Pull Final Client List" on `home.html` reads "Pull List".
---

## Epic: Alpha Beta Command Center [ROIA-1873]

### Story: ROIA-1895 - Personalized Login Page Welcome Message (Status: Done)

**Description:**
Updated the login page (`login.html`, `login.js`, `authController.js`) to display the user's first name in the welcome message instead of their username, providing a more personalized experience.
    - Modified `authController.js` to include `firstName` in the `/auth/check-user-status` response.
    - Modified `login.js` to use the `firstName` (or fallback to username if `firstName` is not available) in the welcome messages on both password setup and login forms.

## Acceptance Criteria
- When a user proceeds to the password setup screen on `login.html`, the welcome message displays "Welcome, [First Name]!" (or "Welcome, [username]!" if first name is unavailable).
- When a user proceeds to the password login screen on `login.html`, the welcome message displays "Welcome back, [First Name]!" (or "Welcome back, [username]!" if first name is unavailable).
- The server (`authController.js`) correctly returns the `firstName` as part of the `check-user-status` endpoint payload.
---

