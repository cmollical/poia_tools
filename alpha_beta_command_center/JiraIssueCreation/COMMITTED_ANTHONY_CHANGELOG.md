
## Epic: Jira Story Automation via AI [ROIA-1803]

### Story: ROIA-1820 - Refactor automatic Jira creation process (Status: Done)

**Description:**
# This task involves refactoring the 'process_changelog_to_jira.py' script.
# Key changes include:
# - Support for user-specific changelog files (pending and committed).
# - Dynamic selection of user changelog via command-line argument.
# - Updated file path configurations to handle subdirectories if necessary.
# - Ensuring robust template handling and file I/O for each user.
#

## Acceptance Criteria
**
# - Script correctly processes a selected user's pending changelog.
# - Jira issues (stories/bugs) are created as specified in the changelog entries.
# - Processed entries are moved to the correct user's committed changelog.
# - Unprocessed entries remain in the user's pending changelog.
# - Script handles new/empty pending files by creating a user-specific template.
---

## Epic: POSTGRESQL migration from SQLite [ROIA-1821]

### Bug: ROIA-1822 - Resolved DataFrame Performance Warnings in PostgreSQL Upsert (Status: Done)

**Description:**
# Addressed persistent `pandas.errors.PerformanceWarning: DataFrame is highly fragmented` during the `_preprocess_dataframe_for_upsert` method in `src/dal/postgres_feature_manager.py`.
# The solution involved an initial `df.copy()` and using `pd.concat()` instead of `df.assign()` for adding missing columns.
# This change improved the stability and performance of the DataFrame preprocessing step.
#
#

## Acceptance Criteria
**
# - No `PerformanceWarning` related to DataFrame fragmentation is present in logs during data refresh.
# - Data upsert to PostgreSQL completes successfully.
---

## Epic: POSTGRESQL migration from SQLite [ROIA-1821]

### Bug: ROIA-1823 - Fixed SQL Syntax Error in Upsert (Duplicate Column Assignment) (Status: Done)

**Description:**
# Resolved a `psycopg2.errors.SyntaxError` in `src/dal/postgres_feature_manager.py` (method `refresh_feature_data`).
# The error was caused by multiple assignments to the `"last_synced_from_snowflake_at"` column in the `UPSERT` SQL statement.
# Fix involved removing the column from `pg_column_order` to ensure it's only set by the `CURRENT_TIMESTAMP` clause.
#
#

## Acceptance Criteria
**
# - The `UPSERT` operation into the PostgreSQL `features` table completes without SQL syntax errors.
# - The `last_synced_from_snowflake_at` column is correctly updated on each upsert.
---

## Epic: POSTGRESQL migration from SQLite [ROIA-1821]

### Bug: ROIA-1824 - Corrected SQL Not-Null Violation for Primary Key "Key" (Status: Done)

**Description:**
# Fixed a `psycopg2.errors.NotNullViolation` for the "Key" column in `src/dal/postgres_feature_manager.py` (method `refresh_feature_data`).
# This was caused by inconsistent column naming ('Key' vs. '"Key"') and potential null/empty key values from Snowflake.
# Solution involved removing the inconsistent rename and adding validation to filter out and log records with null/empty keys.
#
#

## Acceptance Criteria
**
# - No `NotNullViolation` occurs during the upsert to the PostgreSQL `features` table.
# - Records with null or empty 'Key' values from Snowflake are logged and skipped, not processed for upsert.
---

## Epic: Webapp Backend Management [ROIA-1825]

### Bug: ROIA-1826 - Improved Scheduler Shutdown Reliability (Status: Done)

**Description:**
# Corrected an issue in `run.py`'s application `lifespan` manager where it was attempting to call a non-existent `scheduler.shutdown()` method.
# The call was changed to `scheduler.stop()` to match the method defined in the `DataRefreshScheduler` class.
# This improves the reliability of the scheduler's background thread termination.
#
#

## Acceptance Criteria
**
# - The application attempts to stop the scheduler using the correct `stop()` method during shutdown.
# - No `AttributeError` related to `scheduler.shutdown()` occurs during application shutdown.
---

## Epic: POSTGRESQL migration from SQLite [ROIA-1821]

### Story: ROIA-1827 - Updated PostgreSQL Migration Project Plan (Status: Done)

**Description:**
# The `postgresql_project_plan.md` document was updated to reflect the completion and details of recent debugging and refinement tasks.
# This includes updates to Phase 2 (DAL Refactoring) and Phase 3 (Application Logic & API Refactoring) concerning `PostgresFeatureManager` and `run.py`.
#
#

## Acceptance Criteria
**
# - `postgresql_project_plan.md` accurately reflects the status of tasks related to DataFrame optimization, SQL error resolution, and scheduler shutdown improvements.
---

