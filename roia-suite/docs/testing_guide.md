# Testing Guide for Project Management Suite

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Pyramid](#test-pyramid)
3. [Testing Tools](#testing-tools)
4. [Writing Tests](#writing-tests)
5. [Running Tests](#running-tests)
6. [Test Coverage](#test-coverage)
7. [Performance Testing](#performance-testing)
8. [Security Testing](#security-testing)
9. [CI/CD Integration](#cicd-integration)
10. [Best Practices](#best-practices)

## Testing Philosophy

Our testing approach follows these key principles:

- **Test Early, Test Often**: Tests should be written alongside code, preferably before the implementation (TDD).
- **Fast Feedback**: Tests should run quickly to provide immediate feedback to developers.
- **Reliability**: Tests should be deterministic and not flaky.
- **Independence**: Tests should be independent of each other and run in any order.
- **Coverage**: Critical code paths must have high test coverage.

## Test Pyramid

We follow the test pyramid approach to ensure a balance between different types of tests:

```
    /\
   /  \      E2E Tests (Few)
  /____\
 /      \    Integration Tests
/        \
----------    Unit Tests (Many)
```

- **Unit Tests**: Test individual functions/classes in isolation (80% of tests)
- **Integration Tests**: Test interactions between components (15% of tests)
- **E2E Tests**: Test complete user journeys (5% of tests)

## Testing Tools

### Backend (Python)

- **Framework**: pytest
- **Coverage**: pytest-cov
- **Mocking**: pytest-mock
- **Parallel Execution**: pytest-xdist
- **Data Generation**: factory-boy

### Frontend (JavaScript)

- **Framework**: Jest
- **Component Testing**: React Testing Library
- **E2E**: Cypress or Playwright

### Security Testing

- **Static Analysis**: Bandit
- **Dependency Scanning**: Safety
- **Frontend Dependencies**: npm audit

## Writing Tests

### Unit Test Structure

Unit tests should follow the Arrange-Act-Assert (AAA) pattern:

```python
def test_create_issue_from_intent(self, mock_jira):
    # Arrange
    mock_new_issue = mock.MagicMock()
    mock_new_issue.key = "ROIA-123"
    
    mock_jira_client = mock.MagicMock()
    mock_jira_client.create_issue.return_value = mock_new_issue
    
    # Act
    result = JiraService.create_issue_from_intent(...)
    
    # Assert
    assert result == "ROIA-123"
    mock_jira_client.create_issue.assert_called_once()
```

### Naming Conventions

- Test files: `test_*.py`
- Test classes: `Test*`
- Test methods: `test_*`

### Fixtures and Factory Pattern

Use pytest fixtures and factory-boy to create test data:

```python
@pytest.fixture
def sample_intent():
    return ClassifiedIntent(
        type=IssueType.STORY,
        summary="Test Story",
        description="This is a test story",
        acceptance_criteria=["Criteria 1", "Criteria 2"],
        priority=Priority.MEDIUM,
        epic_keywords=["test", "story"],
        confidence=0.9
    )

def test_create_issue(sample_intent):
    # Use sample_intent fixture
    ...
```

### Mocking External Dependencies

Always mock external services and APIs:

```python
@pytest.mark.parametrize("status_code", [200, 404, 500])
def test_api_call_handling(mock_requests, status_code):
    mock_response = mock.Mock()
    mock_response.status_code = status_code
    mock_requests.get.return_value = mock_response
    
    # Test how your code handles different status codes
    ...
```

## Running Tests

### Command Line

Use our PowerShell test runner:

```powershell
# Run all tests
.\run-all-tests.ps1

# Run only backend tests with coverage
.\run-all-tests.ps1 -Backend -Coverage

# Run tests in parallel
.\run-all-tests.ps1 -All -Parallel

# Run with security scanning
.\run-all-tests.ps1 -All -SecurityScan
```

### Direct pytest Commands

```bash
# Run all backend tests
pytest backend/tests

# Run specific test
pytest backend/tests/test_jira_service.py

# Run with coverage
pytest backend/tests --cov=backend/app

# Run with parallel execution
pytest backend/tests -xvs -n auto
```

## Test Coverage

We aim for at least 80% code coverage for critical code paths. Coverage reports are generated in HTML and XML formats:

- HTML: `coverage_reports/html/index.html`
- XML: `coverage_reports/coverage.xml`

Current minimum thresholds:
- Overall: 60% (gradually increasing)
- Critical services: 80%
- API endpoints: 70%

## Performance Testing

### Performance Budgets

We enforce these performance budgets:

- API response time: < 500ms for 95% of requests
- Frontend page load: < 2s
- Database queries: < 100ms

### Benchmarking

Use pytest-benchmark for performance testing:

```python
def test_performance(benchmark):
    result = benchmark(expensive_function, args)
    assert result == expected_result
```

### Load Testing

For API load testing, use Locust:

```python
from locust import HttpUser, task, between

class ApiUser(HttpUser):
    wait_time = between(1, 3)
    
    @task
    def get_features(self):
        self.client.get("/api/v1/features")
```

## Security Testing

Run security scans regularly:

```powershell
# Run all security scans
.\run-all-tests.ps1 -SecurityScan
```

This will:
1. Run Bandit for Python static analysis
2. Check dependencies with Safety
3. Scan frontend dependencies with npm audit

## CI/CD Integration

Tests are automatically run in the CI/CD pipeline:

1. On every push to any branch: unit tests
2. On pull requests: all tests including E2E
3. Weekly: security scans and performance tests

## Testing Specific Features

### Jira Integration Testing

When testing Jira integration components, consider these key aspects:

#### Project Key Selection

Test with both allowed project keys (ROIA and PROPS):

```python
@pytest.mark.parametrize("project_key", ["ROIA", "PROPS"])
def test_get_epics_with_project_key(project_key, mock_jira_service):
    # Arrange
    mock_service_instance = mock.MagicMock()
    mock_service_instance.get_epics.return_value = [
        {"epic_key": f"{project_key}-123", "epic_name": "Test Epic"}
    ]
    mock_jira_service.return_value = mock_service_instance
    
    # Act
    response = client.get(f"/api/v1/jira/epics?project_key={project_key}")
    
    # Assert
    assert response.status_code == 200
    assert response.json()[0]["epic_key"].startswith(project_key)
```

#### Epic Matching with Fallback

Test the fallback mechanism when no matching epics are found:

```python
def test_match_epics_with_fallback(mock_jira_service):
    # Arrange
    mock_service_instance = mock.MagicMock()
    # Simulate find_matching_epics failing
    mock_service_instance.find_matching_epics.side_effect = Exception("Matching failed")
    # But get_epics succeeds with fallback epics
    mock_service_instance.get_epics.return_value = [{"epic_key": "ROIA-123", "epic_name": "Fallback Epic"}]
    mock_jira_service.return_value = mock_service_instance
    
    # Act - this should trigger the fallback
    response = client.post("/api/v1/jira/match-epics", json={...})
    
    # Assert - should still return 200 with the fallback epics
    assert response.status_code == 200
    assert len(response.json()) > 0
```

## Best Practices

- **Don't test implementation details**: Test behavior, not how it works
- **Use parameterized tests** for testing multiple scenarios
- **Isolate test environments**: No shared state between tests
- **Clean up after tests**: Especially those that modify data
- **Use meaningful assertions**: Clear error messages
- **Test edge cases**: Null values, empty collections, errors
- **Focus on business requirements**: Tests should validate requirements
- **Keep tests DRY but readable**: Balance between reuse and clarity
- **Test fallback mechanisms**: Ensure graceful degradation when primary paths fail

## Troubleshooting Common Issues

- **Flaky Tests**: Use retry mechanisms for external integrations
- **Slow Tests**: Use profiling to identify bottlenecks
- **Resource Leaks**: Ensure proper cleanup in fixtures
- **Mocking Issues**: Use dependency injection to simplify mocking

---

*Last Updated: July 30, 2025*
