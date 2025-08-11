# src/dal/jira_connector.py
import os
import urllib3

# Suppress InsecureRequestWarning: Unverified HTTPS request is being made to host...
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
import logging
from typing import List, Dict, Any, Optional, Union
from jira import JIRA, Issue
from jira.exceptions import JIRAError
import ssl # For SSL context, though now primarily handled by JIRA lib's 'validate'

# Configure logging
logger = logging.getLogger(__name__)
# Ensure a handler is configured for the logger if not already configured by the calling script.
# This is a basic configuration.
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


class JiraConnector:
    def __init__(
        self,
        # server parameter removed
        api_token_env_var: str = 'Jira' # Specifies the env var for the API token
    ):
        """
        Initialize the Jira connector.
        API token is loaded from an environment variable. Server URL is hardcoded.
        """
        self.server = "https://athenajira.athenahealth.com/" # Hardcoded server URL
        self.api_token = os.environ.get(api_token_env_var) # Reads from 'Jira' by default

        # SSL verification is hardcoded to False for this specific Jira instance
        self.verify_ssl = False 
        
        # Log a warning that SSL verification is disabled
        logger.warning(
            "Jira SSL certificate verification is PERMANENTLY DISABLED in JiraConnector. "
            "This is generally not recommended for production environments due to security risks, "
            "but may be necessary for specific internal Jira setups with self-signed certificates."
        )
        
        # Validate required parameters for connection
        # JIRA_SERVER is no longer checked here as it's hardcoded.
        # JIRA_VERIFY_SSL is no longer checked here as it's hardcoded.
        required_env_vars = {
            api_token_env_var: self.api_token 
        }
        missing_vars = [var_name for var_name, var_value in required_env_vars.items() if not var_value]
        
        if missing_vars:
            raise ValueError(
                f"Missing required Jira connection environment variable(s): {', '.join(missing_vars)}. "
                f"Ensure this/these are set."
            )

    def connect(self) -> JIRA:
        """
        Establishes and returns a connection to the Jira server using token authentication.
        """
        try:
            logger.info(f"Connecting to Jira server at {self.server}...")
            # Explicitly set verify in options as well, though validate parameter should handle it.
            options = {'server': self.server, 'verify': self.verify_ssl}
            
            # Using token_auth with the API token
            client = JIRA(
                options=options,
                token_auth=self.api_token,
                validate=self.verify_ssl # Controls SSL certificate verification
            )
            logger.info("Successfully connected to Jira using token_auth.")
            return client
        except JIRAError as e:
            logger.error(f"Jira connection error (JIRAError): {e.text if e.text else str(e)}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"General error connecting to Jira: {str(e)}", exc_info=True)
            raise

    def get_fields_info(self) -> List[Dict[str, Any]]:
        """
        Retrieves information about all available Jira fields.

        Returns:
            List[Dict[str, Any]]: A list of dictionaries, each describing a Jira field.
        """
        client = None
        try:
            client = self.connect()
            fields = client.fields()
            logger.info(f"Retrieved information for {len(fields)} Jira fields.")
            return fields
        except Exception as e:
            logger.error(f"Error retrieving Jira fields information: {str(e)}", exc_info=True)
            return []

    def _extract_field_value(self, issue: Issue, field_id: str, field_name: str, fields_info: List[Dict[str, Any]]) -> Any:
        """
        Extracts the value of a field from a Jira issue, handling different field types.
        """
        try:
            raw_value = getattr(issue.fields, field_id, None)
            if raw_value is None:
                return None

            # Find field schema for type information
            field_schema = next((f for f in fields_info if f['id'] == field_id), None)
            field_type = field_schema['schema']['type'] if field_schema and 'schema' in field_schema and 'type' in field_schema['schema'] else 'unknown'
            
            # Based on observed types in your previous scripts and common Jira types:
            if field_type == 'user' and hasattr(raw_value, 'displayName'):
                return raw_value.displayName
            elif field_type == 'array' and field_schema and field_schema['schema'].get('items') == 'string':
                 return ', '.join(raw_value) if isinstance(raw_value, list) else raw_value
            elif field_type == 'array' and field_schema and field_schema['schema'].get('items') == 'option' and isinstance(raw_value, list):
                return ', '.join(item.value for item in raw_value if hasattr(item, 'value'))
            elif field_type == 'option' and hasattr(raw_value, 'value'):
                return raw_value.value
            elif field_type == 'priority' and hasattr(raw_value, 'name'):
                return raw_value.name
            elif field_type == 'status' and hasattr(raw_value, 'name'):
                return raw_value.name
            elif field_type == 'project' and hasattr(raw_value, 'name'):
                return raw_value.name
            elif field_type == 'resolution' and hasattr(raw_value, 'name'):
                return raw_value.name
            elif field_type == 'issuetype' and hasattr(raw_value, 'name'):
                return raw_value.name
            elif isinstance(raw_value, list) and all(hasattr(item, 'name') for item in raw_value): # e.g., components, versions
                return ', '.join(item.name for item in raw_value)
            elif isinstance(raw_value, str) or isinstance(raw_value, (int, float, bool)):
                return raw_value
            else: # Fallback for complex types or unhandled types
                return str(raw_value)

        except Exception as e:
            logger.warning(f"Could not extract value for field '{field_name}' (ID: {field_id}), type: {field_type}. Error: {e}", exc_info=False)
            return None
            
    def get_feature_issues(self, field_mapping: Dict[str, str], fields_info: List[Dict[str, Any]], jql: str, max_results: int = 50) -> List[Dict[str, Any]]:
        """
        Retrieves issues from Jira based on a JQL query and maps custom fields.
        """
        client = None
        try:
            client = self.connect()
            issues_data = []
            
            # Construct the list of fields to retrieve, including standard fields
            jira_fields_to_retrieve = list(field_mapping.values())
            # Add standard fields that might not be in mapping but are usually needed
            standard_fields = ['summary', 'status', 'issuetype', 'reporter', 'assignee', 'created', 'updated', 'priority', 'project', 'resolution']
            for sf in standard_fields:
                if sf not in jira_fields_to_retrieve and sf not in field_mapping.keys(): # Avoid adding if already mapped by name
                    jira_fields_to_retrieve.append(sf)
            
            logger.info(f"Searching Jira with JQL: {jql}")
            searched_issues = client.search_issues(jql, maxResults=max_results, fields=jira_fields_to_retrieve, expand='renderedFields')

            for issue in searched_issues:
                issue_details = {'key': issue.key}
                for human_name, jira_id in field_mapping.items():
                    issue_details[human_name] = self._extract_field_value(issue, jira_id, human_name, fields_info)
                
                # Add standard fields if not already mapped
                for sf in standard_fields:
                    if sf not in issue_details: # If not mapped by custom name
                         issue_details[sf] = self._extract_field_value(issue, sf, sf, fields_info)
                issues_data.append(issue_details)
            
            logger.info(f"Retrieved {len(issues_data)} issues from Jira.")
            return issues_data
        except Exception as e:
            logger.error(f"Error retrieving or processing feature issues from Jira: {str(e)}", exc_info=True)
            return []

    def search_features_by_summary(self, summary_text: str, field_mapping: Dict[str, str], fields_info: List[Dict[str, Any]], max_results: int = 20) -> List[Dict[str, Any]]:
        """
        Searches for 'Feature' type issues by summary text.
        """
        jql = f'project = "PRODUCT" AND issuetype = "Feature" AND summary ~ "{summary_text}" ORDER BY created DESC'
        return self.get_feature_issues(field_mapping, fields_info, jql, max_results)

    def get_feature_by_key(self, issue_key: str, field_mapping: Dict[str, str], fields_info: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """
        Retrieves a single 'Feature' issue by its key.
        """
        client = None
        try:
            client = self.connect()
            jira_fields_to_retrieve = list(field_mapping.values())
            standard_fields = ['summary', 'status', 'issuetype', 'reporter', 'assignee', 'created', 'updated', 'priority', 'project', 'resolution']
            for sf in standard_fields:
                if sf not in jira_fields_to_retrieve and sf not in field_mapping.keys():
                    jira_fields_to_retrieve.append(sf)

            issue = client.issue(issue_key, fields=jira_fields_to_retrieve, expand='renderedFields')
            if issue:
                issue_details = {'key': issue.key}
                for human_name, jira_id in field_mapping.items():
                    issue_details[human_name] = self._extract_field_value(issue, jira_id, human_name, fields_info)
                for sf in standard_fields:
                    if sf not in issue_details:
                         issue_details[sf] = self._extract_field_value(issue, sf, sf, fields_info)
                return issue_details
            return None
        except Exception as e:
            logger.error(f"Error retrieving Jira issue {issue_key}: {str(e)}", exc_info=True)
            return None

    def update_feature(self, issue_key: str, fields_to_update: Dict[str, Any]) -> bool:
        """
        Updates an existing Jira issue.
        fields_to_update should be a dictionary where keys are Jira field IDs (e.g., 'summary', 'customfield_10001').
        """
        client = None
        try:
            client = self.connect()
            issue = client.issue(issue_key)
            issue.update(fields=fields_to_update)
            logger.info(f"Successfully updated Jira issue {issue_key} with fields: {fields_to_update.keys()}")
            return True
        except Exception as e:
            logger.error(f"Error updating Jira issue {issue_key}: {str(e)}", exc_info=True)
            return False

    def get_project_epics(self, project_key: str) -> List[Dict[str, str]]:
        """
        Retrieves all Epics for a given project.
        Returns a list of dictionaries with 'key' and 'summary' for each Epic.
        """
        client = None
        epics_list = []
        try:
            client = self.connect()
            # Standard JQL for Epics. Assumes 'Epic Name' is in summary or a standard field.
            # If 'Epic Name' is a specific custom field, that field needs to be used/queried.
            jql = f'project = "{project_key}" AND issuetype = Epic AND component = "FeatureCentral" ORDER BY summary ASC'
            logger.info(f"Fetching Epics with JQL: {jql}")
            
            epics = client.search_issues(jql, fields="summary,key", maxResults=1000) # High maxResults for Epics
            for epic in epics:
                epics_list.append({'key': epic.key, 'summary': epic.fields.summary})
            logger.info(f"Found {len(epics_list)} Epics in project '{project_key}'.")
        except Exception as e:
            logger.error(f"Error fetching Epics for project {project_key}: {str(e)}", exc_info=True)
        return epics_list

    def get_stories_in_epic(self, project_key: str, epic_key: str) -> List[Dict[str, str]]:
        """
        Retrieves all Stories linked to a specific Epic.
        Returns a list of dictionaries with 'key' and 'summary' for each Story.
        """
        client = None
        stories_list = []
        try:
            client = self.connect()
            # JQL to find stories linked to an Epic. Using the hardcoded Epic Link custom field ID.
            # JQL to find stories linked to an Epic using its display name.
            # Note: Field names with spaces need to be quoted in JQL, but "Epic Link" often works directly or might need to be 'Epic Link'.
            # If "Epic Link" causes issues, try f'project = "{project_key}" AND "Epic Link" = "{epic_key}" AND issuetype = Story ORDER BY summary ASC'
            # or even f'project = "{project_key}" AND "Epic Link" = {epic_key} AND issuetype = Story ORDER BY summary ASC' (if epic_key is numeric, though it's usually a string)
            # For string custom fields, equality with a string is standard.
            jql = f'project = "{project_key}" AND "Epic Link" = "{epic_key}" AND issuetype = Story ORDER BY summary ASC'
            logger.info(f"Fetching Stories with JQL: {jql}")

            stories = client.search_issues(jql, fields="summary,key", maxResults=1000)
            for story in stories:
                stories_list.append({'key': story.key, 'summary': story.fields.summary})
            logger.info(f"Found {len(stories_list)} Stories in Epic '{epic_key}'.")
        except Exception as e:
            logger.error(f"Error fetching Stories for Epic {epic_key}: {str(e)}", exc_info=True)
        return stories_list

    def create_jira_issue(
        self,
        project_key: str,
        summary: str,
        issue_type_name: str, # Added to specify 'Story', 'Bug', etc.
        description_body: str,
        reporter_username: str,
        assignee_username: str,
        epic_link_key: Optional[str] = None,
        issue_type: str = "Story" # Default to Story
    ) -> Optional[str]:
        """
        Creates a new Jira story (or other issue type) and optionally links it to an Epic.
        """
        client = None
        try:
            client = self.connect()
            issue_dict = {
                'project': {'key': project_key},
                'summary': summary,
                'description': description_body,
                'issuetype': {'name': issue_type},
                'reporter': {'name': reporter_username},
                'assignee': {'name': assignee_username},
            }
            
            # Linking to an Epic. The field name for Epic Link can vary.
            # Common ones are 'parent' (for next-gen projects or some newer Jira Cloud)
            # or a custom field like 'customfield_XXXXX' (often for Jira Server/Data Center).
            # The 'jira-python' library often handles this if you provide the 'parent' field for Epics.
            # If 'parent' doesn't work, you'd need to find the actual custom field ID for "Epic Link".
            # For now, assuming 'parent' might work or a custom field ID for 'Epic Link' is needed.
            # Let's try with a common custom field name pattern if 'parent' is not it.
            # This part is highly dependent on Jira configuration.
            if epic_link_key:
                # Epic Link field ID is hardcoded to 'customfield_10007' for this specific Jira instance.
                epic_link_field_id = "customfield_10007"
                issue_dict[epic_link_field_id] = epic_link_key
                logger.info(f"Setting Epic Link using hardcoded field ID: {epic_link_field_id}")


            logger.info(f"Attempting to create Jira {issue_type_name} in project '{project_key}' with summary: '{summary}'")
            new_issue = client.create_issue(fields=issue_dict)
            
            logger.info(f"Successfully created Jira issue with key: {new_issue.key} and summary: {summary}")
            return new_issue.key

        except Exception as e:
            logger.error(f"Error creating Jira {issue_type_name}: {e.text if hasattr(e, 'text') else str(e)}", exc_info=True)
            return None

    def create_jira_epic(
        self,
        project_key: str,
        epic_name: str,
        reporter_username: str,
        assignee_username: str,
        description: Optional[str] = None,
        fix_versions: Optional[List[str]] = None,
        components: Optional[List[str]] = None
    ) -> Optional[str]:
        """
        Creates a new Epic in Jira.
        """
        client = None
        try:
            client = self.connect()

            issue_dict = {
                'project': {'key': project_key},
                'summary': epic_name, 
                'issuetype': {'name': 'Epic'},
                'reporter': {'name': reporter_username},
                'assignee': {'name': assignee_username},
            }
            if description:
                issue_dict['description'] = description
            
            if fix_versions:
                issue_dict['fixVersions'] = [{'name': fv_name} for fv_name in fix_versions]

            if components:
                issue_dict['components'] = [{'name': comp_name} for comp_name in components]
        
            # For Epics, there's often a specific "Epic Name" custom field that needs to be set
            # in addition to the summary. This field's ID varies.
            # If your Jira requires it, you'll need to find its ID and add it here.
            # e.g., issue_dict['customfield_YYYYY'] = epic_name 
            # The JIRA_EPIC_NAME_FIELD_ID environment variable can be used to specify this.
            epic_name_field_id = os.environ.get('JIRA_EPIC_NAME_FIELD_ID', None)
            if epic_name_field_id:
                issue_dict[epic_name_field_id] = epic_name
            else:
                # Fallback to customfield_10008 based on observed error for this instance
                logger.warning(
                    "JIRA_EPIC_NAME_FIELD_ID environment variable not set. "
                    "Attempting to use 'customfield_10008' for Epic Name based on common error."
                )
                issue_dict['customfield_10008'] = epic_name


            logger.info(f"Attempting to create Jira Epic in project '{project_key}' with name: '{epic_name}'")
            new_epic = client.create_issue(fields=issue_dict)
            
            logger.info(f"Successfully created Jira Epic with key: {new_epic.key} and name: {epic_name}")
            return new_epic.key

        except Exception as e:
            logger.error(f"Error creating Jira Epic: {str(e)}", exc_info=True)
            return None

    def get_project_versions(self, project_key: str) -> List[Dict[str, str]]:
        """
        Retrieves unreleased and unarchived versions for a given project.

        Args:
            project_key: The Jira project key (e.g., 'ROIA').

        Returns:
            A list of dictionaries, each containing 'id' and 'name' of a version.
            Example: [{'id': '10001', 'name': 'Version 1.0'}]
        """
        client = None
        versions_list = []
        try:
            client = self.connect()
            logger.info(f"Fetching versions for project '{project_key}'...")
            project_versions = client.project_versions(project_key)
            
            for version in project_versions:
                if not version.archived and not version.released:
                    versions_list.append({'id': version.id, 'name': version.name})
            
            logger.info(f"Found {len(versions_list)} unreleased and unarchived versions for project '{project_key}'.")
        except Exception as e:
            logger.error(f"Error fetching versions for project {project_key}: {str(e)}", exc_info=True)
        return versions_list

    def transition_jira_issue(self, issue_key: str, target_status_name: str) -> bool:
        """
        Transitions a Jira issue to a target status.

        Args:
            issue_key: The key of the issue to transition (e.g., 'ROIA-123').
            target_status_name: The name of the desired target status (e.g., 'Done', 'Resolved').
                                This method will try to find the corresponding transition ID.

        Returns:
            True if the transition was successful, False otherwise.
        """
        client = None
        try:
            client = self.connect()
            logger.info(f"Attempting to transition issue '{issue_key}' to a status like '{target_status_name}'...")
            
            transitions = client.transitions(issue_key)
            target_transition_id = None
            for t in transitions:
                # Simple case-insensitive match for the target status name
                if target_status_name.lower() in t['name'].lower():
                    target_transition_id = t['id']
                    logger.info(f"Found transition ID '{target_transition_id}' for status '{t['name']}' for issue '{issue_key}'.")
                    break
            
            if target_transition_id:
                client.transition_issue(issue_key, target_transition_id)
                logger.info(f"Successfully transitioned issue '{issue_key}' using transition ID '{target_transition_id}'.")
                return True
            else:
                logger.warning(f"Could not find a transition to a status like '{target_status_name}' for issue '{issue_key}'. Available transitions:")
                for t in transitions:
                    logger.warning(f"  - ID: {t['id']}, Name: {t['name']}")
                return False
        except Exception as e:
            logger.error(f"Error transitioning issue {issue_key}: {str(e)}", exc_info=True)
            return False