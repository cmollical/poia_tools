import React, { useState, useEffect } from 'react';
import ApiService from '../services/api';
import EpicSelector from './EpicSelector';

const JiraIntegration = ({ processedData, onReset }) => {
  const [features, setFeatures] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdIssue, setCreatedIssue] = useState(null);
  const [isCreatingIssue, setIsCreatingIssue] = useState(false);
  const [showEpicSelector, setShowEpicSelector] = useState(false);
  const [projectKey, setProjectKey] = useState("ROIA");
  
  // Available project keys - restricting to ROIA and PROPS as requested
  const AVAILABLE_PROJECT_KEYS = ["ROIA", "PROPS"];

  // Fetch Jira features when the component mounts or project key changes
  useEffect(() => {
    fetchFeatures();
  }, [projectKey]);

  const fetchFeatures = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const data = await ApiService.getJiraFeatures(projectKey);
      setFeatures(data);
    } catch (error) {
      console.error("Error fetching Jira features:", error);
      setError(`Failed to fetch Jira features: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Create a Jira issue from the processed data
  const createJiraIssue = async () => {
    if (!processedData) {
      setError("No processed data to create a Jira issue from");
      return;
    }
    
    // Show the epic selector instead of creating issue directly
    setShowEpicSelector(true);
  };
  
  // Handle issue created with epic link
  const handleEpicIssueCreated = (epicKey, issueData) => {
    setCreatedIssue(issueData);
    setShowEpicSelector(false);
    // Refresh features list to show any updates
    fetchFeatures();
  };
  
  // Handle cancel from epic selector
  const handleEpicSelectorReset = () => {
    setShowEpicSelector(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Jira Integration</h2>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      {/* Display Jira connection status */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full ${isLoading ? 'bg-yellow-500' : 'bg-green-500'} mr-2`}></div>
            <span className="text-sm font-medium text-gray-700">
              Jira Connection: {isLoading ? 'Checking...' : 'Connected'}
            </span>
          </div>
          
          {/* Project key selector */}
          <div className="flex items-center">
            <label htmlFor="projectKey" className="text-sm font-medium text-gray-700 mr-2">
              Project:
            </label>
            <select
              id="projectKey"
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              className="border border-gray-300 rounded-md text-sm p-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading || showEpicSelector}
            >
              {AVAILABLE_PROJECT_KEYS.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Connected to {projectKey} Jira project
        </p>
      </div>
      
      {/* Show Epic Selector when needed */}
      {showEpicSelector && processedData ? (
        <EpicSelector 
          processedData={processedData}
          onEpicSelected={handleEpicIssueCreated}
          onReset={handleEpicSelectorReset}
          projectKey={projectKey}
        />
      ) : (
        /* Display the processed data summary */
        processedData?.classified_intent && (
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-2">Processed Transcript</h3>
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase">Type:</span>
                <span className="ml-2 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {processedData.classified_intent.type}
                </span>
              </div>
              <div className="mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase">Summary:</span>
                <span className="ml-2 text-sm text-gray-700">
                  {processedData.classified_intent.summary}
                </span>
              </div>
              <div className="mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase">Priority:</span>
                <span className="ml-2 text-sm text-gray-700">
                  {processedData.classified_intent.priority}
                </span>
              </div>
              <div className="mb-2">
                <span className="text-xs font-semibold text-gray-500 uppercase">Confidence:</span>
                <span className="ml-2 text-sm text-gray-700">
                  {Math.round(processedData.classified_intent.confidence * 100)}%
                </span>
              </div>
              {processedData.classified_intent.epic_keywords && processedData.classified_intent.epic_keywords.length > 0 && (
                <div className="mb-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase">Keywords:</span>
                  <div className="flex flex-wrap mt-1">
                    {processedData.classified_intent.epic_keywords.map((keyword, index) => (
                      <span key={index} className="mr-2 mb-2 px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={createJiraIssue}
                disabled={isCreatingIssue}
                className={`py-2 px-4 rounded-lg font-medium transition-colors ${
                  isCreatingIssue
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <div className="flex items-center">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Create Jira Issue
                </div>
              </button>
            </div>
          </div>
        )
      )}
      
      {/* Display created Jira issue */}
      {createdIssue && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-md font-semibold text-green-800 mb-2">
            Jira Issue Created Successfully
          </h3>
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <a
              href={createdIssue.issue_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {createdIssue.issue_key}
            </a>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            The issue has been created and can be viewed in Jira by clicking the link above.
          </p>
        </div>
      )}
      
      {/* Recent Jira features */}
      <div className="mt-6">
        <h3 className="text-lg font-medium text-gray-800 mb-2">Recent {projectKey} Features</h3>
        {isLoading ? (
          <div className="text-center py-4">
            <svg className="animate-spin h-6 w-6 text-gray-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-sm text-gray-500 mt-2">Loading features...</p>
          </div>
        ) : features.length > 0 ? (
          <div className="divide-y divide-gray-200 border border-gray-200 rounded-lg">
            {features.slice(0, 5).map((feature, index) => (
              <div key={index} className="p-4 hover:bg-gray-50">
                <div className="flex justify-between">
                  <a
                    href={`${feature.jira_url}/browse/${feature.feature_key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {feature.feature_key}
                  </a>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    feature.feature_status === 'Done' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {feature.feature_status}
                  </span>
                </div>
                <h4 className="text-sm font-medium text-gray-800 mt-1">
                  {feature.feature_summary}
                </h4>
                <div className="text-xs text-gray-500 mt-1">
                  Reporter: {feature.feature_reporter || 'Unknown'} | 
                  Updated: {new Date(feature.last_updated).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-500">No features found in the ROIA project.</p>
          </div>
        )}
      </div>
      
      {/* Reset button */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={onReset}
          className="py-2 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default JiraIntegration;
