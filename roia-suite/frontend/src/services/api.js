// API service for communicating with FastAPI backend

const API_BASE_URL = 'http://localhost:8000/api/v1';

class ApiService {
  /**
   * Process transcript using backend AI service
   * @param {Object} options - Options object containing transcript and other parameters
   * @param {string} options.transcript - Raw transcript text
   * @param {string} [options.mode] - Processing mode ('jira' or 'confluence')
   * @param {boolean} [options.multipleIssues] - Whether to create multiple issues
   * @param {boolean} [options.multiplePages] - Whether to create multiple pages
   * @param {string} [options.projectKey] - Jira project key
   * @param {string} [options.spaceKey] - Confluence space key
   * @returns {Promise<Object>} Processed transcript data
   */
  async processTranscript(options) {
    try {
      // Extract the transcript from options
      const { transcript } = options;
      
      // Create project context from the additional parameters
      const projectContext = JSON.stringify({
        mode: options.mode,
        multipleIssues: options.multipleIssues,
        multiplePages: options.multiplePages,
        projectKey: options.projectKey,
        spaceKey: options.spaceKey
      });
      
      console.log('🔍 Sending transcript request with context:', projectContext);
      
      const response = await fetch(`${API_BASE_URL}/transcript/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript,
          user_id: null,
          project_context: projectContext
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error processing transcript:', error);
      throw error;
    }
  }

  /**
   * Clean transcript text only (without full AI processing)
   * @param {string} transcript - Raw transcript text
   * @returns {Promise<Object>} Cleaned transcript data
   */
  async cleanTranscript(transcript) {
    try {
      const response = await fetch(`${API_BASE_URL}/transcript/clean`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error cleaning transcript:', error);
      throw error;
    }
  }

  /**
   * Check backend health status
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    try {
      const response = await fetch('http://localhost:8000/health');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking backend health:', error);
      return {
        status: 'unhealthy',
        error: error.message
      };
    }
  }

  /**
   * Check transcript service health
   * @returns {Promise<Object>} Transcript service health status
   */
  async checkTranscriptHealth() {
    try {
      const response = await fetch(`${API_BASE_URL}/transcript/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking transcript service health:', error);
      return {
        status: 'unhealthy',
        service: 'transcript_processing',
        error: error.message
      };
    }
  }

  /**
   * Download Excel file with all exported stories
   * @returns {Promise<void>} Triggers file download
   */
  async downloadExcelFile() {
    try {
      const response = await fetch(`${API_BASE_URL}/excel/download`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      // Create blob from response
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'project_stories.xlsx';
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error downloading Excel file:', error);
      throw error;
    }
  }

  /**
   * Get Excel export summary
   * @returns {Promise<Object>} Excel export summary data
   */
  async getExcelSummary() {
    try {
      const response = await fetch(`${API_BASE_URL}/excel/summary`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting Excel summary:', error);
      throw error;
    }
  }

  /**
   * Get Jira features from a project
   * @param {string} projectKey - Jira project key (defaults to ROIA)
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Promise<Array>} Array of Jira features
   */
  async getJiraFeatures(projectKey = 'ROIA', maxResults = 50) {
    try {
      const response = await fetch(`${API_BASE_URL}/jira/features?max_results=${maxResults}&project_key=${projectKey}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error fetching Jira features for project ${projectKey}:`, error);
      throw error;
    }
  }

  /**
   * Create Jira issue from intent data
   * @param {Object} intentData - Intent data with classified_intent
   * @param {string} projectKey - Jira project key (defaults to ROIA)
   * @param {string} epicKey - Optional epic key to link the issue to
   * @returns {Promise<Object>} Created Jira issue data
   */
  async createJiraIssueFromIntent(intentData, projectKey = 'ROIA', epicKey = null) {
    try {
      // Create a ProcessTranscriptResponse-like object that the backend expects
      const processedData = {
        success: true,
        classified_intent: intentData.classified_intent || intentData.content,
        epic_match: intentData.epic_match || null,
        cleaned_transcript: '',
        processing_time_ms: 0
      };
      
      console.log('🔍 Creating Jira issue with epic key:', epicKey);
      return await this.createJiraIssue(processedData, projectKey, epicKey);
    } catch (error) {
      console.error(`Error creating Jira issue from intent for project ${projectKey}:`, error);
      throw error;
    }
  }

  /**
   * Create Jira issue from processed transcript data
   * @param {Object} processedData - Processed transcript data
   * @param {string} projectKey - Jira project key (defaults to ROIA)
   * @param {string} epicKey - Optional epic key to link the issue to
   * @returns {Promise<Object>} Created Jira issue data
   */
  async createJiraIssue(processedData, projectKey = 'ROIA', epicKey = null) {
    try {
      let url = `${API_BASE_URL}/jira/create-from-intent?project_key=${projectKey}`;
      if (epicKey) {
        url += `&epic_key=${epicKey}`;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(processedData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error creating Jira issue for project ${projectKey}:`, error);
      throw error;
    }
  }

  /**
   * Create Confluence page
   * @param {Object} pageData - Page data including title, body, etc.
   * @param {string} spaceKey - Confluence space key
   * @param {string} parentPageId - Optional parent page ID
   * @returns {Promise<Object>} Created Confluence page data
   */
  async createConfluencePage(pageData, spaceKey, parentPageId = null) {
    try {
      console.log('🔍 Creating Confluence page:', { pageData, spaceKey, parentPageId });
      
      // Format content as HTML for Confluence storage format
      const bodyContent = pageData.body || pageData.content;
      const formattedContent = this._formatConfluenceContent(bodyContent);
      
      let url = `${API_BASE_URL}/confluence/create-page?space_key=${spaceKey}`;
      if (parentPageId) {
        url += `&parent_id=${parentPageId}`;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: pageData.title,
          content: formattedContent
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Confluence page created:', result);
      return result;
    } catch (error) {
      console.error(`Error creating Confluence page in space ${spaceKey}:`, error);
      throw error;
    }
  }
  
  /**
   * Format content for Confluence storage format with improved structure
   * @param {string} content - Raw content to format
   * @returns {string} HTML formatted for Confluence storage
   * @private
   */
  _formatConfluenceContent(content) {
    if (!content) return '<p>No content provided</p>';
    
    // If content is already HTML, return it
    if (content.startsWith('<') && content.includes('</')) {
      return content;
    }
    
    // Create a more structured document
    let html = '<div class="confluence-content">';
    
    // Add a table of contents macro if content is substantial
    if (content.length > 500) {
      html += '<ac:structured-macro ac:name="toc">' +
             '<ac:parameter ac:name="printable">true</ac:parameter>' +
             '<ac:parameter ac:name="style">disc</ac:parameter>' +
             '<ac:parameter ac:name="maxLevel">3</ac:parameter>' +
             '<ac:parameter ac:name="minLevel">1</ac:parameter>' +
             '</ac:structured-macro>';
    }
    
    // Process content by paragraphs
    const paragraphs = content.split('\n\n');
    let inList = false;
    let listHtml = '';
    
    paragraphs.forEach(paragraph => {
      const trimmed = paragraph.trim();
      if (!trimmed) return;
      
      // Check for different content types
      if (trimmed.startsWith('# ')) {
        // Close any open list
        if (inList) {
          html += listHtml + '</ul>';
          inList = false;
          listHtml = '';
        }
        
        // H1 heading
        const heading = trimmed.substring(2);
        html += `<h1>${heading}</h1>`;
      } else if (trimmed.startsWith('## ')) {
        // Close any open list
        if (inList) {
          html += listHtml + '</ul>';
          inList = false;
          listHtml = '';
        }
        
        // H2 heading
        const heading = trimmed.substring(3);
        html += `<h2>${heading}</h2>`;
      } else if (trimmed.startsWith('* ')) {
        // List item
        if (!inList) {
          inList = true;
          listHtml = '<ul class="confluence-list">';
        }
        const item = trimmed.substring(2);
        listHtml += `<li>${item}</li>`;
      } else if (trimmed.startsWith('> ')) {
        // Close any open list
        if (inList) {
          html += listHtml + '</ul>';
          inList = false;
          listHtml = '';
        }
        
        // Blockquote
        const quote = trimmed.substring(2);
        html += `<blockquote>${quote}</blockquote>`;
      } else {
        // Close any open list
        if (inList) {
          html += listHtml + '</ul>';
          inList = false;
          listHtml = '';
        }
        
        // Regular paragraph
        html += `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
      }
    });
    
    // Close any open list at the end
    if (inList) {
      html += listHtml + '</ul>';
    }
    
    // Close the main content div
    html += '</div>';
    
    return html;
  }

  /**
   * Create a new epic in Jira
   * @param {string} epicName - Name of the epic
   * @param {string} epicSummary - Summary of the epic
   * @param {string} epicDescription - Description of the epic
   * @param {string} projectKey - Jira project key
   * @returns {Promise<Object>} Created epic data
   */
  async createJiraEpic(epicName, epicSummary, epicDescription = '', projectKey = 'ROIA') {
    try {
      const response = await fetch(`${API_BASE_URL}/jira/create-epic?project_key=${projectKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          epic_name: epicName,
          epic_summary: epicSummary,
          epic_description: epicDescription
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating Jira epic:', error);
      throw error;
    }
  }

  /**
   * Check Jira connection health
   * @returns {Promise<Object>} Jira health status
   */
  async checkJiraHealth() {
    try {
      const response = await fetch(`${API_BASE_URL}/jira/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking Jira health:', error);
      return {
        status: 'unhealthy',
        service: 'jira',
        error: error.message
      };
    }
  }

  /**
   * Get all epics from a project
   * @param {string} projectKey - Jira project key
   * @param {number} maxResults - Maximum number of results to return
   * @returns {Promise<Array>} Array of Jira epics
   */
  async getJiraEpics(projectKey = 'ROIA', maxResults = 500) {
    try {
      const response = await fetch(`${API_BASE_URL}/jira/epics?project_key=${projectKey}&max_results=${maxResults}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Error fetching Jira epics for project ${projectKey}:`, error);
      throw error;
    }
  }

  /**
   * Find epics that match the classified intent and user context
   * @param {Object} classifiedIntent - The classified intent
   * @param {Object} userInfo - Optional user information
   * @param {string} projectKey - Jira project key (defaults to ROIA)
   * @param {number} maxResults - Maximum number of matching epics to return
   * @returns {Promise<Array>} Array of matching epics with match scores
   */
  async matchJiraEpics(classifiedIntent, userInfo = null, projectKey = 'ROIA', maxResults = 3) {
    try {
      if (!classifiedIntent) {
        throw new Error("Classified intent is required");
      }
      
      // Create a properly sanitized version of the intent to match the backend model
      // This ensures we don't send extra or invalid fields that would cause validation errors
      // Based on the backend ClassifiedIntent model, we need exact enum values
      const sanitizedIntent = {
        type: String(classifiedIntent.type || 'story').toLowerCase(),
        summary: String(classifiedIntent.summary || ''),
        description: String(classifiedIntent.description || 'No description provided'),
        acceptance_criteria: Array.isArray(classifiedIntent.acceptance_criteria) 
          ? classifiedIntent.acceptance_criteria.map(ac => String(ac))
          : [],
        priority: String(classifiedIntent.priority || 'medium').toLowerCase(),
        epic_keywords: Array.isArray(classifiedIntent.epic_keywords) 
          ? classifiedIntent.epic_keywords.map(kw => String(kw))
          : [],
        confidence: Math.max(0.0, Math.min(1.0, Number(classifiedIntent.confidence || 0.8)))
      };
      
      // Validate enum values to match backend expectations
      const validTypes = ['story', 'bug', 'task', 'epic', 'comment'];
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      
      if (!validTypes.includes(sanitizedIntent.type)) {
        console.warn(`Invalid type '${sanitizedIntent.type}', defaulting to 'story'`);
        sanitizedIntent.type = 'story';
      }
      
      if (!validPriorities.includes(sanitizedIntent.priority)) {
        console.warn(`Invalid priority '${sanitizedIntent.priority}', defaulting to 'medium'`);
        sanitizedIntent.priority = 'medium';
      }
      
      const requestBody = {
        classified_intent: sanitizedIntent,
        max_results: maxResults
      };
      
      // Add user info if provided
      if (userInfo) {
        requestBody.user_info = {
          username: String(userInfo.username || 'current_user'),
          display_name: userInfo.display_name ? String(userInfo.display_name) : null,
          email: userInfo.email ? String(userInfo.email) : null,
          department: userInfo.department ? String(userInfo.department) : null
        };
      }
      
      console.log('Sanitized request body for match-epics:', JSON.stringify(requestBody, null, 2));
      
      // Use query parameter for project_key to match the updated backend API
      const url = new URL(`${API_BASE_URL}/jira/match-epics`);
      url.searchParams.append('project_key', projectKey);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const errorData = await response.json();
          throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        } else {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error matching Jira epics for project ${projectKey}:`, error);
      throw error;
    }
  }

  /**
   * Create Jira issue and link it to the specified epic
   * @param {Object} processedData - Processed transcript data
   * @param {string} epicKey - The epic key to link the issue to
   * @param {string} projectKey - Jira project key (defaults to ROIA)
   * @returns {Promise<Object>} Created Jira issue data
   */
  async createJiraIssueWithEpic(processedData, epicKey, projectKey = 'ROIA') {
    try {
      if (!processedData || !epicKey) {
        throw new Error("Processed data and epic key are required");
      }
      
      // Validate project key against allowed values
      const allowedProjectKeys = ['ROIA', 'PROPS'];
      if (!allowedProjectKeys.includes(projectKey)) {
        throw new Error(`Invalid project key. Allowed values: ${allowedProjectKeys.join(', ')}`);
      }
      
      const response = await fetch(`${API_BASE_URL}/jira/create-with-epic?project_key=${projectKey}&epic_key=${epicKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(processedData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error creating Jira issue with epic link in project ${projectKey}:`, error);
      throw error;
    }
  }

  /**
   * Get current user info from session or browser
   * @returns {Object} User information that can be used for context-aware matching
   */
  getCurrentUserInfo() {
    // In a real application, this would come from authentication
    // For now, we'll use dummy data or try to extract from browser
    const userInfo = {
      username: sessionStorage.getItem('username') || 'current_user',
      display_name: sessionStorage.getItem('display_name') || 'Current User',
      email: sessionStorage.getItem('email') || null,
      department: sessionStorage.getItem('department') || null
    };
    
    return userInfo;
  }

  // Confluence API Methods
  
  /**
   * Check the health of the Confluence connection
   * @returns {Promise<Object>} Health status information
   */
  async checkConfluenceHealth() {
    try {
      const response = await fetch(`${API_BASE_URL}/confluence/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error checking Confluence health:', error);
      throw error;
    }
  }
  
  /**
   * Get pages from a Confluence space
   * @param {string} spaceKey - The space key to retrieve pages from
   * @param {number} maxResults - Maximum number of pages to return
   * @returns {Promise<Array>} Array of Confluence pages
   */
  async getConfluencePages(spaceKey = 'ROIA', maxResults = 500) {
    try {
      const response = await fetch(`${API_BASE_URL}/confluence/pages?space_key=${spaceKey}&max_results=${maxResults}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching Confluence pages:', error);
      throw error;
    }
  }
  
  /**
   * Find Confluence pages that match the classified intent
   * @param {Object} classifiedIntent - The classified intent
   * @param {Object} userInfo - Optional user information
   * @param {string} spaceKey - Confluence space to search in
   * @param {number} maxResults - Maximum number of matching pages to return
   * @returns {Promise<Array>} Array of matching pages with match scores
   */
  async matchConfluencePages(classifiedIntent, userInfo = null, spaceKey = 'ROIA', maxResults = 3) {
    try {
      // Sanitize and format the classified intent similar to Jira integration
      const sanitizedIntent = {
        type: String(classifiedIntent.type || 'story').toLowerCase(),
        summary: String(classifiedIntent.summary || ''),
        description: String(classifiedIntent.description || 'No description provided'),
        acceptance_criteria: Array.isArray(classifiedIntent.acceptance_criteria) 
          ? classifiedIntent.acceptance_criteria 
          : [],
        priority: String(classifiedIntent.priority || 'medium').toLowerCase(),
        epic_keywords: Array.isArray(classifiedIntent.epic_keywords) 
          ? classifiedIntent.epic_keywords 
          : [],
        confidence: Number(classifiedIntent.confidence || 0.8)
      };
      
      const requestBody = {
        classified_intent: sanitizedIntent,
        space_key: spaceKey,
        max_results: maxResults
      };
      
      // Add user info if provided
      if (userInfo) {
        requestBody.user_info = {
          username: String(userInfo.username || 'current_user'),
          display_name: userInfo.display_name ? String(userInfo.display_name) : null,
          email: userInfo.email ? String(userInfo.email) : null,
          department: userInfo.department ? String(userInfo.department) : null
        };
      }
      
      const response = await fetch(`${API_BASE_URL}/confluence/match-pages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const errorData = await response.json();
          throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        } else {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP error! status: ${response.status}`);
        }
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error matching Confluence pages:', error);
      throw error;
    }
  }
  
  /**
   * Update a Confluence page with new content
   * @param {string} pageId - The ID of the page to update
   * @param {string} content - The content to add/update
   * @param {string} comment - Version comment
   * @param {boolean} append - Whether to append content or replace it
   * @returns {Promise<Object>} Update response with page URL
   */
  async updateConfluencePage(pageId, content, comment = 'Updated via AI Project Management Suite', append = true) {
    try {
      const requestBody = {
        page_id: pageId,
        content: content,
        comment: comment,
        append: append
      };
      
      const response = await fetch(`${API_BASE_URL}/confluence/update-page`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating Confluence page:', error);
      throw error;
    }
  }
  
  /**
   * Get a specific Confluence page by ID
   * @param {string} pageId - The ID of the page to retrieve
   * @returns {Promise<Object>} Page data
   */
  async getConfluencePage(pageId) {
    try {
      const response = await fetch(`${API_BASE_URL}/confluence/page/${pageId}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching Confluence page:', error);
      throw error;
    }
  }
}

const apiService = new ApiService();
export default apiService;
