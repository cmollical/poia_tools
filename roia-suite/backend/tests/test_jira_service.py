#!/usr/bin/env python3
"""
Pytest version of the JiraService tests to demonstrate the new testing methodology.
This serves as a migration example from unittest to pytest.
"""

import pytest
from unittest import mock
from app.services.jira_service import JiraService, JiraFeature
from app.models import ClassifiedIntent, IssueType, Priority


# Fixtures for test setup
@pytest.fixture
def mock_jira_client():
    """Fixture to create a mock JIRA client."""
    with mock.patch('app.services.jira_service.JIRA') as mock_jira:
        yield mock_jira


@pytest.fixture
def mock_environment():
    """Fixture to mock environment variables."""
    with mock.patch('app.services.jira_service.os') as mock_os:
        mock_os.environ.get.side_effect = lambda key, default=None: {
            'JIRA': 'test_token',
            'JIRA_SERVER': 'https://test.jira.com'
        }.get(key, default)
        yield mock_os


@pytest.fixture
def sample_intent():
    """Fixture to create a sample classified intent for testing."""
    return ClassifiedIntent(
        type=IssueType.STORY,
        summary="Test Story",
        description="This is a test story",
        acceptance_criteria=["Criteria 1", "Criteria 2"],
        priority=Priority.MEDIUM,
        epic_keywords=["test", "story"],
        confidence=0.9
    )


# Test functions
def test_init_with_valid_credentials(mock_jira_client, mock_environment):
    """Test initializing JiraService with valid credentials."""
    # Act
    service = JiraService()
    
    # Assert
    assert service is not None
    mock_jira_client.assert_called_once()
    assert service.jira_client is not None


def test_create_issue_from_intent_with_assignee(mock_jira_client, sample_intent):
    """Test creating an issue with an assignee specified."""
    # Arrange
    service = JiraService()
    mock_issue = mock.MagicMock()
    mock_issue.key = "TEST-123"
    service.jira_client.create_issue.return_value = mock_issue
    
    # Add assignee to the intent
    sample_intent.assignee = "testuser"
    
    # Act
    result = service.create_issue_from_intent(sample_intent, "TEST")
    
    # Assert
    assert result == "TEST-123"
    service.jira_client.create_issue.assert_called_once()
    # Check that the assignee was included in the issue data
    call_args = service.jira_client.create_issue.call_args[1]
    assert 'assignee' in call_args['fields']
    assert call_args['fields']['assignee'] == {'name': 'testuser'}


def test_create_issue_from_intent_with_epic_and_fix_versions(mock_jira_client, sample_intent):
    """Test creating an issue with an epic key that provides fix versions."""
    # Arrange
    service = JiraService()
    mock_issue = mock.MagicMock()
    mock_issue.key = "TEST-123"
    service.jira_client.create_issue.return_value = mock_issue
    
    # Mock the get_epic_details method
    service.get_epic_details = mock.MagicMock(return_value={
        'fix_versions': [{'name': 'Sprint 1'}, {'name': 'Release 2.0'}]
    })
    
    # Act
    result = service.create_issue_from_intent(sample_intent, "TEST", epic_key="TEST-100")
    
    # Assert
    assert result == "TEST-123"
    service.get_epic_details.assert_called_once_with("TEST-100")
    service.jira_client.create_issue.assert_called_once()
    # Check that fix versions were included in the issue data
    call_args = service.jira_client.create_issue.call_args[1]
    assert 'fixVersions' in call_args['fields']
    assert call_args['fields']['fixVersions'] == [{'name': 'Sprint 1'}, {'name': 'Release 2.0'}]


def test_init_with_missing_token(mock_environment):
    """Test initializing JiraService with missing token."""
    # Arrange
    mock_environment.environ.get.side_effect = lambda key, default=None: {
        'JIRA': None,
        'JIRA_SERVER': 'https://test.jira.com'
    }.get(key, default)
    
    # Act & Assert - Service should initialize without error when token is missing
    service = JiraService()
    assert service.jira_token is None
    
    # But calling connect_to_jira should raise ValueError
    with pytest.raises(ValueError):
        service.connect_to_jira()


