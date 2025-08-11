## Epic: Jira Story Automation via AI [ROIA-1803]

### User Story: Developed Batch Changelog-to-Jira Processing Script
**Jira Project Key:** ROIA
**Issue Type:** Story
**Jira Story Key:** ROIA-1804
**Epic Link:** ROIA-1803
**Reporter:** ameucci
**Assignee:** ameucci
**Status:** Resolved

**Issue Description:**
As a developer, I want a script that processes draft changelog entries from a 'PENDING_CHANGELOG.md' file, interactively guides me through Jira Epic/Story finalization, and creates corresponding issues in Jira, so that major code changes are efficiently documented and tracked in Jira and a 'COMMITTED_CHANGELOG_JIRA.md' file.

## Acceptance Criteria
- The script (`process_changelog_to_jira.py`) reads entries from `PENDING_CHANGELOG.md`.
- The script interactively prompts for Epic selection or creation, calling `JiraConnector.get_project_epics()` and `JiraConnector.create_jira_epic()`.
- The script interactively prompts for Story summary finalization and performs a duplicate check using `JiraConnector.get_stories_in_epic()`.
- The script interactively prompts for Description and Acceptance Criteria finalization.
- The script requests final user approval before creating Jira issues.
- The script calls `JiraConnector.create_jira_story()` to create stories in Jira.
- Successfully processed entries are formatted and appended to `COMMITTED_CHANGELOG_JIRA.md` with Jira keys.
- Unsuccessful or skipped entries remain in `PENDING_CHANGELOG.md`.
- The script handles Jira API errors and user skips gracefully.
- The script uses `JiraConnector` which is configured via environment variables (`JIRA_SERVER`, `JIRA_USERNAME`, `JIRA_API_TOKEN`, `JIRA_VERIFY_SSL`).
---

## Epic: Jira Story Automation via AI [ROIA-1803]

### User Story: Auto-transition Jira Story to Done on Creation
**Jira Project Key:** ROIA
**Issue Type:** Story
**Jira Story Key:** ROIA-1805
**Epic Link:** ROIA-1803
**Reporter:** ameucci
**Assignee:** ameucci
**Status:** Done

**Issue Description:**
As a developer using the changelog script, I want newly created Jira stories to be automatically transitioned to a "Done" (or equivalent) status so that the Jira status reflects the completion of the changelog-to-Jira process for that item.

## Acceptance Criteria
- After a Jira story is successfully created by `process_changelog_to_jira.py`, the script attempts to transition it to a "Done" status.
- The `JiraConnector` class has a method (`transition_jira_issue`) to handle this status change.
- The method in `JiraConnector` can identify the correct transition ID based on a target status name (e.g., "Done", "Resolved").
- If the transition is successful, the `COMMITTED_CHANGELOG_JIRA.md` entry reflects the new "Done" status.
- If the transition fails, a warning is logged, and the `COMMITTED_CHANGELOG_JIRA.md` entry reflects a non-final status (e.g., "Open").
- The script gracefully handles cases where the transition cannot be found or fails.
---

## Epic: Jira Story Automation via AI [ROIA-1803]

### User Story: Align Story Query with Hardcoded Epic Link Field
**Jira Project Key:** ROIA
**Issue Type:** Story
**Jira Story Key:** ROIA-1806
**Epic Link:** ROIA-1803
**Reporter:** ameucci
**Assignee:** ameucci
**Status:** Done

**Issue Description:**
As a system maintainer, I want the `get_stories_in_epic` method in `JiraConnector` to use the hardcoded Epic Link custom field ID (`customfield_10007`) in its JQL query so that fetching stories linked to an Epic is consistent with how Epic Links are set during story creation and is reliable for the target Jira instance.

## Acceptance Criteria
- The JQL query within `JiraConnector.get_stories_in_epic` is modified to use `cf[customfield_10007] = "{epic_key}"` instead of `parent = "{epic_key}"`.
- The duplicate story check in `process_changelog_to_jira.py` correctly retrieves stories associated with the selected Epic using this updated query.
- The change ensures consistency with the hardcoded `customfield_10007` used in `create_jira_story` for linking.
---

## Epic: FeatureCentral Homepage [ROIA-1811]

### Bug: ROIA-1812 - Correct Homepage KPI Display and Initial Data Loading (Status: Done)

