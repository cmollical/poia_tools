// --- START OF FILE login.js ---

document.addEventListener('DOMContentLoaded', () => {
    // Get Form Elements
    const usernameCheckForm = document.getElementById('usernameCheckForm');
    const passwordSetupForm = document.getElementById('passwordSetupForm');
    const passwordLoginForm = document.getElementById('passwordLoginForm');

    // Get Input Elements
    const loginUsernameInput = document.getElementById('loginUsername');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const loginPasswordInput = document.getElementById('loginPassword');

    // Get Display/Message Elements
    const setupUsernameSpan = document.getElementById('setupUsername');
    const loginUsernameDisplaySpan = document.getElementById('loginUsernameDisplay');
    const authMessageDiv = document.getElementById('authMessage');
    const loadingIndicator = document.getElementById('loadingIndicator');

    // Store username after successful check
    let verifiedUsername = null;

    // --- Helper Functions ---
    function showForm(formToShow) {
        usernameCheckForm.style.display = 'none';
        passwordSetupForm.style.display = 'none';
        passwordLoginForm.style.display = 'none';
        loadingIndicator.style.display = 'none'; // Hide loading when showing a form

        if (formToShow === 'check') usernameCheckForm.style.display = 'block';
        else if (formToShow === 'setup') passwordSetupForm.style.display = 'block';
        else if (formToShow === 'login') passwordLoginForm.style.display = 'block';
    }

    function showMessage(message, isError = true) {
        authMessageDiv.textContent = message;
        authMessageDiv.className = 'auth-message'; // Reset classes
        if (message) {
            authMessageDiv.classList.add(isError ? 'error' : 'success');
        }
    }

    function setLoading(isLoading) {
        loadingIndicator.style.display = isLoading ? 'block' : 'none';
        // Optionally disable form buttons while loading
        usernameCheckForm.querySelector('button').disabled = isLoading;
        passwordSetupForm.querySelector('button').disabled = isLoading;
        passwordLoginForm.querySelector('button').disabled = isLoading;
    }

    // --- Event Listeners ---

    // 1. Handle Username Check Submission
    usernameCheckForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showMessage(''); // Clear previous messages
        const username = loginUsernameInput.value.trim();

        if (!username) {
            showMessage('Please enter your username.');
            loginUsernameInput.focus();
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/auth/check-user-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username })
            });

            setLoading(false); // Hide loading indicator

            if (!response.ok) {
                 // Handle non-2xx responses generically first
                 const errorData = await response.json().catch(() => ({})); // Try to parse error JSON
                 console.error(`Server error ${response.status}:`, errorData);
                 showMessage(errorData.message || `Error checking user status (${response.status}).`);
                 return;
            }

            const result = await response.json();
            console.log('Check User Status Result:', result);

            verifiedUsername = result.username || username; // Store the username from response if available
            let userFirstName = result.firstName || verifiedUsername; // Store first name if available, fallback to username

            switch (result.status) {
                case 'INVALID':
                    showMessage('Username not found or not approved.');
                    loginUsernameInput.focus();
                    verifiedUsername = null; // Clear stored username
                    break;
                case 'INACTIVE':
                    showMessage('This account is currently inactive. Please contact an administrator.');
                    verifiedUsername = null; // Clear stored username
                    break;
                case 'NEEDS_SETUP':
                    setupUsernameSpan.textContent = userFirstName; // Display first name on setup form
                    showForm('setup');
                    newPasswordInput.focus();
                    break;
                case 'NEEDS_LOGIN':
                    loginUsernameDisplaySpan.textContent = userFirstName; // Display first name on login form
                    showForm('login');
                    loginPasswordInput.focus();
                    break;
                default:
                     showMessage('Received an unexpected status from the server.');
                     verifiedUsername = null; // Clear stored username
            }

        } catch (error) {
            console.error('Error during username check:', error);
            setLoading(false);
            showMessage('An network error occurred. Please try again.');
             verifiedUsername = null; // Clear stored username
        }
    });

    // 2. Handle Password Setup Submission
    passwordSetupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showMessage('');
        const newPassword = newPasswordInput.value; // No trim needed for password usually
        const confirmPassword = confirmPasswordInput.value;

        // Basic Validations
        if (!newPassword || !confirmPassword) {
            showMessage('Please enter and confirm your new password.');
            return;
        }
        if (newPassword !== confirmPassword) {
            showMessage('Passwords do not match.');
            confirmPasswordInput.focus();
            return;
        }
        if (newPassword.length < 8) { // Match backend validation if possible
            showMessage('Password must be at least 8 characters long.');
            newPasswordInput.focus();
            return;
        }
        if (!verifiedUsername) { // Should not happen if flow is correct, but safety check
             showMessage('Username not verified. Please start over.');
             showForm('check');
             return;
        }

        setLoading(true);

        try {
            const response = await fetch('/auth/setup-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: verifiedUsername, // Send the verified username
                    newPassword: newPassword,
                    confirmPassword: confirmPassword // Send confirmation for potential backend check
                })
            });

            const result = await response.json(); // Always try to parse JSON
            setLoading(false);

            if (response.ok && result.success) {
                // Success! Redirect to the main application page
                showMessage('Password set successfully! Redirecting...', false); // Show success briefly
                window.location.href = '/'; // Redirect to home
            } else {
                // Show error message from backend
                showMessage(result.message || `Password setup failed (${response.status}).`);
            }

        } catch (error) {
            console.error('Error during password setup:', error);
            setLoading(false);
            showMessage('An network error occurred during setup. Please try again.');
        }
    });

    // 3. Handle Password Login Submission
    passwordLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showMessage('');
        const password = loginPasswordInput.value;

        if (!password) {
            showMessage('Please enter your password.');
            loginPasswordInput.focus();
            return;
        }
         if (!verifiedUsername) { // Should not happen if flow is correct, but safety check
             showMessage('Username not verified. Please start over.');
             showForm('check');
             return;
         }

        setLoading(true);

        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: verifiedUsername, // Send the verified username
                    password: password
                })
            });

            const result = await response.json();
            setLoading(false);

            if (response.ok && result.success) {
                // Success! Redirect to the main application page
                showMessage('Login successful! Redirecting...', false);
                window.location.href = '/'; // Redirect to home
            } else {
                // Show error message (likely "Invalid username or password")
                showMessage(result.message || `Login failed (${response.status}).`);
                loginPasswordInput.value = ''; // Clear password field on failure
                loginPasswordInput.focus();
            }

        } catch (error) {
            console.error('Error during login:', error);
            setLoading(false);
            showMessage('An network error occurred during login. Please try again.');
        }
    });

    // --- Initial State ---
    showForm('check'); // Start with the username check form
    loginUsernameInput.focus();

});
// --- END OF FILE login.js ---