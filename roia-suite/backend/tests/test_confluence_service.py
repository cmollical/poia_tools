#!/usr/bin/env python3
"""
Pytest tests for the ConfluenceService class.
"""

import pytest
from unittest import mock
from app.services.confluence_service import ConfluenceService


# Fixtures for test setup
@pytest.fixture
def mock_requests():
    """Fixture to mock the requests library."""
    with mock.patch('app.services.confluence_service.requests') as mock_req:
        # Set up the mock response
        mock_response = mock.MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'id': 'PAGE-123',
            'title': 'Test Page',
            'space': {'key': 'TEST'},
            '_links': {'webui': '/pages/123'}
        }
        mock_req.post.return_value = mock_response
        mock_req.get.return_value = mock_response
        yield mock_req


@pytest.fixture
def mock_environment():
    """Fixture to mock environment variables."""
    with mock.patch('app.services.confluence_service.os') as mock_os:
        mock_os.environ.get.side_effect = lambda key, default=None: {
            'CONFLUENCE_PAT': 'test_token',
            'CONFLUENCE_BASE_URL': 'https://test.confluence.com'
        }.get(key, default)
        yield mock_os


# Test functions
def test_init_with_valid_credentials(mock_environment):
    """Test initializing ConfluenceService with valid credentials."""
    # Act
    service = ConfluenceService()
    
    # Assert
    assert service is not None
    assert service.base_url == 'https://test.confluence.com'
    assert service.auth_header == {'Authorization': 'Bearer test_token'}


def test_create_page_basic(mock_requests, mock_environment):
    """Test creating a basic Confluence page."""
    # Arrange
    service = ConfluenceService()
    title = "Test Page"
    content = "<p>Test content</p>"
    space_key = "TEST"
    
    # Act
    result = service.create_page(title, content, space_key)
    
    # Assert
    assert result['page_id'] == 'PAGE-123'
    assert result['title'] == 'Test Page'
    assert result['space_key'] == 'TEST'
    assert 'page_url' in result
    
    # Verify the request was made correctly
    mock_requests.post.assert_called_once()
    call_args = mock_requests.post.call_args
    assert 'json' in call_args[1]
    assert call_args[1]['json']['title'] == 'Test Page'
    assert call_args[1]['json']['space']['key'] == 'TEST'
    assert '<p>Test content</p>' in call_args[1]['json']['body']['storage']['value']


def test_create_page_with_parent(mock_requests, mock_environment):
    """Test creating a Confluence page with a parent page."""
    # Arrange
    service = ConfluenceService()
    title = "Child Page"
    content = "<p>Child content</p>"
    space_key = "TEST"
    parent_id = "PARENT-123"
    
    # Act
    result = service.create_page(title, content, space_key, parent_id)
    
    # Assert
    assert result['page_id'] == 'PAGE-123'
    
    # Verify the request was made correctly
    mock_requests.post.assert_called_once()
    call_args = mock_requests.post.call_args
    assert 'json' in call_args[1]
    assert 'ancestors' in call_args[1]['json']
    assert call_args[1]['json']['ancestors'][0]['id'] == 'PARENT-123'


def test_create_page_with_author_info(mock_requests, mock_environment):
    """Test creating a Confluence page with author information."""
    # Arrange
    service = ConfluenceService()
    title = "Authored Page"
    content = "<p><strong>Author:</strong> John Doe</p>\n<p>Page content with author</p>"
    space_key = "TEST"
    
    # Act
    result = service.create_page(title, content, space_key)
    
    # Assert
    assert result['page_id'] == 'PAGE-123'
    
    # Verify the request was made correctly
    mock_requests.post.assert_called_once()
    call_args = mock_requests.post.call_args
    assert 'json' in call_args[1]
    # Check that the author information is preserved in the content
    assert '<p><strong>Author:</strong> John Doe</p>' in call_args[1]['json']['body']['storage']['value']