**Description:**
Addressed issue where "Your Features" KPI cards on the homepage displayed hardcoded placeholder numbers. Modified `index.html` to remove these hardcoded values, replacing them with '--' placeholders and adding unique IDs to the stat number elements. Updated the `updateFeatureStats` function in `featurecentral/public/static/js/homepage-features.js` to use these new IDs for populating KPI numbers from the `/api/dashboard/feature-summary` API response, ensuring dynamic and accurate display of feature counts.

## Acceptance Criteria
- Homepage KPI cards initially display '--' or a loading state.
- Upon successful data retrieval, KPI cards display numbers fetched from the backend API.
- "Needs Attention" KPI card correctly displays 0 as per temporary backend adjustment.
---

## Epic: FeatureCentral Homepage [ROIA-1811]

### Story: ROIA-1813 - Enhance Homepage Feature Filter Logic in Backend (Status: Done)

**Description:**
Significantly improved the backend logic for homepage feature filtering in `src/dal/feature_data_accessor.py` (methods `get_filtered_features_list` and `get_filtered_summary_counts`).
- Corrected Product Owner/Product Ops Owner filter interaction: if both role filters are OFF, no username-based PO/PrOps filtering is applied, allowing broader searches based on other criteria.
- Modified `target_ga_release` filter to use `ILIKE` for case-insensitive pattern matching and to correctly handle `*` as SQL `%` wildcards.
- Resolved SQL compilation errors for `FEATURE_STATUS IN (...)` clauses by dynamically generating individual parameter placeholders for each status value, ensuring robust handling of multi-select status filters.
These changes ensure accurate and flexible filtering of features displayed in the "Your Features" section and summary cards.

## Acceptance Criteria
- Filtering by "Target GA Release" with wildcards (e.g., `*25.07*`) works correctly.
- Filtering by multiple "Feature Status" values works correctly.
- If "Product Owner" and "Product Ops Owner" toggles are both OFF, features are filtered based on other criteria without restriction to the logged-in user's PO/PrOps roles.
- KPI summary cards accurately reflect the applied filter combinations.
---

## Epic: Milestone and Calendar Management [ROIA-1807]

### Story: ROIA-1814 - Implement Milestone API Endpoints (Status: Done)

**Description:**
Implemented API endpoints for milestone management.
- Added a public endpoint `GET /api/milestones` to retrieve active milestones for calendar display, utilizing `MilestoneService.get_active_milestones_for_calendar()`.
- Created `src/routers/milestone_routes.py` to house milestone-related routes.
- Implemented admin-only CRUD endpoints under the `/api/admin/milestones` prefix:
    - `POST /api/admin/milestones`: Create a new milestone.
    - `GET /api/admin/milestones`: Retrieve all milestones (paginated).
    - `GET /api/admin/milestones/{milestone_id}`: Retrieve a single milestone by ID.
    - `PUT /api/admin/milestones/{milestone_id}`: Update an existing milestone.
    - `DELETE /api/admin/milestones/{milestone_id}`: Delete a milestone.
- Secured admin endpoints using `get_current_active_admin` dependency.
- Ensured the new `milestone_api_router` is included in the main FastAPI application in `run.py`.

## Acceptance Criteria
- The homepage calendar can successfully fetch and display milestones via `GET /api/milestones`.
- Authenticated admin users can create, read, update, and delete milestones using the `/api/admin/milestones` endpoints.
- Non-admin users are denied access to admin milestone endpoints.
- 404 errors for milestone-related API calls are resolved.
---

## Epic: Milestone and Calendar Management [ROIA-1807]

### Bug: ROIA-1815 - Fix Milestone Creation and Retrieval Bugs (Status: Done)

**Description:**
Resolved a series of issues preventing successful milestone creation and retrieval via the admin API:
- Corrected `AttributeError` in `MilestoneService` by adding `execute_insert_and_get_id` to `SQLiteBase` and updating `MilestoneService.create_milestone` to use it.
- Fixed `sqlite3.OperationalError` for "no column named feature_type_impacted" by removing this field from Pydantic models (`src/models/milestone_models.py`), service layer logic (`src/service/milestone_service.py`), and frontend admin pages (`admin-milestones.html`, `admin-milestones.js`).
- Fixed `sqlite3.OperationalError` for "no column named created_by" by refactoring Pydantic models, service layer, and frontend to use the existing `owner` database column instead. This involved updating models, service logic (SQL queries, parameter handling), and frontend display text.
- Corrected `AttributeError` in `MilestoneService.get_milestone_by_id` by ensuring it calls the appropriate `self.milestone_manager.get_milestone_by_id()` method instead of a non-existent `fetch_one`.
- Addressed an `AttributeError` in `milestone_routes.py` where `milestone_in.created_by` was referenced after it was changed to `milestone_in.owner` in the Pydantic model.

