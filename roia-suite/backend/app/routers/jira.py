"""
Jira Router for AI-Driven Project Management Suite

This module provides API endpoints for Jira integration.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import logging

from app.services.jira_service import JiraService, JiraFeature, JiraEpic
from app.models import ClassifiedIntent, ProcessTranscriptResponse

# Configure logger
logger = logging.getLogger(__name__)

router = APIRouter()

# Dependency to get Jira service instance
def get_jira_service():
    """Dependency to get Jira service instance."""
    try:
        return JiraService()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize Jira service: {str(e)}")

class JiraIssueResponse(BaseModel):
    """Response model for Jira issue creation."""
    issue_key: str = Field(..., description="Jira issue key")
    issue_url: str = Field(..., description="URL to the Jira issue")
    success: bool = Field(..., description="Whether the operation was successful")

class UserInfo(BaseModel):
    """User information for context-aware epic matching."""
    username: str = Field(..., description="Username of the user")
    display_name: str = Field(None, description="Display name of the user")
    email: str = Field(None, description="Email of the user")
    department: str = Field(None, description="Department or team of the user")

class EpicMatchRequest(BaseModel):
    """Request model for finding matching epics."""
    classified_intent: ClassifiedIntent
    user_info: UserInfo = None
    max_results: int = Field(3, description="Maximum number of matching epics to return")

@router.get("/features", response_model=List[JiraFeature])
async def get_features(
    max_results: int = 50,
    jira_service: JiraService = Depends(get_jira_service)
):
    """
    Get a list of Feature-type issues from Jira.
    
    Args:
        max_results: Maximum number of results to return (default: 50)
    """
    try:
        features = jira_service.get_feature_issues(max_results=max_results)
        return features
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve features from Jira: {str(e)}")

@router.post("/create-from-intent", response_model=JiraIssueResponse)
async def create_issue_from_intent(
    response: ProcessTranscriptResponse,
    project_key: str = "ROIA",
    jira_service: JiraService = Depends(get_jira_service)
):
    """
    Create a Jira issue based on the classified intent from AI processing.
    
    Args:
        response: ProcessTranscriptResponse object from transcript processing
        project_key: Jira project key to create the issue in (default: PMT)
    """
    try:
        if not response.success or not response.classified_intent:
            raise HTTPException(
                status_code=400, 
                detail="No valid classified intent provided"
            )
        
        # Create the issue in Jira
        issue_key = jira_service.create_issue_from_intent(
            response.classified_intent,
            project_key=project_key
        )
        
        # Construct the issue URL
        jira_server = jira_service.jira_server.rstrip('/')
        issue_url = f"{jira_server}/browse/{issue_key}"
        
        return JiraIssueResponse(
            issue_key=issue_key,
            issue_url=issue_url,
            success=True
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to create issue in Jira: {str(e)}"
        )

# Define allowed project keys
ALLOWED_PROJECT_KEYS = ["ROIA", "PROPS"]

@router.get("/epics", response_model=List[JiraEpic])
async def get_epics(
    project_key: str = "ROIA",
    max_results: int = 100,
    jira_service: JiraService = Depends(get_jira_service)
):
    """
    Get a list of Epic-type issues from Jira for a specific project.
    
    Args:
        project_key: The project key to filter epics by (default: ROIA)
        max_results: Maximum number of results to return (default: 100)
    """
    # Validate project key
    if project_key not in ALLOWED_PROJECT_KEYS:
        logger.warning(f"Invalid project key requested: {project_key}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid project key. Allowed values: {', '.join(ALLOWED_PROJECT_KEYS)}"
        )
        
    try:
        logger.info(f"Fetching epics for project {project_key}")
        epics = jira_service.get_epics(project_key=project_key, max_results=max_results)
        return epics
    except Exception as e:
        logger.error(f"Error fetching epics: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve epics from Jira: {str(e)}")

@router.post("/match-epics", response_model=List[JiraEpic])
async def match_epics(
    request: EpicMatchRequest,
    project_key: str = "ROIA",
    jira_service: JiraService = Depends(get_jira_service)
):
    """
    Find epics that match the classified intent and user context.
    If matching fails, returns all epics for the specified project.
    
    Args:
        request: EpicMatchRequest containing classified intent and optional user info
        project_key: Jira project key (limited to ROIA, PROPS)
    """
    # Validate project key
    if project_key not in ALLOWED_PROJECT_KEYS:
        logger.warning(f"Invalid project key requested: {project_key}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid project key. Allowed values: {', '.join(ALLOWED_PROJECT_KEYS)}"
        )
        
    try:
        # Log the received data for debugging
        logger.info(f"Received match-epics request for project {project_key}")
        logger.info(f"Request body: {request}")
        logger.info(f"Classified intent type: {type(request.classified_intent)}")
        logger.info(f"Classified intent data: {request.classified_intent}")
        if request.user_info:
            logger.info(f"User info type: {type(request.user_info)}")
            logger.info(f"User info data: {request.user_info}")
        
        # Handle possible enum conversion issues
        classified_intent = request.classified_intent
        
        # Ensure user_info is properly formatted
        user_info = None
        if request.user_info:
            try:
                user_info = request.user_info.model_dump()
            except Exception as e:
                logger.warning(f"Error converting user_info to dict: {e}")
                # Fall back to None if conversion fails
                user_info = None
        
        # Try to find matching epics first
        try:
            matching_epics = jira_service.find_matching_epics(
                classified_intent=classified_intent,
                user_info=user_info,
                max_results=request.max_results,
                project_key=project_key
            )
            
            # Return the matching epics results, even if empty
            # This distinguishes between "no matches found" (empty list) and "error during matching" (exception)
            logger.info(f"Found {len(matching_epics)} matching epics for project {project_key}")
            return matching_epics
                
        except Exception as matching_error:
            # Only use fallback when matching fails with an exception
            logger.warning(f"Error finding matching epics: {matching_error}, falling back to all epics")
            
            # Fallback: Return all epics for the project when matching throws an exception
            logger.info(f"Using fallback to get all epics for project {project_key}")
            all_epics = jira_service.get_epics(project_key=project_key)
            return all_epics
            
    except ValueError as ve:
        # Handle validation errors
        logger.error(f"Validation error in match-epics: {str(ve)}", exc_info=True)
        raise HTTPException(status_code=422, detail=f"Validation error: {str(ve)}")
    except Exception as e:
        logger.error(f"Error handling epics: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve epics: {str(e)}")

@router.post("/create-with-epic", response_model=JiraIssueResponse)
async def create_issue_with_epic(
    response: ProcessTranscriptResponse,
    epic_key: str,
    project_key: str = "ROIA",
    jira_service: JiraService = Depends(get_jira_service)
):
    """
    Create a Jira issue and link it to the specified epic.
    
    Args:
        response: ProcessTranscriptResponse object from transcript processing
        epic_key: The epic key to link the issue to
        project_key: Jira project key to create the issue in (default: ROIA)
    """
    try:
        if not response.success or not response.classified_intent:
            raise HTTPException(
                status_code=400, 
                detail="No valid classified intent provided"
            )
        
        # Create the issue in Jira with epic link
        issue_key = jira_service.create_issue_with_epic_link(
            response.classified_intent,
            epic_key=epic_key,
            project_key=project_key
        )
        
        # Construct the issue URL
        jira_server = jira_service.jira_server.rstrip('/')
        issue_url = f"{jira_server}/browse/{issue_key}"
        
        return JiraIssueResponse(
            issue_key=issue_key,
            issue_url=issue_url,
            success=True
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Failed to create issue with epic link in Jira: {str(e)}"
        )

class CreateEpicRequest(BaseModel):
    """Request model for creating a new epic."""
    epic_name: str = Field(..., description="Name of the epic")
    epic_summary: str = Field(..., description="Summary of the epic")
    epic_description: str = Field("", description="Description of the epic (optional)")

@router.post("/create-epic", response_model=JiraIssueResponse)
async def create_epic(
    request: CreateEpicRequest,
    project_key: str = "ROIA",
    jira_service: JiraService = Depends(get_jira_service)
):
    """
    Create a new epic in Jira.
    
    Args:
        request: Epic creation data
        project_key: Jira project key to create the epic in (default: ROIA)
    """
    # Validate project key
    if project_key not in ALLOWED_PROJECT_KEYS:
        logger.warning(f"Invalid project key requested: {project_key}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid project key. Allowed values: {', '.join(ALLOWED_PROJECT_KEYS)}"
        )
        
    try:
        # Create the epic
        epic_key = jira_service.create_epic(
            epic_name=request.epic_name,
            epic_summary=request.epic_summary,
            epic_description=request.epic_description,
            project_key=project_key
        )
        
        # Construct the epic URL
        jira_server = jira_service.jira_server.rstrip('/')
        epic_url = f"{jira_server}/browse/{epic_key}"
        
        return JiraIssueResponse(
            issue_key=epic_key,
            issue_url=epic_url,
            success=True
        )
    except Exception as e:
        logger.error(f"Error creating epic in Jira: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create epic in Jira: {str(e)}")

@router.get("/health")
async def jira_health(
    jira_service: JiraService = Depends(get_jira_service)
):
    """
    Check the health of the Jira connection.
    """
    health_info = jira_service.health_check()
    
    if health_info["connected"]:
        return {
            "status": "healthy",
            "service": "jira",
            "timestamp": datetime.now().isoformat(),
            "server_info": health_info["server_info"],
            "token_configured": health_info["token_configured"]
        }
    else:
        return {
            "status": "unhealthy",
            "service": "jira",
            "timestamp": datetime.now().isoformat(),
            "error": health_info.get("error", "Unknown error"),
            "token_configured": health_info["token_configured"]
        }