## Epic: POSTGRESQL migration from SQLite [ROIA-1821]

### Bug: ROIA-1828 - Refined Logging for PostgreSQL Upsert Debugging (Status: Done)

**Description:**
# Iteratively adjusted logging configurations in `run.py` and added granular debug statements in `src/dal/postgres_feature_manager.py` (`_upsert_data_to_pg` and `_preprocess_dataframe_for_upsert` methods).
# The goal was to isolate and capture the exact SQL query causing a `psycopg2.errors.SyntaxError` (multiple assignments to "last_synced_from_snowflake_at") during the PostgreSQL upsert process, while also reducing unrelated log verbosity.
#
#

## Acceptance Criteria
**
# - Debug logs in `_upsert_data_to_pg` clearly show the construction of SQL components.
# - The full `UPSERT SQL` statement is logged before execution.
# - Verbose logging from `_preprocess_dataframe_for_upsert` (specifically JSON serialization messages) is suppressed.
---

## Epic: POSTGRESQL migration from SQLite [ROIA-1821]

### Bug: ROIA-1829 - Corrected PrOps Owner Data Handling from Snowflake (Status: Done)

**Description:**
# Modified the SQL query in `src/dal/snowflake_connector.py` (method `get_all_features`) to ensure the "PrOps Owner" field is consistently returned as a single string.
# Removed a duplicate alias for "PrOps Owner" that could lead to inconsistent data types (e.g., lists) in the resulting DataFrame.
# The `CASE` statement for cleaning email addresses from the `PROPS_OWNER` column is now the sole definition for "PrOps Owner".
#
#

## Acceptance Criteria
**
# - The "PrOps Owner" column in the DataFrame fetched from Snowflake is always a single string value.
# - Downstream processing in `_preprocess_dataframe_for_upsert` receives "PrOps Owner" as a string, simplifying data handling.
---

## Epic: Jira Story Automation via AI [ROIA-1803]

### Story: ROIA-1830 - Test Story for Changelog System (Status: Done)

**Description:**
|
  This is a test story to verify the changelog processing and Jira integration.
  It will help ensure that new features or fixes are correctly documented and tracked.

## Acceptance Criteria
|
  - The story is correctly parsed from PENDING_ANTHONY_CHANGELOG.md.
  - A corresponding Jira story is created under the correct Epic (if applicable).
  - The entry is successfully moved to COMMITTED_CHANGELOG_JIRA.md with the Jira issue key.
  - PENDING_ANTHONY_CHANGELOG.md is updated to remove the processed entry.
---

## Epic: Webapp Backend Management [ROIA-1825]

### Story: ROIA-1840 - Implement click tracking and admin table filtering (Status: Done)

**Description:**
Added a backend route and SQLite manager to record click events and a small JS script to submit data when elements marked with `data-track` are clicked. The admin features page now pulls all feature data via a dedicated endpoint and supports per-column filtering inputs. The login page shows a spinner while authenticating so users know their request is processing.
Expanded tracking to all navbar and key admin buttons, and introduced an admin "Click Stats" dashboard displaying aggregated counts. Added groundwork for CSRF tokens in login and change-password forms.

## Acceptance Criteria
**
- Clicks on tracked elements are sent to `/api/clicks` without errors.
- Admin features table filtering correctly narrows results for each column.
- Login form displays a loading indicator while awaiting a response.
---

## Epic: Feature Admin Page [ROIA-1841]

### Bug: ROIA-1842 - Fix admin editing bugs and add notification creation API (Status: Done)

**Description:**
Resolved issues preventing announcement and milestone edits from persisting. Announcement updates now pass individual fields and milestones commit database changes. Added missing POST `/api/notifications` endpoint and connector methods so new notifications can be created successfully.

## Acceptance Criteria
**
- Announcements can be created and edited without server errors.
- Milestone updates immediately appear on the homepage.
- Admins can create notifications via the UI without a 405 error.
---

## Epic: Feature Admin Page [ROIA-1841]

### Story: ROIA-1843 - Load Admin Feature Data from PostgreSQL cache (Status: Done)

**Description:**
Migrated the admin-features page to use the PostgreSQL `public.features` cache instead of querying Jira.  Implemented `get_all_features_from_pg_for_admin` in `FeatureDataAccessor`, added `get_all_features_for_admin` in `FeatureService`, and exposed `/api/features/all` which the frontend now calls.  Added detailed logging to trace data flow end-to-end.

## Acceptance Criteria
**
- After a Snowflake → PostgreSQL refresh, `/api/features/all` returns the full result set.
- Admin Features table renders those rows without showing "No features available".
- No direct Jira traffic is triggered when loading the admin page.
---

