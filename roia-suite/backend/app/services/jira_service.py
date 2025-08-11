"""
Jira Service for AI-Driven Project Management Suite

This service implements integration with Jira API for creating and managing 
project issues, based on AI-processed transcripts.
"""

import os
import logging
import re
import warnings
import urllib3
from typing import Dict, Any, List, Optional
from jira import JIRA
from datetime import datetime
from pydantic import BaseModel

# Configure logging
logger = logging.getLogger(__name__)

# Configure SSL warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class JiraFeature(BaseModel):
    """Model representing a Jira feature."""
    feature_key: str
    feature_summary: str
    feature_description: Optional[str] = None
    feature_status: Optional[str] = None
    create_date: Optional[str] = None
    last_updated: Optional[str] = None
    feature_assignee: Optional[str] = None
    feature_reporter: Optional[str] = None
    feature_resolution_name: Optional[str] = None
    feature_resolution_date: Optional[str] = None
    feature_product: Optional[str] = None
    feature_zone: Optional[str] = None
    
class JiraEpic(BaseModel):
    """Model representing a Jira epic."""
    epic_key: str
    epic_name: str
    epic_summary: str
    epic_description: Optional[str] = None
    epic_status: Optional[str] = None
    create_date: Optional[str] = None
    last_updated: Optional[str] = None
    epic_assignee: Optional[str] = None
    epic_reporter: Optional[str] = None
    epic_owner: Optional[str] = None
    epic_team: Optional[str] = None
    issue_count: int = 0
    recent_activity: bool = False
    match_score: float = 0.0

