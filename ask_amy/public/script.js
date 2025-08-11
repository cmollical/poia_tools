document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const loginScreen = document.getElementById('login-screen');
    const registerScreen = document.getElementById('register-screen');
    const app = document.getElementById('app');
    const registerLink = document.getElementById('register-link');
    const loginLink = document.getElementById('login-link');
    const logoutBtn = document.getElementById('logout-btn');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    const questionForm = document.getElementById('question-form');
    const questionInput = document.getElementById('question-input');
    const chatHistory = document.getElementById('chat-history');
    const loading = document.getElementById('loading');
    const fetchHistoryBtn = document.getElementById('fetch-history');
    const historyContainer = document.getElementById('history-container');
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');

    // Set default dates for history filters
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    startDateInput.value = formatDate(thirtyDaysAgo);
    endDateInput.value = formatDate(today);

    // Auth token storage
    let authToken = localStorage.getItem('amy_auth_token');

    // Check if user is logged in
    checkAuthStatus();

    // Event listeners
    registerLink.addEventListener('click', showRegisterScreen);
    loginLink.addEventListener('click', showLoginScreen);
    logoutBtn.addEventListener('click', handleLogout);
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    questionForm.addEventListener('submit', handleQuestion);
    fetchHistoryBtn.addEventListener('click', fetchChatHistory);

    // Functions
    function checkAuthStatus() {
        if (authToken) {
            showApp();
        } else {
            showLoginScreen();
        }
    }

    function showLoginScreen() {
        loginScreen.classList.remove('d-none');
        registerScreen.classList.add('d-none');
        app.classList.add('d-none');
        loginError.classList.add('d-none');
        loginForm.reset();
    }

    function showRegisterScreen() {
        loginScreen.classList.add('d-none');
        registerScreen.classList.remove('d-none');
        app.classList.add('d-none');
        registerError.classList.add('d-none');
        registerForm.reset();
    }

    function showApp() {
        loginScreen.classList.add('d-none');
        registerScreen.classList.add('d-none');
        app.classList.remove('d-none');
        fetchChatHistory();
    }

    async function handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: username, pass: password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                authToken = data.token;
                localStorage.setItem('amy_auth_token', authToken);
                showApp();
            } else {
                showError(loginError, data.error || 'Login failed');
            }
        } catch (error) {
            showError(loginError, 'Connection error');
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        const username = document.getElementById('reg-username').value;
        const password = document.getElementById('reg-password').value;
        
        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: username, pass: password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showLoginScreen();
                alert('Registration successful! You can now log in.');
            } else {
                showError(registerError, data.error || 'Registration failed');
            }
        } catch (error) {
            showError(registerError, 'Connection error');
        }
    }

    function handleLogout() {
        localStorage.removeItem('amy_auth_token');
        authToken = null;
        showLoginScreen();
    }

    async function handleQuestion(e) {
        e.preventDefault();
        const question = questionInput.value.trim();
        if (!question) return;
        
        // Add user question to chat
        addMessageToChat('user', question);
        questionInput.value = '';
        
        // Show loading spinner with bouncing dots
        loading.style.display = 'block';
        
        try {
            const response = await fetch('/ask', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ question })
            });
            
            if (response.status === 401) {
                // Token expired or invalid
                localStorage.removeItem('amy_auth_token');
                authToken = null;
                showLoginScreen();
                return;
            }
            
            const data = await response.json();
            
            if (response.ok) {
                console.log('Response data:', data);
                // Add bot response to chat
                if (data.error) {
                    addMessageToChat('bot', `Error: ${data.error}`, []);
                } else {
                    addMessageToChat('bot', data.answer, data.sources);
                }
            } else {
                addMessageToChat('bot', `Error: ${data.error || 'Unknown error'}`, []);
            }
        } catch (error) {
            console.error('Error during ask:', error);
            addMessageToChat('bot', 'Sorry, I encountered a connection error.', []);
        } finally {
            loading.style.display = 'none';
        }
    }

    function addMessageToChat(type, text, sources = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type === 'user' ? 'user-message' : 'bot-message'}`;
        
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        
        // Handle text content
        if (text && typeof text === 'string') {
            messageText.textContent = text;
        } else if (text) {
            messageText.textContent = JSON.stringify(text);
        } else {
            messageText.textContent = 'No response received';
        }
        
        messageDiv.appendChild(messageText);
        
        if (sources && Array.isArray(sources) && sources.length > 0) {
            const sourceList = document.createElement('div');
            sourceList.className = 'source-list';
            sourceList.innerHTML = '<strong>Sources:</strong> ';
            
            sources.forEach(source => {
                const sourceLink = document.createElement('a');
                sourceLink.className = 'source-link';
                sourceLink.target = '_blank';
                
                if (typeof source === 'string') {
                    // Handle string URLs (old format)
                    sourceLink.href = source;
                    const pageName = source.split('/').pop() || source;
                    sourceLink.textContent = pageName;
                } else if (source && source.url) {
                    // Handle object with url and title (new format)
                    sourceLink.href = source.url;
                    sourceLink.textContent = source.title || 'Source';
                }
                
                sourceList.appendChild(sourceLink);
                sourceList.appendChild(document.createTextNode(' '));
            });
            
            messageDiv.appendChild(sourceList);
        }
        
        chatHistory.appendChild(messageDiv);
        
        // Scroll to the bottom of the chat
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    async function fetchChatHistory() {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;
        
        if (!startDate || !endDate) return;
        
        try {
            const response = await fetch(`/history?start=${startDate}&end=${endDate}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            
            if (response.status === 401) {
                localStorage.removeItem('amy_auth_token');
                authToken = null;
                showLoginScreen();
                return;
            }
            
            const data = await response.json();
            
            if (response.ok) {
                displayChatHistory(data.rows);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    }

    function displayChatHistory(rows) {
        historyContainer.innerHTML = '';
        
        if (!rows || rows.length === 0) {
            historyContainer.innerHTML = '<p class="text-center">No conversations found for selected dates.</p>';
            return;
        }
        
        rows.forEach(row => {
            const historyItem = document.createElement('div');
            historyItem.className = 'card mb-3';
            
            const timestamp = new Date(row.ASKED_AT).toLocaleString();
            
            const cardBody = document.createElement('div');
            cardBody.className = 'card-body';
            
            const timeElement = document.createElement('small');
            timeElement.className = 'text-muted d-block mb-2';
            timeElement.textContent = timestamp;
            
            const questionElement = document.createElement('p');
            questionElement.className = 'fw-bold mb-1';
            questionElement.textContent = `Q: ${row.QUESTION}`;
            
            let responseContent = '';
            try {
                const parsedResponse = JSON.parse(row.RESPONSE);
                responseContent = parsedResponse.answer || 'No answer available';
            } catch (e) {
                responseContent = row.RESPONSE || 'No response available';
            }
            
            const responseElement = document.createElement('p');
            responseElement.className = 'mb-0';
            responseElement.textContent = `A: ${responseContent}`;
            
            cardBody.appendChild(timeElement);
            cardBody.appendChild(questionElement);
            cardBody.appendChild(responseElement);
            historyItem.appendChild(cardBody);
            
            historyContainer.appendChild(historyItem);
        });
    }

    function showError(element, message) {
        element.textContent = message;
        element.classList.remove('d-none');
    }

    function formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
});
