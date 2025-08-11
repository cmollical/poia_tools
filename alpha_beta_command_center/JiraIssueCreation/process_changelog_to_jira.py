# process_changelog_to_jira.py

import os
import logging
import re
import sys # To ensure src path is found for JiraConnector
import argparse # For command-line arguments
from datetime import datetime

# --- Configuration ---
# Adjust BASE_DIR if this script is moved relative to the 'src' directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

try:
    from jira_connector import JiraConnector
except ImportError as e:
    print(f"Error importing JiraConnector: {e}")
    print(f"Ensure 'jira_connector.py' is in the same directory as this script ({BASE_DIR}) or in the Python path.")
    print(f"Current sys.path: {sys.path}")
    sys.exit(1)

# User-specific changelog file configuration
USERS_CONFIG = {
    "Amy": {
        "pending": "PENDING_AMY_CHANGELOG.md",
        "committed": "COMMITTED_AMY_CHANGELOG.md"
    },
    "Joe": {
        "pending": "PENDING_JOE_CHANGELOG.md",
        "committed": "COMMITTED_JOE_CHANGELOG.md"
    },
    "Charles": {
        "pending": "PENDING_CHARLES_CHANGELOG.md",
        "committed": "COMMITTED_CHARLES_CHANGELOG.md"
    },
    "Anthony": {
        "pending": "PENDING_ANTHONY_CHANGELOG.md",
        "committed": "COMMITTED_ANTHONY_CHANGELOG.md"
    }
}

# These will be set dynamically in main() after user selection
PENDING_FILE_PATH = None
COMMITTED_FILE_PATH = None

# Jira Project Configuration
JIRA_PROJECT_KEY = "ROIA"

# Entry separator in PENDING_CHANGELOG.md
ENTRY_SEPARATOR = "---\n" # Assumes '---' is on its own line

# --- Logging Setup ---
# Simple console logger for now, can be expanded
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()] # Output to console
)
logger = logging.getLogger(__name__)

# --- Helper Functions ---

def get_user_input(prompt_message: str, default_value: str = None) -> str:
    """
    Helper function to get input from the user with an optional default value.
    Treats 'confirm' (case-insensitive) as accepting the default if a default exists.
    Clarifies that pressing Enter accepts the default.
    """
    if default_value is not None: # Check if default_value is actually provided, even if it's an empty string
        prompt_with_default = f"{prompt_message} (Press Enter to accept: '{default_value}') [{default_value}]: "
        user_response = input(prompt_with_default).strip()
        if user_response.lower() == 'confirm':
            return default_value
        return user_response or default_value
    else:
        return input(f"{prompt_message}: ").strip()

def parse_pending_entry(entry_text: str) -> dict:
    """
    Parses a single entry block from PENDING_CHANGELOG.md.
    Returns a dictionary with extracted fields.
    """
    data = {}
    # Example parsing logic, will need to be robust
    # Using simple string searches for now, regex might be better
    
    summary_match = re.search(r"(?:\*\*)?Draft Summary:(?:\*\*)?\s*(.*)", entry_text, re.IGNORECASE)
    if summary_match:
        data['draft_summary'] = summary_match.group(1).strip()

    type_match = re.search(r"(?:\*\*)?Type:(?:\*\*)?\s*(.*)", entry_text, re.IGNORECASE)
    if type_match:
        data['type'] = type_match.group(1).strip()
    
    user_match = re.search(r"(?:\*\*)?User:(?:\*\*)?\s*(.*)", entry_text, re.IGNORECASE)
    if user_match:
        data['user'] = user_match.group(1).strip()

    # Description and AC might be multi-line
    description_block_match = re.search(r"(?:\*\*)?Description:(?:\*\*)?(.*?)(?:\*\*)?Acceptance Criteria:(?:\*\*)?", entry_text, re.IGNORECASE | re.DOTALL)
    if description_block_match:
        data['description'] = description_block_match.group(1).strip()
    else: # Simpler match if AC is not present or format varies
        description_simple_match = re.search(r"(?:\*\*)?Description:(?:\*\*)?(.*)", entry_text, re.IGNORECASE | re.DOTALL)
        if description_simple_match:
             # This might grab AC too if it's not separated well, needs refinement
            # Adjust split to also be flexible with asterisks and the colon
            parts = re.split(r"\n\n(?:\*\*)?Acceptance Criteria:(?:\*\*)?\s*", description_simple_match.group(1).strip(), flags=re.IGNORECASE)
            data['description'] = parts[0].strip()


    ac_block_match = re.search(r"(?:\*\*)?Acceptance Criteria(?:\*\*)?:\s*(.*)", entry_text, re.IGNORECASE | re.DOTALL)
    if ac_block_match:
        data['acceptance_criteria'] = ac_block_match.group(1).strip()
    
    if not data.get('draft_summary'):
        logger.warning(f"Could not parse Draft Summary from entry block: \n{entry_text[:200]}...")
        return {} # Indicate parsing failure

    return data