class JiraService:
    """Service for interacting with Jira API."""
    
    def __init__(self):
        """Initialize the Jira service client."""
        self.jira_token = os.environ.get("JIRA")
        self.jira_server = os.environ.get("JIRA_SERVER", "https://athenajira.athenahealth.com/")
        self.jira_client = None
        
        if self.jira_token:
            try:
                self.connect_to_jira()
                logger.info("Successfully connected to Jira")
            except Exception as e:
                logger.error(f"Error connecting to Jira: {e}")
                raise
    
    def connect_to_jira(self) -> JIRA:
        """
        Connects to Jira using the provided environment token and returns a JIRA client.
        
        Returns:
            JIRA client object.
        """
        try:
            if not self.jira_token:
                logger.error("Jira token environment variable not set!")
                raise ValueError("Jira token environment variable not set!")
            
            # Determine whether to use SSL verification
            verify_ssl = os.environ.get("JIRA_VERIFY_SSL", "false").lower() == "true"
            
            options = {
                'server': self.jira_server,
                'verify': verify_ssl
            }
            
            # If not verifying SSL, we've already disabled the warnings globally
            
            self.jira_client = JIRA(options, token_auth=self.jira_token)
            return self.jira_client
        except Exception as e:
            logger.error(f"Error connecting to Jira: {e}")
            raise
    
    def get_feature_issues(self, max_results: int = 50, project_key: str = "ROIA") -> List[JiraFeature]:
        """
        Retrieves 'Feature'-type issues from Jira.
        
        Args:
            max_results: Maximum number of results to return
            project_key: The project key to filter issues by (defaults to ROIA)
            
        Returns:
            List of JiraFeature objects
        """
        try:
            if not self.jira_client:
                self.connect_to_jira()
                
            # Define fields to retrieve
            fields_to_extract = [
                'summary', 'description', 'status', 'assignee', 'reporter',
                'created', 'updated', 'priority', 'labels', 'components', 
                'fixVersions', 'duedate', 'resolution', 'resolutiondate'
            ]
            
            # Query for Feature type issues in the specified project
            jql_query = f'issuetype = Feature AND project = {project_key}'
            issues = self.jira_client.search_issues(
                jql_query, 
                maxResults=max_results,
                fields=fields_to_extract
            )
            
            logger.info(f"Retrieved {len(issues)} feature issues from Jira project {project_key}")
            
            # Process issues into our model
            features = []
            for issue in issues:
                feature = JiraFeature(
                    feature_key=issue.key,
                    feature_summary=issue.fields.summary if hasattr(issue.fields, 'summary') else None,
                    feature_description=issue.fields.description if hasattr(issue.fields, 'description') else None,
                    feature_status=issue.fields.status.name if hasattr(issue.fields, 'status') else None,
                    create_date=issue.fields.created if hasattr(issue.fields, 'created') else None,
                    last_updated=issue.fields.updated if hasattr(issue.fields, 'updated') else None,
                    feature_assignee=issue.fields.assignee.displayName if hasattr(issue.fields, 'assignee') and issue.fields.assignee else None,
                    feature_reporter=issue.fields.reporter.displayName if hasattr(issue.fields, 'reporter') and issue.fields.reporter else None,
                    feature_resolution_name=issue.fields.resolution.name if hasattr(issue.fields, 'resolution') and issue.fields.resolution else None,
                    feature_resolution_date=issue.fields.resolutiondate if hasattr(issue.fields, 'resolutiondate') else None
                )
                features.append(feature)
            
            return features
            
        except Exception as e:
            logger.error(f"Error fetching feature issues from Jira: {e}")
            raise
    
    def create_issue(self, issue_data: Dict[str, Any]) -> str:
        """
        Create a new issue in Jira.
        
        Args:
            issue_data: Dictionary with issue data
            
        Returns:
            Issue key of the created issue
        """
        try:
            if not self.jira_client:
                self.connect_to_jira()
                
            # Create the issue
            new_issue = self.jira_client.create_issue(fields=issue_data)
            logger.info(f"Created new Jira issue with key: {new_issue.key}")
            
            return new_issue.key
            
        except Exception as e:
            logger.error(f"Error creating issue in Jira: {e}")
            raise
    
    def create_issue_from_intent(self, classified_intent, project_key="ROIA", epic_key=None) -> str:
        """
        Create a Jira issue based on the classified intent from AI processing.
        
        Args:
            classified_intent: ClassifiedIntent object from AI processing
            project_key: Jira project key to create the issue in
            epic_key: Optional epic key to link the issue to after creation
            
        Returns:
            Issue key of the created issue
        """
        try:
            if not self.jira_client:
                self.connect_to_jira()
            
            # Map the intent type to Jira issue type
            type_mapping = {
                "story": "Story",
                "bug": "Bug",
                "task": "Task",
                "epic": "Epic",
                "comment": "Task"  # Comments become tasks in Jira
            }
            
            # Map the priority
            priority_mapping = {
                "low": "Low",
                "medium": "Medium", 
                "high": "High",
                "critical": "Critical"
            }
            
            # Format the description with acceptance criteria
            description = classified_intent.description + "\n\n"
            if classified_intent.acceptance_criteria:
                description += "**Acceptance Criteria:**\n"
                for i, criteria in enumerate(classified_intent.acceptance_criteria, 1):
                    description += f"{i}. {criteria}\n"
            
            # Get fix versions from epic if provided
            fix_versions = []
            if epic_key:
                epic_details = self.get_epic_details(epic_key)
                fix_versions = epic_details.get('fix_versions', [])
                logger.info(f"Using fix versions from epic {epic_key}: {fix_versions}")
            
            # Prepare the issue data
            issue_data = {
                'project': {'key': project_key},
                'summary': classified_intent.summary,
                'description': description,
                'issuetype': {'name': type_mapping.get(classified_intent.type, "Task")},
                'priority': {'name': priority_mapping.get(classified_intent.priority, "Medium")},
            }
            
            # Add assignee if provided
            if hasattr(classified_intent, 'assignee') and classified_intent.assignee:
                issue_data['assignee'] = {'name': classified_intent.assignee}
                logger.info(f"Setting assignee to: {classified_intent.assignee}")
            
            # Add fix versions if available from the epic
            if fix_versions:
                issue_data['fixVersions'] = fix_versions
            
            # Add Epic Name if the issue type is Epic
            if type_mapping.get(classified_intent.type) == "Epic":
                issue_data['customfield_10008'] = classified_intent.summary  # Epic Name field
            
            # Create the issue first
            new_issue = self.jira_client.create_issue(fields=issue_data)
            logger.info(f"Created new Jira issue with key: {new_issue.key}")
            
            # Link to epic after creation using issue links (alternative to customfield_10008)
            if epic_key:
                try:
                    self._link_issue_to_epic(new_issue.key, epic_key)
                    logger.info(f"Successfully linked issue {new_issue.key} to epic {epic_key}")
                except Exception as link_error:
                    logger.warning(f"Failed to link issue {new_issue.key} to epic {epic_key}: {link_error}")
                    # Issue creation succeeded, so we still return the issue key
            
            return new_issue.key
            
        except Exception as e:
            logger.error(f"Error creating issue from intent in Jira: {e}")
            raise
    
    def get_epics(self, project_key: str = "ROIA", max_results: int = 100) -> List[JiraEpic]:
        """
        Retrieves 'Epic'-type issues from Jira for the specified project.
        
        Args:
            project_key: The project key to filter epics by (defaults to ROIA)
            max_results: Maximum number of results to return
            
        Returns:
            List of JiraEpic objects
        """
        try:
            if not self.jira_client:
                self.connect_to_jira()
                
            # Define fields to retrieve
            fields_to_extract = [
                'summary', 'description', 'status', 'assignee', 'reporter',
                'created', 'updated', 'priority', 'labels', 'components', 
                'fixVersions', 'duedate', 'customfield_10008'  # Epic Name
            ]
            
            # Query for Epic type issues in the specified project
            jql_query = f'issuetype = Epic AND project = {project_key}'
            issues = self.jira_client.search_issues(
                jql_query, 
                maxResults=max_results,
                fields=fields_to_extract
            )
            
            logger.info(f"Retrieved {len(issues)} epics from Jira project {project_key}")
            
            # Get activity data for epics
            epic_activity = self._get_epic_activity(issues)
            
            # Process issues into our model
            epics = []
            for issue in issues:
                # Get issue count for this epic
                issue_count = self._get_epic_issue_count(issue.key)
                
                epic = JiraEpic(
                    epic_key=issue.key,
                    epic_name=issue.fields.customfield_10008 if hasattr(issue.fields, 'customfield_10008') else issue.fields.summary,
                    epic_summary=issue.fields.summary,
                    epic_description=issue.fields.description if hasattr(issue.fields, 'description') else None,
                    epic_status=issue.fields.status.name if hasattr(issue.fields, 'status') else None,
                    create_date=issue.fields.created if hasattr(issue.fields, 'created') else None,
                    last_updated=issue.fields.updated if hasattr(issue.fields, 'updated') else None,
                    epic_assignee=issue.fields.assignee.displayName if hasattr(issue.fields, 'assignee') and issue.fields.assignee else None,
                    epic_reporter=issue.fields.reporter.displayName if hasattr(issue.fields, 'reporter') and issue.fields.reporter else None,
                    issue_count=issue_count,
                    recent_activity=epic_activity.get(issue.key, False)
                )
                epics.append(epic)
            
            return epics
            
        except Exception as e:
            logger.error(f"Error fetching epics from Jira: {e}")
            raise
    
    def _get_epic_issue_count(self, epic_key: str) -> int:
        """
        Get the count of issues linked to an epic.
        
        Args:
            epic_key: The epic key to count issues for
            
        Returns:
            Number of issues linked to the epic
        """
        try:
            # Query for issues linked to this epic with minimal data transfer
            jql_query = f'"Epic Link" = {epic_key}'
            issues = self.jira_client.search_issues(jql_query, maxResults=0, fields='key')  # Only need count
            return issues.total
        except Exception as e:
            logger.warning(f"Error getting issue count for epic {epic_key}: {e}")
            return 0
            
    def get_epic_details(self, epic_key: str) -> dict:
        """
        Get detailed information about an epic including Fix Versions.
        
        Args:
            epic_key: The epic key to get details for
            
        Returns:
            Dictionary with epic details
        """
        try:
            if not self.jira_client:
                self.connect_to_jira()
                
            # Get the epic with specific fields we need
            epic = self.jira_client.issue(epic_key, fields='summary,fixVersions,customfield_10008')
            
            # Extract fix versions
            fix_versions = []
            if hasattr(epic.fields, 'fixVersions') and epic.fields.fixVersions:
                fix_versions = [{'name': version.name} for version in epic.fields.fixVersions]
                
            # Extract epic name
            epic_name = epic.fields.customfield_10008 if hasattr(epic.fields, 'customfield_10008') else epic.fields.summary
            
            return {
                'key': epic_key,
                'summary': epic.fields.summary,
                'epic_name': epic_name,
                'fix_versions': fix_versions
            }
        except Exception as e:
            logger.warning(f"Error getting epic details for {epic_key}: {e}")
            return {'key': epic_key, 'fix_versions': [], 'epic_name': '', 'summary': ''}
    
    def _get_epic_activity(self, epics, days: int = 30) -> Dict[str, bool]:
        """
        Check which epics have had recent activity.
        
        Args:
            epics: List of epic issues
            days: Number of days to consider for recent activity
            
        Returns:
            Dictionary mapping epic keys to boolean activity status
        """
        try:
            # For performance, we'll use a simpler heuristic based on epic's own last_updated field
            # instead of querying for all linked issues
            result = {}
            current_date = datetime.now()
            
            for epic in epics:
                try:
                    # Parse the epic's last updated date
                    if hasattr(epic, 'last_updated') and epic.last_updated:
                        # Parse the date string (assuming ISO format)
                        updated_date = datetime.fromisoformat(epic.last_updated.replace('Z', '+00:00'))
                        days_diff = (current_date - updated_date).days
                        result[epic.key] = days_diff <= days
                    else:
                        result[epic.key] = False
                except Exception as parse_error:
                    logger.debug(f"Could not parse date for epic {epic.key}: {parse_error}")
                    result[epic.key] = False
                    
            return result
        except Exception as e:
            logger.warning(f"Error checking epic activity: {e}")
            return {epic.key: False for epic in epics}
    
    def find_matching_epics(self, classified_intent, user_info: Optional[Dict[str, Any]] = None, max_results: int = 3, project_key: str = "ROIA"):
        """
        Find epics that best match the classified intent and user context.
        
        Args:
            classified_intent: The classified intent object
            user_info: Optional user information to improve matching
            max_results: Maximum number of epics to return
            project_key: Project key to search for epics in (default: ROIA)
            
        Returns:
            List of matching JiraEpic objects with match_score populated
        """
        try:
            if not self.jira_client:
                self.connect_to_jira()
                
            # Extract keywords from classified intent
            summary_keywords = self._extract_keywords(classified_intent.summary)
            description_keywords = self._extract_keywords(classified_intent.description)
            keywords = summary_keywords + description_keywords + classified_intent.epic_keywords
            keywords = list(set(keywords))  # Remove duplicates
            
            # Log keywords for debugging
            logger.info(f"Finding epics for project {project_key} with keywords: {keywords}")
            
            # Get all epics from the specified project
            all_epics = self.get_epics(project_key=project_key)
            
            if not all_epics or len(all_epics) == 0:
                logger.warning(f"No epics found for project {project_key}")
                return []
                
            # Calculate match scores for each epic
            for epic in all_epics:
                epic.match_score = self._calculate_epic_match_score(
                    epic, keywords, classified_intent, user_info
                )
            
            # Sort by match score descending
            matching_epics = sorted(all_epics, key=lambda x: x.match_score, reverse=True)
            
            # Return top N results
            return matching_epics[:max_results]
        except Exception as e:
            logger.error(f"Error finding matching epics: {e}")
            return []
    
    def _extract_keywords(self, text: str) -> List[str]:
        """
        Extract keywords from text by removing common words.
        
        Args:
            text: The text to extract keywords from
            
        Returns:
            List of keywords
        """
        if not text:
            return []
            
        # Convert to lowercase and split
        words = re.findall(r'\w+', text.lower())
        
        # Remove common words
        stop_words = {'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'with', 'to', 'for', 'of', 'at', 'by'}
        keywords = [word for word in words if word not in stop_words and len(word) > 2]
        
        return keywords
    
    def _calculate_epic_match_score(self, epic: JiraEpic, keywords: List[str], classified_intent, user_info: Optional[Dict[str, Any]]) -> float:
        """
        Calculate a match score between an epic and the classified intent.
        
        Args:
            epic: The JiraEpic to score
            keywords: List of keywords from the intent
            classified_intent: The classified intent object
            user_info: Optional user information for context-based matching
            
        Returns:
            Match score between 0 and 1
        """
        score = 0.0
        
        # 1. Keyword matching in epic name and description (highest weight)
        epic_text = f"{epic.epic_name} {epic.epic_summary} {epic.epic_description or ''}".lower()
        for keyword in keywords:
            if keyword.lower() in epic_text:
                score += 0.15  # Each matching keyword adds to score
                
        # 2. Recent activity bonus
        if epic.recent_activity:
            score += 0.1
            
        # 3. Issue count factor (active epics with some but not too many issues)
        if 1 <= epic.issue_count <= 10:
            score += 0.1
        elif 11 <= epic.issue_count <= 20:
            score += 0.05
        
        # 4. User matching if user_info is provided
        if user_info and user_info.get('username'):
            # Check if user is assignee or reporter
            if epic.epic_assignee and user_info.get('display_name') in epic.epic_assignee:
                score += 0.3  # Big boost if user is assigned to the epic
            if epic.epic_reporter and user_info.get('display_name') in epic.epic_reporter:
                score += 0.2
                
            # Check user's team/department if available
            if user_info.get('department') and epic.epic_team:
                if user_info.get('department') in epic.epic_team:
                    score += 0.15
        
        # Normalize score to 0-1 range
        return min(1.0, score)
    
    def create_epic(self, epic_name: str, epic_summary: str, epic_description: str = "", project_key: str = "ROIA") -> str:
        """
        Create a new epic in Jira.
        
        Args:
            epic_name: Name of the epic (used as summary)
            epic_summary: Summary of the epic
            epic_description: Description of the epic (optional)
            project_key: Jira project key to create the epic in
            
        Returns:
            Epic key of the created epic
        """
        try:
            if not self.jira_client:
                self.connect_to_jira()
                
            # Get project versions for the fixVersions field
            try:
                versions = self.jira_client.project_versions(project_key)
                # Use most recent unreleased version if available
                available_versions = [v for v in versions if not v.released and not v.archived]
                fix_versions = [{'name': available_versions[0].name}] if available_versions else [{'name': 'Unscheduled'}]
                logger.info(f"Using fix versions: {fix_versions}")
            except Exception as e:
                logger.warning(f"Failed to get project versions: {e}. Using 'Unscheduled'.")
                fix_versions = [{'name': 'Unscheduled'}]
                
            # Prepare issue data for epic creation
            issue_dict = {
                'project': {'key': project_key},
                'summary': epic_name,
                'description': epic_description or epic_summary,
                'issuetype': {'name': 'Epic'},
                # Set Epic Name field (customfield_10008) as required by Jira API
                'customfield_10008': epic_name,
                # Set Fix Versions as required by Jira API
                'fixVersions': fix_versions
            }
            
            # Create the epic
            new_epic = self.jira_client.create_issue(fields=issue_dict)
            epic_key = new_epic.key
            
            logger.info(f"Created new epic {epic_key} in project {project_key}")
            return epic_key
            
        except Exception as e:
            logger.error(f"Error creating epic in Jira: {e}")
            raise
    
    def create_issue_with_epic_link(self, classified_intent, epic_key: str, project_key: str = "ROIA") -> str:
        """
        Create a Jira issue and link it to the specified epic.
        
        Args:
            classified_intent: ClassifiedIntent object from AI processing
            epic_key: The epic key to link the issue to
            project_key: Jira project key to create the issue in
            
        Returns:
            Issue key of the created issue
        """
        try:
            # Create the issue with epic link included from the start
            issue_key = self.create_issue_from_intent(classified_intent, project_key, epic_key=epic_key)
            logger.info(f"Created issue {issue_key} linked to epic {epic_key}")
            
            return issue_key
        except Exception as e:
            logger.error(f"Error creating issue with epic link: {e}")
            raise
    
    def _link_issue_to_epic(self, issue_key: str, epic_key: str) -> None:
        """
        Link an issue to an epic using Jira issue links as alternative to customfield_10008.
        
        Args:
            issue_key: The issue key to link
            epic_key: The epic key to link to
            
        Raises:
            Exception: If linking fails
        """
        try:
            if not self.jira_client:
                self.connect_to_jira()
            
            # Get available link types
            link_types = self.jira_client.issue_link_types()
            
            # Look for appropriate link type (Epic-Story, Relates, or Blocks)
            epic_link_type = None
            for link_type in link_types:
                # Check for Epic-Story link type (most appropriate)
                if 'epic' in link_type.name.lower() or 'story' in link_type.name.lower():
                    epic_link_type = link_type
                    break
                # Fallback to "Relates" link type
                elif 'relates' in link_type.name.lower():
                    epic_link_type = link_type
            
            if not epic_link_type:
                # Use first available link type as last resort
                epic_link_type = link_types[0] if link_types else None
                
            if not epic_link_type:
                raise Exception("No suitable link types available in Jira")
            
            # Create the issue link
            self.jira_client.create_issue_link(
                type=epic_link_type.name,
                inwardIssue=issue_key,
                outwardIssue=epic_key,
                comment={
                    "body": f"Automatically linked {issue_key} to epic {epic_key} via AI-driven project management suite"
                }
            )
            
            logger.info(f"Successfully created {epic_link_type.name} link from {issue_key} to {epic_key}")
            
        except Exception as e:
            logger.error(f"Failed to link issue {issue_key} to epic {epic_key}: {e}")
            raise
    
    def health_check(self) -> Dict[str, Any]:
        """
        Check the health of the Jira connection.
        
        Returns:
            Dictionary with health status information
        """
        try:
            is_connected = False
            server_info = None
            
            if not self.jira_client:
                try:
                    self.connect_to_jira()
                except Exception:
                    pass
            
            if self.jira_client:
                # Try to get server info
                server_info = self.jira_client.server_info()
                is_connected = True
            
            return {
                "connected": is_connected,
                "server_info": server_info,
                "token_configured": bool(self.jira_token),
                "server_configured": bool(self.jira_server)
            }
            
        except Exception as e:
            logger.error(f"Error checking Jira health: {e}")
            return {
                "connected": False,
                "error": str(e),
                "token_configured": bool(self.jira_token),
                "server_configured": bool(self.jira_server)
            }
