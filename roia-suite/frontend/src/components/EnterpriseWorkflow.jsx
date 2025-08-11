import React, { useState, useEffect } from 'react';
import ApiService from '../services/api';
import './EnterpriseWorkflow.css';

const EnterpriseWorkflow = ({ onComplete, onCancel }) => {
  // Step 1: Update Type Selection
  const [updateType, setUpdateType] = useState(''); // 'jira', 'confluence', 'both'
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedSpace, setSelectedSpace] = useState('');
  const [selectedParentPage, setSelectedParentPage] = useState('');
  
  // Available options from backend
  const [availableProjects, setAvailableProjects] = useState([]);
  const [availableSpaces, setAvailableSpaces] = useState([]);
  const [availablePages, setAvailablePages] = useState([]);
  const [availableEpics, setAvailableEpics] = useState([]);
  const [selectedEpic, setSelectedEpic] = useState('');
  const [username, setUsername] = useState(''); // Username for Jira assignee
  const [confluenceAuthor, setConfluenceAuthor] = useState(''); // Author for Confluence pages
  /* eslint-disable no-unused-vars */
  // Variables for Confluence page updating - used in JSX and processContent function
  const [selectedExistingPage, setSelectedExistingPage] = useState(''); 
  const [updateExistingPage, setUpdateExistingPage] = useState(false);
  /* eslint-enable no-unused-vars */
  
  // Step 2: Voice/Text Input
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [characterCount, setCharacterCount] = useState(0);
  // Token estimation has been removed as requested
  const [multipleUpdates, setMultipleUpdates] = useState(false);
  
  // Step 3: LLM Processing
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedContent, setGeneratedContent] = useState([]);
  
  // Step 4: Draft Review
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [editingItem, setEditingItem] = useState(null);
  
  // Step 5: Batch Confirmation & Results
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  
  // Epic creation modal
  const [showNewEpicModal, setShowNewEpicModal] = useState(false);
  const [newEpicName, setNewEpicName] = useState('');
  const [newEpicSummary, setNewEpicSummary] = useState('');
  const [newEpicDescription, setNewEpicDescription] = useState('');
  const [isCreatingEpic, setIsCreatingEpic] = useState(false);

  // Update character count
  useEffect(() => {
    setCharacterCount(inputText.length);
    // Token estimation removed as requested
  }, [inputText]);

  const loadInitialData = async () => {
    console.log('🔍 loadInitialData called');
    try {
      // Load available projects and spaces
      const [jiraHealth, confluenceHealth] = await Promise.all([
        ApiService.checkJiraHealth().catch(err => {
          console.error('Failed to check Jira health:', err);
          return { status: 'unhealthy' };
        }),
        ApiService.checkConfluenceHealth().catch(err => {
          console.error('Failed to check Confluence health:', err);
          return { connected: false, error: err.message };
        })
      ]);

      console.log('🔍 Health checks:', { jiraHealth, confluenceHealth });

      // Always set some default projects and spaces to ensure UI is functional
      // This is a fallback in case the health checks fail
      const defaultProjects = [
        { key: 'ROIA', name: 'ROIA' },
        { key: 'PROPS', name: 'PROPS' }
      ];
      
      const defaultSpaces = [
        { key: 'ROIA', name: 'ROIA' },
        { key: 'PROPS', name: 'PROPS' }
      ];

      // Set Jira projects
      if (jiraHealth && jiraHealth.status === 'healthy') {
        console.log('✅ Setting Jira projects');
        setAvailableProjects(defaultProjects);
      } else {
        console.log('⚠️ Using default Jira projects due to health check failure');
        setAvailableProjects(defaultProjects);
      }

      // Set Confluence spaces
      if (confluenceHealth && confluenceHealth.connected === true) {
        console.log('✅ Setting Confluence spaces');
        setAvailableSpaces(defaultSpaces);
      } else {
        console.log('⚠️ Using default Confluence spaces due to health check failure:', confluenceHealth);
        setAvailableSpaces(defaultSpaces);
      }
    } catch (err) {
      console.error('❌ loadInitialData error:', err);
      setError('Failed to load initial data');
      
      // Set defaults even if there's an error
      setAvailableProjects([{ key: 'ROIA', name: 'ROIA' }]);
      setAvailableSpaces([{ key: 'ROIA', name: 'ROIA' }]);
    }
  };

  // Load initial data when component mounts (only once)
  useEffect(() => {
    loadInitialData();
  }, []);

  const handleUpdateTypeChange = (type) => {
    setUpdateType(type);
    // Reset selections when type changes
    setSelectedProject('');
    setSelectedSpace('');
    setSelectedParentPage('');
  };

  const createNewEpic = async () => {
    if (!selectedProject || !newEpicName.trim() || !newEpicSummary.trim()) {
      return;
    }
    
    setIsCreatingEpic(true);
    setError('');
    
    try {
      console.log('🔍 Creating new epic for project:', selectedProject);
      const result = await ApiService.createJiraEpic(
        newEpicName,
        newEpicSummary,
        newEpicDescription,
        selectedProject
      );
      
      console.log('✅ Created new epic:', result);
      
      // Add the new epic to the list and select it
      const newEpic = {
        id: result.epic_id,
        key: result.epic_key,
        name: newEpicName,
        summary: newEpicSummary
      };
      
      setAvailableEpics([...availableEpics, newEpic]);
      setSelectedEpic(result.epic_id);
      
      // Close the modal and reset the form
      setShowNewEpicModal(false);
      setNewEpicName('');
      setNewEpicSummary('');
      setNewEpicDescription('');
      
    } catch (err) {
      console.error('❌ Failed to create epic:', err);
      setError(`Failed to create epic: ${err.message}`);
    } finally {
      setIsCreatingEpic(false);
    }
  };

  const handleProjectChange = async (projectKey) => {
    setSelectedProject(projectKey);
    setSelectedEpic('');
    // Load epics for the selected project
    if (projectKey) {
      try {
        console.log('🔍 Loading epics for project:', projectKey);
        const epics = await ApiService.getJiraEpics(projectKey);
        console.log('✅ Loaded epics:', epics);
        setAvailableEpics(epics);
      } catch (err) {
        console.error('❌ Failed to load epics for project:', projectKey, err);
        setAvailableEpics([]);
      }
    } else {
      setAvailableEpics([]);
    }
  };

  const handleSpaceChange = async (spaceKey) => {
    console.log('🔍 handleSpaceChange called with space:', spaceKey);
    setSelectedSpace(spaceKey);
    // Reset selected parent page
    setSelectedParentPage('');
    
    // Load pages for the selected space
    if (spaceKey) {
      try {
        console.log('🔍 Fetching pages for space:', spaceKey);
        // Use the increased limit of 500 pages
        const pages = await ApiService.getConfluencePages(spaceKey, 500);
        console.log('✅ Received pages:', pages);
        setAvailablePages(pages);
      } catch (err) {
        console.error('❌ Failed to load pages for space:', spaceKey, err);
        setAvailablePages([]);
      }
    } else {
      setAvailablePages([]);
    }
  };
  
  // Speech recognition implementation
  const startRecording = () => {
    // If already recording, stop it
    if (isRecording && window.currentRecognition) {
      stopRecording();
      return;
    }
    
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
      return;
    }
    
    setIsRecording(true);
    
    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    // Configure recognition
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    // Handle results
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript + ' ';
        }
      }
      
      if (transcript) {
        // Append to existing text instead of replacing
        setInputText(prevText => prevText + ' ' + transcript.trim());
      }
    };
    
    // Handle end of recording
    recognition.onend = () => {
      setIsRecording(false);
      // Clear the current recognition instance
      window.currentRecognition = null;
    };
    
    // Handle errors
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsRecording(false);
      window.currentRecognition = null;
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access to use voice input.');
      }
    };
    
    // Start recording
    recognition.start();
    
    // Store recognition instance for stopping later
    window.currentRecognition = recognition;
  };
  
  // Function to stop recording
  const stopRecording = () => {
    if (window.currentRecognition) {
      window.currentRecognition.stop();
      // onend handler will set isRecording to false
    }
  };

  // This is intentionally empty to remove the duplicate function

  const processContent = async () => {
    if (!inputText.trim()) {
      setError('Please enter some content to process');
      return;
    }

    setIsProcessing(true);
    setError('');
    let processedContent = [];

    try {
      // Process for Jira if selected
      if (updateType === 'jira' || updateType === 'both') {
        try {
          // Process for Jira with enforced schema
          const jiraContent = await ApiService.processTranscript({
            transcript: inputText,
            mode: 'jira',
            multipleIssues: multipleUpdates,
            projectKey: selectedProject
          });
          
          if (jiraContent.success) {
            // Handle multiple issues if available
            if (multipleUpdates && Array.isArray(jiraContent.split_intents) && jiraContent.split_intents.length > 0) {
              console.log('🔍 Processing multiple Jira issues:', jiraContent.split_intents.length);
              
              // Add each split intent as a separate item
              jiraContent.split_intents.forEach((intent, index) => {
                processedContent.push({
                  type: 'jira',
                  id: `jira-${Date.now()}-${index}`,
                  title: intent.summary || `Issue ${index + 1}`,
                  content: intent,
                  projectKey: selectedProject,
                  epicKey: selectedEpic || null
                });
              });
            } 
            // Fall back to single issue if no splits or splitting not enabled
            else if (jiraContent.classified_intent) {
              processedContent.push({
                type: 'jira',
                id: `jira-${Date.now()}`,
                title: jiraContent.classified_intent.summary,
                content: jiraContent.classified_intent,
                projectKey: selectedProject,
                epicKey: selectedEpic || null
              });
            }
          }
        } catch (jiraError) {
          console.error('Error processing Jira content:', jiraError);
          // Continue processing Confluence if selected
        }
      }

      // Process for Confluence if selected
      if (updateType === 'confluence' || updateType === 'both') {
        try {
          // Process for Confluence with enforced schema
          const confluenceContent = await ApiService.processTranscript({
            transcript: inputText,
            mode: 'confluence',
            multiplePages: multipleUpdates,
            spaceKey: selectedSpace
          });
          
          console.log('🔍 Confluence content response:', confluenceContent);
          
          // Use the classified_intent for Confluence content as well
          // The backend uses the same structure for both Jira and Confluence
          if (confluenceContent.success && confluenceContent.classified_intent) {
            // For now, we don't have multiple pages support in the backend yet
            // So we'll create a single Confluence page
            const confluenceData = {
              title: confluenceContent.classified_intent.summary || 'Generated Page Title',
              body: confluenceContent.classified_intent.description || inputText,
              sections: confluenceContent.classified_intent.acceptance_criteria || ['Introduction', 'Details']
            };
            
            processedContent.push({
              type: 'confluence',
              id: `confluence-${Date.now()}`,
              title: confluenceData.title,
              content: confluenceData,
              spaceKey: selectedSpace,
              parentPageId: updateExistingPage ? null : selectedParentPage,
              updateExistingPage: updateExistingPage,
              existingPageId: updateExistingPage ? selectedExistingPage : null
            });
            
            console.log('✅ Created Confluence content item:', confluenceData.title);
          } else {
            // Fallback if processing fails
            processedContent.push({
              type: 'confluence',
              id: `confluence-${Date.now()}`,
              title: 'Generated Page Title',
              content: {
                title: 'Generated Page Title',
                sections: ['Section 1', 'Section 2'],
                body: inputText
              },
              spaceKey: selectedSpace,
              parentPageId: updateExistingPage ? null : selectedParentPage,
              updateExistingPage: updateExistingPage,
              existingPageId: updateExistingPage ? selectedExistingPage : null
            });
          }
        } catch (confluenceError) {
          console.error('Error processing Confluence content:', confluenceError);
          // Continue with what we have
        }
      }

      // Update UI with processed content
      setGeneratedContent(processedContent);
      
      // Auto-expand all items for review
      const allIds = new Set(processedContent.map(item => item.id));
      setExpandedItems(allIds);

    } catch (err) {
      setError(`Processing failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleItemExpansion = (itemId) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const startEditingItem = (itemId) => {
    setEditingItem(itemId);
  };

  const saveItemEdit = (itemId, updatedContent) => {
    setGeneratedContent(prev => prev.map(item => 
      item.id === itemId ? { ...item, ...updatedContent } : item
    ));
    setEditingItem(null);
  };

  const addSplit = (afterItemId) => {
    const afterIndex = generatedContent.findIndex(item => item.id === afterItemId);
    const newItem = {
      type: generatedContent[afterIndex].type,
      id: `${generatedContent[afterIndex].type}-${Date.now()}`,
      title: 'New Split Item',
      content: generatedContent[afterIndex].content,
      projectKey: generatedContent[afterIndex].projectKey,
      spaceKey: generatedContent[afterIndex].spaceKey
    };
    
    const newContent = [...generatedContent];
    newContent.splice(afterIndex + 1, 0, newItem);
    setGeneratedContent(newContent);
  };

  const mergeWithPrevious = (itemId) => {
    const itemIndex = generatedContent.findIndex(item => item.id === itemId);
    if (itemIndex > 0) {
      const newContent = [...generatedContent];
      const currentItem = newContent[itemIndex];
      const previousItem = newContent[itemIndex - 1];
      
      // Merge content
      previousItem.title += ` & ${currentItem.title}`;
      // Merge logic would depend on content structure
      
      newContent.splice(itemIndex, 1);
      setGeneratedContent(newContent);
    }
  };

  const proceedToConfirmation = () => {
    if (generatedContent.length === 0) {
      setError('No content to create');
      return;
    }
    setShowConfirmation(true);
  };

  const executeCreation = async () => {
    setIsExecuting(true);
    setError('');
    
    try {
      const creationResults = [];
      
      for (const item of generatedContent) {
        if (item.type === 'jira') {
          console.log('🔍 Creating Jira issue with epic key:', item.epicKey);
          
          // Ensure we're only creating stories, not bugs, tasks, or epics
          const contentCopy = { ...item.content };
          contentCopy.type = 'story'; // Force type to be 'story'
          
          // Add assignee if username is provided
          if (username && username.trim()) {
            contentCopy.assignee = username.trim();
            console.log('🔍 Setting assignee to:', username.trim());
          }
          
          const result = await ApiService.createJiraIssueFromIntent(
            { classified_intent: contentCopy },
            item.projectKey,
            item.epicKey
          );
          creationResults.push({
            type: 'jira',
            title: item.title,
            key: result.issue_key,
            url: result.issue_url,
            success: true
          });
        } else if (item.type === 'confluence') {
          try {
            // Add author information if provided
            let pageContent = item.content.body;
            if (confluenceAuthor && confluenceAuthor.trim()) {
              // Add author information to the content
              pageContent = `<p><strong>Author:</strong> ${confluenceAuthor.trim()}</p>\n${pageContent}`;
              console.log('🔍 Setting Confluence page author to:', confluenceAuthor.trim());
            }
            
            let result;
            
            // Check if we're updating an existing page or creating a new one
            if (item.updateExistingPage && item.existingPageId) {
              console.log('🔍 Updating existing Confluence page:', item.existingPageId);
              result = await ApiService.updateConfluencePage(
                item.existingPageId,
                pageContent,
                `Updated via AI Project Management Suite by ${confluenceAuthor || 'user'}`,
                true // append = true
              );
            } else {
              // Create a new Confluence page
              console.log('🔍 Creating new Confluence page in space:', item.spaceKey);
              result = await ApiService.createConfluencePage(
                {
                  title: item.title,
                  content: pageContent
                },
                item.spaceKey,
                item.parentPageId || null
              );
            }
            
            creationResults.push({
              type: 'confluence',
              title: item.title,
              key: result.page_id,
              url: result.page_url,
              success: true
            });
          } catch (error) {
            console.error('Error creating Confluence page:', error);
            creationResults.push({
              type: 'confluence',
              title: item.title,
              key: null,
              url: null,
              success: false,
              error: error.message
            });
          }
        }
      }
      
      setResults(creationResults);
      onComplete(creationResults);
      
    } catch (err) {
      setError(`Creation failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const createSimilarUpdate = () => {
    // Reset to input step but keep selections
    setGeneratedContent([]);
    setResults([]);
    setShowConfirmation(false);
    setInputText('');
    setError('');
  };

  // Render main workflow
  return (
    <div className="enterprise-workflow">
      <div className="workflow-header">
        <h1>🚀 Create Project Updates</h1>
        <p>Enterprise-grade workflow for Jira issues and Confluence pages</p>
      </div>

      {/* Step 1: Update Type Selection */}
      {!updateType && (
        <div className="step-panel">
          <h2>1. Select Update Type</h2>
          <div className="update-type-selector">
            <label className="radio-option">
              <input 
                type="radio" 
                name="updateType" 
                value="jira"
                onChange={(e) => handleUpdateTypeChange(e.target.value)}
              />
              <span className="radio-label">
                <strong>Jira Issues</strong>
                <small>Create structured issues for project tracking</small>
              </span>
            </label>
            
            <label className="radio-option">
              <input 
                type="radio" 
                name="updateType" 
                value="confluence"
                onChange={(e) => handleUpdateTypeChange(e.target.value)}
              />
              <span className="radio-label">
                <strong>Confluence Pages</strong>
                <small>Create documentation and knowledge base content</small>
              </span>
            </label>
            
            <label className="radio-option">
              <input 
                type="radio" 
                name="updateType" 
                value="both"
                onChange={(e) => handleUpdateTypeChange(e.target.value)}
              />
              <span className="radio-label">
                <strong>Both</strong>
                <small>Create issues and pages simultaneously</small>
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Step 2: Conditional Controls */}
      {updateType && !inputText && (
        <div className="step-panel">
          <div className="step-header">
            <button 
              onClick={() => setUpdateType('')}
              className="back-button"
            >
              ← Back to Update Type
            </button>
            <h2>2. Select Destination</h2>
          </div>
          <div className="destination-controls">
            {(updateType === 'jira' || updateType === 'both') && (
              <div className="control-group">
                <label>Jira Project</label>
                <select 
                  value={selectedProject} 
                  onChange={(e) => handleProjectChange(e.target.value)}
                  className="searchable-select"
                >
                  <option value="">Select project...</option>
                  {availableProjects.map(project => (
                    <option key={project.key} value={project.key}>
                      {project.key} - {project.name}
                    </option>
                  ))}
                </select>
                
                {selectedProject && (
                  <div>
                    <div className="sub-control">
                      <label>Username (will be assigned to you)</label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your Jira username"
                        className="text-input"
                      />
                      <small className="input-help">This will be set as the assignee for the created issues</small>
                    </div>
                    
                    <div className="sub-control">
                      <label>Epic (optional)</label>
                      <select 
                        value={selectedEpic} 
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === 'create_new') {
                            // Show the create epic modal
                            setShowNewEpicModal(true);
                          } else {
                            setSelectedEpic(value);
                          }
                        }}
                        className="searchable-select"
                      >
                        <option value="">No epic (create at root level)</option>
                      <option value="create_new">➕ Create new epic...</option>
                      {availableEpics.length > 0 && (
                        [...availableEpics]
                          .sort((a, b) => {
                            // Safely handle missing properties by using fallbacks
                            const nameA = a.epic_name || a.name || a.epic_summary || a.summary || '';
                            const nameB = b.epic_name || b.name || b.epic_summary || b.summary || '';
                            return nameA.localeCompare(nameB);
                          })
                          .map((epic, index) => {
                            // Extract properties from API response format
                            const id = epic.epic_key || epic.id || `epic-${index}`;
                            const key = epic.epic_key || epic.key || 'Unknown';
                            const name = epic.epic_name || epic.name || epic.epic_summary || 'Untitled Epic';
                            // Remove unused summary variable to fix ESLint warning
                            
                            // Ensure unique key by combining id with index
                            const uniqueKey = `${id}-${index}`;
                            
                            return (
                              <option key={uniqueKey} value={id}>
                                {key} | {name}
                              </option>
                            );
                          })
                      )}
                    </select>
                  </div>
                  </div>
                )}
              </div>
            )}

            {(updateType === 'confluence' || updateType === 'both') && (
              <div className="control-group">
                <label>Confluence Space</label>
                <select 
                  value={selectedSpace} 
                  onChange={(e) => handleSpaceChange(e.target.value)}
                  className="searchable-select"
                >
                  <option value="">Select space...</option>
                  {availableSpaces.map(space => (
                    <option key={space.key} value={space.key}>
                      {space.key} - {space.name}
                    </option>
                  ))}
                </select>
                
                {selectedSpace && (
                  <div>
                    <div className="sub-control">
                      <label>Author (will be credited in the page)</label>
                      <input
                        type="text"
                        value={confluenceAuthor}
                        onChange={(e) => setConfluenceAuthor(e.target.value)}
                        placeholder="Enter your name"
                        className="text-input"
                      />
                      <small className="input-help">This will be shown as the page author</small>
                    </div>
                    
                    {availablePages.length > 0 && (
                      <>
                        <div className="sub-control">
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={updateExistingPage}
                              onChange={(e) => {
                                setUpdateExistingPage(e.target.checked);
                                if (!e.target.checked) {
                                  setSelectedExistingPage('');
                                }
                              }}
                            />
                            <span>Update existing page</span>
                            <small>Add content to an existing page instead of creating a new one</small>
                          </label>
                        </div>
                        
                        {updateExistingPage ? (
                          <div className="sub-control">
                            <label>Select Page to Update</label>
                            <select 
                              value={selectedExistingPage} 
                              onChange={(e) => setSelectedExistingPage(e.target.value)}
                              className="searchable-select"
                            >
                              <option value="">Select a page to update...</option>
                              {[...availablePages]
                                .sort((a, b) => a.page_title.localeCompare(b.page_title))
                                .map(page => (
                                  <option key={page.page_id} value={page.page_id}>
                                    {page.page_title}
                                  </option>
                                ))}
                            </select>
                          </div>
                        ) : (
                          <div className="sub-control">
                            <label>Parent Page (optional)</label>
                            <select 
                              value={selectedParentPage} 
                              onChange={(e) => setSelectedParentPage(e.target.value)}
                              className="searchable-select"
                            >
                              <option value="">No parent (root level)</option>
                              {[...availablePages]
                                .sort((a, b) => a.page_title.localeCompare(b.page_title))
                                .map(page => (
                                  <option key={page.page_id} value={page.page_id}>
                                    {page.page_title}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="helper-text">
            <p>
              <strong>Issues vs Pages:</strong> Issues track actionable work items with status, 
              priority, and assignments. Pages capture knowledge, documentation, and collaborative content.
            </p>
          </div>
          
          <button 
            onClick={() => setInputText(' ')} // Trigger input step
            disabled={
              (updateType === 'jira' && !selectedProject) ||
              (updateType === 'confluence' && !selectedSpace) ||
              (updateType === 'both' && (!selectedProject || !selectedSpace))
            }
            className="btn-continue"
          >
            Continue to Input →
          </button>
        </div>
      )}

      {/* Step 3: Voice/Text Input */}
      {updateType && inputText && !showConfirmation && results.length === 0 && (
        <div className="step-panel">
          <div className="step-header">
            <button 
              onClick={() => {
                setInputText('');
                setGeneratedContent([]);
                setError('');
              }}
              className="back-button"
            >
              ← Back to Destination
            </button>
            <h2>3. Input Content</h2>
          </div>
          <div className="input-panel">
            <div className="input-controls">
              <div className="voice-text-toggle">
                <button 
                  onClick={startRecording}
                  className={`btn-voice ${isRecording ? 'recording' : ''}`}
                >
                  {isRecording ? '⏹️ Stop Recording' : '🎤 Voice Input'}
                </button>
              </div>
              
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Describe what you want to create..."
                className="content-textarea"
                rows={8}
              />
              
              <div className="input-stats">
                <span className="char-count">
                  {characterCount} characters
                </span>
              </div>
              
              <div className="advanced-options">
                <label className="toggle-option">
                  <input
                    type="checkbox"
                    checked={multipleUpdates}
                    onChange={(e) => setMultipleUpdates(e.target.checked)}
                  />
                  <span>Split into multiple {updateType === 'jira' ? 'issues' : updateType === 'confluence' ? 'pages' : 'items'}</span>
                  <small>AI will look for logical breakpoints to create separate items</small>
                </label>
              </div>
            </div>
            
            <button
              onClick={processContent}
              disabled={!inputText.trim() || isProcessing}
              className="btn-process"
            >
              {isProcessing ? '⏳ Processing...' : '🧠 Generate Content'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Draft Review */}
      {generatedContent.length > 0 && !showConfirmation && results.length === 0 && (
        <div className="step-panel">
          <div className="step-header">
            <button 
              onClick={() => {
                setGeneratedContent([]);
                setError('');
              }}
              className="back-button"
            >
              ← Back to Input
            </button>
            <h2>4. Review & Edit Drafts</h2>
          </div>
          <div className="draft-accordion">
            {generatedContent.map((item, index) => (
              <div key={item.id} className="accordion-item">
                <div 
                  className="accordion-header"
                  onClick={() => toggleItemExpansion(item.id)}
                >
                  <span className="item-type-badge">
                    {item.type === 'jira' ? '🎫' : '📄'} {item.type.toUpperCase()}
                  </span>
                  <span className="item-title">{item.title}</span>
                  <span className="expand-icon">
                    {expandedItems.has(item.id) ? '▼' : '▶'}
                  </span>
                </div>
                
                {expandedItems.has(item.id) && (
                  <div className="accordion-content">
                    {editingItem === item.id ? (
                      <div className="edit-form">
                        <input
                          value={item.title}
                          onChange={(e) => saveItemEdit(item.id, { title: e.target.value })}
                          className="edit-title"
                        />
                        {item.type === 'jira' && (
                          <>
                            <textarea
                              value={item.content.description || ''}
                              onChange={(e) => saveItemEdit(item.id, { 
                                content: { ...item.content, description: e.target.value }
                              })}
                              className="edit-description"
                              rows={4}
                            />
                            <select
                              value={item.content.priority || 'Medium'}
                              onChange={(e) => saveItemEdit(item.id, {
                                content: { ...item.content, priority: e.target.value }
                              })}
                              className="edit-priority"
                            >
                              <option value="Low">Low Priority</option>
                              <option value="Medium">Medium Priority</option>
                              <option value="High">High Priority</option>
                              <option value="Critical">Critical Priority</option>
                            </select>
                          </>
                        )}
                        <div className="edit-actions">
                          <button onClick={() => setEditingItem(null)} className="btn-save">
                            ✓ Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="content-preview">
                        <div className="content-details">
                          {item.type === 'jira' ? (
                            <>
                              <p><strong>Summary:</strong> {item.content.summary}</p>
                              <p><strong>Description:</strong> {item.content.description}</p>
                              <p><strong>Priority:</strong> {item.content.priority}</p>
                              <p><strong>Type:</strong> {item.content.type}</p>
                            </>
                          ) : (
                            <>
                              <p><strong>Title:</strong> {item.content.title}</p>
                              <p><strong>Sections:</strong> {item.content.sections?.join(', ')}</p>
                              <div><strong>Body:</strong> <div className="body-preview">{item.content.body}</div></div>
                            </>
                          )}
                        </div>
                        
                        <div className="content-actions">
                          <button 
                            onClick={() => startEditingItem(item.id)}
                            className="btn-edit"
                          >
                            ✏️ Edit
                          </button>
                          <button 
                            onClick={() => addSplit(item.id)}
                            className="btn-split"
                          >
                            ➕ Add Split
                          </button>
                          {index > 0 && (
                            <button 
                              onClick={() => mergeWithPrevious(item.id)}
                              className="btn-merge"
                            >
                              🔗 Merge with Previous
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="review-actions">
            <button onClick={() => setGeneratedContent([])} className="btn-back">
              ← Back to Input
            </button>
            <button onClick={proceedToConfirmation} className="btn-continue">
              Continue to Confirmation →
            </button>
          </div>
        </div>
      )}

      {/* Epic Creation Modal */}
      {showNewEpicModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Create New Epic</h3>
            <div className="modal-form">
              <div className="form-group">
                <label>Epic Name</label>
                <input 
                  type="text" 
                  value={newEpicName}
                  onChange={(e) => setNewEpicName(e.target.value)}
                  placeholder="Enter epic name"
                  className="modal-input"
                />
              </div>
              <div className="form-group">
                <label>Summary</label>
                <input 
                  type="text" 
                  value={newEpicSummary}
                  onChange={(e) => setNewEpicSummary(e.target.value)}
                  placeholder="Enter epic summary"
                  className="modal-input"
                />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea 
                  value={newEpicDescription}
                  onChange={(e) => setNewEpicDescription(e.target.value)}
                  placeholder="Enter epic description"
                  className="modal-textarea"
                  rows={4}
                />
              </div>
              <div className="modal-actions">
                <button 
                  onClick={() => {
                    setShowNewEpicModal(false);
                    setNewEpicName('');
                    setNewEpicSummary('');
                    setNewEpicDescription('');
                  }}
                  className="btn-cancel"
                >
                  Cancel
                </button>
                <button 
                  onClick={createNewEpic}
                  disabled={!newEpicName.trim() || !newEpicSummary.trim() || isCreatingEpic}
                  className="btn-create"
                >
                  {isCreatingEpic ? '⏳ Creating...' : 'Create Epic'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Batch Confirmation */}
      {showConfirmation && results.length === 0 && (
        <div className="step-panel">
          <div className="step-header">
            <button 
              onClick={() => setShowConfirmation(false)}
              className="back-button"
            >
              ← Back to Review
            </button>
            <h2>5. Confirm Creation</h2>
          </div>
          <div className="confirmation-summary">
            <div className="summary-stats">
              <h3>📊 Creation Summary</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-number">
                    {generatedContent.filter(item => item.type === 'jira').length}
                  </span>
                  <span className="stat-label">Jira Issues</span>
                </div>
                <div className="stat-item">
                  <span className="stat-number">
                    {generatedContent.filter(item => item.type === 'confluence').length}
                  </span>
                  <span className="stat-label">Confluence Pages</span>
                </div>

              </div>
            </div>
            
            <div className="warnings">
              {generatedContent.length > 5 && (
                <div className="warning-item">
                  ⚠️ Creating {generatedContent.length} items simultaneously. This may take several minutes.
                </div>
              )}

            </div>
            
            <div className="final-review">
              <h4>Items to be created:</h4>
              <ul className="creation-list">
                {generatedContent.map(item => (
                  <li key={item.id} className="creation-item">
                    <span className="item-badge">
                      {item.type === 'jira' ? '🎫' : '📄'}
                    </span>
                    <span className="item-details">
                      <strong>{item.title}</strong>
                      <small>
                        {item.type === 'jira' ? `Project: ${item.projectKey}` : `Space: ${item.spaceKey}`}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="confirmation-actions">
            <button onClick={() => setShowConfirmation(false)} className="btn-back">
              ← Back to Review
            </button>
            <button 
              onClick={executeCreation}
              disabled={isExecuting}
              className="btn-execute"
            >
              {isExecuting ? '⏳ Creating...' : '🚀 Create All Items'}
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Results */}
      {results.length > 0 && (
        <div className="step-panel">
          <div className="step-header">
            <h2>6. Creation Results</h2>
          </div>
          <div className="results-table">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Key/ID</th>
                  <th>Link</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr key={index} className={result.success ? 'success' : 'error'}>
                    <td>
                      <span className="type-badge">
                        {result.type === 'jira' ? '🎫 Jira' : '📄 Confluence'}
                      </span>
                    </td>
                    <td>{result.title}</td>
                    <td className="result-key">{result.key}</td>
                    <td>
                      <a href={result.url} target="_blank" rel="noopener noreferrer" className="result-link">
                        View →
                      </a>
                    </td>
                    <td>
                      <span className={`status-badge ${result.success ? 'success' : 'error'}`}>
                        {result.success ? '✓ Created' : '✗ Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="workflow-completion">
            <div className="completion-actions">
              <button onClick={createSimilarUpdate} className="btn-similar">
                🔄 Create Similar Update
              </button>
              <button onClick={onCancel} className="btn-done">
                ✓ Done
              </button>
            </div>
          </div>
        </div>
      )}
      
      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default EnterpriseWorkflow;
