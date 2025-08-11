"""
Tests for the enhanced Jira integration features:
- Project key selection
- Epic matching with fallback
"""

import pytest
from unittest import mock
from fastapi.testclient import TestClient

from app.main import app
from app.models import ClassifiedIntent, IssueType, Priority


@pytest.fixture
def client():
    """Create a TestClient for FastAPI app testing."""
    return TestClient(app)


@pytest.fixture
def mock_jira_service():
    """Mock the JiraService used in the router."""
    with mock.patch('app.routers.jira.JiraService') as mock_service:
        yield mock_service


@pytest.fixture
def sample_intent():
    """Create a sample classified intent for testing."""
    return ClassifiedIntent(
        type=IssueType.STORY,
        summary="Test Story",
        description="This is a test story",
        acceptance_criteria=["Criteria 1", "Criteria 2"],
        priority=Priority.MEDIUM,
        epic_keywords=["test", "story"],
        confidence=0.9
    )


# Project Key Selection Tests
@pytest.mark.parametrize("project_key", ["ROIA", "PROPS"])
def test_get_epics_with_project_key(client, mock_jira_service, project_key):
    """Test retrieving epics with different project keys."""
    # Arrange
    mock_epics = [
        {
            "epic_key": f"{project_key}-100",
            "epic_name": f"Test Epic for {project_key}",
            "epic_summary": "This is a test epic",
            "epic_status": "In Progress"
        }
    ]
    
    mock_service_instance = mock.MagicMock()
    mock_service_instance.get_epics.return_value = mock_epics
    mock_jira_service.return_value = mock_service_instance
    
    # Act
    response = client.get(f"/api/v1/jira/epics?project_key={project_key}")
    
    # Assert
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["epic_key"] == f"{project_key}-100"
    assert response.json()[0]["epic_name"] == f"Test Epic for {project_key}"
    mock_service_instance.get_epics.assert_called_once_with(project_key=project_key, max_results=100)


def test_get_epics_with_invalid_project_key(client):
    """Test retrieving epics with an invalid project key returns 400."""
    # Act
    response = client.get("/api/v1/jira/epics?project_key=INVALID")
    
    # Assert
    assert response.status_code == 400
    assert "Invalid project key" in response.json()["detail"]


# Epic Matching with Fallback Tests
def test_match_epics_with_successful_matching(client, mock_jira_service, sample_intent):
    """Test epic matching when matching is successful."""
    # Arrange
    mock_matching_epics = [
        {
            "epic_key": "ROIA-100",
            "epic_name": "Matched Epic",
            "epic_summary": "This is a matched epic",
            "match_score": 0.85
        }
    ]
    
    mock_service_instance = mock.MagicMock()
    mock_service_instance.find_matching_epics.return_value = mock_matching_epics
    mock_jira_service.return_value = mock_service_instance
    
    # Act
    response = client.post(
        "/api/v1/jira/match-epics?project_key=ROIA",
        json={
            "classified_intent": sample_intent.model_dump(),
            "max_results": 3
        }
    )
    
    # Assert
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["epic_key"] == "ROIA-100"
    assert response.json()[0]["epic_name"] == "Matched Epic"
    assert response.json()[0]["match_score"] == 0.85
    mock_service_instance.find_matching_epics.assert_called_once()
    # get_epics should not be called since matching was successful
    mock_service_instance.get_epics.assert_not_called()


def test_match_epics_with_fallback(client, mock_jira_service, sample_intent):
    """Test epic matching falls back to all epics when matching fails."""
    # Arrange
    mock_all_epics = [
        {
            "epic_key": "ROIA-200",
            "epic_name": "Fallback Epic",
            "epic_summary": "This is a fallback epic",
            "match_score": 0.0  # No match score since this is fallback
        }
    ]
    
    mock_service_instance = mock.MagicMock()
    # Simulate find_matching_epics failing
    mock_service_instance.find_matching_epics.side_effect = Exception("Matching failed")
    # But get_epics succeeds with fallback epics
    mock_service_instance.get_epics.return_value = mock_all_epics
    mock_jira_service.return_value = mock_service_instance
    
    # Act
    response = client.post(
        "/api/v1/jira/match-epics?project_key=ROIA",
        json={
            "classified_intent": sample_intent.model_dump(),
            "max_results": 3
        }
    )
    
    # Assert
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["epic_key"] == "ROIA-200"
    assert response.json()[0]["epic_name"] == "Fallback Epic"
    # Verify both methods were called
    mock_service_instance.find_matching_epics.assert_called_once()
    mock_service_instance.get_epics.assert_called_once_with(project_key="ROIA")


def test_match_epics_with_empty_results(client, mock_jira_service, sample_intent):
    """Test epic matching when no matching epics are found and no fallback epics exist."""
    # Arrange
    mock_service_instance = mock.MagicMock()
    # Simulate find_matching_epics returning empty list
    mock_service_instance.find_matching_epics.return_value = []
    # And get_epics also returns empty list
    mock_service_instance.get_epics.return_value = []
    mock_jira_service.return_value = mock_service_instance
    
    # Act
    response = client.post(
        "/api/v1/jira/match-epics?project_key=ROIA",
        json={
            "classified_intent": sample_intent.model_dump(),
            "max_results": 3
        }
    )
    
    # Assert
    assert response.status_code == 200
    assert len(response.json()) == 0
    # Verify only find_matching_epics was called since it returned an empty list (not None)
    mock_service_instance.find_matching_epics.assert_called_once()
    mock_service_instance.get_epics.assert_not_called()


@pytest.mark.parametrize("project_key", ["ROIA", "PROPS"])
def test_create_issue_with_epic_project_selection(client, mock_jira_service, project_key):
    """Test creating an issue with an epic in different projects."""
    # Arrange
    mock_service_instance = mock.MagicMock()
    mock_service_instance.create_issue_with_epic_link.return_value = f"{project_key}-123"
    mock_service_instance.jira_server = "https://athenajira.athenahealth.com/"
    mock_jira_service.return_value = mock_service_instance
    
    # Create request data
    request_data = {
        "success": True,
        "classified_intent": {
            "type": "story",
            "summary": "Test Story",
            "description": "This is a test story",
            "acceptance_criteria": ["Criteria 1"],
            "priority": "medium",
            "epic_keywords": ["test"],
            "confidence": 0.9
        },
        "cleaned_transcript": "Test transcript",
        "processing_time_ms": 500
    }
    
    # Act
    response = client.post(
        f"/api/v1/jira/create-with-epic?epic_key={project_key}-100&project_key={project_key}",
        json=request_data
    )
    
    # Assert
    assert response.status_code == 200
    assert response.json()["issue_key"] == f"{project_key}-123"
    assert f"{project_key}-123" in response.json()["issue_url"]
    mock_service_instance.create_issue_with_epic_link.assert_called_once()
