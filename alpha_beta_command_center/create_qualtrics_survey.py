# --- create_qualtrics_survey.py ---
import sys
import os
import json
import requests
import snowflake.connector
from datetime import datetime, timedelta # Ensure timedelta is imported if used (not currently, but good practice)
import traceback # For detailed error logging

# --- Configuration --- # (Values from conversation - Ensure these are correct for your env)

# Path to QSF template files
BASE_TEMPLATE_PATH = r"C:\Users\cmollica\list_generation_project\templates" # UPDATE IF NEEDED

# List of users who should always be added as collaborators to surveys
DEFAULT_COLLABORATOR_IDS = [
    'UR_9p3KaX8HWuKUhGl',
    'UR_8ennTWfbUMs6PcN',
    'UR_3WwsG1ypjclrxAi',
    'UR_a91AMgrcR3NOArc'
]

# Snowflake Account Identifier
SNOWFLAKE_ACCOUNT = "athenahealth" # UPDATE IF NEEDED

# Snowflake connection details for WRITING SURVEY RESULTS
SNOWFLAKE_DATABASE_RESULTS = "CORPANALYTICS_BUSINESS_PROD" # UPDATE IF NEEDED
SNOWFLAKE_SCHEMA_RESULTS = "SCRATCHPAD_PRDPF"             # UPDATE IF NEEDED
SNOWFLAKE_WAREHOUSE_RESULTS = "CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD" # UPDATE IF NEEDED
SNOWFLAKE_ROLE_RESULTS = "CORPANALYTICS_BDB_PRDPF_PROD_RW" # UPDATE IF NEEDED
SNOWFLAKE_TARGET_TABLE_RESULTS = f"{SNOWFLAKE_DATABASE_RESULTS}.{SNOWFLAKE_SCHEMA_RESULTS}.cr_opt_in_out_surveys" # UPDATE IF NEEDED

# Snowflake connection details for READING QUALTRICS USER IDs
SNOWFLAKE_DATABASE_USERS = "UX_PROD"    # UPDATE IF NEEDED
SNOWFLAKE_SCHEMA_USERS = "SURVEY"       # UPDATE IF NEEDED
SNOWFLAKE_USER_TABLE = f"{SNOWFLAKE_DATABASE_USERS}.{SNOWFLAKE_SCHEMA_USERS}.qualtrics_user" # UPDATE IF NEEDED
# Using the same warehouse/role for user lookup, assuming same creds/perms apply
SNOWFLAKE_WAREHOUSE_USERS = SNOWFLAKE_WAREHOUSE_RESULTS # UPDATE IF NEEDED
SNOWFLAKE_ROLE_USERS = SNOWFLAKE_ROLE_RESULTS # UPDATE IF NEEDED

# Qualtrics Base URL for EDITOR links
QUALTRICS_EDITOR_BASE_URL = "https://athenahealthrc.co1.qualtrics.com" # UPDATE IF NEEDED

# --- Environment Variable Names (Script expects these to be set externally) ---
ENV_QUALTRICS_TOKEN = "QUALTRICS_API_TOKEN"         # Service Account Token
ENV_QUALTRICS_DC_ID = "QUALTRICS_DATACENTER_ID"     # Service Account Datacenter ID
ENV_SNOWFLAKE_USER = "API_USERNAME"                 # Snowflake Username
ENV_SNOWFLAKE_PASSWORD = "API_PASSWORD"             # Snowflake Password

# --- Helper Functions ---
def print_error(msg):
    """Prints an error message to stderr."""
    print(f"ERROR: {msg}", file=sys.stderr)

