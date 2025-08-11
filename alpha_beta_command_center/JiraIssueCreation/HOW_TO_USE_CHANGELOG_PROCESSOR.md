# How to Use the Changelog Processor for Jira Issue Creation

This document outlines the process for using the `process_changelog_to_jira.py` script to convert changelog entries into Jira issues.

## Overview

The `process_changelog_to_jira.py` script is designed to automate the creation of Jira issues from formatted changelog files. It primarily processes files named in the format `PENDING_XXX_CHANGELOG.md`, where `XXX` typically represents the developer's name or a specific feature area.

## `PENDING_XXX_CHANGELOG.md` Files

These files serve as the input for the script. Each `PENDING_XXX_CHANGELOG.md` file should contain a list of changes that need to be tracked as individual Jira issues or tasks.

### File Naming Convention:

*   **`PENDING_`**: Prefix indicating the changelog is awaiting processing.
*   **`XXX`**: A unique identifier, usually the author's name (e.g., `PENDING_ANTHONY_CHANGELOG.md`, `PENDING_JOE_CHANGELOG.md`). This helps in tracking the source of the changes.
*   **`_CHANGELOG.md`**: Suffix indicating it's a Markdown changelog file.

### Content Format:

Each entry within the `PENDING_XXX_CHANGELOG.md` file that is intended to become a Jira issue should follow a consistent format. While the exact format depends on the script's parsing logic, a common approach is:

```markdown
### [Issue Type] Brief Description of the Change

- **Details**: More detailed explanation of the change, impact, or reason.
- **Reporter**: (Optional) The person reporting or requesting this change.
- **Assignee**: (Optional) The person to whom the Jira issue should be assigned.
- **Labels**: (Optional) Comma-separated list of labels (e.g., `bug`, `feature-request`, `documentation`).
- **Epic Link**: (Optional) Link to a parent Epic if applicable.
- **Sprint**: (Optional) Target sprint for the issue.
```

**Example Entry in `PENDING_ANTHONY_CHANGELOG.md`:**

```markdown
### [Task] Update User Authentication Module

- **Details**: Refactor the authentication service to use OAuth 2.0. This involves updating client libraries and server-side token validation.
- **Assignee**: Anthony
- **Labels**: `security`, `refactor`, `authentication`
- **Epic Link**: `PROJECT-123`
```

## Script Operation: `process_changelog_to_jira.py`

1.  **Input**: The script takes one or more `PENDING_XXX_CHANGELOG.md` files as input. It might scan the `JiraIssueCreation` directory for all such files or require them to be specified as arguments.
2.  **Parsing**: It parses each file, identifying individual changelog entries based on the defined format (e.g., lines starting with `###`).
3.  **Jira Issue Creation**: For each valid entry, the script interacts with the Jira API to:
    *   Create a new Jira issue.
    *   Populate fields like Summary, Description, Reporter, Assignee, Labels, Epic Link, etc., based on the parsed information.
4.  **Post-Processing (Archival/Renaming)**:
    *   **Successful Processing**: After successfully creating Jira issues for all entries in a `PENDING_XXX_CHANGELOG.md` file, the script should rename or move the file to prevent reprocessing. A common convention is to rename it to `COMMITTED_XXX_CHANGELOG_YYYYMMDD_HHMMSS.md` (e.g., `COMMITTED_ANTHONY_CHANGELOG_20250611_103000.md`) or move it to an archive subfolder. This provides a record of what was processed and when.
    *   **Partial Success/Failure**: If some entries fail, the script might leave the file as `PENDING_XXX_CHANGELOG.md` with annotations about failures, or create a separate error log.

## How to Run the Script

The exact command to run the script will depend on its implementation. Typically, it would be a Python script executed from the command line:

```bash
# Navigate to the directory containing the script (if not in PATH)
cd /path/to/FeatureCentral/JiraIssueCreation

# Example command (actual arguments may vary):
python process_changelog_to_jira.py --file PENDING_ANTHONY_CHANGELOG.md
# or to process all pending files:
python process_changelog_to_jira.py --all-pending
```

Refer to the script's internal documentation or command-line help (`python process_changelog_to_jira.py --help`) for specific usage instructions.

## For AI/Automated Agents

When tasked with processing changelogs using `process_changelog_to_jira.py`:

1.  **Identify Target Files**: Locate files matching the `PENDING_XXX_CHANGELOG.md` pattern in the `JiraIssueCreation` directory.
2.  **Understand Content Structure**: Assume each `###` heading in these files represents a potential Jira issue. Parse the subsequent lines (e.g., "Details:", "Assignee:") to extract relevant information for Jira fields.
3.  **Execute the Script**: Run `process_changelog_to_jira.py`, providing the identified pending files as arguments or using an option to process all pending files.
4.  **Verify Outcome**:
    *   Check if the `PENDING_XXX_CHANGELOG.md` files have been renamed (e.g., to `COMMITTED_XXX_CHANGELOG_*.md`) or moved. This indicates successful processing.
    *   Look for any output logs or error messages from the script.
    *   (If API access is available) Optionally, verify in Jira that the corresponding issues have been created.
5.  **Handle `COMMITTED_XXX_CHANGELOG.md` files**: These files have already been processed. Do not attempt to re-process them with the script. They serve as an archive.

By following these guidelines, the changelog-to-Jira process can be effectively managed.
