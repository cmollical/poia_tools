from pydantic import BaseModel, Field
from typing import Optional, List, Literal, Dict, Any
from enum import Enum

class IssueType(str, Enum):
    STORY = "story"
    BUG = "bug"
    TASK = "task"
    EPIC = "epic"
    COMMENT = "comment"

class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class TranscriptRequest(BaseModel):
    transcript: str = Field(..., description="Raw transcript text from voice input")
    user_id: Optional[str] = Field(None, description="User identifier for personalization")
    project_context: Optional[str] = Field(None, description="Optional project context")

class ClassifiedIntent(BaseModel):
    type: IssueType = Field(..., description="Classified issue type")
    summary: str = Field(..., description="Brief summary of the issue")
    description: str = Field(..., description="Detailed description")
    acceptance_criteria: List[str] = Field(default_factory=list, description="List of acceptance criteria")
    priority: Priority = Field(Priority.MEDIUM, description="Issue priority")
    epic_keywords: List[str] = Field(default_factory=list, description="Keywords for epic matching")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Classification confidence score")
    assignee: Optional[str] = Field(None, description="Username to assign the issue to")
    # Additional fields for future extensibility
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

class EpicMatch(BaseModel):
    epic_id: Optional[str] = Field(None, description="Matched epic ID")
    epic_name: Optional[str] = Field(None, description="Epic name")
    match_confidence: float = Field(0.0, ge=0.0, le=1.0, description="Match confidence score")
    keywords_matched: List[str] = Field(default_factory=list, description="Keywords that matched")

class ProcessTranscriptResponse(BaseModel):
    success: bool = Field(..., description="Whether processing was successful")
    classified_intent: Optional[ClassifiedIntent] = Field(None, description="Classified intent details")
    epic_match: Optional[EpicMatch] = Field(None, description="Epic matching results")
    cleaned_transcript: str = Field(..., description="Cleaned and normalized transcript")
    processing_time_ms: int = Field(..., description="Processing time in milliseconds")
    error_message: Optional[str] = Field(None, description="Error message if processing failed")

class HealthResponse(BaseModel):
    status: Literal["healthy", "unhealthy"] = Field(..., description="System health status")
    athenagpt_configured: bool = Field(..., description="AthenaGPT API configuration status")
    jira_configured: bool = Field(..., description="Jira API configuration status")
    confluence_configured: bool = Field(..., description="Confluence API configuration status")

class UserInfo(BaseModel):
    username: str = Field(..., description="User's login username")
    display_name: str = Field(..., description="User's display name")
    email: Optional[str] = Field(None, description="User's email address")
    department: Optional[str] = Field(None, description="User's department")
    team: Optional[str] = Field(None, description="User's team")
    preferences: Optional[Dict[str, Any]] = Field(None, description="User preferences")

class ErrorResponse(BaseModel):
    error: str = Field(..., description="Error message")
    detail: Optional[str] = Field(None, description="Detailed error information")
    timestamp: str = Field(..., description="Error timestamp")