def load_qsf(qsf_path: str) -> dict:
    """Loads QSF file content."""
    try:
        with open(qsf_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print_error(f"Template file not found at: {qsf_path}")
        return None
    except json.JSONDecodeError as e:
        print_error(f"Error decoding JSON from template file {qsf_path}: {e}")
        return None
    except Exception as e:
        print_error(f"Unexpected error loading template file {qsf_path}: {e}")
        return None

def update_placeholders(qsf_dict: dict, feature_number: str, alpha_beta: str, client_facing_feature_name: str) -> dict:
    """Replaces placeholders in the QSF dictionary (as a string)."""
    if not qsf_dict:
        return None
    try:
        qsf_str = json.dumps(qsf_dict)
        # Perform replacements using case-sensitive matches from template
        qsf_str = qsf_str.replace("FEATURE_NUMBER", feature_number)
        qsf_str = qsf_str.replace("ALPHA_BETA", alpha_beta)
        qsf_str = qsf_str.replace("CLIENT_FACING_FEATURE_NAME", client_facing_feature_name)
        return json.loads(qsf_str)
    except Exception as e:
        print_error(f"Error updating placeholders in QSF data: {e}")
        return None

def update_qsf_dates(qsf_dict: dict, start_date_str: str, end_date_str: str) -> dict:
    """
    Updates SurveyStartDate, SurveyExpirationDate in SurveyEntry,
    and sets SurveyExpiration to 'on' in Survey Options.
    Expects date strings in 'YYYY-MM-DD' format.
    """
    if not qsf_dict:
        print_error("Cannot update dates: Invalid QSF data provided.")
        return None

    try:
        # Format dates to 'YYYY-MM-DD HH:MM:SS' required by Qualtrics API/QSF format.
        # Using 00:00:00 for start and 23:59:59 for end to cover the full days selected.
        start_datetime_str = f"{start_date_str} 00:00:00"
        end_datetime_str = f"{end_date_str} 15:00:00" # 3pm of the selected day

        # 1. Update SurveyEntry dates
        if 'SurveyEntry' in qsf_dict and isinstance(qsf_dict['SurveyEntry'], dict):
            qsf_dict['SurveyEntry']['SurveyStartDate'] = start_datetime_str
            qsf_dict['SurveyEntry']['SurveyExpirationDate'] = end_datetime_str
            print(f"INFO: Set QSF SurveyStartDate to {start_datetime_str}", file=sys.stderr)
            print(f"INFO: Set QSF SurveyExpirationDate to {end_datetime_str}", file=sys.stderr)
        else:
            print_error("QSF structure error: 'SurveyEntry' dictionary not found.")
            return None

        # 2. Update Survey Options to enable expiration
        so_element_updated = False
        if 'SurveyElements' in qsf_dict and isinstance(qsf_dict['SurveyElements'], list):
            for element in qsf_dict['SurveyElements']:
                # Check element type and existence of Payload dictionary
                if element.get('Element') == 'SO' and 'Payload' in element and isinstance(element['Payload'], dict):
                    element['Payload']['SurveyExpiration'] = 'on'
                    so_element_updated = True
                    print("INFO: Set QSF Survey Options 'SurveyExpiration' to 'on'", file=sys.stderr)
                    break # Assume only one SO element needs updating
        else:
             print_error("QSF structure error: 'SurveyElements' not found or is not a list.")
             return None

        if not so_element_updated:
            print_error("QSF structure error: Survey Options ('SO' element with 'Payload') not found.")
            # This is critical for dates to work, so consider it a failure.
            return None

        return qsf_dict

    except KeyError as ke:
        print_error(f"QSF structure error updating dates: Missing expected key {ke}")
        return None
    except Exception as e:
        print_error(f"An unexpected error occurred while updating QSF dates: {e}")
        print_error(traceback.format_exc(), file=sys.stderr)
        return None


def upload_survey(qsf_dict: dict, survey_name: str):
    """
    Creates survey in Qualtrics using the service account's API token.
    Returns (survey_id, editor_url, live_url, datacenter_id) on success, else (None, None, None, None).
    """
    api_token = os.environ.get(ENV_QUALTRICS_TOKEN)
    datacenter_id = os.environ.get(ENV_QUALTRICS_DC_ID)
    if not api_token or not datacenter_id:
        print_error(f"Service account environment variables {ENV_QUALTRICS_TOKEN} or {ENV_QUALTRICS_DC_ID} not set.")
        return None, None, None, None

    if not qsf_dict:
        print_error("Cannot upload survey: Invalid QSF data provided.")
        return None, None, None, None

    try:
        # The QSF dictionary should already be updated with placeholders and dates
        qsf_str = json.dumps(qsf_dict)
    except Exception as e:
        print_error(f"Failed to serialize final QSF data to JSON for upload: {e}")
        return None, None, None, None

    # Use the service account's DC ID for the API call URL
    api_call_url = f"https://{datacenter_id}.qualtrics.com/API/v3/surveys"
    headers = {"X-API-TOKEN": api_token, "Accept": "application/json"}
    files = {
        "file": ("updated_survey.qsf", qsf_str, "application/vnd.qualtrics.survey.qsf"),
        "name": (None, survey_name) # Qualtrics Survey Name shown in UI
    }

    print(f"INFO: Creating Qualtrics survey '{survey_name}' via API ({api_call_url})...", file=sys.stderr)
    try:
        resp = requests.post(api_call_url, headers=headers, files=files, timeout=60) # Increased timeout
        resp.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        resp_data = resp.json()
        if "result" in resp_data and "id" in resp_data["result"]:
            survey_id = resp_data["result"]["id"]
            # Use the specific base URL requested for the editor link
            editor_url = f"{QUALTRICS_EDITOR_BASE_URL}/survey-builder/{survey_id}/edit"
            # Use the service account's DC ID for the live JFE link (participation link)
            live_url = f"https://{datacenter_id}.qualtrics.com/jfe/form/{survey_id}"
            print(f"INFO: Qualtrics survey created successfully! ID = {survey_id}", file=sys.stderr)
            return survey_id, editor_url, live_url, datacenter_id
        else:
            print_error(f"Qualtrics API responded OK, but missing result/id in response: {json.dumps(resp_data)}")
            return None, None, None, None

    except requests.exceptions.Timeout:
        print_error(f"Qualtrics survey creation timed out after 60 seconds.")
        return None, None, None, None
    except requests.exceptions.HTTPError as http_err:
        print_error(f"Qualtrics survey creation failed (HTTP Error): {http_err}")
        try:
            # Attempt to get more detailed error from Qualtrics response
            err_content = http_err.response.json()
            print_error(f"Qualtrics Response Content: {json.dumps(err_content)}", file=sys.stderr)
        except Exception:
            # Fallback if response is not JSON
            print_error(f"Qualtrics Non-JSON Response: {http_err.response.text[:500]}", file=sys.stderr) # Log first 500 chars
        return None, None, None, None
    except requests.exceptions.RequestException as req_err:
        print_error(f"Qualtrics survey creation failed (Request Exception): {req_err}")
        return None, None, None, None
    except Exception as e:
        print_error(f"An unexpected error occurred during survey upload: {e}")
        print_error(traceback.format_exc(), file=sys.stderr) # Log full traceback for unexpected errors
        return None, None, None, None


def get_snowflake_connection(db, schema, warehouse, role):
    """Establishes a Snowflake connection using environment credentials."""
    snowflake_user = os.environ.get(ENV_SNOWFLAKE_USER)
    snowflake_password = os.environ.get(ENV_SNOWFLAKE_PASSWORD)

    if not snowflake_user or not snowflake_password:
        print_error(f"Snowflake credentials ({ENV_SNOWFLAKE_USER}, {ENV_SNOWFLAKE_PASSWORD}) not found in environment variables.")
        return None

    try:
        conn = snowflake.connector.connect(
            user=snowflake_user,
            password=snowflake_password,
            account=SNOWFLAKE_ACCOUNT,
            warehouse=warehouse,
            database=db,
            schema=schema,
            role=role,
            session_parameters={
                'QUERY_TAG': 'QualtricsSurveyCreationScript', # Helpful for monitoring
                'QUERY_TIMEOUT_IN_SECONDS': 60 # Slightly increased timeout for potentially slower operations
            }
        )
        # print(f"INFO: Connected to Snowflake DB: {db}, Schema: {schema}, Role: {role}", file=sys.stderr) # Less verbose
        return conn
    except snowflake.connector.Error as sf_err:
        print_error(f"Snowflake Connection Error to DB {db}, Schema {schema}, Role {role}: {sf_err}")
        return None
    except Exception as e:
        print_error(f"Unexpected error connecting to Snowflake DB {db}: {e}")
        return None


def get_qualtrics_user_id(username: str):
    """Looks up Qualtrics User ID (UR_...) from Snowflake using case-insensitive match."""
    user_qualtrics_id = None
    conn = get_snowflake_connection(SNOWFLAKE_DATABASE_USERS, SNOWFLAKE_SCHEMA_USERS, SNOWFLAKE_WAREHOUSE_USERS, SNOWFLAKE_ROLE_USERS)
    if not conn:
        print_error(f"Cannot lookup Qualtrics User ID for '{username}': Snowflake connection failed.")
        return None

    try:
        print(f"INFO: Looking up Qualtrics ID for username: '{username}' in {SNOWFLAKE_USER_TABLE}", file=sys.stderr)

        # Using UPPER for case-insensitive matching on USER_NAME column. Assumes ID column is stored correctly.
        # Column names "ID" and "USER_NAME" are quoted as they were likely created case-sensitively in Snowflake.
        # Ensure these exact column names exist in your table.
        sql = f'SELECT "ID" FROM {SNOWFLAKE_USER_TABLE} WHERE UPPER("USER_NAME") = UPPER(%s) LIMIT 1'

        with conn.cursor() as cur:
            cur.execute(sql, (username,))
            result = cur.fetchone()

            if result and result[0] and isinstance(result[0], str) and result[0].startswith("UR_"):
                user_qualtrics_id = result[0]
                print(f"INFO: Found Qualtrics User ID: {user_qualtrics_id}", file=sys.stderr)
            elif result:
                 # Found a row but the ID format is wrong
                 print(f"WARN: Found a value for user '{username}' in {SNOWFLAKE_USER_TABLE}, but it doesn't look like a valid Qualtrics User ID (expected UR_...): '{result[0]}'", file=sys.stderr)
            else:
                # No row found
                print(f"WARN: No Qualtrics User ID found for username: '{username}' in {SNOWFLAKE_USER_TABLE}", file=sys.stderr)

    except snowflake.connector.Error as sf_err:
        print_error(f"Snowflake Error during user lookup for '{username}': {sf_err}")
    except Exception as e:
        print_error(f"Unexpected error during Snowflake user lookup for '{username}': {e}")
    finally:
        if conn:
            conn.close()
            # print(f"INFO: Closed Snowflake connection for user lookup.", file=sys.stderr) # Optional

    return user_qualtrics_id


def share_survey_with_user(survey_id, user_id_to_share_with):
    """
    Shares the survey with the specified User ID using the service token
    and the /permissions/collaborations endpoint. Grants broad edit/manage permissions.
    """
    api_token = os.environ.get(ENV_QUALTRICS_TOKEN)
    datacenter_id = os.environ.get(ENV_QUALTRICS_DC_ID) # Service account's DC
    if not api_token or not datacenter_id:
        print_error("Cannot share survey: Service account Qualtrics credentials missing from env.")
        return False
    # Validate the User ID format passed in
    if not user_id_to_share_with or not user_id_to_share_with.startswith("UR_"):
         print_error(f"Cannot share survey {survey_id}: Invalid User ID provided for sharing: '{user_id_to_share_with}'")
         return False

    # Use the correct endpoint for adding collaborations
    share_url = f"https://{datacenter_id}.qualtrics.com/API/v3/surveys/{survey_id}/permissions/collaborations"

    headers = {"X-API-TOKEN": api_token, "Content-Type": "application/json", "Accept": "application/json"}

    # Define comprehensive permissions payload for collaboration
    # (Adjust these based on the minimum required permissions for your users)
    payload = {
      "recipientId": user_id_to_share_with, # Field name for the user ID to share with
      "permissions": {
        "surveyDefinitionManipulation": { # Editing survey structure
          "copySurveyQuestions": True,
          "editSurveyFlow":        True,
          "useBlocks":             True,
          "useSkipLogic":          True,
          "useConjoint":           True,  # Might depend on user's Qualtrics license features
          "useTriggers":           True,
          "useQuotas":             True,
          "setSurveyOptions":      True,
          "editQuestions":         True,
          "deleteSurveyQuestions": True,  # Consider setting to False for safety?
          "useTableOfContents":    True,
          "useAdvancedQuotas":     True,
          "viewSurveys":           True   # Likely implied, but doesn't hurt
        },
        "surveyManagement": { # Managing the survey project itself
          "editSurveys":      True,  # Edit survey name, etc.
          "activateSurveys":  True,
          "deactivateSurveys":True,
          "copySurveys":      True,
          "distributeSurveys":True,
          "deleteSurveys":    False, # RECOMMENDED: Keep False to prevent accidental deletion by collaborators
          "translateSurveys": True
        },
        "response": { # Permissions related to individual responses
          "editSurveyResponses": False, # Typically False unless specifically needed
          "createResponseSets":   True,
          "viewResponseId":       True,
          "useCrossTabs":         True,
          "useScreenouts":        True
        },
        "result": { # Permissions related to aggregated results/reporting
          "downloadSurveyResults": True,
          "viewSurveyResults":     True,
          "filterSurveyResults":   True,
          "viewPersonalData":      True, # Allow viewing PII if collected (e.g., email)
          "generateSurveyReports": True, # Grant report generation if needed
          "viewSurveyReports": True
        }
        # Note: collaborationManagement (sharing with others) is usually handled separately or implied by ownership/admin rights
      }
    }

    print(f"INFO: Attempting to share survey {survey_id} with user {user_id_to_share_with} via POST to: {share_url}", file=sys.stderr)
    # print(f"[DEBUG] Sharing Payload: {json.dumps(payload, indent=2)}", file=sys.stderr) # Optional: Log payload for debugging

    try:
        # Use POST method for adding collaboration
        response = requests.post(share_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status() # Will raise HTTPError on 4xx/5xx responses

        # Check response content for success confirmation if available/needed, but 2xx status is usually enough
        print(f"INFO: Successfully shared survey {survey_id} with user {user_id_to_share_with}.", file=sys.stderr)
        return True # Indicate success

    except requests.exceptions.Timeout:
         print_error(f"Qualtrics survey sharing timed out for survey {survey_id}, user {user_id_to_share_with}.")
         return False
    except requests.exceptions.HTTPError as http_err:
        print_error(f"Failed to share survey {survey_id} with user {user_id_to_share_with} (HTTP Error): {http_err}")
        try:
            err_content = http_err.response.json()
            print_error(f"Qualtrics Sharing Response (JSON): {json.dumps(err_content)}")
        except Exception:
            print_error(f"Qualtrics Sharing Response (Non-JSON): {http_err.response.text[:500]}")
        return False # Indicate sharing failure
    except requests.exceptions.RequestException as req_err:
        print_error(f"Failed to share survey {survey_id} with user {user_id_to_share_with} (Request Exception): {req_err}")
        return False
    except Exception as e:
        print_error(f"An unexpected error occurred during survey sharing for {survey_id}: {e}")
        print_error(f"Traceback: {traceback.format_exc()}")
        return False


def write_to_snowflake(data_to_insert: dict):
    """Writes the survey creation record to the Snowflake RESULTS table."""
    success = False
    conn = get_snowflake_connection(SNOWFLAKE_DATABASE_RESULTS, SNOWFLAKE_SCHEMA_RESULTS, SNOWFLAKE_WAREHOUSE_RESULTS, SNOWFLAKE_ROLE_RESULTS)
    if not conn:
        print_error("Cannot write results to Snowflake: Connection failed.")
        return False

    try:
        print(f"INFO: Preparing to insert record into {SNOWFLAKE_TARGET_TABLE_RESULTS}...", file=sys.stderr)

        # Define columns to insert - ensure these match your Snowflake table definition!
        # Use sorted keys for consistent order, quote names for case sensitivity
        cols = sorted(data_to_insert.keys())
        quoted_cols = [f'"{c.upper()}"' for c in cols] # Assuming Snowflake columns are uppercase

        # Add the timestamp column explicitly if it's not in data_to_insert
        # Assuming the column name is CREATED_TIMESTAMP_UTC in Snowflake
        timestamp_col_name = '"CREATED_TIMESTAMP_UTC"'
        if timestamp_col_name not in quoted_cols:
             quoted_cols.append(timestamp_col_name)
             # Add placeholder for the timestamp value
             placeholders = ", ".join(["%s"] * len(cols)) + ", %s"
             current_time_utc = datetime.utcnow()
             vals = [data_to_insert[key] for key in cols] + [current_time_utc]
        else:
            # Timestamp is already in the data_to_insert dict
             placeholders = ", ".join(["%s"] * len(quoted_cols))
             vals = [data_to_insert[key] for key in cols] # Order must match quoted_cols


        sql = f'INSERT INTO {SNOWFLAKE_TARGET_TABLE_RESULTS} ({", ".join(quoted_cols)}) VALUES ({placeholders})'

        print(f"INFO: Executing Snowflake INSERT statement...", file=sys.stderr)
        # print(f"[DEBUG] SQL: {sql}", file=sys.stderr)
        # print(f"[DEBUG] Values: {vals}", file=sys.stderr)

        with conn.cursor() as cur:
            cur.execute(sql, vals)

        conn.commit()
        print(f"INFO: Record successfully inserted into Snowflake table {SNOWFLAKE_TARGET_TABLE_RESULTS}.", file=sys.stderr)
        success = True

    except snowflake.connector.Error as sf_err:
        print_error(f"Snowflake Error during results write to {SNOWFLAKE_TARGET_TABLE_RESULTS}: {sf_err}")
        # Attempt to rollback transaction on error
        if conn:
            try:
                conn.rollback()
                print("INFO: Snowflake transaction rolled back.", file=sys.stderr)
            except Exception as rb_err:
                print_error(f"Error during Snowflake rollback: {rb_err}")
    except Exception as e:
        print_error(f"An unexpected error occurred during Snowflake results write: {e}")
        if conn:
            try:
                conn.rollback()
                print("INFO: Snowflake transaction rolled back.", file=sys.stderr)
            except Exception as rb_err:
                print_error(f"Error during Snowflake rollback: {rb_err}")
    finally:
        if conn:
            conn.close()
            # print(f"INFO: Closed Snowflake connection for results write.", file=sys.stderr) # Optional
    return success


# --- Main Execution Logic ---
def main():
    # Expect 8 arguments now: script_name, type, feature, stage, name, user, start_date, end_date
    expected_arg_count = 8
    if len(sys.argv) != expected_arg_count:
        print_error(f"Usage: python {sys.argv[0]} <survey_type> <FEATURE_NUMBER> <ALPHA_BETA> <CLIENT_FACING_FEATURE_NAME> <requesting_username> <start_date YYYY-MM-DD> <end_date YYYY-MM-DD>")
        # Output JSON error message to stdout for the calling process (Node.js)
        print(json.dumps({
            "success": False,
            "message": f"Internal script error: Expected {expected_arg_count - 1} data arguments, received {len(sys.argv) - 1}."
        }))
        sys.exit(1) # Exit with a non-zero code to indicate failure

    try:
        # Parse command-line arguments (index 0 is the script name)
        survey_type_input = sys.argv[1]
        feature_number_arg = sys.argv[2]
        alpha_beta_arg = sys.argv[3]
        client_facing_feature_name_arg = sys.argv[4]
        requesting_username_arg = sys.argv[5]
        start_date_arg = sys.argv[6] # New argument for start date
        end_date_arg = sys.argv[7]   # New argument for end date

        # Basic validation: Check if any arguments are empty strings
        if not all([survey_type_input, feature_number_arg, alpha_beta_arg, client_facing_feature_name_arg, requesting_username_arg, start_date_arg, end_date_arg]):
             raise ValueError("One or more required command-line arguments are empty.")

        # Validate date formats (YYYY-MM-DD)
        try:
            start_dt = datetime.strptime(start_date_arg, '%Y-%m-%d')
            end_dt = datetime.strptime(end_date_arg, '%Y-%m-%d')
            # Optional: Check if end date is not before start date
            if end_dt < start_dt:
                raise ValueError("End date cannot be before start date.")
        except ValueError as date_err:
            raise ValueError(f"Invalid date format or value: {date_err}. Expected YYYY-MM-DD.") from date_err

        # Log received arguments (including new dates) to stderr for debugging
        print(f"INFO: Received arguments: Type='{survey_type_input}', Feature='{feature_number_arg}', Stage='{alpha_beta_arg}', Name='{client_facing_feature_name_arg}', User='{requesting_username_arg}', Start='{start_date_arg}', End='{end_date_arg}'", file=sys.stderr)

        # --- New fallback for blank client-facing feature name ---
        if not client_facing_feature_name_arg.strip():
            client_facing_feature_name_arg = "**PLEASE UPDATE WITH CLIENT FACING FEATURE NAME**"
            print_error("CLIENT_FACING_FEATURE_NAME was blank; using placeholder text.")

    except IndexError:
        # This error occurs if fewer arguments than expected are provided
        print_error(f"Failed to parse command-line arguments. Expected {expected_arg_count -1}, received {len(sys.argv) - 1}. Check indices. Received: {sys.argv[1:]}")
        print(json.dumps({"success": False, "message": "Internal error: Incorrect number of command-line arguments received."}))
        sys.exit(1)
    except ValueError as ve: # Catch specific validation errors (empty args, date format/value)
         print_error(f"Failed to parse command-line arguments: {ve}")
         print(json.dumps({"success": False, "message": f"Invalid arguments received: {ve}"}))
         sys.exit(1)
    except Exception as e:
        # Catch any other unexpected errors during argument parsing
        print_error(f"Unexpected error parsing command-line arguments: {e}")
        print_error(traceback.format_exc(), file=sys.stderr)
        print(json.dumps({"success": False, "message": f"Internal error processing arguments: {e}"}))
        sys.exit(1)

    # --- Determine Template Based on survey_type_input ---
    if survey_type_input.lower() == "opt-in":
        template_filename = "opt_in_survey.qsf"
        survey_type_suffix = "Opt_In"
        survey_type_data = "Opt-In" # Value to store in Snowflake
    elif survey_type_input.lower() == "opt-out":
        template_filename = "opt_out_survey.qsf"
        survey_type_suffix = "Opt_Out"
        survey_type_data = "Opt-Out" # Value to store in Snowflake
    else:
        print_error(f"Invalid survey_type provided: '{survey_type_input}'. Must be 'Opt-In' or 'Opt-Out'.")
        print(json.dumps({"success": False, "message": "Invalid survey_type provided. Choose 'Opt-In' or 'Opt-Out'."}))
        sys.exit(1)

    template_qsf_path = os.path.join(BASE_TEMPLATE_PATH, template_filename)
    print(f"INFO: Using template file: {template_qsf_path}", file=sys.stderr)

    # --- Step 1: Look up Qualtrics User ID for Sharing ---
    print(f"INFO: Looking up Qualtrics User ID for '{requesting_username_arg}'...", file=sys.stderr)
    user_id_for_sharing = get_qualtrics_user_id(requesting_username_arg)
    sharing_status = None # Will be 'success', 'failed', 'user_not_found', or 'not_attempted'

    if not user_id_for_sharing:
        print_error(f"Could not find Qualtrics User ID for '{requesting_username_arg}'. Survey will be created but NOT shared automatically.")
        sharing_status = "user_not_found"
        # Continue with survey creation, but sharing will be skipped

    # --- Step 2: Load QSF Template ---
    print(f"INFO: Loading template file: {template_qsf_path}", file=sys.stderr)
    qsf_data = load_qsf(template_qsf_path)
    if not qsf_data:
        # Error already printed by load_qsf
        print(json.dumps({"success": False, "message": f"Internal server error: Could not load template file '{template_filename}'."}))
        sys.exit(1)

    # --- Step 3: Update Placeholders in QSF ---
    print("INFO: Updating placeholders (FEATURE_NUMBER, ALPHA_BETA, etc.) in QSF...", file=sys.stderr)
    updated_qsf_placeholders = update_placeholders(qsf_data, feature_number_arg, alpha_beta_arg, client_facing_feature_name_arg)
    if not updated_qsf_placeholders:
         # Error already printed by update_placeholders
         print(json.dumps({"success": False, "message": "Internal server error: Could not update placeholders in template."}))
         sys.exit(1)

    # --- Step 4: Update Dates and Expiration Option in QSF ---
    print("INFO: Updating dates and expiration option in QSF...", file=sys.stderr)
    final_qsf = update_qsf_dates(updated_qsf_placeholders, start_date_arg, end_date_arg)
    if not final_qsf:
        # Error already printed by update_qsf_dates
        print(json.dumps({"success": False, "message": "Internal server error: Could not update survey dates in template."}))
        sys.exit(1)

    # --- Step 5: Build Final Survey Name ---
    final_survey_name = f"{feature_number_arg}-{alpha_beta_arg}-{survey_type_suffix}"
    print(f"INFO: Final survey name will be: '{final_survey_name}'", file=sys.stderr)

    # --- Step 6: Upload Survey to Qualtrics using Service Token ---
    print(f"INFO: Attempting to upload survey '{final_survey_name}' to Qualtrics...", file=sys.stderr)
    # Pass the 'final_qsf' which includes both placeholder and date updates
    upload_result = upload_survey(final_qsf, final_survey_name)

    # Properly unpack the result (always expect 4 values, even if None)
    qualtrics_survey_id, editor_url, live_url, dc_id = None, None, None, None
    if upload_result is not None and len(upload_result) == 4:
        qualtrics_survey_id, editor_url, live_url, dc_id = upload_result
    else:
         print_error("Upload_survey function returned an unexpected result or failed.")
         # Keep variables as None

    # Check if upload was successful (survey ID is the key indicator)
    if not qualtrics_survey_id:
        print_error("Qualtrics survey creation failed (details logged above).")
        print(json.dumps({"success": False, "message": "Failed to create survey in Qualtrics."}))
        sys.exit(1) # Exit script as we cannot proceed without a survey ID

    # --- Step 7: Attempt Sharing if Upload Succeeded and User ID Was Found ---
    if user_id_for_sharing: # Only attempt sharing if we found a user ID earlier
        print(f"INFO: Survey {qualtrics_survey_id} created. Attempting to share with user {user_id_for_sharing} ('{requesting_username_arg}')...", file=sys.stderr)
        sharing_successful = share_survey_with_user(qualtrics_survey_id, user_id_for_sharing)
        sharing_status = "success" if sharing_successful else "failed"
        if not sharing_successful:
            # Log the error, but don't necessarily stop the script - survey exists, just not shared
            print_error(f"CRITICAL WARNING: Survey {qualtrics_survey_id} created, but FAILED to share automatically with {user_id_for_sharing} ({requesting_username_arg}). Manual sharing may be required.")
    elif sharing_status == "user_not_found":
         print("INFO: Skipping sharing step because Qualtrics user ID was not found.", file=sys.stderr)
    else: # Should not happen if logic is correct, but defensive coding
        sharing_status = "not_attempted"
        print("INFO: Skipping sharing step.", file=sys.stderr)
        
    # --- Step 7b: Share with default collaborators ---
    # Add required collaborators regardless of whether the original user was found
    print(f"INFO: Sharing survey with required default collaborators...", file=sys.stderr)
    
    # Track sharing status with default collaborators
    default_collaborator_status = []
    for collab_id in DEFAULT_COLLABORATOR_IDS:
        # Skip if this is the same as the requesting user (avoid duplicate sharing)
        if collab_id == user_id_for_sharing:
            print(f"INFO: Skipping default collaborator {collab_id} - same as requesting user", file=sys.stderr)
            default_collaborator_status.append((collab_id, "skipped - requesting user"))
            continue
            
        print(f"INFO: Sharing with default collaborator {collab_id}...", file=sys.stderr)
        sharing_result = share_survey_with_user(qualtrics_survey_id, collab_id)
        status = "success" if sharing_result else "failed"
        default_collaborator_status.append((collab_id, status))
        
        if not sharing_result:
            print_error(f"WARNING: Failed to share survey {qualtrics_survey_id} with default collaborator {collab_id}")

    # --- Step 8: Write Results Record to Snowflake ---
    print("INFO: Attempting to write survey creation details to Snowflake...", file=sys.stderr)
    # Prepare data dictionary for insertion. Column names must match Snowflake table.
    # Use uppercase keys if Snowflake columns are uppercase and not quoted.
    record_data = {
        "FEATURE_NUMBER": feature_number_arg,
        "ALPHA_BETA": alpha_beta_arg,
        "CLIENT_FACING_FEATURE_NAME": client_facing_feature_name_arg,
        "SURVEY_TYPE": survey_type_data, # e.g., "Opt-In" or "Opt-Out"
        "FINAL_SURVEY_NAME": final_survey_name,
        "QUALTRICS_SURVEY_ID": qualtrics_survey_id,
        "QUALTRICS_SURVEY_URL": live_url, # Participation URL
        "REQUESTING_USER": requesting_username_arg,
        "SHARING_STATUS": sharing_status, # 'success', 'failed', 'user_not_found', 'not_attempted'
        "SURVEY_START_DATE": start_date_arg, # Store the start date
        "SURVEY_END_DATE": end_date_arg,       # Store the end date
        # Ensure columns like SURVEY_START_DATE, SURVEY_END_DATE exist in your target Snowflake table
        # Or remove them from this dictionary if they don't exist in the table.
    }
    snowflake_write_success = write_to_snowflake(record_data)
    if not snowflake_write_success:
        # Log error, but proceed to output success to frontend as survey was created
        print_error("CRITICAL WARNING: Failed to write survey details to Snowflake results table (logged above). Record may be missing.")
        # You might decide to change the final success output based on this failure if logging is critical.

    # --- Step 9: Output Final JSON Result to Frontend (via stdout) ---
    # This JSON is captured by the calling Node.js process
    final_output = {
        "success": True, # Indicate overall process (survey creation) succeeded
        "surveyId": qualtrics_survey_id,
        "surveyUrl": editor_url, # Provide the EDITOR URL for the user
        "sharingStatus": sharing_status, # Inform frontend about sharing outcome
        "message": "Survey creation process completed." # General success message
    }
    print(json.dumps(final_output)) # Print final JSON to stdout
    print("INFO: Script finished successfully.", file=sys.stderr)
    sys.exit(0) # Exit with 0 code for success


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # Catch any unhandled exceptions in the main function flow
        print_error(f"An uncaught exception occurred in main execution: {e}")
        print_error(traceback.format_exc(), file=sys.stderr) # Log the full traceback
        # Output a standard JSON error message to stdout
        print(json.dumps({
            "success": False,
            "message": f"An unexpected internal server error occurred: {e}",
            "surveyId": None,
            "surveyUrl": None,
            "sharingStatus": "error"
        }))
        sys.exit(1) # Exit non-zero on unhandled exception