## Epic: Feature Admin Page [ROIA-1841]

### Bug: ROIA-1844 - Fix missing `get_all_features_from_pg_for_admin` AttributeError (Status: Done)

**Description:**
Resolved `AttributeError: 'FeatureDataAccessor' object has no attribute 'get_all_features_from_pg_for_admin'` by re-adding the method and ensuring it executes the correct `SELECT * FROM public.features` query.  Updated unit-tests and added logging to confirm execution.

## Acceptance Criteria
**
- Server starts without AttributeErrors.
- Logs show successful execution of the PostgreSQL query.
---

## Epic: POSTGRESQL migration from SQLite [ROIA-1821]

### Bug: ROIA-1845 - Commit visibility for bulk upsert into PostgreSQL (Status: Done)

**Description:**
Modified `_upsert_data_to_pg` to explicitly `commit()` after `execute_values`, and enhanced `PostgresConnector.execute_query` to commit after all operations.  Eliminated race condition where freshly-upserted rows were not immediately visible to read connections.

## Acceptance Criteria
**
- Immediately after a refresh completes, `/api/features/all` returns > 0 rows.
- No stale-snapshot issues observed in pooled connections.
---

## Epic: POSTGRESQL migration from SQLite [ROIA-1821]

### Story: ROIA-1846 - Enhance API and DB Diagnostics Logging (Status: Done)

**Description:**
Added granular DEBUG/INFO logs for `/api/features/all`, feature refresh, PostgreSQL queries (mogrified), and Snowflake connector activity.  This drastically shortened root-cause analysis time for admin-page loading issues.

## Acceptance Criteria
**
- All major data-flow steps emit clear, timestamped log messages.
- Mogrified SQL statements are visible in DEBUG output.
---

## Epic: POSTGRESQL migration from SQLite [ROIA-1821]

### Bug: ROIA-1847 - Resolved PostgreSQL Feature Admin Data Loading and Display Issues (Status: Done)

**Description:**
Addressed multiple issues preventing the Feature Admin page from correctly loading and displaying data from the PostgreSQL `public.features` table. Key problems included transaction isolation leading to stale data, incorrect data fetching logic, and a data structure mismatch where the backend sent features as arrays instead of objects.

Root Causes & Fixes:
- Transaction Isolation: Implemented `autocommit=True` for PostgreSQL read operations in [PostgresConnector](cci:2://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/run.py:15:4-16:48) and [FeatureDataAccessor](cci:2://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/run.py:223:4-224:12).
- Incorrect Data Fetching: Ensured `fetch_all=True` is used in `FeatureDataAccessor.get_all_features_from_pg_for_admin`.
- Data Structure Mismatch (Frontend):
    - Ensured [FeatureDataAccessor](cci:2://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/run.py:223:4-224:12) returns `List[Dict[str, Any]]`.
    - Applied a strict Pydantic `response_model` ([AdminFeaturesResponse](cci:2://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/src/models/feature_models.py:41:0-43:34) with [FeatureDetailAdmin](cci:2://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/src/models/feature_models.py:35:0-42:85) as `RootModel[Dict[str, Any]]`) to `/api/features/all`.
    - Corrected Pydantic V1 `__root__` to V2 `RootModel` in [src/models/feature_models.py](cci:7://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/src/models/feature_models.py:0:0-0:0) and fixed imports in [run.py](cci:7://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/run.py:0:0-0:0).

Improvements:
- Enhanced diagnostic logging across [PostgresConnector](cci:2://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/run.py:15:4-16:48), [FeatureDataAccessor](cci:2://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/run.py:223:4-224:12), [PostgresFeatureManager](cci:2://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/run.py:232:4-233:38), [api-adapter.js](cci:7://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/featurecentral/public/static/api-adapter.js:0:0-0:0), and [admin-features.js](cci:7://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/featurecentral/public/static/admin-features.js:0:0-0:0) to trace data flow, SQL queries, row counts, and data structures.

Technical Debt Addressed:
- Updated Pydantic model definitions ([FeatureDetailAdmin](cci:2://file:///c:/Users/ameucci/athenahealth/R&D%20Operations%20Business%20Analytics%20-%20Documents/General/Anthony%27s%20Workspace/FeatureCentral/src/models/feature_models.py:35:0-42:85)) for V2 compatibility, resolving `TypeError` on startup.

## Acceptance Criteria
**
- Feature Admin page reliably loads and displays all features from the PostgreSQL `public.features` table.
- Data displayed is current and reflects the latest upserts.
- Frontend JavaScript correctly interprets feature data as objects with named properties.
- Server starts without Pydantic-related TypeErrors or NameErrors.
- Diagnostic logs provide clear insights into the data loading process.
---

