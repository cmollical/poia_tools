// --- START OF FILE authController.js ---
// Purpose: Handles the business logic for authentication routes.

const bcrypt = require('bcrypt');
const dbAuth = require('./dbAuth'); // Import database functions

const SALT_ROUNDS = 10; // Standard salt rounds for bcrypt hashing

// --- Handler Functions ---

/**
 * Checks the status of a user based on username.
 * Determines if the user is invalid, inactive, needs password setup, or needs to log in.
 */
async function handleCheckUserStatus(req, res) {
    const { username } = req.body;
    console.log(`[AuthController.checkUserStatus] Received check for username: ${username}`);

    if (!username || typeof username !== 'string' || username.trim() === '') {
        return res.status(400).json({ status: 'ERROR', message: 'Username is required.' });
    }

    const cleanedUsername = username.trim();

    try {
        const user = await dbAuth.getUserByUsername(cleanedUsername);

        if (!user) {
            // User not found in the database
            console.log(`[AuthController.checkUserStatus] User not found: ${cleanedUsername}`);
            return res.status(200).json({ status: 'INVALID' }); // Use 200 OK but indicate status in body
        }

        if (!user.IS_ACTIVE) {
            // User found but is marked as inactive
            console.log(`[AuthController.checkUserStatus] User inactive: ${user.USERNAME}`);
            return res.status(200).json({ status: 'INACTIVE' });
        }

        if (user.PASSWORD_HASH === null || user.PASSWORD_HASH === '') {
            // User found, is active, but has no password set
            console.log(`[AuthController.checkUserStatus] User needs setup: ${user.USERNAME}`);
            return res.status(200).json({ 
                status: 'NEEDS_SETUP', 
                username: user.USERNAME,
                firstName: user.FIRST_NAME || user.USERNAME
            }); 
        }

        // User found, is active, and has a password hash set
        console.log(`[AuthController.checkUserStatus] User needs login: ${user.USERNAME}`);
        return res.status(200).json({ 
            status: 'NEEDS_LOGIN', 
            username: user.USERNAME,
            firstName: user.FIRST_NAME || user.USERNAME
        });

    } catch (error) {
        console.error(`[AuthController.checkUserStatus] Error checking user ${cleanedUsername}:`, error);
        return res.status(500).json({ status: 'ERROR', message: 'Internal server error checking user status.' });
    }
}

/**
 * Handles the initial password setup for a new user.
 */