def process_single_entry(entry_data: dict, jira_connector: JiraConnector, user_details: dict) -> tuple[bool, str | None]:
    """
    Interactively processes a single parsed entry.
    Returns (True, formatted_committed_entry_string) on success, 
            (False, "skipped") if user skips,
            (False, None) on other failures.
    """
    logger.info(f"\n--- Processing Entry: {entry_data.get('draft_summary', 'Unknown Summary')} ---")
    reporter_assignee = user_details['username'] # Always use the username provided at the script's initial prompt

    # --- Use Parsed Data --- 
    final_summary = entry_data.get('draft_summary', 'No summary provided')
    final_description = entry_data.get('description', 'Description to be added.')
    final_ac_str = entry_data.get('acceptance_criteria', '- Acceptance criteria to be added.')

    if not final_summary:
        logger.warning("Issue summary from pending entry is empty. Skipping entry.")
        return False, "skipped"

    # Determine issue type from entry data, default to 'Story'
    issue_type = entry_data.get('type', 'Story').capitalize()
    if issue_type not in ['Story', 'Bug']:
        logger.warning(f"Unsupported issue type '{issue_type}' found for entry '{final_summary}'. Defaulting to 'Story'.")
        issue_type = 'Story'
    
    logger.info(f"Displaying details for {issue_type}: '{final_summary}'")
    print(f"\n--- Review Parsed {issue_type} Details --- ")
    print(f"  Parsed Summary:             {final_summary}")
    print(f"  Parsed Description:       {final_description}")
    print(f"  Parsed Acceptance Criteria: {final_ac_str}")
    print(f"  Reporter/Assignee:        {reporter_assignee}")

    # --- Initial Confirmation --- 
    proceed_with_creation = get_user_input(f"\nProceed with creating this {issue_type} ('{final_summary}') in Jira? (yes/no/skip)", "yes").lower()
    if proceed_with_creation == "skip":
        logger.info(f"User chose to skip Jira creation for '{final_summary}'.")
        return False, "skipped"
    if proceed_with_creation != 'yes':
        logger.info(f"User chose not to create the {issue_type} '{final_summary}' in Jira at this stage.")
        return False, "skipped"

    # --- Epic Handling (Moved after initial confirmation) --- 
    selected_epic_key = None
    selected_epic_name = "N/A"
    try:
        logger.info("Fetching existing Epics from Jira...")
        epics = jira_connector.get_project_epics(project_key=JIRA_PROJECT_KEY)
        if epics:
            print("Available Epics in ROIA:")
            for i, epic in enumerate(epics):
                print(f"  {i+1}. {epic['key']} - {epic['summary']}")
            print("  N. Create NEW Epic")
            
            while True:
                choice = get_user_input("Select an Epic by number or type 'N' for new (Press Enter for N, or 'none' to skip linking an Epic)", default_value="N").upper()
                if choice == 'N': # Create new Epic
                    new_epic_name = get_user_input("Enter the name for the new Epic")
                    if not new_epic_name:
                        logger.error("Epic name cannot be empty. Will proceed without linking an Epic.")
                        selected_epic_key = None # Ensure it's None
                        selected_epic_name = "N/A"
                        break 
                    
                    new_epic_desc = get_user_input("Enter an optional description for the new Epic (leave blank if none)")
                    
                    # Fetch and select Fix Versions for the new Epic
                    new_epic_fix_versions = None
                    available_versions = jira_connector.get_project_versions(JIRA_PROJECT_KEY)
                    if available_versions:
                        print("Available Fix Versions for ROIA (unreleased, unarchived):")
                        for i, version in enumerate(available_versions):
                            print(f"  {i+1}. {version['name']} (ID: {version['id']})")
                        
                        while True:
                            version_selection_str = get_user_input("Select Fix Version(s) by number for the new Epic (comma-separated, or type 'none'): ").lower()
                            if not version_selection_str or version_selection_str == 'none':
                                new_epic_fix_versions = None
                                break
                            try:
                                selected_indices = [int(x.strip()) - 1 for x in version_selection_str.split(',')]
                                selected_versions_names = []
                                valid_selection = True
                                for index in selected_indices:
                                    if 0 <= index < len(available_versions):
                                        selected_versions_names.append(available_versions[index]['name'])
                                    else:
                                        print(f"Invalid selection: {index + 1}. Please choose from the list.")
                                        valid_selection = False
                                        break
                                if valid_selection:
                                    new_epic_fix_versions = selected_versions_names
                                    break
                            except ValueError:
                                print("Invalid input. Please enter numbers comma-separated, or 'none'.")
                    else:
                        logger.info("No available Fix Versions found or failed to fetch. Falling back to manual input for new Epic.")
                        fix_versions_input_str = get_user_input("Enter Fix Version/s for the new Epic (comma-separated if multiple, leave blank if none): ")
                        new_epic_fix_versions = [fv.strip() for fv in fix_versions_input_str.split(',') if fv.strip()] if fix_versions_input_str else None

                    logger.info(f"Attempting to create new Epic: '{new_epic_name}'")
                    created_epic_key = jira_connector.create_jira_epic(
                        project_key=JIRA_PROJECT_KEY,
                        epic_name=new_epic_name,
                        reporter_username=reporter_assignee,
                        assignee_username=reporter_assignee,
                        description=new_epic_desc if new_epic_desc else None,
                        fix_versions=new_epic_fix_versions,
                        components=['FeatureCentral']
                    )
                    if created_epic_key:
                        selected_epic_key = created_epic_key
                        selected_epic_name = new_epic_name
                        logger.info(f"Successfully created and selected new Epic: {selected_epic_key} - {selected_epic_name}")
                    else:
                        logger.error(f"Failed to create new Epic '{new_epic_name}'. You may need to create it manually. Proceeding without linking an Epic.")
                        selected_epic_key = None # Ensure it's None
                        selected_epic_name = "N/A"
                    break # Exit while loop after attempting creation or getting name
                elif choice.lower() == 'none':
                    selected_epic_key = None
                    selected_epic_name = "N/A"
                    logger.info("User chose not to link to an Epic.")
                    break
                try:
                    epic_index = int(choice) - 1
                    if 0 <= epic_index < len(epics):
                        selected_epic_key = epics[epic_index]['key']
                        selected_epic_name = epics[epic_index]['summary']
                        logger.info(f"Selected Epic: {selected_epic_key} - {selected_epic_name}")
                        break
                    else:
                        print("Invalid selection. Please try again.")
                except ValueError:
                    print("Invalid input. Please enter a number, 'N', or 'none'.")
        else: # No existing epics found
            logger.info("No existing Epics found in ROIA. Option to create a new one.")
            if get_user_input("No Epics found. Create a new Epic? (yes/no)", "yes").lower() == 'yes':
                new_epic_name = get_user_input("Enter the name for the new Epic")
                if new_epic_name: # Only proceed if name is given
                    new_epic_desc = get_user_input("Enter an optional description for the new Epic (leave blank if none)")
                    new_epic_fix_versions = None # Simplified
                    created_epic_key = jira_connector.create_jira_epic(
                        project_key=JIRA_PROJECT_KEY, epic_name=new_epic_name, 
                        reporter_username=reporter_assignee, assignee_username=reporter_assignee, 
                        description=new_epic_desc, fix_versions=new_epic_fix_versions,
                        components=['FeatureCentral']
                    )
                    if created_epic_key:
                        selected_epic_key = created_epic_key
                        selected_epic_name = new_epic_name
                    else:
                        logger.error(f"Failed to create Epic '{new_epic_name}'. Proceeding without an Epic link.")
                else:
                    logger.info("No Epic name provided. Proceeding without an Epic link.")
            else:
                logger.info("User chose not to create a new Epic. Proceeding without an Epic link.")

    except Exception as e:
        logger.error(f"Error during Epic handling: {e}", exc_info=True)
        if get_user_input("Failed to handle Epics. Proceed without linking an Epic? (yes/no)", "yes").lower() != 'yes':
            return False, "skipped"
        selected_epic_key = None # Ensure it's None if error and user wants to skip epic part
        selected_epic_name = "N/A"

    # --- Duplicate Check (Moved after Epic handling) ---
    if selected_epic_key: # Only check duplicates if an Epic is linked
        logger.info(f"Fetching existing issues under Epic {selected_epic_key} to check for duplicates...")
        try:
            # Assuming get_stories_in_epic fetches all issue types, or adjust if it's specific
            existing_issues_in_epic = jira_connector.get_stories_in_epic(JIRA_PROJECT_KEY, selected_epic_key) 
            if existing_issues_in_epic:
                duplicate_summaries = [s['summary'] for s in existing_issues_in_epic if s['summary'].lower() == final_summary.lower()]
                if duplicate_summaries:
                    print(f"---")
                    logger.warning(f"Potential duplicate(s) found for summary '{final_summary}' (as potential {issue_type}) under Epic {selected_epic_key} ({selected_epic_name}):")
                    for dup_sum in duplicate_summaries:
                        print(f"  - {dup_sum}")
                    proceed_with_duplicate = get_user_input(f"Still want to create a new {issue_type} with this summary? (yes/no)", "no").lower()
                    if proceed_with_duplicate != 'yes':
                        logger.info(f"User chose not to create {issue_type} due to potential duplicate. Skipping entry for '{final_summary}'.")
                        return False, "skipped"
            else:
                logger.info(f"No existing issues found under Epic {selected_epic_key}.")
        except Exception as e:
            logger.error(f"Error fetching issues for duplicate check under Epic {selected_epic_key}: {e}", exc_info=True)
            if get_user_input("Could not perform duplicate check. Proceed with creation anyway? (yes/no)", "no").lower() != 'yes':
                logger.info("User chose not to proceed due to duplicate check failure. Skipping entry.")
                return False, "skipped"
    else:
        logger.info(f"No Epic linked. Skipping duplicate {issue_type} check within an Epic.")
    
    # Format for Jira description field
    jira_description_body = f"{final_description}\n\n## Acceptance Criteria\n{final_ac_str}"

    # --- Actual Jira Issue Creation (Confirmation already done) ---
    logger.info(f"Attempting to create Jira {issue_type} for: '{final_summary}' under Epic '{selected_epic_name if selected_epic_name else 'None'}'")
    new_issue_key = jira_connector.create_jira_issue(
        issue_type_name=issue_type,
        project_key=JIRA_PROJECT_KEY,
        summary=final_summary,
        description_body=jira_description_body,
        reporter_username=reporter_assignee,
        assignee_username=reporter_assignee,
        epic_link_key=selected_epic_key
    )

    if not new_issue_key:
        logger.error(f"Failed to create Jira {issue_type} for '{final_summary}'. Review JiraConnector logs and Jira permissions.")
        return False, None
    
    logger.info(f"Successfully created Jira {issue_type}: {new_issue_key} for summary: '{final_summary}'")

    # Transition the newly created issue to 'Done'
    target_final_status = "Done" 
    logger.info(f"Attempting to transition {issue_type} {new_issue_key} to '{target_final_status}' status...")
    transition_success = jira_connector.transition_jira_issue(new_issue_key, target_final_status)
    current_story_status_for_changelog = "Open"
    if transition_success:
        logger.info(f"Successfully transitioned {issue_type} {new_issue_key} to a status like '{target_final_status}'.")
        current_story_status_for_changelog = target_final_status
    else:
        logger.warning(f"Failed to automatically transition {issue_type} {new_issue_key} to '{target_final_status}'. It may need manual transition in Jira.")

    # Format the committed entry string for the changelog file
    committed_entry_str = f"""## Epic: {selected_epic_name} [{selected_epic_key if selected_epic_key else 'N/A'}]

### {issue_type}: {new_issue_key} - {final_summary} (Status: {current_story_status_for_changelog})

**Description:**
{final_description}

## Acceptance Criteria
{final_ac_str}
---
"""
    logger.info(f"Entry for '{final_summary}' processed successfully. Jira Issue Key: {new_issue_key}")
    return True, committed_entry_str


