import React, { useState, useEffect } from 'react';
import ApiService from '../services/api';
import CreateEpicForm from './CreateEpicForm';

/**
 * Component that displays matching epics and allows selection
 */
const EpicSelector = ({ processedData, onEpicSelected, onReset, projectKey = "ROIA" }) => {
  const [epics, setEpics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEpicKey, setSelectedEpicKey] = useState(null);
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [createdIssue, setCreatedIssue] = useState(null);
  const [isShowingAllEpics, setIsShowingAllEpics] = useState(false);
  const [showCreateEpicForm, setShowCreateEpicForm] = useState(false);
  
  // Fetch matching epics when component mounts or project key changes
  useEffect(() => {
    fetchMatchingEpics();
  }, [processedData, projectKey]);
  
  const fetchMatchingEpics = async () => {
    if (!processedData || !processedData.classified_intent) {
      setError("No processed data available");
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      // Get user info for better matching
      const userInfo = ApiService.getCurrentUserInfo();
      
      // Create a properly formatted classified intent object that matches the backend model
      // This ensures we send exactly what the Pydantic model expects
      const formattedIntent = {
        type: processedData.classified_intent.type,
        summary: processedData.classified_intent.summary,
        description: processedData.classified_intent.description || "No description provided",
        acceptance_criteria: processedData.classified_intent.acceptance_criteria || [],
        priority: processedData.classified_intent.priority || "medium",
        epic_keywords: processedData.classified_intent.epic_keywords || [],
        confidence: processedData.classified_intent.confidence || 0.8
      };
      
      console.log('Formatted intent for epic matching:', formattedIntent);
      
      // Get epics that match the classified intent with properly formatted data
      const matchingEpics = await ApiService.matchJiraEpics(
        formattedIntent,
        userInfo,
        projectKey
      );
      
      setEpics(matchingEpics);
      setIsShowingAllEpics(false);
      
      // Auto-select the top matching epic if available
      if (matchingEpics && matchingEpics.length > 0) {
        setSelectedEpicKey(matchingEpics[0].epic_key);
      }
    } catch (error) {
      console.error("Error fetching matching epics:", error);
      
      // Better error handling
      let errorMessage = "Failed to fetch matching epics";
      if (error.response && error.response.data && error.response.data.detail) {
        // Handle FastAPI error format
        errorMessage += ": " + error.response.data.detail;
      } else if (typeof error.message === 'string') {
        errorMessage += ": " + error.message;
      } else if (error.message) {
        // Handle case where error.message might be an object
        errorMessage += ": Validation error with request data";
      }
      
      setError(errorMessage);
      
      // When matching fails, fetch all epics for the project
      try {
        console.log(`Falling back to fetching all epics for project ${projectKey}`);
        const allEpics = await ApiService.getJiraEpics(projectKey);
        setEpics(allEpics);
        setIsShowingAllEpics(true);
        
        // Auto-select the top epic if available
        if (allEpics && allEpics.length > 0) {
          setSelectedEpicKey(allEpics[0].epic_key);
        }
      } catch (fallbackError) {
        console.error("Error fetching all epics for fallback:", fallbackError);
        // Keep the original error message but indicate fallback also failed
        setError(errorMessage + " (Fallback to all epics also failed)");
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleEpicSelect = (epicKey) => {
    setSelectedEpicKey(epicKey);
    console.log(`Selected epic: ${epicKey}`);
  };
  
  const createIssueWithEpic = async () => {
    if (!selectedEpicKey) {
      setError("Please select an epic first");
      return;
    }
    
    try {
      setCreatingIssue(true);
      setError(null);
      
      // Create the issue with the selected epic
      const issueData = await ApiService.createJiraIssueWithEpic(
        processedData, 
        selectedEpicKey,
        projectKey
      );
      
      setCreatedIssue(issueData);
      
      // Notify parent component if callback provided
      if (onEpicSelected && typeof onEpicSelected === 'function') {
        onEpicSelected(selectedEpicKey, issueData);
      }
    } catch (error) {
      console.error("Error creating Jira issue with epic:", error);
      setError(`Failed to create Jira issue: ${error.message}`);
    } finally {
      setCreatingIssue(false);
    }
  };
  
  const handleReset = () => {
    setSelectedEpicKey(null);
    setCreatedIssue(null);
    setError(null);
    setShowCreateEpicForm(false);
    
    // Notify parent component if callback provided
    if (onReset && typeof onReset === 'function') {
      onReset();
    }
  };
  
  // Handle showing the create epic form
  const handleShowCreateEpicForm = () => {
    setShowCreateEpicForm(true);
  };
  
  // Handle new epic created successfully
  const handleEpicCreated = async (epicData) => {
    try {
      // Hide the create form
      setShowCreateEpicForm(false);
      
      // Refresh epics list to include the new epic
      setLoading(true);
      const refreshedEpics = await ApiService.getJiraEpics(projectKey);
      setEpics(refreshedEpics);
      
      // Select the newly created epic
      setSelectedEpicKey(epicData.issue_key);
      
      // Show a success message (could use a toast notification here)
      setError(null);
    } catch (error) {
      console.error("Error refreshing epics after creation:", error);
      setError("Epic created but failed to refresh the list. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  
  // Format match score as percentage
  const formatMatchScore = (score) => {
    return `${Math.round(score * 100)}%`;
  };
  
  // Format epic option for dropdown display
  const formatEpicOption = (epic) => {
    // Format as KEY | Summary | FIXVERSION | Assignee
    const fixVersion = epic.fix_version || '-';
    const assignee = epic.epic_assignee || '-';
    return `${epic.epic_key} | ${epic.epic_summary} | ${fixVersion} | ${assignee}`;
  };
  
  // Render different views based on state
  if (showCreateEpicForm) {
    return (
      <CreateEpicForm 
        projectKey={projectKey}
        onEpicCreated={handleEpicCreated}
        onCancel={() => setShowCreateEpicForm(false)}
      />
    );
  }
  
  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-md p-6">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-gray-900">Select an Epic</h2>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 mt-1">
              Choose the epic to associate with this issue:
            </p>
            <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
              Project: {projectKey}
            </span>
          </div>
          
          {isShowingAllEpics && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
              Showing all available epics for project {projectKey}
            </div>
          )}
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Analyzing context and finding the best epics...</p>
        </div>
      </div>
    );
  }
  
  if (error && !epics.length) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Epic Matching</h2>
        <div className="bg-red-50 p-4 rounded-md border border-red-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error Finding Epics</h3>
              <p className="mt-2 text-sm text-red-700">{error}</p>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  if (createdIssue) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Issue Created Successfully</h2>
        <div className="bg-green-50 p-4 rounded-md border border-green-200">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Jira Issue Created Successfully</h3>
              <div className="mt-2 text-sm text-green-700">
                <p>Issue <a 
                  href={createdIssue.issue_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-bold text-blue-600 hover:underline"
                >
                  {createdIssue.issue_key}
                </a> has been created and linked to the selected epic.</p>
                <p className="mt-1">You can view the issue in Jira by clicking the link above.</p>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              Create Another
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-md p-6">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-gray-900">Select an Epic</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 mt-1">
            Choose the epic to associate with this issue:
          </p>
          <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
            Project: {projectKey}
          </span>
        </div>
        
        {isShowingAllEpics && (
          <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
            Showing all available epics for project {projectKey}
          </div>
        )}
      </div>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      {epics.length === 0 ? (
        <div className="text-center py-6 border border-gray-200 rounded-lg">
          <p className="text-gray-500">No matching epics found.</p>
          <button
            onClick={handleShowCreateEpicForm}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Create New Epic
          </button>
        </div>
      ) : (
        <div className="mb-6">
          <label htmlFor="epicSelector" className="block text-sm font-medium text-gray-700 mb-1">
            Select an Epic
          </label>
          <div className="relative">
            <select
              id="epicSelector"
              value={selectedEpicKey || ''}
              onChange={(e) => handleEpicSelect(e.target.value)}
              className="block w-full p-2.5 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="" disabled>Select an epic...</option>
              {epics.map((epic) => (
                <option key={epic.epic_key} value={epic.epic_key}>
                  {formatEpicOption(epic)}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>
          
          {selectedEpicKey && epics.find(e => e.epic_key === selectedEpicKey) && (
            <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="font-medium text-gray-800">
                {epics.find(e => e.epic_key === selectedEpicKey).epic_name}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {epics.find(e => e.epic_key === selectedEpicKey).epic_summary}
              </p>
              {epics.find(e => e.epic_key === selectedEpicKey).epic_assignee && (
                <p className="text-xs text-gray-500 mt-2">
                  Assignee: {epics.find(e => e.epic_key === selectedEpicKey).epic_assignee}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      
      <div className="flex justify-between mt-6">
        <div>
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          
          <button
            onClick={handleShowCreateEpicForm}
            className="ml-3 px-4 py-2 border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Create New Epic
          </button>
        </div>
        
        <button
          onClick={createIssueWithEpic}
          disabled={!selectedEpicKey || creatingIssue || epics.length === 0}
          className={`px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
            !selectedEpicKey || creatingIssue || epics.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {creatingIssue ? (
            <span className="flex items-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating...
            </span>
          ) : (
            'Create Issue in Selected Epic'
          )}
        </button>
      </div>
    </div>
  );
};

export default EpicSelector;
