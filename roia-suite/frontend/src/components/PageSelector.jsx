import React, { useState, useEffect } from 'react';
import ApiService from '../services/api';

const PageSelector = ({ processedData, onPageSelected, onReset }) => {
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingPage, setUpdatingPage] = useState(false);
  const [updatedPage, setUpdatedPage] = useState(null);
  const [updateContent, setUpdateContent] = useState('');

  useEffect(() => {
    if (processedData) {
      fetchMatchingPages();
    }
  }, [processedData]);

  const fetchMatchingPages = async () => {
    if (!processedData || !processedData.classified_intent) {
      setError("No processed data available");
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Get user info for better matching
      const userInfo = ApiService.getCurrentUserInfo();
      
      // Create a properly formatted classified intent object
      const formattedIntent = {
        type: processedData.classified_intent.type,
        summary: processedData.classified_intent.summary,
        description: processedData.classified_intent.description || "No description provided",
        acceptance_criteria: processedData.classified_intent.acceptance_criteria || [],
        priority: processedData.classified_intent.priority || "medium",
        epic_keywords: processedData.classified_intent.epic_keywords || [],
        confidence: processedData.classified_intent.confidence || 0.8
      };
      
      console.log('Formatted intent for page matching:', formattedIntent);
      
      // Get pages that match the classified intent
      const matchingPages = await ApiService.matchConfluencePages(
        formattedIntent,
        userInfo
      );
      
      setPages(matchingPages);
      
      // Auto-select the top matching page if available
      if (matchingPages && matchingPages.length > 0) {
        setSelectedPageId(matchingPages[0].page_id);
        
        // Prepare default update content
        const defaultContent = `
Project Update: ${processedData.classified_intent.summary}

${processedData.classified_intent.description}

${processedData.classified_intent.acceptance_criteria && processedData.classified_intent.acceptance_criteria.length > 0 
  ? `\nAcceptance Criteria:\n${processedData.classified_intent.acceptance_criteria.map(criteria => `• ${criteria}`).join('\n')}`
  : ''
}
        `.trim();
        
        setUpdateContent(defaultContent);
      }
    } catch (error) {
      console.error("Error fetching matching pages:", error);
      
      // Better error handling
      let errorMessage = "Failed to fetch matching pages";
      if (error.response && error.response.data && error.response.data.detail) {
        errorMessage += ": " + error.response.data.detail;
      } else if (typeof error.message === 'string') {
        errorMessage += ": " + error.message;
      } else if (error.message) {
        errorMessage += ": Validation error with request data";
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const updatePageWithContent = async () => {
    if (!selectedPageId) {
      setError("Please select a page first");
      return;
    }
    
    if (!updateContent.trim()) {
      setError("Please enter content to add to the page");
      return;
    }
    
    try {
      setUpdatingPage(true);
      setError(null);
      
      // Update the page with the content
      const updateData = await ApiService.updateConfluencePage(
        selectedPageId,
        updateContent,
        `Added project update: ${processedData.classified_intent.summary}`,
        true // append content
      );
      
      setUpdatedPage(updateData);
      
      // Notify parent component if callback provided
      if (onPageSelected && typeof onPageSelected === 'function') {
        onPageSelected(selectedPageId, updateData);
      }
    } catch (error) {
      console.error("Error updating Confluence page:", error);
      setError(`Failed to update Confluence page: ${error.message}`);
    } finally {
      setUpdatingPage(false);
    }
  };

  const handleReset = () => {
    setPages([]);
    setSelectedPageId('');
    setError(null);
    setUpdatedPage(null);
    setUpdateContent('');
    setLoading(true);
    
    if (onReset && typeof onReset === 'function') {
      onReset();
    }
  };

  if (loading) {
    return (
      <div className="page-selector">
        <h3>🔍 Finding Matching Confluence Pages...</h3>
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Analyzing content and matching with Confluence pages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-selector">
        <h3>❌ Error Finding Pages</h3>
        <div className="error-message">
          <p>{error}</p>
          <button onClick={fetchMatchingPages} className="retry-button">
            Try Again
          </button>
          <button onClick={handleReset} className="reset-button">
            Back to Start
          </button>
        </div>
      </div>
    );
  }

  if (updatedPage) {
    return (
      <div className="page-selector success">
        <h3>✅ Confluence Page Updated Successfully!</h3>
        <div className="success-details">
          <p><strong>Page Updated:</strong> {pages.find(p => p.page_id === selectedPageId)?.page_title}</p>
          <p><strong>Page URL:</strong> <a href={updatedPage.page_url} target="_blank" rel="noopener noreferrer">
            View Updated Page
          </a></p>
          <p><strong>Update Message:</strong> {updatedPage.message}</p>
        </div>
        <div className="action-buttons">
          <button onClick={handleReset} className="new-update-button">
            Create Another Update
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-selector">
      <h3>📄 Select Confluence Page to Update</h3>
      <p className="instruction">
        We found {pages.length} page{pages.length !== 1 ? 's' : ''} that might be relevant to your update. 
        Select the page you'd like to update:
      </p>
      
      <div className="pages-list">
        {pages.map((page) => (
          <div 
            key={page.page_id} 
            className={`page-item ${selectedPageId === page.page_id ? 'selected' : ''}`}
            onClick={() => setSelectedPageId(page.page_id)}
          >
            <div className="page-header">
              <input
                type="radio"
                name="selectedPage"
                value={page.page_id}
                checked={selectedPageId === page.page_id}
                onChange={() => setSelectedPageId(page.page_id)}
              />
              <h4>{page.page_title}</h4>
              <span className="match-score">{Math.round(page.match_score * 100)}% match</span>
            </div>
            
            <div className="page-details">
              <p className="page-space"><strong>Space:</strong> {page.space_name} ({page.space_key})</p>
              {page.content_excerpt && (
                <p className="page-excerpt"><strong>Content Preview:</strong> {page.content_excerpt}</p>
              )}
              {page.last_modified && (
                <p className="page-modified"><strong>Last Modified:</strong> {new Date(page.last_modified).toLocaleDateString()}</p>
              )}
              {page.author && (
                <p className="page-author"><strong>Author:</strong> {page.author}</p>
              )}
            </div>
            
            <div className="page-actions">
              <a href={page.page_url} target="_blank" rel="noopener noreferrer" className="view-page-link">
                🔗 View Page
              </a>
            </div>
          </div>
        ))}
      </div>

      {selectedPageId && (
        <div className="update-content-section">
          <h4>Content to Add to Page</h4>
          <textarea
            value={updateContent}
            onChange={(e) => setUpdateContent(e.target.value)}
            placeholder="Enter the content you want to add to this Confluence page..."
            rows={8}
            className="update-content-textarea"
          />
          <p className="content-help">
            💡 This content will be appended to the selected page with nice formatting and a timestamp.
          </p>
        </div>
      )}
      
      <div className="action-buttons">
        <button 
          onClick={updatePageWithContent}
          disabled={!selectedPageId || !updateContent.trim() || updatingPage}
          className="update-page-button"
        >
          {updatingPage ? '🔄 Updating Page...' : '📝 Update Confluence Page'}
        </button>
        
        <button onClick={handleReset} className="reset-button">
          🔙 Back to Start
        </button>
      </div>
    </div>
  );
};

export default PageSelector;
