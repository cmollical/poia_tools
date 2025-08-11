// Utility functions
function getAuthHeader() {
  // Try to get token from both sessionStorage and localStorage
  const sessionToken = sessionStorage.getItem('jwt_token');
  const localToken = localStorage.getItem('token');
  
  // Use the first available token
  const token = sessionToken || localToken;
  
  // If we found a token in localStorage but not in sessionStorage, sync them
  if (!sessionToken && localToken) {
    sessionStorage.setItem('jwt_token', localToken);
    console.log('Synced token from localStorage to sessionStorage');
  }
  
  // If we found a token in sessionStorage but not in localStorage, sync them
  if (sessionToken && !localToken) {
    localStorage.setItem('token', sessionToken);
    console.log('Synced token from sessionStorage to localStorage');
  }
  
  // Debug token info
  console.log('Auth header token status:', {
    'sessionStorage jwt_token exists': !!sessionToken,
    'localStorage token exists': !!localToken,
    'using token': !!token
  });
  
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

async function fetchWithAuth(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...getAuthHeader()
    }
  });
}

// Document list management
async function loadExistingDocuments() {
  const fileList = document.getElementById('fileList');
  const loadingIndicator = document.getElementById('documentsLoading');
  
  try {
    const response = await fetchWithAuth('/files');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch documents: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.files && Array.isArray(data.files)) {
      fileList.innerHTML = '';
      
      if (data.files.length === 0) {
        fileList.innerHTML = '<li>No documents found</li>';
      } else {
        data.files.forEach(file => {
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="file-row">
              <span class="file-name" data-filename="${file}">${file}</span>
              <div class="file-actions">
                <button class="view-btn" data-filename="${file}">View Text</button>
                <button class="reprocess-btn" data-filename="${file}">Reprocess</button>
                <button class="remove-btn" data-filename="${file}">Remove</button>
              </div>
            </div>
            <div class="document-text-container" id="text-${file.replace(/[^a-zA-Z0-9]/g, '-')}" style="display:none;">
              <div class="document-text-loading">Loading...</div>
              <div class="document-text"></div>
            </div>
          `;
          fileList.appendChild(li);
        });
        
        // Add click handlers for buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
          btn.addEventListener('click', handleViewClick);
        });
        
        document.querySelectorAll('.reprocess-btn').forEach(btn => {
          btn.addEventListener('click', handleReprocessClick);
        });
        
        document.querySelectorAll('.remove-btn').forEach(btn => {
          btn.addEventListener('click', handleRemoveClick);
        });
      }
    }
  } catch (error) {
    console.error('Error loading documents:', error);
    fileList.innerHTML = `<li>Error loading documents: ${error.message}</li>`;
  } finally {
    loadingIndicator.classList.add('hidden');
  }
}

async function handleReprocessClick(e) {
  const filename = e.target.dataset.filename;
  const logNode = document.getElementById('log');
  logNode.textContent = `Reprocessing ${filename}...\n`;
  
  // Create a FormData with a fetch request for the existing file
  try {
    const response = await fetchWithAuth(`/admin/reprocess?filename=${encodeURIComponent(filename)}`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    
    // Stream the response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      logNode.textContent += decoder.decode(value);
      logNode.scrollTop = logNode.scrollHeight;
    }
    
    // Refresh document list
    loadExistingDocuments();
  } catch (error) {
    logNode.textContent += `\nError: ${error.message}`;
  }
}

async function handleViewClick(e) {
  const filename = e.target.dataset.filename;
  const sanitizedId = filename.replace(/[^a-zA-Z0-9]/g, '-');
  const textContainer = document.getElementById(`text-${sanitizedId}`);
  const documentTextElement = textContainer.querySelector('.document-text');
  const loadingElement = textContainer.querySelector('.document-text-loading');
  
  // Toggle visibility
  if (textContainer.style.display === 'none') {
    // Show container first
    textContainer.style.display = 'block';
    
    // Check if we already loaded the text
    if (!documentTextElement.textContent) {
      try {
        loadingElement.style.display = 'block';
        
        const response = await fetchWithAuth(`/admin/document-text?filename=${encodeURIComponent(filename)}`);
        
        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        
        let data;
        try {
          data = await response.json();
        } catch (jsonError) {
          throw new Error(`Failed to parse response: ${jsonError.message}`);
        }
        
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response format');
        }
        
        // Format and display the text
        const text = data.text || 'No text content available';
        console.log('Document text retrieved, length:', text.length);
        documentTextElement.innerHTML = formatDocumentText(text);
        e.target.textContent = 'Hide Text';
      } catch (error) {
        documentTextElement.textContent = `Error loading document text: ${error.message}`;
      } finally {
        loadingElement.style.display = 'none';
      }
    } else {
      // Already loaded, just update button text
      e.target.textContent = 'Hide Text';
    }
  } else {
    // Hide the text container
    textContainer.style.display = 'none';
    e.target.textContent = 'View Text';
  }
}

// Helper function to format document text for better readability
function formatDocumentText(text) {
  // Escape HTML to prevent XSS
  const escapeHtml = (str) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };
  
  // Format text for better display
  return escapeHtml(text)
    .replace(/\n/g, '<br>')
    .replace(/(\s{2,})/g, match => '&nbsp;'.repeat(match.length));
}


async function handleRemoveClick(e) {
  const filename = e.target.dataset.filename;
  const logNode = document.getElementById('log');
  
  // Confirm before deletion
  if (!confirm(`Are you sure you want to completely remove ${filename}? This action cannot be undone.`)) {
    return;
  }
  
  logNode.textContent = `Removing ${filename}...\n`;
  
  try {
    const response = await fetchWithAuth(`/admin/remove?filename=${encodeURIComponent(filename)}`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    
    // Stream the response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      logNode.textContent += decoder.decode(value);
      logNode.scrollTop = logNode.scrollHeight;
    }
    
    // Refresh document list
    loadExistingDocuments();
  } catch (error) {
    logNode.textContent += `\nError: ${error.message}`;
  }
}

// File upload handling
document.getElementById('uploader').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const fileInput = form.querySelector('input[type="file"]');
  const fileName = fileInput.files[0]?.name;
  
  if (!fileName) {
    alert('Please select a file to upload');
    return;
  }
  
  const fd = new FormData(form);
  const logNode = document.getElementById('log');
  const uploadStatus = document.getElementById('uploadStatus');
  
  logNode.textContent = '';
  uploadStatus.classList.remove('hidden');
  
  try {
    // Check if file already exists
    const checkResp = await fetchWithAuth('/files');
    const fileData = await checkResp.json();
    const existingFiles = fileData.files || [];
    const isReprocessing = existingFiles.includes(fileName);
    
    // Update log with status
    logNode.textContent = `${isReprocessing ? 'Reprocessing' : 'Adding new document'}: ${fileName}\n`;
    
    // Upload the file
    const resp = await fetchWithAuth('/admin/upload', {
      method: 'POST',
      body: fd
    });

    if (!resp.ok) {
      throw new Error(resp.statusText);
    }

    // Stream the response
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      logNode.textContent += decoder.decode(value);
      logNode.scrollTop = logNode.scrollHeight;
    }
    
    // Reset form and refresh document list
    form.reset();
    loadExistingDocuments();
  } catch (error) {
    logNode.textContent += `\nError: ${error.message}`;
  } finally {
    uploadStatus.classList.add('hidden');
  }
});

// --------- Admin Management ----------
async function loadAdminList() {
  const adminList = document.getElementById('adminList');
  const loadingIndicator = document.getElementById('adminsLoading');
  
  try {
    const response = await fetchWithAuth('/api/admins');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch admin list: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.admins && Array.isArray(data.admins)) {
      adminList.innerHTML = '';
      
      if (data.admins.length === 0) {
        adminList.innerHTML = '<li>No admins found</li>';
      } else {
        data.admins.forEach(admin => {
          const li = document.createElement('li');
          li.innerHTML = `
            <div class="file-row" style="background:#f0f5ff; margin:5px 0; padding:10px; border-radius:4px;">
              <span class="file-name">${admin}</span>
              <div class="file-actions">
                <button class="remove-admin-btn" data-username="${admin}" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:3px; cursor:pointer;">Remove</button>
              </div>
            </div>
          `;
          adminList.appendChild(li);
        });
        
        // Add click handlers for remove buttons
        document.querySelectorAll('.remove-admin-btn').forEach(btn => {
          btn.addEventListener('click', handleRemoveAdmin);
        });
      }
    }
  } catch (error) {
    console.error('Error loading admin list:', error);
    adminList.innerHTML = `<li>Error loading admin list: ${error.message}</li>`;
  } finally {
    loadingIndicator.style.display = 'none';
  }
}

async function handleAddAdmin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('newAdminUsername');
  const username = usernameInput.value.trim();
  
  if (!username) {
    alert('Please enter a username');
    return;
  }
  
  try {
    const response = await fetchWithAuth('/api/admins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, action: 'add' })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }
    
    // Clear the input
    usernameInput.value = '';
    
    // Reload admin list
    loadAdminList();
  } catch (error) {
    console.error('Error adding admin:', error);
    alert(`Failed to add admin: ${error.message}`);
  }
}

async function handleRemoveAdmin(e) {
  const username = e.target.dataset.username;
  
  // Confirm before removal
  if (!confirm(`Are you sure you want to remove ${username} from admins?`)) {
    return;
  }
  
  try {
    const response = await fetchWithAuth('/api/admins', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, action: 'remove' })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }
    
    // Reload admin list
    loadAdminList();
  } catch (error) {
    console.error('Error removing admin:', error);
    alert(`Failed to remove admin: ${error.message}`);
  }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  loadExistingDocuments();
  loadAdminList();
  
  // Add event listener for the admin form
  document.getElementById('addAdminForm').addEventListener('submit', handleAddAdmin);
});