## Acceptance Criteria
- Admin users can successfully create new milestones without encountering `AttributeError` or `sqlite3.OperationalError`.
- Milestones are correctly retrieved and displayed after creation.
- The application consistently uses the `owner` field for milestones, aligning with the database schema.
---

## Epic: Jira Story Automation via AI [ROIA-1803]

### Story: ROIA-1816 - Filter Jira Epics by 'FeatureCentral' Component in Changelog Script (Status: Done)

**Description:**
Modified the `JiraConnector.get_project_epics` method in `src/dal/jira_connector.py` to filter Epics by the component 'FeatureCentral'. The JQL query was updated to include `AND component = "FeatureCentral"`. This ensures that when the `process_changelog_to_jira.py` script fetches Epics for selection, only those relevant to FeatureCentral are displayed.

## Acceptance Criteria
- When running `process_changelog_to_jira.py`, the list of selectable Epics only includes those from the 'ROIA' project that have 'FeatureCentral' as a component.
- Other Epics without this component are not listed.
- If no Epics match this criteria, the script correctly indicates that no Epics were found and allows for creation of a new one (which should ideally also get this component, though that's a separate step for new Epic creation logic if needed).
---

## Epic: Jira Story Automation via AI [ROIA-1803]

### Story: ROIA-1817 - Auto-assign 'FeatureCentral' Component to New Epics (Status: Done)

**Description:**
Enhanced the changelog script (`process_changelog_to_jira.py`) and `JiraConnector` (`src/dal/jira_connector.py`) to automatically assign the 'FeatureCentral' component to new Epics created via the script.
- Modified `JiraConnector.create_jira_epic` to accept a `components` parameter and include it in the Jira API request.
- Updated `process_changelog_to_jira.py` to pass `components=['FeatureCentral']` when calling `create_jira_epic`.

## Acceptance Criteria
- When a new Epic is created using the `process_changelog_to_jira.py` script, it is automatically assigned the 'FeatureCentral' component in Jira.
- This ensures consistency with the Epic filtering logic, which only displays Epics with this component.
---

## Epic: Jira Story Automation via AI [ROIA-1803]

### Story: ROIA-1818 - Refactor Changelog Script Workflow and Address Bugs (Status: Done)

**Description:**
Refactored the `process_single_entry` function in `process_changelog_to_jira.py` to improve user workflow:
- Epic selection/creation is now performed *after* the user confirms the details of the Story/Bug to be created, preventing unnecessary Epic interaction if the item is skipped.
Addressed several bugs:
- Fixed a `NameError` for `new_story_key` (changed to `new_issue_key`) in a log message.
- Re-integrated the detailed Fix Version selection logic for newly created Epics, which was inadvertently simplified during prior refactoring and caused errors when Jira required Fix Versions for Epics.

## Acceptance Criteria
- When processing an entry, the script first shows parsed Story/Bug details and asks for confirmation to proceed.
- Epic selection/creation occurs only after this initial confirmation.
- The script runs without `NameError` related to `new_story_key`/`new_issue_key`.
- When creating a new Epic, the user is correctly prompted to select/enter Fix Versions, and these are passed to Jira.
- Jira Epics are created successfully when Fix Versions are required and provided.
---

## Epic: Jira Story Automation via AI [ROIA-1803]

### Story: ROIA-1819 - Implement and Refine Changelog Template Handling in Script (Status: Done)

**Description:**
Enhanced `process_changelog_to_jira.py` to support and preserve a template at the beginning of `PENDING_CHANGELOG.md`.
- The `main()` function now detects a template block marked with `<!-- TEMPLATE - DO NOT PROCESS -->` and `<!-- END TEMPLATE -->`.
- This template block (including its trailing `---` separator) is skipped during entry processing.
- When `PENDING_CHANGELOG.md` is rewritten after processing, the template is preserved at the top of the file, even if all entries are cleared.
- Corrected `NameError` related to `content` variable scope and a syntax error in a `logger.info` statement within the template handling logic. This also resolved associated linting errors.

## Acceptance Criteria
- A template placed at the top of `PENDING_CHANGELOG.md` (and correctly marked) is not processed as a changelog entry.
- After the script runs, if all entries were processed, `PENDING_CHANGELOG.md` contains the template followed by a "# No pending entries remaining." comment.
- If some entries remain, `PENDING_CHANGELOG.md` contains the template, followed by the remaining entries.
- The script runs without errors related to template parsing or `content` variable definition.
---

