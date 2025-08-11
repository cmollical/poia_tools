import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import JiraIntegration from './JiraIntegration';
import ApiService from '../services/api';

// Mock the API service
jest.mock('../services/api', () => ({
  getJiraFeatures: jest.fn(),
  createJiraIssue: jest.fn(),
  checkJiraHealth: jest.fn()
}));

// Mock fetch to prevent actual network requests
global.fetch = jest.fn();

describe('JiraIntegration Component', () => {
  const mockProcessedData = {
    success: true,
    classified_intent: {
      type: "story",
      summary: "Test Story Summary",
      description: "This is a test story description",
      acceptance_criteria: ["Criteria 1", "Criteria 2"],
      priority: "medium",
      epic_keywords: ["test", "story"],
      confidence: 0.9
    },
    epic_match: {
      epic_id: "ROIA-100",
      epic_name: "Test Epic",
      match_confidence: 0.8,
      keywords_matched: ["test"]
    },
    cleaned_transcript: "This is a cleaned transcript",
    processing_time_ms: 500
  };
  
  const mockFeatures = [
    {
      feature_key: "ROIA-1",
      feature_summary: "Test Feature 1",
      feature_status: "In Progress",
      feature_reporter: "Test User",
      last_updated: "2025-07-26T10:00:00.000Z"
    },
    {
      feature_key: "ROIA-2",
      feature_summary: "Test Feature 2",
      feature_status: "Done",
      feature_reporter: "Test User",
      last_updated: "2025-07-25T10:00:00.000Z"
    }
  ];

  const mockCreatedIssue = {
    issue_key: "ROIA-123",
    issue_url: "https://athenajira.athenahealth.com/browse/ROIA-123",
    success: true
  };

  const mockOnReset = jest.fn();

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementations
    ApiService.getJiraFeatures.mockResolvedValue(mockFeatures);
    ApiService.createJiraIssue.mockResolvedValue(mockCreatedIssue);
    ApiService.checkJiraHealth.mockResolvedValue({
      status: "healthy",
      service: "jira",
      timestamp: "2025-07-27T12:30:00.000Z",
      server_info: { version: "9.0.0" },
      token_configured: true
    });
    
    // Mock fetch implementation
    global.fetch.mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockFeatures)
      })
    );
  });

  test('renders component with processed data', async () => {
    // We need to wrap rendering in act because it triggers useEffect calls
    await act(async () => {
      render(<JiraIntegration processedData={mockProcessedData} onReset={mockOnReset} />);
    });
    
    // Wait for all promises to resolve
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    
    // Basic component rendering assertions
    expect(screen.getByText("Jira Integration")).toBeInTheDocument();
    expect(screen.getByText("Processed Transcript")).toBeInTheDocument();
    
    // Check that type is displayed
    const typeElements = screen.getAllByText(/Type:/i);
    expect(typeElements.length).toBeGreaterThan(0);
    
    // Check that the summary is displayed
    const summaryElements = screen.getAllByText(/Summary:/i);
    expect(summaryElements.length).toBeGreaterThan(0);
    
    // Check that Recent ROIA Features header is displayed
    expect(screen.getByText("Recent ROIA Features")).toBeInTheDocument();
  });

  test('shows loading state while fetching features', async () => {
    // Make the API call pending indefinitely
    ApiService.getJiraFeatures.mockImplementation(() => 
      new Promise(resolve => {
        // This promise will not resolve during the test
        setTimeout(() => resolve([]), 10000);
      })
    );
    
    // Render with act to handle useEffect
    await act(async () => {
      render(<JiraIntegration processedData={mockProcessedData} onReset={mockOnReset} />);
    });
    
    // The loading indicator should be visible
    expect(screen.getByText("Loading features...")).toBeInTheDocument();
  });

  test('creates Jira issue when button is clicked', async () => {
    // Render the component
    await act(async () => {
      render(<JiraIntegration processedData={mockProcessedData} onReset={mockOnReset} />);
    });
    
    // Wait for initial render to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    
    // Find all buttons with the text "Create Jira Issue"
    const buttons = screen.getAllByText("Create Jira Issue");
    expect(buttons.length).toBeGreaterThan(0);
    
    // Click the first button that's a real button element
    await act(async () => {
      fireEvent.click(buttons[0]);
    });
    
    // Wait for the API call to resolve
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    
    // Verify the API call was made
    expect(ApiService.createJiraIssue).toHaveBeenCalledWith(mockProcessedData);
  });

  test('reset button calls onReset callback', async () => {
    // Render the component
    await act(async () => {
      render(<JiraIntegration processedData={mockProcessedData} onReset={mockOnReset} />);
    });
    
    // Wait for initial render to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    
    // Find the Reset button
    const resetButton = screen.getByText("Reset");
    
    // Click the Reset button
    await act(async () => {
      fireEvent.click(resetButton);
    });
    
    // Verify the onReset callback was called
    expect(mockOnReset).toHaveBeenCalledTimes(1);
  });
});
