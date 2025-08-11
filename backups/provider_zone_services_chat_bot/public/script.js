document.addEventListener('DOMContentLoaded', () => {
    // Overlays and forms
    const overlay = document.getElementById('login-overlay');
    const loginBox = document.getElementById('login-box');
    const registerBox = document.getElementById('register-box');

    // Login elements
    const loginBtn = document.getElementById('login-btn');
    const loginUser = document.getElementById('login-user');
    const loginPass = document.getElementById('login-pass');
    const loginErr = document.getElementById('login-error');

    // Registration elements
    const registerBtn = document.getElementById('register-btn');
    const registerUser = document.getElementById('register-user');
    const registerPass = document.getElementById('register-pass');
    const registerErr = document.getElementById('register-error');
    const registerSuccess = document.getElementById('register-success');

    // Form switch links
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');

    // Main app elements
    const chatForm = document.getElementById('chat-form');
    const historyBtn = document.getElementById('history-btn');
    const questionInput = document.getElementById('question-input');
    const chatBox = document.getElementById('chat-box');

    // --- Helper Functions ---
    function showChat() { overlay.classList.add('hidden'); }
    function showLogin() {
        overlay.classList.remove('hidden');
        loginBox.classList.remove('hidden');
        registerBox.classList.add('hidden');
    }
    function showRegister() {
        overlay.classList.remove('hidden');
        loginBox.classList.add('hidden');
        registerBox.classList.remove('hidden');
    }

    function getAuthHeader() {
        const token = sessionStorage.getItem('jwt_token');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    // --- Initial State ---
    if (sessionStorage.getItem('jwt_token')) {
        loadFiles();
        showChat();
    } else {
        showLogin();
    }

    // --- Event Listeners ---
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        showRegister();
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showLogin();
    });

    loginBtn.addEventListener('click', async () => {
        const user = loginUser.value.trim();
        const pass = loginPass.value.trim();
        if (!user || !pass) {
            loginErr.textContent = 'Username and password are required.';
            loginErr.classList.remove('hidden');
            return;
        }

        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user, pass })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');

            sessionStorage.setItem('jwt_token', data.token);
            loginErr.classList.add('hidden');
            loadFiles();
            showChat();
        } catch (err) {
            loginErr.textContent = err.message;
            loginErr.classList.remove('hidden');
        }
    });

    registerBtn.addEventListener('click', async () => {
        const user = registerUser.value.trim();
        const pass = registerPass.value.trim();
        if (!user || !pass) {
            registerErr.textContent = 'Username and password are required.';
            registerErr.classList.remove('hidden');
            return;
        }

        try {
            const res = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user, pass })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration failed');

            registerErr.classList.add('hidden');
            registerSuccess.classList.remove('hidden');
            setTimeout(() => {
                registerSuccess.classList.add('hidden');
                showLogin();
            }, 2000);

        } catch (err) {
            registerSuccess.classList.add('hidden');
            registerErr.textContent = err.message;
            registerErr.classList.remove('hidden');
        }
    });

    historyBtn.addEventListener('click', fetchHistory);

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const question = questionInput.value.trim();
        if (!question) return;

        appendMessage(question, 'user');
        questionInput.value = '';

        const thinkingMessage = appendMessage('Thinking...', 'bot');

        try {
            const headers = {
                'Content-Type': 'application/json',
                ...getAuthHeader()
            };
            const response = await fetch('/ask', {
                method: 'POST',
                headers,
                body: JSON.stringify({ question }),
            });

            if(thinkingMessage.parentNode) chatBox.removeChild(thinkingMessage);

            if (!response.ok) {
                if(response.status === 401) {
                    sessionStorage.removeItem('jwt_token');
                    showLogin();
                }
                throw new Error('Network response was not ok.');
            }

            const data = await response.json();

            if (data.error) {
                appendMessage(`Error: ${data.error}`, 'bot');
            } else {
                let answerText = data.answer || 'No answer found.';
                if (data.sources && data.sources.length > 0) {
                    const sourcesHtml = `<div class="sources"><strong>Sources:</strong> ${data.sources.join(', ')}</div>`;
                    answerText += sourcesHtml;
                }
                appendMessage(answerText, 'bot', true);
            }
        } catch (error) {
            if(thinkingMessage.parentNode) chatBox.removeChild(thinkingMessage);
            appendMessage('Failed to get a response from the server.', 'bot');
            console.error('Fetch error:', error);
        }
    });

    // --- Data Fetching ---
    function loadFiles() {
        fetch('/files', { headers: getAuthHeader() })
            .then(res => {
                if(res.status === 401) {
                    sessionStorage.removeItem('jwt_token');
                    showLogin();
                    return;
                }
                return res.json();
            })
            .then(data => {
                if(!data) return;
                const list = document.getElementById('file-list');
                list.innerHTML = '';
                data.files.forEach(f => {
                    const div = document.createElement('div');
                    div.textContent = f;
                    list.appendChild(div);
                });
            }).catch(err => console.error('Error loading files:', err));
    }

    function fetchHistory() {
        const s = document.getElementById('start-date').value;
        const e = document.getElementById('end-date').value;
        if (!s || !e) return alert('Pick dates');

        fetch(`/history?start=${s}&end=${e}`, { headers: getAuthHeader() })
            .then(res => {
                if(res.status === 401) {
                    sessionStorage.removeItem('jwt_token');
                    showLogin();
                    return;
                }
                return res.json();
            })
            .then(data => {
                if(!data) return;
                const container = document.getElementById('history-results');
                container.innerHTML = '';
                if (data.rows && data.rows.length) {
                    data.rows.forEach(r => {
                        const div = document.createElement('div');
                        div.innerHTML = `<strong>${r.ASKED_AT}</strong><br><em>${r.QUESTION}</em><br>${r.RESPONSE}<hr>`;
                        container.appendChild(div);
                    });
                } else {
                    container.textContent = 'No results';
                }
            }).catch(err => alert('history error'));
    }

    // --- UI Helpers ---
    function appendMessage(text, sender, isHtml = false) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);
        if (isHtml) {
            messageElement.innerHTML = text;
        } else {
            messageElement.textContent = text;
        }
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
        return messageElement;
    }
});
