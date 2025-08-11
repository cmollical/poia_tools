import React, { useState, useEffect } from 'react';
import ApiService from '../services/api';
import PageSelector from './PageSelector';

const ConfluenceIntegration = ({ processedData }) => {
  const [confluencePages, setConfluencePages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [confluenceError, setConfluenceError] = useState(null);
  const [confluenceHealth, setConfluenceHealth] = useState(null);
  const [showPageSelector, setShowPageSelector] = useState(false);
  const [selectedPageData, setSelectedPageData] = useState(null);

  useEffect(() => {
    checkConfluenceHealth();
  }, []);

  const checkConfluenceHealth = async () => {
    try {
      const health = await ApiService.checkConfluenceHealth();
      setConfluenceHealth(health);
      
      if (health.connected) {
        // Automatically load some pages for preview
        loadConfluencePages();
      }
    } catch (error) {
      console.error('Error checking Confluence health:', error);
      setConfluenceError(`Failed to connect to Confluence: ${error.message}`);
    }
  };

  const loadConfluencePages = async () => {
    try {
      setLoadingPages(true);
      setConfluenceError(null);
      
      const pages = await ApiService.getConfluencePages('ROIA', 10);
      setConfluencePages(pages);
    } catch (error) {
      console.error('Error loading Confluence pages:', error);
      setConfluenceError(`Failed to load Confluence pages: ${error.message}`);
    } finally {
      setLoadingPages(false);
    }
  };

  const handleUpdateConfluence = () => {
    if (!processedData || !processedData.classified_intent) {
      setConfluenceError('No processed transcript data available. Please process a transcript first.');
      return;
    }
    
    setShowPageSelector(true);
  };

  const handlePageSelected = (pageId, updateData) => {
    setSelectedPageData(updateData);
    console.log('Page updated successfully:', updateData);
  };

  const handlePageSelectorReset = () => {
    setShowPageSelector(false);
    setSelectedPageData(null);
  };

  if (showPageSelector) {
    return (
      <div className="confluence-integration">
        <PageSelector
          processedData={processedData}
          onPageSelected={handlePageSelected}
          onReset={handlePageSelectorReset}
        />
      </div>
    );
  }

  return (
    <div className="confluence-integration">
      <h3>📄 Confluence Integration</h3>
      
      {/* Health Status */}
      <div className="confluence-health">
        {confluenceHealth ? (
          <div className={`health-status ${confluenceHealth.connected ? 'connected' : 'disconnected'}`}>
            <span className="status-indicator">
              {confluenceHealth.connected ? '🟢' : '🔴'}
            </span>
            <span className="status-text">
              {confluenceHealth.connected 
                ? `Connected to Confluence (${confluenceHealth.server_info?.spaces_found || 0} spaces found)`
                : 'Confluence connection failed'
              }
            </span>
          </div>
        ) : (
          <div className="health-status checking">
            <span className="status-indicator">🟡</span>
            <span className="status-text">Checking Confluence connection...</span>
          </div>
        )}
      </div>

      {confluenceError && (
        <div className="error-message">
          <p>{confluenceError}</p>
          <button onClick={checkConfluenceHealth} className="retry-button">
            Retry Connection
          </button>
        </div>
      )}

      {confluenceHealth?.connected && (
        <>
          {/* Recent Pages Preview */}
          <div className="pages-preview">
            <h4>📋 Recent ROIA Confluence Pages</h4>
            {loadingPages ? (
              <div className="loading">Loading pages...</div>
            ) : (
              <div className="pages-list">
                {confluencePages.slice(0, 5).map((page) => (
                  <div key={page.page_id} className="page-item preview">
                    <div className="page-info">
                      <h5>{page.page_title}</h5>
                      <p className="page-excerpt">{page.content_excerpt}</p>
                      <div className="page-meta">
                        <span>Space: {page.space_key}</span>
                        {page.last_modified && (
                          <span>Modified: {new Date(page.last_modified).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="page-actions">
                      <a href={page.page_url} target="_blank" rel="noopener noreferrer" className="view-link">
                        🔗 View
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="confluence-actions">
            <button 
              onClick={handleUpdateConfluence}
              disabled={!processedData || !processedData.classified_intent}
              className="update-confluence-button"
              title={!processedData ? "Please process a transcript first" : "Update a Confluence page with your transcript"}
            >
              📝 Update Confluence Page
            </button>
            
            <button onClick={loadConfluencePages} className="refresh-pages-button">
              🔄 Refresh Pages
            </button>
          </div>

          {/* Success Message */}
          {selectedPageData && (
            <div className="success-message">
              <h4>✅ Confluence Page Updated Successfully!</h4>
              <p>
                <strong>Updated:</strong> {selectedPageData.message}
              </p>
              <p>
                <a href={selectedPageData.page_url} target="_blank" rel="noopener noreferrer">
                  🔗 View Updated Page
                </a>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ConfluenceIntegration;