async function handleSetupPassword(req, res) {
    const { username, newPassword, confirmPassword } = req.body;
    console.log(`[AuthController.setupPassword] Received setup request for username: ${username}`);

    // --- Basic Validations ---
    if (!username || !newPassword || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'Username, new password, and confirmation are required.' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    // --- Basic Password Complexity (Example: Minimum length) ---
    if (newPassword.length < 8) { // Adjust complexity rules as needed
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }
    // Add more complexity rules here if desired (uppercase, number, symbol etc.)

    const cleanedUsername = username.trim();

    try {
        // --- Verify User Status Again (Security Check) ---
        const user = await dbAuth.getUserByUsername(cleanedUsername);
        if (!user) {
            console.warn(`[AuthController.setupPassword] Attempt to setup password for non-existent user: ${cleanedUsername}`);
            return res.status(404).json({ success: false, message: 'User not found.' }); // Or a generic error
        }
        if (!user.IS_ACTIVE) {
            console.warn(`[AuthController.setupPassword] Attempt to setup password for inactive user: ${user.USERNAME}`);
            return res.status(403).json({ success: false, message: 'Account is inactive.' });
        }
        if (user.PASSWORD_HASH !== null && user.PASSWORD_HASH !== '') {
            console.warn(`[AuthController.setupPassword] Attempt to setup password for user who already has one: ${user.USERNAME}`);
            return res.status(409).json({ success: false, message: 'Password has already been set for this user.' }); // 409 Conflict
        }

        // --- Hash the Password ---
        console.log(`[AuthController.setupPassword] Hashing password for: ${user.USERNAME}`);
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        console.log(`[AuthController.setupPassword] Hashing complete for: ${user.USERNAME}`);

        // --- Update Database ---
        const updateSuccess = await dbAuth.updateUserPasswordHash(user.USERNAME, hashedPassword); // Use correct casing from DB

        if (!updateSuccess) {
            console.error(`[AuthController.setupPassword] Failed to update password hash in DB for: ${user.USERNAME}`);
            return res.status(500).json({ success: false, message: 'Failed to save password. Please try again.' });
        }

        // --- Create Session ---
        req.session.username = user.USERNAME; // Set username in session
        req.session.firstName = user.FIRST_NAME; // Store first name in session
        console.log(`[AuthController.setupPassword] Session created for user: ${user.USERNAME}`);

        // Optionally update last login time (can run in background)
        dbAuth.updateLastLogin(user.USERNAME).catch(err => console.error(`[AuthController.setupPassword] Non-critical error updating last login for ${user.USERNAME}:`, err));

        // --- Send Success Response ---
        return res.status(200).json({ success: true, username: user.USERNAME, firstName: user.FIRST_NAME });

    } catch (error) {
        console.error(`[AuthController.setupPassword] Error setting up password for ${cleanedUsername}:`, error);
        return res.status(500).json({ success: false, message: 'Internal server error during password setup.' });
    }
}

/**
 * Handles user login with username and password.
 */
async function handleLogin(req, res) {
    const { username, password } = req.body;
    console.log(`[AuthController.login] Received login attempt for username: ${username}`);

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const cleanedUsername = username.trim();

    try {
        const user = await dbAuth.getUserByUsername(cleanedUsername);

        // --- Verify User and Password Status ---
        if (!user || !user.IS_ACTIVE || user.PASSWORD_HASH === null || user.PASSWORD_HASH === '') {
            // User not found, inactive, or password not set - generic error
            console.warn(`[AuthController.login] Invalid login attempt for: ${cleanedUsername} (User Status: ${!user ? 'Not Found' : user.IS_ACTIVE ? 'Password Null' : 'Inactive'})`);
            return res.status(401).json({ success: false, message: 'Invalid username or password.' }); // Generic error
        }

        // --- Compare Passwords ---
        console.log(`[AuthController.login] Comparing submitted password with hash for: ${user.USERNAME}`);
        const match = await bcrypt.compare(password, user.PASSWORD_HASH);
        console.log(`[AuthController.login] Password comparison result for ${user.USERNAME}: ${match}`);

        if (!match) {
            // Passwords do not match
            return res.status(401).json({ success: false, message: 'Invalid username or password.' }); // Generic error
        }

        // --- Passwords Match - Create Session ---
        req.session.username = user.USERNAME; // Set username in session
        req.session.firstName = user.FIRST_NAME; // Store first name in session
        console.log(`[AuthController.login] Login successful, session created for user: ${user.USERNAME}`);

        // Optionally update last login time (can run in background)
        dbAuth.updateLastLogin(user.USERNAME).catch(err => console.error(`[AuthController.login] Non-critical error updating last login for ${user.USERNAME}:`, err));

        // --- Send Success Response ---
        return res.status(200).json({ success: true, username: user.USERNAME, firstName: user.FIRST_NAME });

    } catch (error) {
        console.error(`[AuthController.login] Error during login for ${cleanedUsername}:`, error);
        return res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
}

/**
 * Handles user logout by destroying the session.
 */
async function handleLogout(req, res) {
    const username = req.session.username; // Get username for logging before destroying
    console.log(`[AuthController.logout] Logout request received for user: ${username || 'unknown'}`);

    req.session.destroy(err => {
        if (err) {
            console.error('[AuthController.logout] Failed to destroy session:', err);
            // Even if destroy fails, try to clear cookie and respond
            res.clearCookie('connect.sid'); // Use the default session cookie name
            return res.status(500).json({ success: false, message: 'Failed to logout completely.' });
        }
        console.log(`[AuthController.logout] Session destroyed for user: ${username || 'unknown'}`);
        res.clearCookie('connect.sid'); // Clear the session cookie on the client side
        return res.status(200).json({ success: true, message: 'Logged out successfully.' });
    });
}


// Export the handlers
module.exports = {
    handleCheckUserStatus,
    handleSetupPassword,
    handleLogin,
    handleLogout
};
// --- END OF FILE authController.js ---