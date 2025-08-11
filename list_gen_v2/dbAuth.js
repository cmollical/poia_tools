// --- START OF FILE dbAuth.js ---
// Purpose: Contains functions for interacting with the CR_APP_USERS table in Snowflake.

// Require the actual executeSnowflakeQuery function from dbUtils.js
const { executeSnowflakeQuery } = require('./dbUtils'); // Adjust path if needed

/**
 * Fetches user details from CR_APP_USERS by username (case-insensitive).
 * @param {string} username - The username to look up.
 * @returns {Promise<object|null>} A promise that resolves to the user object
 *          { USERNAME, PASSWORD_HASH, IS_ACTIVE, FIRST_NAME } or null if not found.
 */
async function getUserByUsername(username) {
    if (!username) {
        console.warn('[dbAuth.getUserByUsername] Called with empty username.');
        return null;
    }
    console.log(`[dbAuth.getUserByUsername] Fetching user: ${username}`);
    // Use UPPER function for case-insensitive comparison initially
    const query = `
        SELECT /* Fetch User By Username */
            USERNAME,       -- Return the username as stored in DB (should be lowercase based on your check)
            PASSWORD_HASH,
            IS_ACTIVE,
            FIRST_NAME      -- Added to support personalized greeting
        FROM corpanalytics_business_prod.scratchpad_prdpf.CR_APP_USERS
        WHERE UPPER(USERNAME) = UPPER(?) -- Still use UPPER for robust initial lookup
        LIMIT 1;
    `;
    const params = [username];

    try {
        const rows = await executeSnowflakeQuery(query, params);
        if (rows && rows.length > 0) {
            console.log(`[dbAuth.getUserByUsername] User found: ${rows[0].USERNAME}`);
            return {
                USERNAME: rows[0].USERNAME, // Use the exact (lowercase) casing from the DB
                PASSWORD_HASH: rows[0].PASSWORD_HASH,
                IS_ACTIVE: rows[0].IS_ACTIVE,
                FIRST_NAME: rows[0].FIRST_NAME // Include first name in the returned object
            };
        } else {
            console.log(`[dbAuth.getUserByUsername] User not found: ${username}`);
            return null;
        }
    } catch (error) {
        console.error(`[dbAuth.getUserByUsername] Error fetching user '${username}':`, error);
        throw new Error(`Database error checking user status.`);
    }
}

/**
 * Updates the password hash for a given username.
 * Assumes the caller provides the username with the correct casing (as retrieved by getUserByUsername).
 * Relies on executeSnowflakeQuery throwing an error on DB failure.
 * @param {string} username - The username (exact casing) whose password hash needs updating.
 * @param {string} hash - The new bcrypt password hash.
 * @returns {Promise<boolean>} A promise that resolves to true if the update likely succeeded (no error thrown). Throws error on failure.
 */
async function updateUserPasswordHash(username, hash) {
    if (!username || !hash) {
        console.error('[dbAuth.updateUserPasswordHash] Called with empty username or hash.');
        throw new Error('Invalid input for password update.'); // Throw error for invalid input
    }
    console.log(`[dbAuth.updateUserPasswordHash] Attempting to update hash for user: ${username}`);
    const query = `
        UPDATE /* Set User Password Hash */
            corpanalytics_business_prod.scratchpad_prdpf.CR_APP_USERS
        SET
            PASSWORD_HASH = ?
        WHERE
            USERNAME = ?; -- Match exact (lowercase) username
    `;
    const params = [hash, username];

    try {
        const result = await executeSnowflakeQuery(query, params);

        // Log the result for confirmation, even if assuming success
        console.log("[dbAuth.updateUserPasswordHash] Raw UPDATE result (expected empty array on success):", JSON.stringify(result));

        // ** SUCCESS CHECK LOGIC **
        // If executeSnowflakeQuery did NOT throw an error, assume the UPDATE succeeded.
        console.log(`[dbAuth.updateUserPasswordHash] Successfully executed UPDATE statement for: ${username} (assuming success as no error was thrown).`);
        return true; // Indicate success

    } catch (error) {
        // If executeSnowflakeQuery throws an error, it's caught here.
        console.error(`[dbAuth.updateUserPasswordHash] Error updating hash for '${username}':`, error);
        // Re-throw the error so the controller knows something went wrong.
        throw new Error(`Database error updating password.`);
    }
}

/**
 * Updates the last login timestamp for a given username. (Optional)
 * Assumes the caller provides the username with the correct casing.
 * @param {string} username - The username (exact casing) whose last login time needs updating.
 * @returns {Promise<void>} A promise that resolves when the update attempt is complete. Errors are logged.
 */
async function updateLastLogin(username) {
    if (!username) {
        console.warn('[dbAuth.updateLastLogin] Called with empty username.');
        return; // Don't throw for this non-critical function
    }
    console.log(`[dbAuth.updateLastLogin] Attempting to update last login time for user: ${username}`);
    const query = `
        UPDATE /* Update Last Login Timestamp */
            corpanalytics_business_prod.scratchpad_prdpf.CR_APP_USERS
        SET
            LAST_LOGIN_TS = CURRENT_TIMESTAMP()
        WHERE
            USERNAME = ?; -- Match exact (lowercase) username
    `;
    const params = [username];

    try {
        // Also assume success if no error is thrown for this update
        const result = await executeSnowflakeQuery(query, params);
        console.log("[dbAuth.updateLastLogin] Raw UPDATE result:", JSON.stringify(result)); // Log result
        console.log(`[dbAuth.updateLastLogin] Successfully executed last login update for: ${username}`);
    } catch (error) {
        // Log the error but don't necessarily stop the login flow
        console.error(`[dbAuth.updateLastLogin] Non-critical error updating last login for '${username}':`, error);
    }
}

// Export the functions to be used by the authController
module.exports = {
    getUserByUsername,
    updateUserPasswordHash,
    updateLastLogin // Ensure this is exported
};
// --- END OF FILE dbAuth.js ---