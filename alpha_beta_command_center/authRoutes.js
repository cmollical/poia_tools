// --- START OF FILE authRoutes.js ---
// Purpose: Defines the Express routes for authentication endpoints.

const express = require('express');
const authController = require('./authController'); // Import the controller functions

// Create a new router instance
const router = express.Router();

// --- Define Authentication Routes ---

// POST /auth/check-user-status
// Checks if a user exists, is active, and needs password setup or login.
router.post('/check-user-status', authController.handleCheckUserStatus);

// POST /auth/setup-password
// Handles the initial password setting for a user.
router.post('/setup-password', authController.handleSetupPassword);

// POST /auth/login
// Handles user login attempts with username and password.
router.post('/login', authController.handleLogin);

// POST /auth/logout
// Destroys the user's session.
router.post('/logout', authController.handleLogout);

// GET /auth/check-session (Moved here for consistency)
// Checks if a user session is currently active.
router.get('/check-session', (req, res) => {
    if (req.session.username) {
        console.log(`[AuthRoutes.check-session] Active session found for user: ${req.session.username}`);
        res.json({ 
            loggedIn: true, 
            username: req.session.username,
            firstName: req.session.firstName || req.session.username // Fallback to username if firstName not set
        });
    } else {
        console.log(`[AuthRoutes.check-session] No active session found.`);
        res.json({ loggedIn: false });
    }
});

// Export the router so it can be used by server.js
module.exports = router;
// --- END OF FILE authRoutes.js ---