def main():
    """
    Main function to orchestrate the changelog processing.
    """
    logger.info("Starting changelog processing script...")

    # --- Argument Parsing for Changelog User ---
    parser = argparse.ArgumentParser(description="Process user-specific changelogs and create Jira issues.")
    user_choices = list(USERS_CONFIG.keys())
    # Make username argument optional (nargs='?'). If not provided, it will be None.
    parser.add_argument("username", nargs='?', default=None, help="Optional: The name of the user whose changelog is to be processed. If omitted, you will be prompted.", choices=user_choices)
    
    args = parser.parse_args()
    selected_user_name = args.username

    if selected_user_name is None:
        # Username not provided via command line, so prompt interactively
        print("Please select the user whose changelog you want to process:")
        for i, name in enumerate(user_choices):
            print(f"  {i+1}. {name}")
        
        while True:
            try:
                choice_idx_str = get_user_input(f"Enter number (1-{len(user_choices)}): ")
                if not choice_idx_str: # Handle empty input from get_user_input if it can return that
                    print("No selection made. Please enter a number.")
                    continue
                choice_idx = int(choice_idx_str) - 1
                if 0 <= choice_idx < len(user_choices):
                    selected_user_name = user_choices[choice_idx]
                    break
                else:
                    print(f"Invalid selection. Please enter a number between 1 and {len(user_choices)}.")
            except ValueError:
                print("Invalid input. Please enter a number.")
            except EOFError:
                logger.error("Input stream closed. Cannot select user.")
                return # Exit if user selection fails due to EOF
        if selected_user_name is None: # Should not happen if loop is exited correctly
            logger.error("User selection failed. Exiting.")
            return

    # Validate selected_user_name regardless of how it was obtained
    if selected_user_name not in USERS_CONFIG:
        logger.error(f"Invalid username: '{selected_user_name}'. Please choose from {', '.join(user_choices)}.")
        return

    logger.info(f"Processing changelog for: {selected_user_name}")
    
    global PENDING_FILE_PATH, COMMITTED_FILE_PATH
    PENDING_FILE_PATH = os.path.join(BASE_DIR, USERS_CONFIG[selected_user_name]['pending'])
    COMMITTED_FILE_PATH = os.path.join(BASE_DIR, USERS_CONFIG[selected_user_name]['committed'])

    # Ensure selected user's PENDING_CHANGELOG.md exists
    if not os.path.exists(PENDING_FILE_PATH):
        logger.info(f"'{PENDING_FILE_PATH}' not found. Creating an empty one for {selected_user_name}.") # Added user name for clarity
        with open(PENDING_FILE_PATH, "w", encoding="utf-8") as f:
            f.write(f"# Add {selected_user_name}'s pending changelog entries here, separated by '{ENTRY_SEPARATOR.strip()}'\n")
            f.write(f"# Template for {selected_user_name}:\n")
            f.write("<!-- TEMPLATE - DO NOT PROCESS -->\n")
            f.write(f"{ENTRY_SEPARATOR}\n") # Ensure a newline before the detailed template
            f.write(f"""# **Draft Summary:** My New Feature for {selected_user_name}
# **Type:** Story
# **User:** {selected_user_name}
# **Description:**
# As a user, I want this feature so that I can achieve a goal.
#
# **Acceptance Criteria:**
# - Criteria 1
# - Criteria 2
# {ENTRY_SEPARATOR}<!-- END TEMPLATE -->\n""") # Corrected f-string closing
        logger.info(f"Please add entries to '{PENDING_FILE_PATH}' for {selected_user_name} and re-run.")
        return

    try:
        with open(PENDING_FILE_PATH, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception as e:
        logger.error(f"Error reading '{PENDING_FILE_PATH}': {e}")
        return

    template_section = ""
    processed_content = "" # Initialize to empty, will be set if file read succeeds

    try:
        with open(PENDING_FILE_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        
        processed_content = content # Start with full content for processing

        TEMPLATE_END_MARKER = "<!-- END TEMPLATE -->"
        template_end_idx = content.find(TEMPLATE_END_MARKER)

        if template_end_idx != -1:
            first_entry_sep_after_template_idx = content.find(ENTRY_SEPARATOR, template_end_idx + len(TEMPLATE_END_MARKER))
            
            if first_entry_sep_after_template_idx != -1:
                template_section = content[:first_entry_sep_after_template_idx + len(ENTRY_SEPARATOR)]
                processed_content = content[first_entry_sep_after_template_idx + len(ENTRY_SEPARATOR):]
                logger.info("Detected and skipped changelog template (including its trailing separator).") # Corrected syntax
            else:
                end_of_template_block = template_end_idx + len(TEMPLATE_END_MARKER)
                while end_of_template_block < len(content) and content[end_of_template_block] == '\n':
                    end_of_template_block +=1
                template_section = content[:end_of_template_block]
                if not template_section.endswith('\n'): 
                    template_section += '\n'
                processed_content = content[end_of_template_block:]
                logger.info("Detected changelog template. No clear entry separator after template, or file ends here.")

    except Exception as e:
        logger.error(f"Error reading '{PENDING_FILE_PATH}': {e}")
        return

    # Split entries by the separator using the processed_content. Filter out empty strings.
    # If file read failed, processed_content is "", so pending_entry_texts will be [].
    pending_entry_texts = [entry.strip() for entry in processed_content.split(ENTRY_SEPARATOR) if entry.strip()]

    if not pending_entry_texts:
        logger.info(f"No pending entries found in '{PENDING_FILE_PATH}'.")
        return

    logger.info(f"Found {len(pending_entry_texts)} pending entries.")

    # Initialize JiraConnector
    try:
        # Print the environment variable for debugging
        jira_api_token_value = os.environ.get('Jira')
        logger.info(f"Attempting to use Jira API Token from env var 'Jira'. Value found: '{jira_api_token_value}'")

        # JiraConnector will use the API token from the environment variable specified in its constructor (default 'Jira').
        # Server URL is hardcoded in JiraConnector.
        jira_conn = JiraConnector() # Assumes API token is in env var 'Jira' or JiraConnector is modified to use a different env var name.
        logger.info("JiraConnector initialized. Ensure the Jira API token environment variable (e.g., 'Jira') is set.")
        # You might want to do a quick test connection here if desired, e.g., fetch project details
    except ValueError as e: # Raised by JiraConnector if essential env vars are missing
        logger.error(f"Failed to initialize JiraConnector: {e}")
        logger.error("Please ensure the Jira API token environment variable (e.g., 'Jira') is correctly set.")
        return
    except Exception as e:
        logger.error(f"An unexpected error occurred while initializing JiraConnector: {e}", exc_info=True)
        return

    # For now, just get a common username for all entries for simplicity in this phase
    # In a real scenario, this might come from the entry or a global config
    default_username = os.environ.get('JIRA_USERNAME', 'default_user') # Fallback
    user_details = {'username': input(f"Enter Jira username for Reporter/Assignee [{default_username}]: ").strip() or default_username}


    processed_successfully_texts = [] # To store original text of successfully processed entries
    all_committed_entries_text = [] # To store the new formatted text for COMMITTED_FILE

    for entry_text in pending_entry_texts:
        if not entry_text.strip(): # Skip empty blocks if any
            continue
        logger.debug(f"Parsing entry: \n{entry_text}")
        entry_data = parse_pending_entry(entry_text)

        if not entry_data: # Skip if parsing failed
            logger.warning(f"Skipping entry due to parsing failure: \n{entry_text[:100]}...")
            processed_successfully_texts.append(None) # Keep placeholder to maintain list size if needed for rewrite logic
            continue

        success, result_data = process_single_entry(entry_data, jira_conn, user_details)
        
        if success:
            processed_successfully_texts.append(entry_text) # Mark original for removal
            if result_data and result_data != "skipped": # Ensure it's not a skip
                 all_committed_entries_text.append(result_data)
        elif result_data == "skipped":
            logger.info(f"Entry for '{entry_data.get('draft_summary')}' was skipped by the user.")
            # Skipped entries are treated as "not processed" for now, so they remain in pending.
            processed_successfully_texts.append(None) 
        else: # Failed
            logger.warning(f"Failed to process entry for '{entry_data.get('draft_summary')}'. It will remain in pending.")
            processed_successfully_texts.append(None)


    # Update COMMITTED_CHANGELOG_JIRA.md
    if all_committed_entries_text:
        try:
            with open(COMMITTED_FILE_PATH, "a", encoding="utf-8") as f_committed:
                for committed_entry_str in all_committed_entries_text:
                    f_committed.write(committed_entry_str + "\n") # Add newline after each entry
            logger.info(f"Appended {len(all_committed_entries_text)} entries to '{COMMITTED_FILE_PATH}'.")
        except Exception as e:
            logger.error(f"Error writing to '{COMMITTED_FILE_PATH}': {e}")

    # Update PENDING_CHANGELOG.md: Keep only entries that were not successfully processed or skipped
    remaining_pending_texts = []
    any_entry_found_in_loop = False # To track if we even entered the loop over pending_entry_texts
    if pending_entry_texts: # Check if there were any entries to begin with after template stripping
        any_entry_found_in_loop = True

    for i, entry_text in enumerate(pending_entry_texts):
        # An entry remains if it was not successfully processed (i.e., its corresponding slot in processed_successfully_texts is None)
        if i < len(processed_successfully_texts) and processed_successfully_texts[i] is None: 
            remaining_pending_texts.append(entry_text)
        elif i >= len(processed_successfully_texts): # Should ideally not happen if lists are managed correctly
             logger.warning(f"Mismatch in processed_successfully_texts length. Keeping entry: {entry_text[:50]}...")
             remaining_pending_texts.append(entry_text)

    try:
        with open(PENDING_FILE_PATH, "w", encoding="utf-8") as f: # Uses global PENDING_FILE_PATH
            if template_section:
                f.write(template_section)
                # Ensure a newline after template if not already present and if remaining_entries exist
                # and if template_section itself doesn't end with the separator.
                if remaining_pending_texts and \
                   not template_section.strip().endswith('\n') and \
                   not template_section.strip().endswith(ENTRY_SEPARATOR.strip()):
                    if not template_section.endswith('\n'):
                         f.write('\n')
            
            if remaining_pending_texts:
                # Join entries, ensuring the last one also has a separator
                full_remaining_content = ENTRY_SEPARATOR.join(remaining_pending_texts)
                if not full_remaining_content.endswith(ENTRY_SEPARATOR):
                    full_remaining_content += ENTRY_SEPARATOR
                f.write(full_remaining_content)
            elif not template_section: # No template and no remaining entries, create a fresh template
                logger.info(f"No template or entries left; creating a fresh template for {selected_user_name} in '{PENDING_FILE_PATH}'.")
                f.write(f"# Add {selected_user_name}'s pending changelog entries here, separated by '{ENTRY_SEPARATOR.strip()}'\n")
                f.write(f"# Template for {selected_user_name}:\n")
                f.write("<!-- TEMPLATE - DO NOT PROCESS -->\n")
                f.write(f"{ENTRY_SEPARATOR}\n") # Separator before the example entry
                f.write(f"# **Draft Summary:** My New Feature for {selected_user_name}\n")
                f.write(f"# **Type:** Story\n")
                f.write(f"# **User:** {selected_user_name}\n") 
                f.write(f"# **Description:**\n")
                f.write(f"# As a user, I want this feature so that I can achieve a goal.\n#\n")
                f.write(f"# **Acceptance Criteria:**\n")
                f.write(f"# - Criteria 1\n")
                f.write(f"# - Criteria 2\n")
                f.write(f"{ENTRY_SEPARATOR}<!-- END TEMPLATE -->\n")
            # If template_section exists but remaining_pending_texts is empty, the template is already written.

        # Logging based on what happened
        if all_committed_entries_text: # if any entries were successfully processed and formatted for commit
            logger.info(f"Successfully processed and committed {len(all_committed_entries_text)} entries for {selected_user_name}.")
            logger.info(f"Committed entries appended to '{COMMITTED_FILE_PATH}'.")
            logger.info(f"Pending changelog '{PENDING_FILE_PATH}' has been updated with remaining entries (if any).")
        elif not any_entry_found_in_loop and template_section: # No entries found after template
             logger.info(f"No processable entries found after the template in '{PENDING_FILE_PATH}' for {selected_user_name}.")
        elif not any_entry_found_in_loop and not template_section: # No entries and no template (or empty template)
            logger.info(f"No processable entries found in '{PENDING_FILE_PATH}' for {selected_user_name}. The file might be empty or only contain a basic template structure.")
        else: # Some entries were found (any_entry_found_in_loop was true) but none were committed
            logger.info(f"No entries were successfully committed from '{PENDING_FILE_PATH}' for {selected_user_name}. Check logs for details on skips or failures.")

    except Exception as e:
        logger.error(f"Error writing back to pending file '{PENDING_FILE_PATH}' for {selected_user_name}: {e}")

    logger.info(f"Changelog processing script finished for {selected_user_name}.")


    try:
        with open(PENDING_FILE_PATH, "w", encoding="utf-8") as f_pending:
            f_pending.write(template_section) # Write template (it includes its trailing separator or ends with newline)

            if remaining_pending_texts:
                # Join remaining entries. The first entry in remaining_pending_texts does NOT start with '---'
                # because split() consumes it, and template_section included the first '---' if present.
                # So, we join them with ENTRY_SEPARATOR.
                f_pending.write(ENTRY_SEPARATOR.join(remaining_pending_texts))
                
                # Ensure the file ends with a separator if there's content, for consistency for next run.
                # This also handles the case where the last remaining entry might not have naturally ended with one.
                if not f_pending.tell() == len(template_section): # Check if anything was written after template
                    if not template_section.endswith(ENTRY_SEPARATOR) and not remaining_pending_texts[0].startswith(ENTRY_SEPARATOR):
                         # This case should be rare if template_section captures its separator
                         pass # Handled by join
                    
                    # Ensure the very end of the file has a proper separator if there are entries
                    # Read what was just written to check its ending. This is a bit inefficient.
                    # A simpler way: if remaining_pending_texts, ensure the whole block ends with ENTRY_SEPARATOR.
                    # The join should handle separators between entries. We just need one at the very end. 
                    # Let's assume join adds separators correctly, just ensure final one. 
                    # If the last entry was just '---', strip() would make it empty, 
                    # but we are writing raw text from remaining_pending_texts. 
                    # A simple approach: always add a final ENTRY_SEPARATOR if there are entries, 
                    # then rely on parsing to strip it if it's redundant. 
                    # Or, be more precise. If the joined string doesn't end with it. 
                    current_written_content = ENTRY_SEPARATOR.join(remaining_pending_texts)
                    if not current_written_content.endswith(ENTRY_SEPARATOR.strip()): # Check if the content itself ends with it
                         f_pending.write(ENTRY_SEPARATOR)
                logger.info(f"Updated '{PENDING_FILE_PATH}' with template and {len(remaining_pending_texts)} remaining entries.")
            
            elif template_section.strip(): # Template exists, but no more entries
                # Ensure template_section itself ends with a newline before the comment
                if not template_section.endswith('\n'):
                    f_pending.write('\n')
                f_pending.write("# No pending entries remaining.\n")
                logger.info(f"All entries processed. Template preserved in '{PENDING_FILE_PATH}'.")
            else: # No template and no entries (empty PENDING_FILE_PATH initially)
                f_pending.write("# No pending entries remaining.\n")
                logger.info(f"All entries processed. '{PENDING_FILE_PATH}' cleared.")
    except Exception as e:
        logger.error(f"Error writing to '{PENDING_FILE_PATH}': {e}")

    logger.info("Changelog processing script finished.")

if __name__ == "__main__":
    main()