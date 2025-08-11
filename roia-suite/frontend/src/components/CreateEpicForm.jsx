import React, { useState } from 'react';
import ApiService from '../services/api';

/**
 * Component for creating a new Jira epic
 */
const CreateEpicForm = ({ projectKey, onEpicCreated, onCancel }) => {
  const [epicName, setEpicName] = useState('');
  const [epicSummary, setEpicSummary] = useState('');
  const [epicDescription, setEpicDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (!epicName || !epicSummary) {
      setError('Epic name and summary are required');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Call API to create epic
      const response = await ApiService.createJiraEpic(
        epicName,
        epicSummary,
        epicDescription,
        projectKey
      );
      
      // Call success callback with created epic
      if (onEpicCreated && typeof onEpicCreated === 'function') {
        onEpicCreated(response);
      }
    } catch (error) {
      console.error('Error creating epic:', error);
      setError(`Failed to create epic: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Epic</h2>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="epicName">
            Epic Name *
          </label>
          <input
            id="epicName"
            type="text"
            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={epicName}
            onChange={(e) => setEpicName(e.target.value)}
            required
            placeholder="Enter epic name"
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="epicSummary">
            Epic Summary *
          </label>
          <input
            id="epicSummary"
            type="text"
            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={epicSummary}
            onChange={(e) => setEpicSummary(e.target.value)}
            required
            placeholder="Enter a short summary"
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="epicDescription">
            Description
          </label>
          <textarea
            id="epicDescription"
            className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={epicDescription}
            onChange={(e) => setEpicDescription(e.target.value)}
            rows="4"
            placeholder="Enter a detailed description (optional)"
          />
        </div>
        
        <div className="flex justify-between">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          
          <button
            type="submit"
            disabled={loading || !epicName || !epicSummary}
            className={`px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              loading || !epicName || !epicSummary
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {loading ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Creating...
              </span>
            ) : (
              'Create Epic'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateEpicForm;