def test_get_feature_issues(mock_jira_client):
    """Test getting feature issues from Jira."""
    # Arrange
    # Create mock issues with proper string attributes
    mock_issue1 = mock.MagicMock()
    mock_issue1.key = "ROIA-1"
    mock_issue1.fields.summary = "Test Feature 1"
    mock_issue1.fields.status.name = "In Progress"
    mock_issue1.fields.created = "2025-07-25T10:00:00.000Z"
    mock_issue1.fields.updated = "2025-07-26T10:00:00.000Z"
    mock_issue1.fields.assignee.displayName = "Test User"
    mock_issue1.fields.reporter.displayName = "Test Reporter"
    mock_issue1.fields.description = "Test description"
    mock_issue1.fields.resolution = mock.MagicMock()
    mock_issue1.fields.resolution.name = "Fixed"
    mock_issue1.fields.resolutiondate = "2025-07-26T12:00:00.000Z"
    
    mock_issue2 = mock.MagicMock()
    mock_issue2.key = "ROIA-2"
    mock_issue2.fields.summary = "Test Feature 2"
    mock_issue2.fields.status.name = "Done"
    mock_issue2.fields.created = "2025-07-24T10:00:00.000Z"
    mock_issue2.fields.updated = "2025-07-25T10:00:00.000Z"
    mock_issue2.fields.assignee = None
    mock_issue2.fields.reporter.displayName = "Test Reporter"
    mock_issue2.fields.description = "Test description 2"
    mock_issue2.fields.resolution = mock.MagicMock()
    mock_issue2.fields.resolution.name = "Fixed"
    mock_issue2.fields.resolutiondate = "2025-07-25T12:00:00.000Z"
    
    mock_service = mock.MagicMock()
    mock_service.jira_client.search_issues.return_value = [mock_issue1, mock_issue2]
    
    # Act
    result = JiraService.get_feature_issues(mock_service, max_results=10)
    
    # Assert
    assert len(result) == 2
    assert result[0].feature_key == "ROIA-1"
    assert result[0].feature_summary == "Test Feature 1"
    assert result[0].feature_status == "In Progress"
    assert result[0].feature_assignee == "Test User"
    
    assert result[1].feature_key == "ROIA-2"
    assert result[1].feature_summary == "Test Feature 2"
    assert result[1].feature_status == "Done"
    assert result[1].feature_assignee is None


def test_create_issue_from_intent(mock_jira_client, sample_intent):
    """Test creating a Jira issue from a classified intent."""
    # Arrange
    mock_new_issue = mock.MagicMock()
    mock_new_issue.key = "ROIA-123"
    
    mock_jira_instance = mock.MagicMock()
    mock_jira_instance.create_issue.return_value = mock_new_issue
    
    mock_service = mock.MagicMock()
    mock_service.jira_client = mock_jira_instance
    
    # Act
    result = JiraService.create_issue_from_intent(mock_service, sample_intent, project_key="ROIA")
    
    # Assert
    assert result == "ROIA-123"
    mock_jira_instance.create_issue.assert_called_once()
    
    # Check that the fields were passed correctly
    call_args = mock_jira_instance.create_issue.call_args[1]["fields"]
    assert call_args["project"]["key"] == "ROIA"
    assert call_args["summary"] == "Test Story"
    assert "This is a test story" in call_args["description"]
    assert call_args["issuetype"]["name"] == "Story"
    assert call_args["priority"]["name"] == "Medium"


@pytest.mark.parametrize("is_healthy,expected_connected", [
    (True, True),
    (False, False),
])
def test_health_check(mock_jira_client, is_healthy, expected_connected):
    """Test health check with parameterized tests."""
    # Arrange
    mock_jira_instance = mock.MagicMock()
    
    if is_healthy:
        mock_jira_instance.server_info.return_value = {"version": "9.0.0"}
    else:
        mock_jira_instance.server_info.side_effect = Exception("Connection error")
    
    mock_service = mock.MagicMock()
    mock_service.jira_client = mock_jira_instance
    mock_service.jira_token = "test_token"
    mock_service.jira_server = "https://test.jira.com"
    
    # Act
    result = JiraService.health_check(mock_service)
    
    # Assert
    assert result["connected"] == expected_connected
    assert result["token_configured"] is True
    assert result["server_configured"] is True
    
    if is_healthy:
        assert result["server_info"] == {"version": "9.0.0"}
    else:
        assert result["error"] == "Connection error"


if __name__ == "__main__":
    pytest.main(["-v", __file__])
