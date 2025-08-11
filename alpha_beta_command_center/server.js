// --- START OF FILE server.js ---
// Purpose: Node.js backend for Product Operations Tools

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs'); // Ensure fs is required
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const cheerio = require('cheerio');
const crypto = require('crypto');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid'); // Added for unique IDs

// Require the new authentication router
const authRoutes = require('./authRoutes');
// Require the shared DB utility function
const { executeSnowflakeQuery } = require('./dbUtils'); // Ensure dbUtils.js exists and path is correct

const app = express();

// --- Configuration ---
// !! IMPORTANT: Verify these paths are correct for your environment !!
const LIST_GENERATION_SCRIPT_PATH = "C:\\poia_tools\\alpha_beta_command_center\\list_generation_power_shell.ps1";
const LIST_FILTER_SCRIPT_PATH = "C:\\poia_tools\\alpha_beta_command_center\\list_filter_power_shell.ps1";
const QUALTRICS_SCRIPT_PATH = "C:\\poia_tools\\alpha_beta_command_center\\create_qualtrics_survey.py";
const TEMPLATE_DIR_PATH = path.join(__dirname, 'templates'); // Assumes templates folder is next to server.js
const OUTPUT_DIR_PATH = "C:\\Users\\cmollica\\OneDrive - athenahealth\\Shared Services (Product Operations) - Invite Drafts"; // Standard output for generated docs
const PUBLIC_DIR_PATH = path.join(__dirname, 'public'); // Assumes public folder is next to server.js
const PORT = 3000;

// --- IMPORTANT: Session Secret ---
// Prefer env; fall back to a stable dev-only value (do NOT commit real secret)
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-only-change-me-alpha-beta-command-center-2024';
if (!process.env.SESSION_SECRET && process.env.NODE_ENV !== 'test') { // Don't warn in test env
    console.warn('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.warn('WARNING: Using default dev session secret. For production, set SESSION_SECRET environment variable.');
    console.warn('Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.warn('Set with PM2: pm2 set ab-command-center:SESSION_SECRET "your-secret-here"');
    console.warn('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
}

// --- Middleware ---
app.use(express.static(PUBLIC_DIR_PATH)); // Serve static files (HTML, CSS, JS, images)
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true })); // Parse URL-encoded bodies, increased limit
app.use(bodyParser.json({ limit: '50mb' })); // Parse JSON bodies, increased limit

// --- Session Middleware ---
app.use(session({
    secret: SESSION_SECRET,
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    rolling: false, // Don't reset expiration on every request
    cookie: {
        secure: false, // Set to false for development (HTTP), true for production (HTTPS)
        maxAge: 1000 * 60 * 60 * 8, // Session duration: 8 hours
        httpOnly: true, // Prevent client-side JS from accessing cookie
        sameSite: 'lax' // Help prevent CSRF while allowing normal navigation
    }
}));

// Request Logger Middleware
app.use((req, res, next) => {
    const username = req.session?.username || 'anonymous';
    console.log(`[Request Logger] ${new Date().toISOString()} - ${req.method} ${req.originalUrl} (User: ${username})`);
    // Log request body (excluding sensitive fields)
    if ((req.method === 'POST' || req.method === 'PUT') && req.body && Object.keys(req.body).length > 0) {
        let bodyLog = {};
        try {
            bodyLog = JSON.parse(JSON.stringify(req.body)); // Deep copy to avoid modifying original
            // Redact sensitive fields
            if (bodyLog.password) bodyLog.password = '[REDACTED]';
            if (bodyLog.newPassword) bodyLog.newPassword = '[REDACTED]';
            // Truncate potentially long fields to avoid excessive logging
            const truncateLength = 200;
            for (const key in bodyLog) {
                if (typeof bodyLog[key] === 'string' && bodyLog[key].length > truncateLength) {
                    bodyLog[key] = bodyLog[key].substring(0, truncateLength) + '...[truncated]';
                }
            }
            console.log(`   Body:`, JSON.stringify(bodyLog));
        } catch (e) {
            console.log('   Body: [Could not serialize body for logging]');
        }
    }
    next(); // Pass control to the next middleware/route handler
});

// --- Helper Middleware to Require Verified User Session ---
function requireVerifiedUser(req, res, next) {
    if (!req.session.username) { // Check if username exists in the session
        console.warn(`[Auth Required] Access denied for ${req.method} ${req.originalUrl}. No verified username in session.`);
        // For browser requests expecting HTML, redirect to the login page
        if (req.accepts('html') && req.method === 'GET') {
             console.log('[Auth Required] Redirecting to /login');
             return res.redirect('/login'); // Redirect to the login page route
        } else {
             // For API requests or non-HTML GETs, send a 401 Unauthorized JSON response
             return res.status(401).json({ message: 'Authentication required. Please log in.', reason: 'NO_SESSION' });
        }
    } else {
        next(); // User is authenticated, proceed to the next middleware/route handler
    }
}

// --- Routes ---

// Mount Authentication Routes (handles /auth/login, /auth/logout, /auth/check-session, etc.)
app.use('/auth', authRoutes);

// Add route for Template Admin page
app.get('/template-admin', requireVerifiedUser, (req, res) => {
    // Check if user is authorized to access template management
    if (!TEMPLATE_ADMIN_USERS.includes(req.session.username.toLowerCase())) {
        return res.status(403).sendFile(path.join(__dirname, 'public', 'access_denied.html'));
    }
    
    res.sendFile(path.join(__dirname, 'public', 'template_admin.html'));
});

// Route for Serving the Login Page (unprotected)
app.get('/login', (req, res) => {
    const loginPath = path.join(PUBLIC_DIR_PATH, 'login.html');
    if (fs.existsSync(loginPath)) {
        res.sendFile(loginPath);
    } else {
        console.error(`[Server Error] Login page login.html not found at: ${loginPath}`);
        res.status(404).send("Login page (login.html) not found.");
    }
});

// --- Protected Routes (Require Login using requireVerifiedUser middleware) ---

// Serve Home Page
app.get('/', requireVerifiedUser, (req, res) => {
    const homePath = path.join(PUBLIC_DIR_PATH, 'home.html');
    if (fs.existsSync(homePath)) { res.sendFile(homePath); } else { console.error(`[Server Error] Landing page home.html not found at: ${homePath}`); res.status(404).send("Landing page (home.html) not found."); }
});
// Serve List Tools Page
app.get('/list-tools', requireVerifiedUser, (req, res) => {
    const toolPath = path.join(PUBLIC_DIR_PATH, 'list_tools.html');
    if (fs.existsSync(toolPath)) { res.sendFile(toolPath); } else { console.error(`[Server Error] List tool page list_tools.html not found at: ${toolPath}`); res.status(404).send("List tool page (list_tools.html) not found."); }
});
// Serve Marketing Content Page
app.get('/marketing-content', requireVerifiedUser, (req, res) => {
    const marketingPath = path.join(PUBLIC_DIR_PATH, 'marketing_content.html');
    if (fs.existsSync(marketingPath)) { res.sendFile(marketingPath); } else { console.error(`[Server Error] Marketing Content page marketing_content.html not found at: ${marketingPath}`); res.status(404).send("Marketing Content tool page not found."); }
});
// Serve Qualtrics Survey Page
app.get('/qualtrics-survey', requireVerifiedUser, (req, res) => {
    const qualtricsPath = path.join(PUBLIC_DIR_PATH, 'qualtrics_survey.html');
    if (fs.existsSync(qualtricsPath)) { res.sendFile(qualtricsPath); } else { console.error(`[Server Error] Qualtrics Survey page qualtrics_survey.html not found at: ${qualtricsPath}`); res.status(404).send("Qualtrics Survey tool page not found."); }
});
// Serve Dashboard Page
app.get('/dashboard', requireVerifiedUser, (req, res) => {
    const dashboardPath = path.join(PUBLIC_DIR_PATH, 'dashboard.html');
    if (fs.existsSync(dashboardPath)) {
        res.sendFile(dashboardPath);
    } else {
        console.error(`[Server Error] Dashboard page dashboard.html not found at: ${dashboardPath}`);
        res.status(404).send("Dashboard page (dashboard.html) not found.");
    }
});
// Serve Final Client List Page
app.get('/final-client-list', requireVerifiedUser, (req, res) => {
    const finalClientListPath = path.join(PUBLIC_DIR_PATH, 'final_client_list.html');
    if (fs.existsSync(finalClientListPath)) {
        res.sendFile(finalClientListPath);
    } else {
        console.error(`[Server Error] Final Client List page final_client_list.html not found at: ${finalClientListPath}`);
        res.status(404).send("Final Client List page (final_client_list.html) not found.");
    }
});

// --- Protected API Endpoints ---

// Endpoint for original list generation (PowerShell)
app.post('/run-powershell', requireVerifiedUser, (req, res) => {
    const { var2, var3, explainOnly, optInOut } = req.body; // var2 = context list, var3 = filename base, explainOnly = explanation mode, optInOut = opt-in/opt-out selection
    const username = req.session.username;
    console.log(`[Original List Gen] Request received for user: ${username}, FileName Base: ${var3}${explainOnly === 'true' ? ' (Explain Only Mode)' : ''}`);
    const psScriptPath = LIST_GENERATION_SCRIPT_PATH;
    if (!fs.existsSync(psScriptPath)) {
        console.error(`[PowerShell Error - Original Gen] Script file not found at: ${psScriptPath}`);
        return res.status(500).send(`Server config error: Original list generation PowerShell script not found.`);
    }
    const psVar1 = username; // Username passed to PS script
    const psVar2 = var2 || ''; // Context list (comma-separated IDs)
    const psVar3 = var3 || ''; // Filename base (e.g., FEATURE-123_Beta_1)
    const psOptInOut = optInOut || 'Opt-in'; // Default to Opt-in if not specified
    const args = [
        '-ExecutionPolicy', 'Bypass',
        '-NoProfile', '-NonInteractive',
        '-File', psScriptPath,
        '-var1', psVar1,
        '-var2', psVar2,
        '-var3', psVar3
    ];
    
    // Add optInOut parameter
    args.push('-optInOut', psOptInOut);
    
    // Add explainOnly parameter if present
    if (explainOnly === 'true') {
        args.push('-explainOnly', 'true');
    }
    console.log(`[PowerShell - Original Gen] Executing: powershell.exe ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
    const child = spawn('powershell.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] }); // Ignore stdin, pipe stdout/stderr
    let stdoutOutput = "";
    let stderrOutput = "";
    child.stdout.on('data', (data) => { const outputChunk = data.toString(); console.log('[PowerShell STDOUT - Original Gen]', outputChunk); stdoutOutput += outputChunk; });
    child.stderr.on('data', (data) => { const errorChunk = data.toString(); console.error('[PowerShell STDERR - Original Gen]', errorChunk); stderrOutput += errorChunk; });
    child.on('error', (err) => {
        console.error("[PowerShell - Original Gen] Failed to start script:", err);
        return res.status(500).send(`Execution error: Failed to start original generation PowerShell process. Error: ${err.message}`);
    });
    child.on('exit', (code, signal) => {
        console.log(`[PowerShell - Original Gen] Script exited with code ${code}, signal ${signal}`);
        if (code !== 0) {
            console.error(`[PowerShell Error - Original Gen] Script exited non-zero (Code: ${code}, Signal: ${signal})`);
            console.error("[PowerShell Error Output - Original Gen]", stderrOutput);
            const errorMessage = `Original list generation script execution failed (Code: ${code}).\nError details:\n${stderrOutput || 'No specific error output captured.'}`;
            return res.status(500).send(errorMessage); // Send error details back (consider sanitizing in production)
        }
        // Success path
        console.log("[PowerShell Success Output - Original Gen]", stdoutOutput);
        
        // If explainOnly mode, return the PowerShell stdout directly (contains JSON)
        if (explainOnly === 'true') {
            console.log("[PowerShell - Original Gen] Returning PowerShell stdout for explainOnly mode");
            res.send(stdoutOutput);
            return;
        }
        
        // Otherwise, return formatted success message for normal mode
        let successMessage = "List generation request submitted successfully.";
        const pathMatch = stdoutOutput.match(/Script finished\. Your list should be available at (.*)/i) || stdoutOutput.match(/Failure metadata saved to (.*)/i);
        if (pathMatch && pathMatch[1]) {
            successMessage += ` Output saved to: ${pathMatch[1].trim()}`; // Include path if found
        } else {
            successMessage += " File will be saved to OneDrive."; // Generic message
        }
        res.send(successMessage);
    });
});

// Endpoint for list filtering/scrubbing (PowerShell)
app.post('/run-list-filter', requireVerifiedUser, (req, res) => {
    const { var2, var3, saveToDownloads, environment } = req.body; // var2=scrub list, var3=target list file, saveToDownloads=boolean, environment=alpha/beta
    const username = req.session.username;
    // Ensure boolean conversion is robust
    const saveToDownloadsFlag = (typeof saveToDownloads === 'string' && saveToDownloads.toLowerCase() === 'true') || saveToDownloads === true;

    console.log(`[List Scrub] Request received for user: ${username}, TargetList: ${var3}, SaveToDownloads: ${saveToDownloadsFlag}, Environment: ${environment || 'beta'}`);

    const psScriptPath = LIST_FILTER_SCRIPT_PATH;
    if (!fs.existsSync(psScriptPath)) {
        console.error(`[PowerShell Error - Filter] Script file not found at: ${psScriptPath}`);
        return res.status(500).send(`Server configuration error: List filter PowerShell script not found.`);
    }

    const psVar1 = username; // User running the script
    const psVar2 = var2 || ''; // Comma-separated list of IDs/contexts to scrub
    // Format filename based on pattern and environment parameter
    let baseFileName = var3 || '';
    
    // For CSMInvite lists, apply special formatting with environment variable
    if (baseFileName.includes('CSMInvite') || baseFileName.includes('FEATURE-3623')) {
        // Extract feature number and index if present
        const featureMatch = baseFileName.match(/FEATURE-(\d+)(?:_CSMInvite)?(?:.*?)(\d+)?$/i);
        const featureNum = featureMatch ? featureMatch[1] : '3623';
        const indexNum = featureMatch ? (featureMatch[2] || '3') : '3';
        
        // Capitalize first letter of environment
        const envName = environment ? 
            (environment.charAt(0).toUpperCase() + environment.slice(1).toLowerCase()) : 'Beta';
            
        // Create formatted filename: FEATURE-XXXX_CSMInviteAlpha/Beta_N
        baseFileName = `FEATURE-${featureNum}_CSMInvite${envName}_${indexNum}`;
    }
    
    const psVar3 = baseFileName; // Target list filename
    const args = [
        '-ExecutionPolicy', 'Bypass',
        '-NoProfile', '-NonInteractive',
        '-File', psScriptPath,
        '-var1', psVar1,
        '-var2', psVar2,
        '-var3', psVar3
    ];

    // Pass the -SaveToDownloads switch parameter to PowerShell *only if* it's true
    if (saveToDownloadsFlag) {
        args.push('-SaveToDownloads');
    }

    console.log(`[PowerShell - Filter] Executing: powershell.exe ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

    const child = spawn('powershell.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdoutOutput = "";
    let stderrOutput = "";

    child.stdout.on('data', (data) => {
        const outputChunk = data.toString();
        // Log cautiously, especially if file paths are sensitive
        // console.log('[PowerShell STDOUT - Filter]', outputChunk);
        process.stdout.write(outputChunk); // Write directly to see PS progress in server console
        stdoutOutput += outputChunk;
    });

    child.stderr.on('data', (data) => {
        const errorChunk = data.toString();
        console.error('[PowerShell STDERR - Filter]', errorChunk);
        stderrOutput += errorChunk;
    });

    child.on('error', (err) => {
        console.error("[PowerShell - Filter] Failed to start script:", err);
        // Send generic error to client
        return res.status(500).send(`Execution error: Failed to start list filter process. Contact support.`);
    });

    child.on('exit', (code, signal) => {
        console.log(`[PowerShell - Filter] Script exited with code ${code}, signal ${signal}`);

        if (code !== 0) {
            console.error(`[PowerShell Error - Filter] Script exited non-zero (Code: ${code}, Signal: ${signal})`);
            console.error("[PowerShell Error Output - Filter]", stderrOutput);
            const clientErrorMessage = `List filter script execution failed (Code: ${code}). Check server logs or contact support.`;
            // Avoid sending detailed server errors (like stderrOutput) to the client in production
            return res.status(500).send(clientErrorMessage);
        }

        // --- Success Path (Code 0) ---
        console.log("[PowerShell Success Output - Filter]:\n", stdoutOutput); // Log the full output for debugging

        if (saveToDownloadsFlag) {
            // --- Handle File Download ---
            // Look for the specific line PowerShell should output containing the temp file path
            const downloadPathMatch = stdoutOutput.match(/^DOWNLOAD_FILE_PATH:(.*)$/m); // Use multiline flag ^ $
            if (downloadPathMatch && downloadPathMatch[1]) {
                const tempFilePath = downloadPathMatch[1].trim();
                // Use the actual file name (handles .zip or .xlsx)
                const finalDownloadFilename = path.basename(tempFilePath);

                console.log(`[Download] Attempting to send file: ${tempFilePath} as ${finalDownloadFilename}`);

                // IMPORTANT: Check if file exists on the server before attempting download
                if (fs.existsSync(tempFilePath)) {
                    // Use res.download() to set headers and stream the file
                    res.download(tempFilePath, finalDownloadFilename, (err) => {
                        if (err) {
                            // Handle potential errors during streaming (e.g., client aborted connection)
                            // Avoid sending another response if headers might have been sent
                            console.error(`[Download Error] Error sending file ${tempFilePath}:`, err);
                        } else {
                            console.log(`[Download Success] File ${tempFilePath} sent successfully.`);
                        }

                        // --- Cleanup: Always attempt to delete the temporary file afterwards ---
                        console.log(`[Cleanup] Attempting to delete temporary file: ${tempFilePath}`);
                        fs.unlink(tempFilePath, (unlinkErr) => {
                            if (unlinkErr) {
                                // Log error, but don't block response if download succeeded/failed earlier
                                console.error(`[Cleanup Error] Failed to delete temporary file ${tempFilePath}:`, unlinkErr);
                            } else {
                                console.log(`[Cleanup Success] Deleted temporary file: ${tempFilePath}`);
                            }
                        });
                    });
                } else {
                    // File doesn't exist where PowerShell said it would be
                    console.error(`[Download Error] File not found at expected temporary path: ${tempFilePath}`);
                    res.status(500).send('Error: Generated file could not be found on the server for download.');
                }
            } else {
                // PowerShell finished successfully (Code 0) but didn't output the path line correctly
                console.error("[Download Error] PowerShell finished (Code 0) but did not output the expected DOWNLOAD_FILE_PATH line.");
                console.error("PowerShell STDOUT received:", stdoutOutput); // Log what *was* received
                res.status(500).send('Server error: Could not retrieve the generated file path for download. Check server logs.');
            }
        } else {
            // --- Handle Standard Save to OneDrive (Send Text Confirmation) ---
            let successMessage = "List filter request submitted successfully.";
            // Try to parse the standard output path message from PowerShell
            const pathMatch = stdoutOutput.match(/Script finished\. Filtered list saved to (.*)/i);
            if (pathMatch && pathMatch[1]) {
                // We don't need to expose the full server path to the client.
                // Just confirm it's going to the shared location.
                successMessage += ` Output saved to the shared OneDrive folder.`;
                console.log(`[Success] Standard save confirmed. Path on server (not sent to client): ${pathMatch[1].trim()}`);
            } else {
                // Generic message if path parsing fails but script succeeded (Code 0)
                successMessage += " Output will be saved to OneDrive.";
                console.warn("[Success] Standard save path message not found in PS output (Code 0), using generic message.");
            }
            res.send(successMessage); // Send the text confirmation back to the client
        }
    });
});

// Endpoint for Generating Marketing Content (DocxTemplater)
app.post('/generate-content', requireVerifiedUser, async (req, res) => {
    try {
        const { listId, templateName, additionalFields } = req.body;
        const username = req.session.username;

        // --- Basic Input Validation ---
        const validTemplates = [
            "InviteTemplate_AlphaOptIn", "InviteTemplate_AlphaOptOut",
            "InviteTemplate_BetaOptIn", "InviteTemplate_BetaOptOut"
        ];
        if (!listId || !templateName) {
            return res.status(400).json({ message: "Missing required fields: listId or templateName." });
        }
        if (!validTemplates.includes(templateName)) {
            console.warn(`[Generate Content] Invalid template name received: ${templateName}`);
            return res.status(400).json({ message: `Invalid templateName specified: ${templateName}. Must be one of ${validTemplates.join(', ')}.` });
        }
        console.log(`[Generate Content] Request received for user: ${username}, listId: ${listId}, template: ${templateName}`);

        // --- Parse Filename ---
        let featureKey, stage, waveNumber;
        try {
            ({ featureKey, stage, waveNumber } = parseFileName(listId));
            console.log(`[Generate Content] Parsed listId: Feature=${featureKey}, Stage=${stage}, Wave=${waveNumber}`);
        } catch (parseError) {
            console.error(`[Generate Content] Error parsing listId '${listId}':`, parseError);
            return res.status(400).json({ message: `Invalid listId format: ${listId}. ${parseError.message}` });
        }

        // --- Fetch Data from DB ---
        const featureContent = await getFeatureContentData(featureKey, stage, waveNumber);
        if (!featureContent) {
            console.warn(`[Generate Content] No matching content found for ${featureKey}, ${stage}, ${waveNumber}`);
            return res.status(404).json({ message: "Content definition not found for this feature/stage/wave in the database (cr_alpha_content)." });
        }

        // --- Prepare Data for Template (Merge DB data, additionalFields, defaults) ---
        const data = {
            // Provide defaults for ALL fields selected in getFeatureContentData
            FEATURE_KEY: '', STAGE: '', WAVE_NUMBER: '', ALPHA_NAME: '', CLIENT_FACING_FEATURE_NAME: '',
            PRACTICE_IDS: '', OPT_IN_DEADLINE: '', ALPHA_START_DATE: '', INVITE_DATE: '', RELEASE_NOTE_URL: '',
            ROADMAP_TIMEFRAME: '',
            ADDITIONAL_NOTES: '', FEEDBACK_METHOD: '', FEEDBACK_LINK: '', WHY_AM_I_RECEIVING_THIS: '',
            CRT: '', OPT_IN_FORM: '', OPT_OUT_FORM: '', OPT_IN: '', OPT_OUT: '', PROPS_OWNER: '', BRIEF_DESCRIPTION: '', WORKFLOW_CHANGES: '',
            TARGETING_REASON: null, TASK_DETAILS: '',
            RELEASE_NOTE: '#', // Default URL if none provided/parsed
            ...featureContent, // Overwrite defaults with data from DB
            ...additionalFields // Overwrite DB data/defaults with user-provided fields
        };

        // --- Format Dates ---
        const formatDate = (dateInput) => {
            if (!dateInput || !(typeof dateInput === 'string' || dateInput instanceof Date)) return '';
            try {
                const dateObject = new Date(dateInput); // Assumes dateInput can be parsed by Date constructor
                if (isNaN(dateObject.getTime())) { console.warn(`[Date Format] Invalid date value: '${dateInput}'`); return ''; }
                const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                // Use UTC methods to avoid timezone shifts if dates are stored/entered as UTC
                return `${monthNames[dateObject.getUTCMonth()]} ${dateObject.getUTCDate()}, ${dateObject.getUTCFullYear()}`;
            } catch (dateError) { console.error(`[Date Format] Error processing date '${dateInput}':`, dateError); return ''; }
        };
        data.OPT_IN_DEADLINE = formatDate(data.OPT_IN_DEADLINE);
        data.ALPHA_START_DATE = formatDate(data.ALPHA_START_DATE);
        data.INVITE_DATE = formatDate(data.INVITE_DATE);


        // --- Sanitize Text Fields (Remove control chars, trim, provide defaults) ---
        const sanitizeText = (textInput, fieldName = "Field", allowEmpty = false, defaultIfEmpty = "") => {
            if (textInput === null || typeof textInput === 'undefined') return allowEmpty ? "" : defaultIfEmpty;
            // Remove specific unwanted unicode control characters, then trim whitespace
            let sanitizedValue = String(textInput).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
            if (!allowEmpty && sanitizedValue === '') {
                console.warn(`[Sanitize ${fieldName}] Value became empty after sanitization/trimming. Using default: "${defaultIfEmpty}"`);
                return defaultIfEmpty;
            }
            return sanitizedValue;
        };
        data.FEATURE_KEY = sanitizeText(data.FEATURE_KEY, "Feature Key"); // Might not be needed for display but good practice
        data.STAGE = sanitizeText(data.STAGE, "Stage");
        data.WAVE_NUMBER = sanitizeText(data.WAVE_NUMBER, "Wave Number");
        data.ALPHA_NAME = sanitizeText(data.ALPHA_NAME, "Alpha Name"); // Added
        data.CLIENT_FACING_FEATURE_NAME = sanitizeText(data.CLIENT_FACING_FEATURE_NAME, "Client Facing Feature Name", false, "(Feature Name TBD)");
        data.PRACTICE_IDS = sanitizeText(data.PRACTICE_IDS, "Practice IDs", true); // Allow empty? Check usage
        // OPT_IN_DEADLINE, ALPHA_START_DATE, INVITE_DATE are formatted dates, skip direct sanitization
        data.RELEASE_NOTE_URL = sanitizeText(data.RELEASE_NOTE_URL, "Release Note URL Raw", true); // Sanitize the raw input before HTML parsing
        data.ADDITIONAL_NOTES = sanitizeText(data.ADDITIONAL_NOTES, "Additional Notes", true); // Allow empty
        data.FEEDBACK_METHOD = sanitizeText(data.FEEDBACK_METHOD, "Feedback Method", true); // Added, allow empty?
        data.FEEDBACK_LINK = sanitizeText(data.FEEDBACK_LINK, "Feedback Link", true); // Allow empty
        data.WHY_AM_I_RECEIVING_THIS = sanitizeText(data.WHY_AM_I_RECEIVING_THIS, "Why Receiving");
        data.CRT = sanitizeText(data.CRT, "CRT");
        data.OPT_IN_FORM = sanitizeText(data.OPT_IN_FORM, "Opt In Form", true);
        data.OPT_OUT_FORM = sanitizeText(data.OPT_OUT_FORM, "Opt Out Form", true);
        // Map to template placeholders
        data.OPT_IN = data.OPT_IN_FORM;
        data.OPT_OUT = data.OPT_OUT_FORM;
        data.PROPS_OWNER = sanitizeText(data.PROPS_OWNER, "Props Owner");
        data.BRIEF_DESCRIPTION = sanitizeText(data.BRIEF_DESCRIPTION, "Brief Description");
        data.WORKFLOW_CHANGES = sanitizeText(data.WORKFLOW_CHANGES, "Workflow Changes");
        data.TARGETING_REASON = data.TARGETING_REASON ? sanitizeText(data.TARGETING_REASON, "Targeting Reason", true) : null; // Sanitize if exists
        data.ROADMAP_TIMEFRAME = sanitizeText(data.ROADMAP_TIMEFRAME, "Roadmap Timeframe", true);
        data.TASK_DETAILS = sanitizeText(data.TASK_DETAILS, "Task Details");

      // Provide fallback text for empty optional fields (adjust as needed based on template requirements)
      if (!data.ADDITIONAL_NOTES) data.ADDITIONAL_NOTES = "N/A"; // Use N/A or similar if preferred
      if (!data.FEEDBACK_METHOD) data.FEEDBACK_METHOD = "Standard feedback channels apply."; // Example fallback
      if (!data.OPT_IN_FORM) data.OPT_IN_FORM = "";
      if (!data.OPT_OUT_FORM) data.OPT_OUT_FORM = "";

        // --- Extract URL from RELEASE_NOTE_URL (might contain HTML) ---
        if (data.RELEASE_NOTE_URL && typeof data.RELEASE_NOTE_URL === 'string') {
            try {
                const rawUrlField = data.RELEASE_NOTE_URL.trim();
                // Sanitize input before parsing as HTML
                const sanitizedHtmlInput = rawUrlField.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
                if (sanitizedHtmlInput) {
                    const $ = cheerio.load(sanitizedHtmlInput); // Load into cheerio
                    const linkElement = $('a'); // Find the first <a> tag
                    let extractedUrl = '';
                    if (linkElement.length > 0 && linkElement.attr('href')) {
                        extractedUrl = linkElement.attr('href'); // Get href attribute
                    } else if (sanitizedHtmlInput.toLowerCase().startsWith('http')) {
                        extractedUrl = sanitizedHtmlInput; // Assume it's a plain URL if no <a> tag found
                    }
                    // Assign to RELEASE_NOTE if a valid URL was extracted
                    if (extractedUrl) data.RELEASE_NOTE = extractedUrl.trim();
                    else console.warn("[Release Note Link] Could not extract valid URL from DB field:", sanitizedHtmlInput);
                }
            } catch (htmlParseError) {
                console.error("[Release Note Link] Error parsing RELEASE_NOTE_URL HTML:", htmlParseError);
                // Keep the default '#' if parsing fails
            }
        }

        console.log("[DEBUG] Final data object for Docxtemplater:", JSON.stringify(data, null, 2)); // Log final data

        // --- Load Template ---
        const templatePath = path.join(TEMPLATE_DIR_PATH, `${templateName}.docx`);
        if (!fs.existsSync(templatePath)) {
            console.error(`Template file not found: ${templatePath}`);
            return res.status(404).json({ message: `Template file '${templateName}.docx' not found on the server.` });
        }
        const content = fs.readFileSync(templatePath, 'binary'); // Read as binary

        // --- Initialize Docxtemplater ---
        const zip = new PizZip(content);
        let doc;
        try {
            doc = new Docxtemplater(zip, {
                paragraphLoop: true, // Allow loops inside paragraphs
                linebreaks: true,   // Handle line breaks (e.g., \n in data)
                // Handle missing tags gracefully: replace missing tags with empty string
                nullGetter: function(part) {
                    // part.module examples: 'rawxml', 'loop', 'condition'
                    // part.value examples: 'CLIENT_FACING_FEATURE_NAME', 'users' (for loops)
                    console.warn(`[Docxtemplater Warning] Tag not found in data: {${part.value}} (Module: ${part.module || 'default'})`);
                    if(part.module === "loop") return []; // Empty array for missing loops
                    if(part.module === "condition") return false; // False for missing conditions
                    return ""; // Empty string for simple missing tags
                }
            });
        } catch (initError) {
            console.error("[Generate Content] Error creating Docxtemplater instance:", initError);
            return res.status(500).json({ message: "Error initializing template processor: " + initError.message });
        }

        // --- Render Document ---
        try {
            doc.render(data); // Pass the prepared data object
        } catch (renderError) {
            console.error("[Generate Content] Error rendering template:", renderError);
            // Provide more specific error messages to the user if possible
            const e = { message: renderError.message, name: renderError.name, properties: renderError.properties };
            let userMessage = `Error rendering document: ${renderError.message}.`;
            if (e.properties && e.properties.id === 'scope_not_found') {
                 userMessage += ` Failed to find value for template tag: '{${e.properties.details}}'. Check if this field exists in the database or was provided.`;
            } else if (e.properties && e.properties.id === 'template_error') {
                 userMessage += ` Template syntax error near tag: '${e.properties.tag}'. Check the template file for errors.`;
            } else if (e.properties && (e.properties.id === 'unopened_tag' || e.properties.id === 'unclosed_tag')) {
                 userMessage += ` Mismatched tags like '{' or '}' found near '${e.properties.explanation}'. Check the template file.`;
            } else {
                 userMessage += ` Verify template tags match data fields.`;
            }
            return res.status(500).json({ message: userMessage, details: e });
        }

        // --- Generate Output Buffer ---
        let buf;
        try {
            buf = doc.getZip().generate({
                type: 'nodebuffer',
                compression: "DEFLATE" // Standard compression
            });
        } catch (bufferError) {
            console.error("[Generate Content] Error generating buffer:", bufferError);
            return res.status(500).json({ message: "Error finalizing document buffer: " + bufferError.message });
        }

        // --- Ensure Output Directory Exists ---
        const oneDriveFolder = OUTPUT_DIR_PATH; // Defined in Configuration section
        try {
            if (!fs.existsSync(oneDriveFolder)) {
                fs.mkdirSync(oneDriveFolder, { recursive: true }); // Create recursively if needed
            }
        } catch (dirError) {
            console.error(`[Generate Content] CRITICAL ERROR creating output directory ${oneDriveFolder}:`, dirError);
            return res.status(500).json({ message: `Server config error: Could not create output directory. Error: ${dirError.message}` });
        }

        // --- Construct Output Filename ---
        const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-'); // ISO format safe for filenames
        const sanitize = (str) => str ? String(str).replace(/[\\/:*?"<>|#%&{}\s~]/g, '_').replace(/_+/g, '_') : ''; // Basic sanitization
        const sanitizedFeatureName = sanitize(featureKey || 'UnknownFeature').substring(0, 50); // Limit length
        const sanitizedStage = sanitize(stage || 'UnknownStage');
        const sanitizedWave = sanitize((waveNumber || 'X').toString());
        const templateTypeForFile = templateName.replace('InviteTemplate_', ''); // e.g., AlphaOptIn
        // Final filename structure
        const fileName = `${templateTypeForFile}_Invite_${sanitizedFeatureName}_${sanitizedStage}_${sanitizedWave}_${fileTimestamp}.docx`;
        const outputPath = path.join(oneDriveFolder, fileName);

        // --- Write File to Disk ---
        try {
            fs.writeFileSync(outputPath, buf);
            console.log(`[Generate Content] File saved successfully: ${outputPath}`);

            // --- Log Creation Event (Best effort) ---
            try {
                const derivedContentType = templateName.replace('InviteTemplate_', '').replace(/([A-Z])/g, ' $1').trim(); // e.g., "Alpha Opt In"
                await logContentCreation(username, derivedContentType, listId);
            } catch (logError) {
                // Log the error but don't fail the entire request if logging fails
                console.error(`[Generate Content] WARNING: Failed to log content creation event. Error:`, logError);
            }

            // Send success response with path (maybe just filename is safer)
            res.status(200).json({ savedPath: outputPath }); // Consider sending only `fileName` instead of full path

        } catch (writeError) {
            console.error(`[Generate Content] Error writing file to ${outputPath}:`, writeError);
            // Provide more helpful error message if possible
            let writeErrorMessage = `Error saving generated file.`;
            if (writeError.code === 'EPERM') writeErrorMessage += ' Permission denied writing to output directory.';
            else if (writeError.code === 'EBUSY') writeErrorMessage += ' File may be locked or in use.';
            else if (writeError.code === 'ENOSPC') writeErrorMessage += ' Not enough disk space.';
            else writeErrorMessage += ` Details: ${writeError.message}`;
            return res.status(500).json({ message: writeErrorMessage });
        }
    } catch (error) {
        // Catch any other unhandled errors in the main try block
        console.error("[Generate Content] UNHANDLED error:", error);
        res.status(500).json({ message: "Unexpected internal server error during content generation.", details: error.message });
    }
});

// Endpoint for Getting User's List Metadata
app.get('/get-lists', requireVerifiedUser, async (req, res) => {
    const username = req.session.username;
    console.log(`[/get-lists] Request received for user: ${username}`);
    try {
        const lists = await getAllListMetadata(username);
        console.log(`[/get-lists] Found ${lists.length} lists for user.`);
        res.json(lists); // Send the array of list metadata
    } catch (error) {
        console.error("[/get-lists] Error retrieving lists:", error);
        res.status(500).json({ message: "Failed to retrieve lists.", details: error.message });
    }
});

// --- *** MODIFIED /create-qualtrics-survey Endpoint *** ---
app.post('/create-qualtrics-survey', requireVerifiedUser, async (req, res) => {
    // Destructure all expected fields from the request body
    const { surveyType, featureNumber, alphaBeta, clientFacingName, startDate, endDate } = req.body;
    const requestingUser = req.session.username; // Get username from session

    // Generate the survey name exactly as the Python script does
    let survey_type_suffix;
    if (surveyType.toLowerCase() === 'opt-in') survey_type_suffix = 'Opt_In';
    else if (surveyType.toLowerCase() === 'opt-out') survey_type_suffix = 'Opt_Out';
    else survey_type_suffix = surveyType.replace(/ /g, '_'); // fallback

    const finalSurveyName = `${featureNumber}-${alphaBeta}-${survey_type_suffix}`;
    console.log(`[Qualtrics Survey] Generated survey name for check: ${finalSurveyName}`);

    // Check if a survey with this name already exists in the database
    try {
        const checkQuery = "SELECT final_survey_name, qualtrics_survey_url FROM corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys WHERE final_survey_name = ?";
        const existingRows = await executeSnowflakeQuery(checkQuery, [finalSurveyName]);

        if (existingRows && existingRows.length > 0) {
            console.log(`[Qualtrics Survey] Survey with name ${finalSurveyName} already exists.`);
            const existingSurvey = existingRows[0];
            const surveyUrl = existingSurvey.QUALTRICS_SURVEY_URL || '#';
            return res.status(409).json({
                success: false,
                message: `A survey with this name already exists: <a href="${surveyUrl}" target="_blank">${existingSurvey.FINAL_SURVEY_NAME}</a>`,
                alreadyExists: true,
                surveyName: existingSurvey.FINAL_SURVEY_NAME,
                surveyUrl: surveyUrl,
                editLink: "/qualtrics_edit.html?survey_name=" + encodeURIComponent(existingSurvey.FINAL_SURVEY_NAME)
            });
        }
    } catch (dbError) {
        console.error("[DB Error - Qualtrics] Failed to check for existing survey:", dbError);
        // Continue with survey creation even if the check fails, to prevent blocking users if DB is temporarily unavailable
    }

    // Log received data including new dates
    console.log(`[Qualtrics Survey] Request received for user: ${requestingUser}`);
    console.log(`  Type: ${surveyType}, Feature: ${featureNumber}, Stage: ${alphaBeta}, Name: "${clientFacingName}", Start: ${startDate}, End: ${endDate}`);

    // --- Input Validation ---
    const errors = [];
    if (!surveyType || !['Opt-In', 'Opt-Out'].includes(surveyType)) errors.push("Invalid 'surveyType' (must be 'Opt-In' or 'Opt-Out').");
    if (!featureNumber || !/^FEATURE-\d{3,8}$/i.test(featureNumber)) errors.push("Invalid 'featureNumber' format (e.g., FEATURE-123).");
    if (!alphaBeta || alphaBeta.trim() === '') errors.push("Missing 'alphaBeta' stage identifier.");
    if (!clientFacingName || clientFacingName.trim() === '') errors.push("Missing 'clientFacingName'.");
    if (!startDate) errors.push("Missing 'startDate'."); // Validate start date presence
    if (!endDate) errors.push("Missing 'endDate'.");     // Validate end date presence
    // Basic date format check (YYYY-MM-DD) - Python does stricter validation
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !datePattern.test(startDate)) errors.push("Invalid 'startDate' format (use YYYY-MM-DD).");
    if (endDate && !datePattern.test(endDate)) errors.push("Invalid 'endDate' format (use YYYY-MM-DD).");

    if (errors.length > 0) {
        console.warn('[Qualtrics Survey] Validation failed:', errors);
        return res.status(400).json({ success: false, message: "Invalid request data.", errors: errors });
    }

    // --- Prepare for Python Script ---
    const pythonScriptPath = QUALTRICS_SCRIPT_PATH;
    if (!fs.existsSync(pythonScriptPath)) {
        console.error(`[Python Error - Qualtrics] Script file not found at: ${pythonScriptPath}`);
        return res.status(500).json({ success: false, message: `Server config error: Qualtrics survey script not found.` });
    }

    // Derive username format expected by the Python script's Snowflake lookup (remove domain if present)
    let pythonUsername = requestingUser;
    if (requestingUser && requestingUser.includes('@')) {
        pythonUsername = requestingUser.split('@')[0];
        console.log(`[Qualtrics Survey] Using username '${pythonUsername}' for Python script's user lookup.`);
    }

    // --- Construct Arguments for Python Script (ensure order matches Python's sys.argv expectation) ---
    const args = [
        surveyType,                    // sys.argv[1]
        featureNumber,                 // sys.argv[2]
        alphaBeta,                     // sys.argv[3]
        clientFacingName,              // sys.argv[4]
        pythonUsername,                // sys.argv[5] - username for Qualtrics sharing lookup
        startDate,                     // sys.argv[6] - NEW survey start date
        endDate                        // sys.argv[7] - NEW survey end date
    ];

    // Use direct path to python.exe from list_gen_v2 virtual environment to avoid 'py' launcher issues
    const pythonExecutable = 'c:\\poia_tools\\list_gen_v2\\venv\\Scripts\\python.exe'; // Use 'py' on Windows, 'python3' elsewhere
    console.log(`[Python - Qualtrics] Executing: ${pythonExecutable} "${pythonScriptPath}" ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

    // --- Spawn Python Process ---
    const child = spawn(pythonExecutable, [pythonScriptPath, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'] // Ignore stdin, capture stdout and stderr
    });

    let stdoutOutput = "";
    let stderrOutput = "";

    child.stdout.on('data', (data) => {
        const outputChunk = data.toString();
        console.log('[Python STDOUT - Qualtrics]', outputChunk); // Log Python's stdout
        stdoutOutput += outputChunk;
    });

    child.stderr.on('data', (data) => {
        const errorChunk = data.toString();
        console.error('[Python STDERR - Qualtrics]', errorChunk); // Log Python's stderr
        stderrOutput += errorChunk;
    });

    child.on('error', (err) => {
        // Handle errors spawning the process itself (e.g., python not found)
        console.error("[Python - Qualtrics] Failed to start script:", err);
        let userMessage = `Execution error: Failed to start survey creation script. ${err.message}`;
        if (err.code === 'ENOENT') {
            userMessage = `Execution error: '${pythonExecutable}' command not found. Is Python installed correctly and included in the system's PATH environment variable?`;
        }
        return res.status(500).json({ success: false, message: userMessage });
    });

    child.on('exit', (code, signal) => {
        console.log(`[Python - Qualtrics] Script exited with code ${code}, signal ${signal}`);

        let resultData;
        try {
            // Attempt to parse the *entire* stdout as JSON. Python script should only print JSON to stdout on success/handled failure.
            resultData = JSON.parse(stdoutOutput);
        } catch (parseError) {
            // If JSON parsing fails, it indicates a problem with the Python script's output format or an unhandled error.
            console.error("[Qualtrics Survey] Failed to parse JSON from Python stdout:", parseError);
            console.error("Python stdout received:", stdoutOutput);
            console.error("Python stderr received:", stderrOutput);
            // Create a failure response object
            resultData = {
                success: false,
                message: `Script finished (Code: ${code}), but the server failed to parse its response. Check server logs for details.`,
                details: stderrOutput.trim() || "No specific error output from script.",
                rawOutput: stdoutOutput // Include raw output for debugging if needed
            };
        }

        // Check both the exit code and the parsed 'success' flag from the JSON
        if (code !== 0 || !resultData.success) {
            console.error(`[Python Error - Qualtrics] Failure detected (Exit Code: ${code}, JSON Success Flag: ${resultData.success}).`);
            // If script reported success (JSON) but exited non-zero, update the message
            if (resultData.success && code !== 0) {
                 resultData.message = `Script exited unexpectedly (Code: ${code}) despite reporting success. ${resultData.message || ''}`.trim();
            } else if (!resultData.message) { // If no message was parsed, create a generic one
                 resultData.message = `Survey creation script failed (Code: ${code}). ${stderrOutput.trim() || 'No specific error details available.'}`;
            }
            resultData.success = false; // Ensure success is false
            return res.status(500).json(resultData); // Send failure response
        }

        // --- Success Path ---
        // Validate essential fields in the successful response from Python
        if (!resultData.surveyId || !resultData.surveyUrl) {
            console.error("[Qualtrics Survey] Python reported success, but response is missing 'surveyId' or 'surveyUrl'.");
            return res.status(500).json({ success: false, message: "Internal error: Script response was incomplete." });
        }

        console.log("[Qualtrics Survey] Process completed successfully.");
        res.status(200).json(resultData); // Send the successful JSON response from Python back to the frontend
    });
});
// --- *** END OF MODIFIED /create-qualtrics-survey Endpoint *** ---


// --- API Endpoints for Final Client List ---

// Endpoint to get Qualtrics surveys for a specific feature and stage
app.post('/api/get-qualtrics-surveys', requireVerifiedUser, async (req, res) => {
    try {
        const { featureNumber, stage } = req.body;
        const username = req.session.username;
        
        console.log(`[Qualtrics Surveys] Request received for user: ${username}, Feature: ${featureNumber}, Stage: ${stage}`);
        
        if (!featureNumber || !stage) {
            return res.status(400).json({ message: 'Feature number and stage are required' });
        }
        
        // Query to get all surveys for a specific feature and stage
        const query = `
            SELECT 
                qualtrics_survey_id AS "QUALTRICS_SURVEY_ID", 
                survey_end_date AS "SURVEY_END_DATE" 
            FROM corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys 
            WHERE feature_number = '${featureNumber}' AND alpha_beta ILIKE '%${stage}%'
        `;
        
        const queryResult = await executeSnowflakeQuery(query);
        
        if (queryResult.error) {
            console.error(`[Qualtrics Surveys Error] ${queryResult.error}`);
            return res.status(500).json({ message: 'Failed to fetch Qualtrics surveys', error: queryResult.error });
        }
        
        // Use the raw queryResult if it's an array, as we fixed in the other endpoint
        const surveys = Array.isArray(queryResult) ? queryResult : (queryResult.rows || []);
        console.log(`[Debug] Qualtrics surveys found: ${surveys.length}`);
        if (surveys.length > 0) {
            console.log(`[Debug] Sample survey: ${JSON.stringify(surveys[0])}`);
        }
        
        return res.json({ surveys });
    } catch (error) {
        console.error('[Qualtrics Surveys Error]', error);
        return res.status(500).json({ message: 'Server error fetching Qualtrics surveys', error: error.message });
    }
});

// Endpoint to pull the final client list
app.post('/api/pull-final-client-list', requireVerifiedUser, async (req, res) => {
    try {
        const { featureNumber, stage, wave } = req.body;
        const username = req.session.username;
        
        console.log(`[Final Client List] Request received for user: ${username}, Feature: ${featureNumber}, Stage: ${stage}, Wave: ${wave}`);
        
        if (!featureNumber || !stage || !wave) {
            return res.status(400).json({ message: 'Feature number, stage, and wave are required' });
        }
        
        // Escape single quotes for SQL safety
        const escapedFeatureNumber = featureNumber.replace(/'/g, "''");
        const escapedStage = stage.replace(/'/g, "''");
        const escapedWave = wave.replace(/'/g, "''");
        
        // Let's log the exact input values for debugging
        console.log(`[Debug] Raw input values - Feature: "${featureNumber}", Stage: "${stage}", Wave: "${wave}"`);
        console.log(`[Debug] Escaped values - Feature: "${escapedFeatureNumber}", Stage: "${escapedStage}", Wave: "${escapedWave}"`);
        
        // Test what our JOIN conditions will look like
        console.log(`[Debug] JOIN condition will be: SPLIT_PART(cl.feature_key,'_',1) = '${escapedFeatureNumber}'`);
        console.log(`[Debug] Survey JOIN will be: s.feature_number = '${escapedFeatureNumber}' AND s.alpha_beta ILIKE '%${escapedStage}%'`);
        console.log(`[Debug] WHERE clause will be: SPLIT_PART(ur.file_name,'_',1) = '${escapedFeatureNumber}' AND SPLIT_PART(ur.file_name,'_',2) ILIKE '%${escapedStage}%' AND SPLIT_PART(ur.file_name,'_',3) LIKE '${escapedWave}%'`);
        
        // Corrected query using client_list as base table (not restrictive user_requests join)
        const query = `
            WITH OptedOutContexts AS (
                SELECT DISTINCT
                    TRY_CAST(oo.q2_practice_id AS VARCHAR) AS Context_ID
                FROM CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_Q_OPT_OUT_SURVEY_RESPONSES oo 
                JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys s
                    ON oo.qualtrics_survey_id = s.qualtrics_survey_id
                WHERE oo.q7_opt_out_reason IS NOT NULL
                  AND oo.q7_opt_out_reason <> ''
                  AND s.feature_number = '${escapedFeatureNumber}'
                  AND s.alpha_beta ILIKE '%${escapedStage}%'
            )
            SELECT DISTINCT
                 SPLIT_PART(cl.feature_key, '_', 1) AS Feature,
                 SPLIT_PART(cl.feature_key, '_', 2) AS Stage,
                 TRIM(REGEXP_REPLACE(SPLIT_PART(cl.feature_key, '_', 3), '\\s*\\([^)]*\\)', '')) AS Wave,
                 cl."Context_ID",
                 IFNULL(cl."Account_Name", cl.account_name) CRT_practice_name,
                 ifnull(cl."Full_Name", cl.full_name) CRT_name,
                 ifnull(cl."Email", cl.email) CRT_email,
                 ifnull(oi.q5_organization_name, oo.q3_organization_name) respondent_practice_name,
                 ifnull(oi.q6_username, oo.q4_username) respondent_username,
                 ifnull(oi.q7_email_address, oo.q5_email_address) respondent_email,
                 IFNULL(cl."CSM_Tier", cl.csm_tier) AS tier,
                 IFNULL(cl."CS_Team", cl.cs_team) AS cs_team,
                 IFNULL(cl."CSM_Name", cl.csm_name) AS csm_name,
                 IFNULL(cl."Alpha_Beta_Status", cl.alpha_beta_status) AS alpha_beta_status,
                 IFNULL(cl."Opt_In_Out", cl.optin_out) AS test_type,
                 oi.q3_opt_in_choice AS opt_in,
                 oo.q7_opt_out_reason AS opt_out
            FROM corpanalytics_business_prod.scratchpad_prdpf.cr_client_list cl
            LEFT JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys s
                ON s.feature_number = SPLIT_PART(cl.feature_key, '_', 1)
                AND s.alpha_beta = SPLIT_PART(cl.feature_key, '_', 2)
            LEFT JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_q_opt_in_survey_responses oi
                ON oi.qualtrics_survey_id = s.qualtrics_survey_id
                AND TRY_CAST(oi.q4_practice_id AS VARCHAR) = TRY_CAST(cl."Context_ID" AS VARCHAR)
            LEFT JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_q_opt_out_survey_responses oo
                ON oo.qualtrics_survey_id = s.qualtrics_survey_id
                AND TRY_CAST(oo.q2_practice_id AS VARCHAR) = TRY_CAST(cl."Context_ID" AS VARCHAR)
            LEFT JOIN CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.SALESFORCE_MARKETINGCLOUD_CR mk 
                ON mk.emailaddress = ifnull(cl.email, cl."Email")
                AND split_part(mk.emailname, '_', 3) = SPLIT_PART(cl.feature_key, '_', 1)
                AND split_part(mk.emailname, '_', 4) = SPLIT_PART(cl.feature_key, '_', 2)
                AND split_part(mk.emailname, '_', 5) = TRIM(REGEXP_REPLACE(SPLIT_PART(cl.feature_key, '_', 3), '\\s*\\(([^)]*)\\)',''))
            WHERE SPLIT_PART(cl.feature_key, '_', 1) = '${escapedFeatureNumber}'
              AND SPLIT_PART(cl.feature_key, '_', 2) ILIKE '%${escapedStage}%'
              AND SPLIT_PART(cl.feature_key, '_', 3) LIKE '${escapedWave}%'
              AND mk.jobid is null
              AND (
                    (IFNULL(cl."Opt_In_Out", cl.optin_out) ILIKE '%in%' AND oi.q3_opt_in_choice = 1)
                 OR (IFNULL(cl."Opt_In_Out", cl.optin_out) ILIKE '%out%'
                        AND (
                            (LOWER(IFNULL(cl."Alpha_Beta_Status", cl.alpha_beta_status)) NOT ILIKE 'csm sends alpha/beta invites'
                                AND cl."Context_ID" NOT IN (SELECT Context_ID FROM OptedOutContexts))
                            OR
                            (LOWER(IFNULL(cl."Alpha_Beta_Status", cl.alpha_beta_status)) ILIKE 'csm sends alpha/beta invites'
                                AND oi.q3_opt_in_choice = 1)
                        )
                    )
                )
        `;
                
        // Log the actual query being executed
        console.log(`[Debug] Executing main client list query`);
        console.log(`[Debug] Query length: ${query.length} characters`);
        
        // Add debugging query to understand opt-out logic results
        const debugQuery = `
            WITH OptedOutContexts AS (
                SELECT DISTINCT
                    TRY_CAST(oo.q2_practice_id AS VARCHAR) AS Context_ID
                FROM CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_Q_OPT_OUT_SURVEY_RESPONSES oo
                JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys s
                      ON oo.qualtrics_survey_id = s.qualtrics_survey_id
                WHERE
                    oo.q7_opt_out_reason IS NOT NULL
                    AND oo.q7_opt_out_reason != ''
                    AND s.feature_number = '${escapedFeatureNumber}'
                    AND s.alpha_beta ILIKE '%${escapedStage}%'
            )
            SELECT 
                COUNT(*) as total_user_requests,
                COUNT(DISTINCT cl."Context_ID") as total_clients,
                SUM(CASE WHEN IFNULL(cl."Opt_In_Out", cl.optin_out) ILIKE '%in%' THEN 1 ELSE 0 END) as opt_in_clients,
                SUM(CASE WHEN IFNULL(cl."Opt_In_Out", cl.optin_out) ILIKE '%out%' THEN 1 ELSE 0 END) as opt_out_clients,
                SUM(CASE WHEN oi.q3_opt_in_choice = 1 THEN 1 ELSE 0 END) as survey_opt_ins,
                COUNT(DISTINCT ooc.Context_ID) as opted_out_contexts
            FROM corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests   ur
            JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_client_list     cl
                 ON  SPLIT_PART(ur.file_name,'_',1) = SPLIT_PART(cl.feature_key,'_',1)
                 AND SPLIT_PART(ur.file_name,'_',2) = SPLIT_PART(cl.feature_key,'_',2)
                 AND TRIM(REGEXP_REPLACE(SPLIT_PART(ur.file_name,'_',3),'\\s*\\(([^)]*)\\)',''))
                     = TRIM(REGEXP_REPLACE(SPLIT_PART(cl.feature_key,'_',3),'\\s*\\(([^)]*)\\)',''))
            LEFT JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys s
                   ON  s.feature_number = SPLIT_PART(ur.file_name,'_',1)
                   AND s.alpha_beta = SPLIT_PART(ur.file_name,'_',2)
            LEFT JOIN CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_Q_OPT_IN_SURVEY_RESPONSES oi
                   ON  oi.qualtrics_survey_id = s.qualtrics_survey_id
                   AND TRY_CAST(oi.q4_practice_id AS VARCHAR) = TRY_CAST(cl."Context_ID" AS VARCHAR)
            LEFT JOIN OptedOutContexts ooc ON ooc.Context_ID = TRY_CAST(cl."Context_ID" AS VARCHAR)
            WHERE SPLIT_PART(ur.file_name,'_',1) = '${escapedFeatureNumber}'
              AND SPLIT_PART(ur.file_name,'_',2) ILIKE '%${escapedStage}%'
              AND SPLIT_PART(ur.file_name,'_',3) LIKE '${escapedWave}%'
        `;
        
        console.log('[Debug] Running debugging query to understand data distribution...');
        const debugResult = await executeSnowflakeQuery(debugQuery);
        const debugData = Array.isArray(debugResult) ? debugResult[0] : (debugResult?.rows?.[0] || {});
        
        console.log('[Debug] Data distribution:');
        console.log(`  - Total user requests: ${debugData.TOTAL_USER_REQUESTS || debugData.total_user_requests || 0}`);
        console.log(`  - Total clients: ${debugData.TOTAL_CLIENTS || debugData.total_clients || 0}`);
        console.log(`  - Opt-in clients: ${debugData.OPT_IN_CLIENTS || debugData.opt_in_clients || 0}`);
        console.log(`  - Opt-out clients: ${debugData.OPT_OUT_CLIENTS || debugData.opt_out_clients || 0}`);
        console.log(`  - Survey opt-ins: ${debugData.SURVEY_OPT_INS || debugData.survey_opt_ins || 0}`);
        console.log(`  - Opted out contexts: ${debugData.OPTED_OUT_CONTEXTS || debugData.opted_out_contexts || 0}`);
        
        console.log(`[Debug] Main query parameters: Feature=${escapedFeatureNumber}, Stage=${escapedStage}, Wave=${escapedWave}`);
        
        // Now run the actual query
        
        const queryResult = await executeSnowflakeQuery(query);
        
        if (queryResult.error) {
            console.error(`[Final Client List Error] ${queryResult.error}`);
            return res.status(500).json({ message: 'Failed to fetch client list', error: queryResult.error });
        }
        
        // Debug log the query result structure
        console.log(`[Debug] Query result type: ${typeof queryResult}`);
        console.log(`[Debug] Query result is array: ${Array.isArray(queryResult)}`);
        console.log(`[Debug] Query result length: ${queryResult.length || 0}`);
        if (queryResult.length > 0) {
            console.log(`[Debug] Sample result item: ${JSON.stringify(queryResult[0])}`);
        } else {
            console.log(`[Debug] NO RESULTS FOUND! This suggests the query filtering is too restrictive.`);
            console.log(`[Debug] Check if these values exist in the database:`);
            console.log(`[Debug] - Feature number: ${escapedFeatureNumber}`);
            console.log(`[Debug] - Stage: ${escapedStage}`);
            console.log(`[Debug] - Wave: ${escapedWave}`);
        }
        
        // Use the raw queryResult if it's an array, instead of looking for a 'rows' property
        const clients = Array.isArray(queryResult) ? queryResult : (queryResult.rows || []);
        
        console.log(`[Debug] Final clients array length: ${clients.length}`);
        
        // --- Find opt-in survey respondents who are missing from the final client list ---
        const missingQuery = `
            WITH final_list_context_ids AS (
                SELECT DISTINCT TRY_CAST("Context_ID" AS VARCHAR) AS context_id
                FROM (
${query.replace(/;\s*$/, '')}
                )
            )
            SELECT DISTINCT
                TRY_CAST(oi.q4_practice_id AS VARCHAR) AS context_id,
                oi.q5_organization_name practice_name,
                oi.q6_username username,
                oi.q7_email_address email,
                s.final_survey_name,
                TO_CHAR(oi.response_end_date, 'YYYY-MM-DD HH12:MI:SS AM') AS response_date
            FROM corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys s
            INNER JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_q_opt_in_survey_responses oi
                ON oi.qualtrics_survey_id = s.qualtrics_survey_id
            LEFT JOIN final_list_context_ids fl ON fl.context_id = TRY_CAST(oi.q4_practice_id AS VARCHAR)
            WHERE
                s.feature_number = '${escapedFeatureNumber}'
                AND s.alpha_beta ILIKE '%${escapedStage}%'
                AND oi.q3_opt_in_choice = 1
                AND oi.q4_practice_id IS NOT NULL
                AND fl.context_id IS NULL
        `;
        
        console.log('[Debug] Executing missing clients query');
        console.log(`[Debug] Missing clients query parameters: Feature=${escapedFeatureNumber}, Stage=${escapedStage}`);
        console.log('[Debug] Full missing clients SQL query:');
        console.log(missingQuery);
        
        const missingResult = await executeSnowflakeQuery(missingQuery);
        const missingClients = Array.isArray(missingResult) ? missingResult : (missingResult.rows || []);
        
        console.log(`[Debug] Missing clients count: ${missingClients.length}`);
        if (missingClients.length > 0) {
            console.log(`[Debug] Missing client Context IDs: ${missingClients.map(c => c.CONTEXT_ID || c.context_id).join(', ')}`);
        } else {
            console.log(`[Debug] No missing clients found - all survey respondents are in the final list`);
        }
        
        return res.json({ clients, missingClients });
    } catch (error) {
        console.error('[Final Client List Error]', error);
        return res.status(500).json({ message: 'Server error fetching client list', error: error.message });
    }
});

// In-memory storage for client data (will be cleared after download or timeout)
const clientDataStore = {};

// Endpoint to temporarily store client data for download
app.post('/api/store-client-data-for-download', requireVerifiedUser, async (req, res) => {
    try {
        const { clientData, metadata } = req.body;
        const username = req.session.username;
        
        console.log(`[Store Client Data] Request received for user: ${username}, Feature: ${metadata?.featureNumber}, Stage: ${metadata?.stage}, Wave: ${metadata?.wave}`);
        
        if (!clientData || !Array.isArray(clientData) || clientData.length === 0) {
            return res.status(400).json({ message: 'No valid client data provided' });
        }
        
        // Generate a unique download ID
        const downloadId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        
        // Store the data with metadata
        clientDataStore[downloadId] = {
            clientData,
            metadata,
            username,
            timestamp: Date.now()
        };
        
        console.log(`[Store Client Data] Stored ${clientData.length} clients with ID: ${downloadId}`);
        
        // Set a timeout to clean up the data after 5 minutes
        setTimeout(() => {
            if (clientDataStore[downloadId]) {
                console.log(`[Store Client Data] Cleaning up stored data for ID: ${downloadId}`);
                delete clientDataStore[downloadId];
            }
        }, 5 * 60 * 1000); // 5 minutes
        
        return res.status(200).json({ downloadId });
    } catch (error) {
        console.error('[Store Client Data Error]', error);
        return res.status(500).json({ message: 'Server error storing client data', error: error.message });
    }
});

// Endpoint to download the final client list as Excel or CSV
app.get('/api/download-final-client-list', requireVerifiedUser, async (req, res) => {
    // Handle download using downloadId from query parameter
    if (req.query.downloadId) {
        try {
            const downloadId = req.query.downloadId;
            const username = req.session.username;
            
            console.log(`[Download Final Client List] GET request received for downloadId: ${downloadId}, user: ${username}`);
            
            // Check if the download ID exists in our store
            if (!clientDataStore[downloadId]) {
                console.error(`[Download Final Client List] Download ID not found: ${downloadId}`);
                return res.status(404).json({ message: 'Download ID not found or expired' });
            }
            
            // Get the stored data
            const storedData = clientDataStore[downloadId];
            
            // Verify the request is from the same user who stored the data
            if (storedData.username !== username) {
                console.error(`[Download Final Client List] User mismatch for downloadId: ${downloadId}`);
                return res.status(403).json({ message: 'Access denied' });
            }
            
            const clientData = storedData.clientData;
            const metadata = storedData.metadata || {};
            const { featureNumber, stage, wave } = metadata;
            
            console.log(`[Download Final Client List] Processing download for ${clientData.length} clients, Feature: ${featureNumber}, Stage: ${stage}, Wave: ${wave}`);
            
            // Clean up the stored data immediately after processing
            delete clientDataStore[downloadId];
            
            // Process the download using the client data and metadata
            // Set the filename base (without extension)
            const filenameBase = `${featureNumber || 'Feature'}_${stage || 'Stage'}_${wave || 'Wave'}_Final_Client_List`;
            
            // Generate Excel file from the client data (same code as in POST handler)
            try {
                const Excel = require('exceljs');
                console.log('[Download Final Client List] Creating Excel workbook');
                
                const workbook = new Excel.Workbook();
                const worksheet = workbook.addWorksheet('Client List');
                
                // Add headers based on first client object properties
                const headers = Object.keys(clientData[0]);
                worksheet.addRow(headers);
                
                // Add client data rows
                clientData.forEach(client => {
                    const row = [];
                    headers.forEach(header => {
                        row.push(client[header] !== null && client[header] !== undefined ? client[header] : '');
                    });
                    worksheet.addRow(row);
                });
                
                // Format header row
                worksheet.getRow(1).font = { bold: true };
                
                // Auto-size columns (with performance optimizations)
                let maxLength = 0;
                const sampleSize = Math.min(100, clientData.length); // Only sample a subset of rows for performance
                worksheet.columns.forEach(column => {
                    maxLength = 0;
                    // Only check the header and a sample of rows
                    for (let i = 1; i <= sampleSize + 1; i++) {
                        const cell = column.worksheet.getCell(i, column.number);
                        const cellValue = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
                        const cellLength = cellValue.length;
                        if (cellLength > maxLength) {
                            maxLength = cellLength;
                        }
                    }
                    column.width = maxLength < 10 ? 10 : Math.min(maxLength + 2, 50); // Cap width at 50
                });
                
                console.log('[Download Final Client List GET] *** REACHED POINT BEFORE OPT-OUT CODE ***');
                
                // Query for opt-out survey responses (same logic as POST endpoint)
                const optOutQuery = `
                    SELECT DISTINCT
                        oo.q2_practice_id,
                        oo.q3_organization_name,
                        oo.q4_username,
                        oo.q5_email_address,
                        CASE oo.q7_opt_out_reason
                            WHEN '1' THEN 'This isn''t the right time for our practice'
                            WHEN '2' THEN 'This test isn''t of interest to our practice'
                            WHEN '3' THEN 'We use other functionality/software for this feature'
                            WHEN '4' THEN 'We are currently in too many alphas/betas'
                            WHEN '5' THEN 'We are leaving athena or our practice is closing'
                            WHEN '6' THEN 'We want to opt-out of all future Alphas/Betas'
                            WHEN '7' THEN 'I personally want to opt-out of receiving these emails'
                            WHEN '8' THEN 'Other'
                            ELSE 'Unknown Reason'
                        END AS opt_out_reason,
                        oo.q7_opt_out_reason_other_text,
                        TO_CHAR(oo.response_end_date, 'YYYY-MM-DD HH12:MI:SS AM') AS response_date
                    FROM CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_Q_OPT_OUT_SURVEY_RESPONSES oo 
                    JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys s
                        ON oo.qualtrics_survey_id = s.qualtrics_survey_id
                    WHERE oo.q7_opt_out_reason IS NOT NULL
                      AND oo.q7_opt_out_reason <> ''
                      AND s.feature_number = '${(featureNumber || '').replace(/'/g, "''")}'  
                      AND s.alpha_beta ILIKE '%${(stage || '').replace(/'/g, "''")}%'
                `;
                
                console.log('[Download Final Client List GET] *** EXECUTING OPT-OUT SURVEY QUERY ***');
                console.log(`[Download Final Client List GET] Query parameters - Feature: ${featureNumber}, Stage: ${stage}`);
                console.log(`[Download Final Client List GET] Opt-out query: ${optOutQuery}`);
                
                try {
                    // Execute opt-out survey query
                    const optOutResults = await executeSnowflakeQuery(optOutQuery);
                    
                    // Add opt-outs worksheet if there are results
                    if (optOutResults && optOutResults.length > 0) {
                        console.log(`[Download Final Client List GET] *** FOUND ${optOutResults.length} OPT-OUT RESPONSES - CREATING WORKSHEET ***`);
                        console.log(`[Download Final Client List GET] Opt-out data preview:`, JSON.stringify(optOutResults.slice(0, 2), null, 2));
                        
                        const optOutWorksheet = workbook.addWorksheet('opt-outs');
                        
                        // Define columns for opt-out data
                        const optOutColumns = [
                            { header: 'Practice ID', key: 'q2_practice_id', width: 15 },
                            { header: 'Organization Name', key: 'q3_organization_name', width: 30 },
                            { header: 'Username', key: 'q4_username', width: 20 },
                            { header: 'Email Address', key: 'q5_email_address', width: 30 },
                            { header: 'Opt Out Reason', key: 'opt_out_reason', width: 40 },
                            { header: 'Other Reason Text', key: 'q7_opt_out_reason_other_text', width: 50 },
                            { header: 'Response Date', key: 'response_date', width: 20 }
                        ];
                        
                        optOutWorksheet.columns = optOutColumns;
                        
                        // Add opt-out data rows
                        optOutResults.forEach(row => {
                            optOutWorksheet.addRow({
                                q2_practice_id: row.Q2_PRACTICE_ID || row.q2_practice_id,
                                q3_organization_name: row.Q3_ORGANIZATION_NAME || row.q3_organization_name,
                                q4_username: row.Q4_USERNAME || row.q4_username,
                                q5_email_address: row.Q5_EMAIL_ADDRESS || row.q5_email_address,
                                opt_out_reason: row.OPT_OUT_REASON || row.opt_out_reason,
                                q7_opt_out_reason_other_text: row.Q7_OPT_OUT_REASON_OTHER_TEXT || row.q7_opt_out_reason_other_text,
                                response_date: row.RESPONSE_DATE || row.response_date
                            });
                        });
                        
                        // Style the opt-out worksheet header row
                        optOutWorksheet.getRow(1).font = { bold: true };
                        optOutWorksheet.getRow(1).fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFFFE4B5' } // Light orange background to differentiate from main sheet
                        };
                        
                        // Auto-filter for opt-out worksheet
                        optOutWorksheet.autoFilter = {
                            from: { row: 1, column: 1 },
                            to: { row: 1, column: optOutColumns.length }
                        };
                        
                        // Set borders for opt-out worksheet
                        optOutWorksheet.eachRow({ includeEmpty: false }, function(row) {
                            row.eachCell({ includeEmpty: false }, function(cell) {
                                cell.border = {
                                    top: { style: 'thin' },
                                    left: { style: 'thin' },
                                    bottom: { style: 'thin' },
                                    right: { style: 'thin' }
                                };
                            });
                        });
                    } else {
                        console.log('[Download Final Client List GET] *** NO OPT-OUT RESPONSES FOUND - SKIPPING WORKSHEET ***');
                    }
                } catch (error) {
                    console.error('[Download Final Client List GET] *** ERROR IN OPT-OUT QUERY ***:', error);
                    // Continue without the opt-out worksheet rather than failing the entire download
                }
                
                // Set response headers for Excel download
                const filename = filenameBase + '.xlsx';
                console.log(`[Download Final Client List] Sending Excel file: ${filename}`);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
                
                // Write workbook to response
                await workbook.xlsx.write(res);
                res.end();
                console.log('[Download Final Client List] Excel file sent successfully');
                return;
            } catch (excelError) {
                // If Excel generation fails, fall back to CSV
                console.error('[Download Final Client List] Failed to create Excel, falling back to CSV:', excelError);
                
                try {
                    console.log('[Download Final Client List] Generating CSV');
                    const headers = Object.keys(clientData[0]);
                    let csv = headers.join(',') + '\r\n';
                    
                    clientData.forEach(client => {
                        const row = headers.map(header => {
                            const value = client[header];
                            if (value === null || value === undefined) return '';
                            // Escape quotes and wrap in quotes if value contains comma, newline, or quote
                            const stringValue = String(value);
                            if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
                                return '"' + stringValue.replace(/"/g, '""') + '"';
                            }
                            return stringValue;
                        });
                        csv += row.join(',') + '\r\n';
                    });
                    
                    // Set response headers for CSV download
                    const filename = filenameBase + '.csv';
                    console.log(`[Download Final Client List] Sending CSV file: ${filename}`);
                    res.setHeader('Content-Type', 'text/csv');
                    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
                    
                    // Send CSV
                    res.send(csv);
                    console.log('[Download Final Client List] CSV file sent successfully');
                    return;
                } catch (csvError) {
                    console.error('[Download Final Client List] Failed to create CSV:', csvError);
                    throw csvError;
                }
            }
        } catch (error) {
            console.error('[Download Final Client List GET Error]', error);
            return res.status(500).json({ 
                message: 'Server error downloading client list',
                error: error.message,
                stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
            });
        }
    } else {
        // If no downloadId is provided, return an error
        console.error('[Download Final Client List] Missing downloadId parameter');
        return res.status(400).json({ message: 'Missing downloadId parameter' });
    }
});

// Endpoint to download the final client list as Excel or CSV (POST method for backward compatibility)
app.post('/api/download-final-client-list', requireVerifiedUser, async (req, res) => {
    try {
        const { clientData, featureNumber, stage, wave } = req.body;
        const username = req.session.username;
        
        console.log(`[Download Final Client List] Request received for user: ${username}, Feature: ${featureNumber}, Stage: ${stage}, Wave: ${wave}`);
        console.log(`[Debug] Request body type: ${typeof req.body}`);
        console.log(`[Debug] clientData type: ${typeof clientData}`);
        if (typeof clientData === 'string') {
            console.log(`[Debug] clientData string length: ${clientData.length}`);
        }
        
        // Validate input
        if (!clientData) {
            console.error('[Download Final Client List] Missing clientData');
            return res.status(400).json({ message: 'Missing client data' });
        }
        if (!featureNumber || !stage || !wave) {
            console.error('[Download Final Client List] Missing parameters:', { featureNumber, stage, wave });
            return res.status(400).json({ message: 'Missing required fields (featureNumber, stage, or wave)' });
        }
        
        // Parse the client data if it's a string
        let parsedClientData;
        try {
            parsedClientData = typeof clientData === 'string' ? JSON.parse(clientData) : clientData;
            console.log(`[Debug] Successfully parsed client data. Parsed data type: ${typeof parsedClientData}`);
            console.log(`[Debug] Parsed data is array: ${Array.isArray(parsedClientData)}`);
            if (Array.isArray(parsedClientData)) {
                console.log(`[Debug] Parsed data length: ${parsedClientData.length}`);
                if (parsedClientData.length > 0) {
                    console.log(`[Debug] Sample client:`, JSON.stringify(parsedClientData[0]).substring(0, 100) + '...');
                }
            }
        } catch (parseError) {
            console.error('[Download Final Client List] Failed to parse client data:', parseError);
            console.error('[Download Final Client List] Raw client data preview:', 
                          typeof clientData === 'string' ? clientData.substring(0, 100) + '...' : clientData);
            return res.status(400).json({ message: 'Invalid client data format', error: parseError.message });
        }
        
        if (!Array.isArray(parsedClientData) || parsedClientData.length === 0) {
            console.error('[Download Final Client List] Client data is not an array or is empty');
            return res.status(400).json({ message: 'No client data to download or invalid format' });
        }
        
        // Set the filename base (without extension)
        const filenameBase = `${featureNumber}_${stage}_${wave}_Final_Client_List`;
        
        // Try Excel format first
        try {
            const Excel = require('exceljs');
            console.log('[Download Final Client List] Creating Excel workbook');
            
            const workbook = new Excel.Workbook();
            const worksheet = workbook.addWorksheet('Client List');
            
            // Add headers based on first client object properties
            const headers = Object.keys(parsedClientData[0]);
            worksheet.addRow(headers);
            console.log(`[Debug] Added ${headers.length} headers to Excel: ${headers.join(', ').substring(0, 100)}...`);
            
            // Add client data rows
            console.log(`[Debug] Adding ${parsedClientData.length} rows to Excel`);
            parsedClientData.forEach((client, index) => {
                try {
                    const row = [];
                    headers.forEach(header => {
                        row.push(client[header] !== null && client[header] !== undefined ? client[header] : '');
                    });
                    worksheet.addRow(row);
                    if (index % 100 === 0) {
                        console.log(`[Debug] Added ${index} rows so far...`);
                    }
                } catch (rowError) {
                    console.error(`[Debug] Error adding row ${index}:`, rowError);
                    // Continue with other rows
                }
            });
            
            // Format header row
            worksheet.getRow(1).font = { bold: true };
            
            // Auto-size columns
            try {
                console.log('[Debug] Auto-sizing Excel columns');
                worksheet.columns.forEach(column => {
                    let maxLength = 0;
                    column.eachCell({ includeEmpty: true }, function(cell, rowNumber) {
                        const cellValue = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
                        const cellLength = cellValue.length;
                        if (cellLength > maxLength) {
                            maxLength = cellLength;
                        }
                    });
                    column.width = maxLength < 10 ? 10 : Math.min(maxLength + 2, 50); // Cap width at 50
                });
            } catch (autoSizeError) {
                console.error('[Debug] Error auto-sizing columns:', autoSizeError);
                // Continue without auto-sizing
            }
            
            // Set response headers for Excel download
            const filename = filenameBase + '.xlsx';
            console.log(`[Download Final Client List] Sending Excel file: ${filename}`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
            
            // Write workbook to response
            await workbook.xlsx.write(res);
            res.end();
            console.log('[Download Final Client List] Excel file sent successfully');
            return;
        } catch (excelError) {
            // If Excel generation fails (e.g., exceljs not installed), fall back to CSV
            console.error('[Download Final Client List] Failed to create Excel, falling back to CSV:', excelError);
            
            // Generate CSV
            try {
                console.log('[Download Final Client List] Generating CSV');
                const headers = Object.keys(parsedClientData[0]);
                let csv = headers.join(',') + '\r\n';
                
                parsedClientData.forEach(client => {
                    const row = headers.map(header => {
                        const value = client[header];
                        if (value === null || value === undefined) return '';
                        // Escape quotes and wrap in quotes if value contains comma, newline, or quote
                        const stringValue = String(value);
                        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
                            return '"' + stringValue.replace(/"/g, '""') + '"';
                        }
                        return stringValue;
                    });
                    csv += row.join(',') + '\r\n';
                });
                
                // Set response headers for CSV download
                const filename = filenameBase + '.csv';
                console.log(`[Download Final Client List] Sending CSV file: ${filename}`);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
                
                // Send CSV
                res.send(csv);
                console.log('[Download Final Client List] CSV file sent successfully');
                return;
            } catch (csvError) {
                console.error('[Download Final Client List] Failed to create CSV:', csvError);
                throw csvError; // Rethrow to be caught by the outer try-catch
            }
        }
    } catch (error) {
        console.error('[Download Final Client List Error]', error);
        return res.status(500).json({ 
            message: 'Server error downloading client list',
            error: error.message,
            stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
        });
    }
});

// Endpoint to download missing clients as Excel
app.post('/api/download-missing-clients', requireVerifiedUser, async (req, res) => {
    try {
        const { missingData, featureNumber, stage, wave } = req.body;
        const username = req.session.username;
        
        console.log(`[Download Missing Clients] Request received for user: ${username}, Feature: ${featureNumber}, Stage: ${stage}, Wave: ${wave}`);
        
        if (!missingData || !featureNumber || !stage || !wave) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        // Parse the missing client data if it's a string
        const parsedMissingData = typeof missingData === 'string' ? JSON.parse(missingData) : missingData;
        
        if (!Array.isArray(parsedMissingData) || parsedMissingData.length === 0) {
            return res.status(400).json({ message: 'No missing client data to download' });
        }
        
        // Create Excel workbook
        const Excel = require('exceljs');
        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Missing Clients');
        
        // Add headers based on first object properties
        const headers = Object.keys(parsedMissingData[0]);
        worksheet.addRow(headers);
        
        // Add missing client data rows
        parsedMissingData.forEach(client => {
            const row = [];
            headers.forEach(header => {
                row.push(client[header] !== null && client[header] !== undefined ? client[header] : '');
            });
            worksheet.addRow(row);
        });
        
        // Format header row
        worksheet.getRow(1).font = { bold: true };
        
        // Auto-size columns
        worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: true }, function(cell, rowNumber) {
                const cellValue = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
                const cellLength = cellValue.length;
                if (cellLength > maxLength) {
                    maxLength = cellLength;
                }
            });
            column.width = maxLength < 10 ? 10 : maxLength + 2;
        });
        
        // Set the filename
        const filename = `${featureNumber}_${stage}_${wave}_Missing_Clients.xlsx`;
        
        // Set response headers for Excel download
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        
        // Write workbook to response
        await workbook.xlsx.write(res);
        res.end();
        
    } catch (error) {
        console.error('[Download Missing Clients Error]', error);
        return res.status(500).json({ message: 'Server error downloading missing clients', error: error.message });
    }
});

// Endpoint to log client list data with verification for Top 25 clients
app.post('/api/log-top25-verification', requireVerifiedUser, async (req, res) => {
    try {
        const { featureNumber, stage, wave, initials, verified, clients } = req.body;
        const username = req.session.username;
        const timestamp = new Date().toISOString();
        
        console.log(`[Client List Logging] Request received for user: ${username}, Feature: ${featureNumber}, Stage: ${stage}, Wave: ${wave}`);
        
        if (!featureNumber || !stage || !wave || !clients) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        // For Top 25 verification, these are required
        if (verified === true && !initials) {
            return res.status(400).json({ message: 'Initials are required for Top 25 verification' });
        }
        
        // Check if table exists, if not, create it
        const checkTableQuery = `
            SELECT COUNT(*) as table_exists 
            FROM information_schema.tables 
            WHERE table_schema = 'CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF' 
            AND table_name = 'CR_FINAL_LIST_PULL'
        `;
        
        const tableCheckResult = await executeSnowflakeQuery(checkTableQuery);
        const tableExists = Array.isArray(tableCheckResult) && tableCheckResult[0] && tableCheckResult[0].table_exists > 0;
        
        if (!tableExists) {
            // Create the table if it doesn't exist with client-level data
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_FINAL_LIST_PULL (
                    ID NUMBER AUTOINCREMENT,
                    PULL_ID VARCHAR, -- Unique ID for this pull operation
                    USERNAME VARCHAR, -- Who ran the operation
                    PULL_TIMESTAMP TIMESTAMP_NTZ, -- When the operation was run
                    FEATURE_NUMBER VARCHAR,
                    STAGE VARCHAR,
                    WAVE VARCHAR,
                    CONTEXT_ID VARCHAR, -- Client identifier
                    TIER VARCHAR,
                    CS_TEAM VARCHAR,
                    CSM_NAME VARCHAR,
                    ALPHA_BETA_STATUS VARCHAR,
                    TEST_TYPE VARCHAR,
                    OPT_IN NUMBER,
                    OPT_OUT VARCHAR,
                    IS_TOP25 BOOLEAN,
                    TOP25_VERIFIED BOOLEAN,
                    VERIFICATION_INITIALS VARCHAR,
                    VERIFICATION_TIMESTAMP TIMESTAMP_NTZ
                )
            `;
            
            const createTableResult = await executeSnowflakeQuery(createTableQuery);
            
            if (createTableResult.error) {
                console.error(`[Client List Logging Error] Table creation failed: ${createTableResult.error}`);
                return res.status(500).json({ message: 'Failed to create table', error: createTableResult.error });
            }
            
            console.log('[Client List Logging] Created CR_FINAL_LIST_PULL table');
        }
        
        // Generate a unique ID for this pull operation
        const pullId = `${featureNumber}_${stage}_${wave}_${Date.now()}`;
        
        // Process clients for bulk insert
        const valueRows = [];
        for (const client of clients) {
            const tier = (client.TIER || client.tier || '').toString().toLowerCase();
            const isTop25 = tier.includes('top 25');

            const contextIdValue = (client.CONTEXT_ID || client.Context_ID || '').toString().replace(/'/g, "''");
            const tierValue = (client.TIER || client.tier || '').toString().replace(/'/g, "''");
            const csTeamValue = (client.CS_TEAM || client.cs_team || '').toString().replace(/'/g, "''");
            const csmNameValue = (client.CSM_NAME || client.csm_name || '').toString().replace(/'/g, "''");
            const alphaBetaStatusValue = (client.ALPHA_BETA_STATUS || client.alpha_beta_status || '').toString().replace(/'/g, "''");
            const testTypeValue = (client.TEST_TYPE || client.test_type || '').toString().replace(/'/g, "''");
            const optInValue = client.OPT_IN || client.opt_in || 'NULL';
            const optOutValue = client.OPT_OUT || client.opt_out ? `'${(client.OPT_OUT || client.opt_out).toString().replace(/'/g, "''")}'` : 'NULL';
            const top25VerifiedValue = isTop25 && verified ? true : false;
            const verificationInitialsValue = isTop25 && verified && initials ? `'${initials.replace(/'/g, "''")}'` : 'NULL';
            const verificationTimestampValue = isTop25 && verified ? `'${timestamp}'` : 'NULL';

            valueRows.push(
                `('${pullId}', '${username}', '${timestamp}', '${featureNumber}', '${stage}', '${wave}', ` +
                `'${contextIdValue}', '${tierValue}', '${csTeamValue}', '${csmNameValue}', ` +
                `'${alphaBetaStatusValue}', '${testTypeValue}', ${optInValue}, ${optOutValue}, ` +
                `${isTop25}, ${top25VerifiedValue}, ${verificationInitialsValue}, ${verificationTimestampValue})`
            );
        }

        if (valueRows.length > 0) {
            const bulkInsertQuery = `
                INSERT INTO CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_FINAL_LIST_PULL (
                    PULL_ID, USERNAME, PULL_TIMESTAMP, FEATURE_NUMBER, STAGE, WAVE,
                    CONTEXT_ID, TIER, CS_TEAM, CSM_NAME, ALPHA_BETA_STATUS, TEST_TYPE,
                    OPT_IN, OPT_OUT, IS_TOP25, TOP25_VERIFIED, VERIFICATION_INITIALS, VERIFICATION_TIMESTAMP
                ) VALUES 
                ${valueRows.join(',\n                ')}
            `;
            try {
                await executeSnowflakeQuery(bulkInsertQuery);
                console.log(`[Client List Logging] Bulk inserted ${valueRows.length} client records.`);
            } catch (error) {
                console.error(`[Client List Logging Error] Bulk insert failed: ${error}`);
                // Decide if you want to return an error or just log and continue
                // For now, just logging, and the original success message will be sent.
            }
        }
        
        return res.json({ message: 'Client data logged successfully', pullId });
    } catch (error) {
        console.error('[Client List Logging Error]', error);
        return res.status(500).json({ message: 'Server error logging client data', error: error.message });
    }
});

// Endpoint to download the final client list as Excel
app.post('/api/download-final-client-list', requireVerifiedUser, async (req, res) => {
    try {
        const { clientData, featureNumber, stage, wave } = req.body;
        const username = req.session.username;
        
        console.log(`[Download Final Client List] Request received for user: ${username}, Feature: ${featureNumber}, Stage: ${stage}, Wave: ${wave}`);
        
        if (!clientData || !featureNumber || !stage || !wave) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        const clients = typeof clientData === 'string' ? JSON.parse(clientData) : clientData;
        
        if (!clients || !Array.isArray(clients) || clients.length === 0) {
            return res.status(400).json({ message: 'Invalid client data' });
        }
        
        // Create an Excel file with ExcelJS
        const Excel = require('exceljs');
        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Final Client List');
        
        // Define columns based on the first client object's keys
        // Convert snake_case to Title Case for column headers
        const columns = Object.keys(clients[0]).map(key => {
            return {
                header: key.split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' '),
                key: key,
                width: 20
            };
        });
        
        worksheet.columns = columns;
        
        // Add client rows
        clients.forEach(client => {
            worksheet.addRow(client);
        });
        
        // Style the header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE6E6FA' } // Light purple background
        };
        
        // Auto-filter
        worksheet.autoFilter = {
            from: { row: 1, column: 1 },
            to: { row: 1, column: columns.length }
        };
        
        // Set borders
        worksheet.eachRow({ includeEmpty: false }, function(row) {
            row.eachCell({ includeEmpty: false }, function(cell) {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });
        
        console.log('[Download Final Client List] *** REACHED POINT BEFORE OPT-OUT CODE ***');
        
        // Query for opt-out survey responses
        const optOutQuery = `
            SELECT DISTINCT
                oo.q2_practice_id,
                oo.q3_organization_name,
                oo.q4_username,
                oo.q5_email_address,
                CASE oo.q7_opt_out_reason
                    WHEN '1' THEN 'This isn''t the right time for our practice'
                    WHEN '2' THEN 'This test isn''t of interest to our practice'
                    WHEN '3' THEN 'We use other functionality/software for this feature'
                    WHEN '4' THEN 'We are currently in too many alphas/betas'
                    WHEN '5' THEN 'We are leaving athena or our practice is closing'
                    WHEN '6' THEN 'We want to opt-out of all future Alphas/Betas'
                    WHEN '7' THEN 'I personally want to opt-out of receiving these emails'
                    WHEN '8' THEN 'Other'
                    ELSE 'Unknown Reason'
                END AS opt_out_reason,
                oo.q7_opt_out_reason_other_text,
                TO_CHAR(oo.response_end_date, 'YYYY-MM-DD HH12:MI:SS AM') AS response_date
            FROM CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_Q_OPT_OUT_SURVEY_RESPONSES oo 
            JOIN corpanalytics_business_prod.scratchpad_prdpf.cr_opt_in_out_surveys s
                ON oo.qualtrics_survey_id = s.qualtrics_survey_id
            WHERE oo.q7_opt_out_reason IS NOT NULL
              AND oo.q7_opt_out_reason <> ''
              AND s.feature_number = '${featureNumber.replace(/'/g, "''")}'  
              AND s.alpha_beta ILIKE '%${stage.replace(/'/g, "''")}%'
        `;
        
        console.log('[Download Final Client List] *** EXECUTING OPT-OUT SURVEY QUERY ***');
        console.log(`[Download Final Client List] Query parameters - Feature: ${featureNumber}, Stage: ${stage}`);
        console.log(`[Download Final Client List] Opt-out query: ${optOutQuery}`);
        
        try {
            // Execute opt-out survey query
            const optOutResults = await executeSnowflakeQuery(optOutQuery);
            
            // Add opt-outs worksheet if there are results
            if (optOutResults && optOutResults.length > 0) {
                console.log(`[Download Final Client List] *** FOUND ${optOutResults.length} OPT-OUT RESPONSES - CREATING WORKSHEET ***`);
                console.log(`[Download Final Client List] Opt-out data preview:`, JSON.stringify(optOutResults.slice(0, 2), null, 2));
                
                const optOutWorksheet = workbook.addWorksheet('opt-outs');
                
                // Define columns for opt-out data
                const optOutColumns = [
                    { header: 'Practice ID', key: 'q2_practice_id', width: 15 },
                    { header: 'Organization Name', key: 'q3_organization_name', width: 30 },
                    { header: 'Username', key: 'q4_username', width: 20 },
                    { header: 'Email Address', key: 'q5_email_address', width: 30 },
                    { header: 'Opt Out Reason', key: 'opt_out_reason', width: 40 },
                    { header: 'Other Reason Text', key: 'q7_opt_out_reason_other_text', width: 50 },
                    { header: 'Response Date', key: 'response_date', width: 20 }
                ];
                
                optOutWorksheet.columns = optOutColumns;
                
                // Add opt-out data rows
                optOutResults.forEach(row => {
                    optOutWorksheet.addRow({
                        q2_practice_id: row.Q2_PRACTICE_ID || row.q2_practice_id,
                        q3_organization_name: row.Q3_ORGANIZATION_NAME || row.q3_organization_name,
                        q4_username: row.Q4_USERNAME || row.q4_username,
                        q5_email_address: row.Q5_EMAIL_ADDRESS || row.q5_email_address,
                        opt_out_reason: row.OPT_OUT_REASON || row.opt_out_reason,
                        q7_opt_out_reason_other_text: row.Q7_OPT_OUT_REASON_OTHER_TEXT || row.q7_opt_out_reason_other_text,
                        response_date: row.RESPONSE_DATE || row.response_date
                    });
                });
                
                // Style the opt-out worksheet header row
                optOutWorksheet.getRow(1).font = { bold: true };
                optOutWorksheet.getRow(1).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFFE4B5' } // Light orange background to differentiate from main sheet
                };
                
                // Auto-filter for opt-out worksheet
                optOutWorksheet.autoFilter = {
                    from: { row: 1, column: 1 },
                    to: { row: 1, column: optOutColumns.length }
                };
                
                // Set borders for opt-out worksheet
                optOutWorksheet.eachRow({ includeEmpty: false }, function(row) {
                    row.eachCell({ includeEmpty: false }, function(cell) {
                        cell.border = {
                            top: { style: 'thin' },
                            left: { style: 'thin' },
                            bottom: { style: 'thin' },
                            right: { style: 'thin' }
                        };
                    });
                });
            } else {
                console.log('[Download Final Client List] *** NO OPT-OUT RESPONSES FOUND - SKIPPING WORKSHEET ***');
            }
        } catch (error) {
            console.error('[Download Final Client List] *** ERROR IN OPT-OUT QUERY ***:', error);
            // Continue without the opt-out worksheet rather than failing the entire download
        }
        
        // Generate Excel file
        const filename = `${featureNumber}_${stage}_${wave}_final_list.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        // Write to a buffer and send
        await workbook.xlsx.write(res);
        res.end();
        
        // Log the download
        console.log(`[Download Final Client List] Excel file ${filename} downloaded by ${username}`);
    } catch (error) {
        console.error('[Download Final Client List Error]', error);
        return res.status(500).json({ message: 'Server error generating download', error: error.message });
    }
});

// Endpoint to download missing survey clients as Excel
app.post('/api/download-missing-clients', requireVerifiedUser, async (req, res) => {
    try {
        const { missingData, featureNumber, stage, wave } = req.body;
        const username = req.session.username;
        console.log(`[Download Missing Clients] Request received for user: ${username}, Feature: ${featureNumber}, Stage: ${stage}, Wave: ${wave}`);

        if (!missingData || !featureNumber || !stage || !wave) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const missingClients = typeof missingData === 'string' ? JSON.parse(missingData) : missingData;
        if (!Array.isArray(missingClients) || missingClients.length === 0) {
            return res.status(400).json({ message: 'No missing clients to download' });
        }

        const Excel = require('exceljs');
        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Missing Clients');

        const columns = Object.keys(missingClients[0]).map(key => ({
            header: key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
            key,
            width: 20
        }));
        worksheet.columns = columns;
        missingClients.forEach(item => worksheet.addRow(item));
        worksheet.getRow(1).font = { bold: true };
        worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

        const filename = `${featureNumber}_${stage}_${wave}_missing_survey_clients.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        await workbook.xlsx.write(res);
        res.end();

        console.log(`[Download Missing Clients] Excel file ${filename} downloaded by ${username}`);
    } catch (error) {
        console.error('[Download Missing Clients Error]', error);
        return res.status(500).json({ message: 'Server error generating missing clients download', error: error.message });
    }
});

// --- Public/Unprotected API Endpoints ---
// (These don't require login)

// Endpoint for searching feature content definitions
app.get('/search-features-by-criteria', async (req, res) => {
    console.log(`\n--- ENTERING /search-features-by-criteria HANDLER ---`);
    console.log(`   Query Params Received:`, req.query);
    const { featureKey, stage, waveNumber } = req.query;
    // Validate input
    const featurePattern = /^FEATURE-\d{3,8}$/i;
    if (!featureKey) { errors.push("featureKey is required."); } else if (!featurePattern.test(featureKey)) { errors.push("Invalid featureKey format (e.g., FEATURE-123)."); }
    if (stage && !/^[a-z0-9]+$/i.test(stage)) { errors.push("Invalid stage format (alphanumeric expected)."); } // Allow only alphanumeric stage
    if (waveNumber && !/^\d+$/.test(waveNumber)) { errors.push("Invalid waveNumber format (digits expected)."); }

    if (errors.length > 0) {
        console.warn(`[/search-features-by-criteria] Validation failed:`, errors);
        return res.status(400).json({ message: "Invalid search criteria.", errors: errors });
    }
    try {
        const upperFeatureKey = featureKey.toUpperCase();
        console.log(`[/search-features-by-criteria] Searching DB for Feature: ${upperFeatureKey}, Stage: ${stage || 'Any'}, Wave: ${waveNumber || 'Any'}`);
        const features = await searchFeaturesByCriteria(upperFeatureKey, stage, waveNumber); // Call DB helper
        console.log(`[/search-features-by-criteria] Found ${features.length} matching definitions.`);
        res.status(200).json(features); // Send results back
        console.log(`--- EXITING /search-features-by-criteria HANDLER (Success) ---`);
    } catch (error) {
        console.error("[/search-features-by-criteria] ERROR executing search:", error);
        res.status(500).json({ message: "Failed to search features.", details: error.message });
        console.log(`--- EXITING /search-features-by-criteria HANDLER (Error) ---`);
    }
});

// Endpoint for getting just the client-facing name for a feature key
app.get('/get-feature-name', async (req, res) => {
    const featureKey = req.query.featureKey;
    console.log(`[/get-feature-name] Request received for featureKey: ${featureKey}`);
    // Validate input
    if (!featureKey) { return res.status(400).json({ message: "Missing featureKey query parameter." }); }
    const featurePattern = /^FEATURE-\d{3,8}$/i;
    if (!featurePattern.test(featureKey)) { return res.status(400).json({ message: "Invalid featureKey format (e.g., FEATURE-123)." }); }

    try {
        const featureName = await getFeatureNameFromDB(featureKey); // Call DB helper
        if (featureName !== null) {
            console.log(`[/get-feature-name] Found name for ${featureKey}: "${featureName}"`);
            res.status(200).json({ clientFacingFeatureName: featureName });
        } else {
            console.warn(`[/get-feature-name] Client-facing name not found for: ${featureKey}`);
            res.status(404).json({ message: `Client-facing name not found, please ensure to edit in the survey` });
        }
    } catch (error) {
        console.error("[/get-feature-name] Error retrieving feature name:", error);
        res.status(500).json({ message: "Failed to retrieve feature name.", details: error.message });
    }
});


// --- Helper Functions (Using imported executeSnowflakeQuery from dbUtils.js) ---
// (Make sure these functions correctly use the imported DB utility)

// Fetches detailed content definition for a specific feature/stage/wave
async function getFeatureContentData(featureKey, stage, waveNumber) {
    console.log(`[DB getFeatureContentData] Fetching content for ${featureKey}, ${stage}, ${waveNumber}`);
    const query = `
        SELECT /* Feature Content Fetch */
            FEATURE_KEY, STAGE, WAVE_NUMBER,
            ALPHA_NAME, -- Added
            CLIENT_FACING_FEATURE_NAME,
            PRACTICE_IDS, OPT_IN_DEADLINE, ALPHA_START_DATE,
            RELEASE_NOTE_URL, ADDITIONAL_NOTES,
            FEEDBACK_METHOD, -- Added
            FEEDBACK_LINK, WHY_AM_I_RECEIVING_THIS,
            CRT,
            OPT_IN_FORM, OPT_OUT_FORM,
            INVITE_DATE, PROPS_OWNER, BRIEF_DESCRIPTION, WORKFLOW_CHANGES,
            RELEASE_TIMEFRAME AS ROADMAP_TIMEFRAME,
            TARGETING_REASON, TASK_DETAILS
        FROM corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_content
        WHERE FEATURE_KEY = ? AND STAGE ILIKE CONCAT('%', ?) AND WAVE_NUMBER = ?
        LIMIT 1;
    `;
    try {
        const rows = await executeSnowflakeQuery(query, [featureKey, stage, waveNumber]);
        if (rows && rows.length > 0) {
            // Trim whitespace from string fields before returning
            const trimmedRow = {};
            for (const key in rows[0]) {
                 if (Object.prototype.hasOwnProperty.call(rows[0], key)) {
                    trimmedRow[key] = (typeof rows[0][key] === 'string') ? rows[0][key].trim() : rows[0][key];
                 }
            }
            console.log(`[DB getFeatureContentData] Found content for ${featureKey}, ${stage}, ${waveNumber}.`);
            return trimmedRow;
        } else {
            console.log("[DB getFeatureContentData] No matching row found.");
            return null; // Return null if no content definition found
        }
    } catch (err) {
        console.error(`[DB getFeatureContentData] Error executing query for ${featureKey}/${stage}/${waveNumber}:`, err);
        console.error(`[DB getFeatureContentData] Failing Query: ${query.replace(/\s+/g, ' ')}`);
        console.error(`[DB getFeatureContentData] Failing Params: ${JSON.stringify([featureKey, stage, waveNumber])}`);
        throw new Error(`Database error fetching feature content: ${err.message}`); // Rethrow specific error
    }
}

// Fetches metadata (filename, user, creation date) for all lists generated by a user
async function getAllListMetadata(usernameFromSession) {
     let dbUsername = usernameFromSession;
     if (!dbUsername) { console.error("[DB getAllListMetadata] Cannot fetch lists, username from session is missing."); return []; }
     // Ensure username format includes domain for DB query if needed
     if (!dbUsername.includes('@')) { dbUsername = `${usernameFromSession}@athenahealth.com`; console.log(`[DB getAllListMetadata] Appended @athenahealth.com to username '${usernameFromSession}' for DB query.`); }
      else { console.log(`[DB getAllListMetadata] Username '${usernameFromSession}' already contains '@', using as is for DB query.`); }

    console.log(`[DB getAllListMetadata] Fetching lists for user: ${dbUsername}`);
    const query = `
        SELECT /* User's All Lists Metadata Fetch */
            FILE_NAME,
            "USER",
            TO_CHAR(INSERT_TIMESTAMP, 'YYYY-MM-DD HH24:MI') AS CREATEDDATE -- Format timestamp for display
        FROM corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests
        WHERE "USER" = ? -- Filter by user (ensure case sensitivity if needed)
        ORDER BY INSERT_TIMESTAMP DESC; -- Show newest first
    `;
    try {
        const rows = await executeSnowflakeQuery(query, [dbUsername]);
        console.log(`[DB getAllListMetadata] Found ${rows.length} lists for ${dbUsername}.`);
        return rows && Array.isArray(rows) ? rows : []; // Return rows or empty array
    } catch (err) {
        console.error(`[DB getAllListMetadata] Error fetching lists for ${dbUsername}:`, err);
        throw new Error(`Database error fetching user lists: ${err.message}`); // Rethrow specific error
    }
}

// Logs an event when marketing content is generated
async function logContentCreation(usernameFromSession, contentType, listName) {
    let dbUsername = usernameFromSession;
    if (!dbUsername) { console.error("[DB logContentCreation] Cannot log event, username from session is missing."); return; }
    if (!dbUsername.includes('@')) { dbUsername = `${usernameFromSession}@athenahealth.com`; console.log(`[DB logContentCreation] Appended @athenahealth.com to username '${usernameFromSession}' for DB insert.`); }
     else { console.log(`[DB logContentCreation] Username '${usernameFromSession}' already contains '@', using as is for DB insert.`); }

    const timestamp = new Date(); // Current timestamp
    console.log(`[DB logContentCreation] Logging event: User=${dbUsername}, Type=${contentType}, List=${listName}, Time=${timestamp.toISOString()}`);
    // Ensure column names ("USER", "TIMESTAMP", etc.) match your Snowflake table exactly (case-sensitive if created that way)
    const query = `
        INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_beta_content_creation
            ("USER", "TIMESTAMP", "CONTENT_TYPE", "LIST_NAME")
        VALUES (?, ?, ?, ?);
    `;
    const params = [
        dbUsername,
        timestamp.toISOString(), // Use ISO format for timestamp
        contentType,
        listName
    ];
    try {
        await executeSnowflakeQuery(query, params); // Execute the insert query
        console.log(`[DB logContentCreation] Insert successful.`);
    } catch (err) {
        console.error("[DB Insert Error] Error in logContentCreation:", err.message);
        console.error(`[DB Insert Error Context] User: ${dbUsername}, Type: ${contentType}, List: ${listName}`);
        // Decide if this error should be propagated or just logged
    }
}

// Parses a filename like "FEATURE-123_Beta_1" into its components
function parseFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') { throw new Error(`Invalid input: fileName must be a non-empty string.`); }
    const parts = fileName.split('_');
    // Validate basic structure
    if (parts.length < 3) { throw new Error(`Invalid file name format: ${fileName}. Expected format: FEATURE-XXX_Stage_WaveNumber`); }
    // Validate individual parts using regex
    if (!/^FEATURE-\d{3,8}$/i.test(parts[0])) { throw new Error(`Invalid Feature Key format in name: ${parts[0]}`); }
    if (!/^[a-zA-Z0-9]+$/.test(parts[1])) { throw new Error(`Invalid Stage format in name: ${parts[1]}`); } // Alphanumeric stage
    if (!/^\d+$/.test(parts[2])) { throw new Error(`Invalid Wave Number format in name: ${parts[2]}`); } // Digits only for wave
    // Return parsed components
    return {
        featureKey: parts[0].toUpperCase(), // Standardize to uppercase
        stage: parts[1],
        waveNumber: parts[2]
    };
}

// Fetches just the client-facing name from a specific table (TEMP_FEATURE_MASTER)
async function getFeatureNameFromDB(featureKey) {
    console.log(`[DB getFeatureNameFromDB] Fetching name for ${featureKey}`);
    // Query targeting the specific feature master table
    const query = `
        SELECT
            fm.client_facing_feature_name
        FROM corpanalytics_business_prod.scratchpad_prdpf.temp_feature_master_6_13_2022 fm
        WHERE UPPER(fm.feature_key) = ? -- Case-insensitive match on feature_key
        LIMIT 1;
    `;
    try {
        const upperFeatureKey = featureKey.toUpperCase(); // Ensure comparison is case-insensitive
        const rows = await executeSnowflakeQuery(query, [upperFeatureKey]);
        // Check if a row was found and the name is not null or empty
        if (rows && rows.length > 0 && rows[0].CLIENT_FACING_FEATURE_NAME && rows[0].CLIENT_FACING_FEATURE_NAME.trim() !== '') {
            return rows[0].CLIENT_FACING_FEATURE_NAME.trim(); // Return the trimmed name
        } else {
            return null; // Return null if not found or empty
        }
    } catch (err) {
        console.error(`[DB getFeatureNameFromDB] Error fetching name for ${featureKey}:`, err);
        throw new Error(`Database error fetching feature name: ${err.message}`); // Rethrow specific error
    }
}

// Searches the content definition table based on criteria
async function searchFeaturesByCriteria(featureKey, stage, waveNumber) {
     let criteriaLog = `Feature: ${featureKey}`;
     if (stage) criteriaLog += `, Stage: ${stage}`;
     if (waveNumber) criteriaLog += `, Wave: ${waveNumber}`;
     console.log(`[DB searchFeaturesByCriteria] Searching content definitions for: ${criteriaLog}`);

    // Build query dynamically based on provided criteria
    let query = `
        SELECT /* Feature Content Search */
            FEATURE_KEY, STAGE, WAVE_NUMBER, CLIENT_FACING_FEATURE_NAME
        FROM corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_content
        WHERE UPPER(FEATURE_KEY) = ? -- Always filter by feature key (case-insensitive)
    `;
    const params = [featureKey.toUpperCase()]; // Start with feature key param

    // Add stage condition if provided
    if (stage && stage !== '') {
        query += ` AND STAGE ILIKE CONCAT('%', ?)`;
        params.push(stage);
    }
    // Add wave number condition if provided
    if (waveNumber && waveNumber !== '') {
        query += ` AND WAVE_NUMBER = ?`;
        params.push(waveNumber);
    }

    query += ` ORDER BY FEATURE_KEY, STAGE, WAVE_NUMBER;`; // Order results consistently

    try {
        const rows = await executeSnowflakeQuery(query, params);
        // Trim results before returning
        const trimmedRows = rows.map(row => {
            const trimmedRow = {};
            for (const key in row) {
                 if (Object.prototype.hasOwnProperty.call(row, key)) {
                    trimmedRow[key] = (typeof row[key] === 'string') ? row[key].trim() : row[key];
                 }
            }
            return trimmedRow;
        });
        return trimmedRows && Array.isArray(trimmedRows) ? trimmedRows : []; // Return results or empty array
    } catch (err) {
        console.error(`[DB searchFeaturesByCriteria] Error searching for ${criteriaLog}:`, err);
        throw new Error(`Database error searching feature criteria: ${err.message}`); // Rethrow specific error
    }
}


// -------------------------------------------------------------------
// API Endpoint for Active Clients by Feature Key
// -------------------------------------------------------------------
app.post('/api/active-clients', (req, res, next) => {
    // Debug session state before requireVerifiedUser middleware
    console.log(`[Active Clients Debug] Session state:`, {
        sessionExists: !!req.session,
        username: req.session?.username,
        sessionId: req.sessionID,
        cookies: req.headers.cookie
    });
    
    // Force session save before processing
    if (req.session && req.session.username) {
        req.session.save((err) => {
            if (err) console.error('[Active Clients] Session save error:', err);
            next();
        });
    } else {
        next();
    }
}, requireVerifiedUser, async (req, res) => {
    const { featureKey } = req.body;
    const username = req.session.username;
    
    // Double-check we still have the session
    if (!username) {
        console.error('[Active Clients] Username lost after middleware');
        return res.status(401).json({ message: 'Session lost during processing' });
    }
    
    if (!featureKey) {
        return res.status(400).json({ message: 'Feature key is required' });
    }
    
    console.log(`[Active Clients Query] Request received for feature key: ${featureKey} by user: ${username}`);
    
    // Clean the feature key (removing any non-alphanumeric characters except dash)
    const cleanFeatureKey = featureKey.replace(/[^a-zA-Z0-9\-]/g, '');
    
    try {
        console.log(`[Active Clients Query] Starting query execution for feature: ${cleanFeatureKey}`);
        
        // Add process monitoring
        const memUsage = process.memoryUsage();
        console.log(`[Active Clients Query] Memory usage before query:`, {
            rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
        });
        
        // Build the Snowflake query with the feature key
        const query = `
        with base as (
        select 
            feature_key_clean
            ,context_id__c
        from 
            corpanalytics_business_prod.scratchpad_prdpf.cr_sf_alphabeta
        where
            feature_key_clean = '${cleanFeatureKey}'
        )
          
        SELECT DISTINCT
            a.main_context_id           AS ContextID,
            a.name                      AS Account_Name,
            a.am_service_level__c       AS CSM_Tier,
            a.alpha_beta_status__c      AS Alpha_Beta_Status,
            a.product_status_athenaclinicals__c    AS Clinicals_Status,
            a.product_status_athenacollector__c     AS Collector_Status,
            a.product_status_athenacommunicator__c  AS Communicator_Status
            
        FROM CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.SALESFORCE_ACCOUNT_MASTER a
          JOIN base b on b.context_id__c = a.main_context_id
          JOIN corpanalytics_salesforce_prod.clean.acrt ac
            ON ac.account__c = a.account_id_full__c
          JOIN corpanalytics_salesforce_prod.clean.contact c
            ON c.accountid = ac.account__c
            and ac.contact_name_formula__c = c.name
          LEFT JOIN CORPANALYTICS_BUSINESS_PROD.ENT_PRODUCT.ACTIVITY_MASTER am
            ON am.worker = a.am1_full_name__c
          LEFT JOIN corpanalytics_salesforce_prod.clean.crt_option__c cr
            ON cr.id = ac.crt_options__c
          LEFT JOIN CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.SALESFORCE_ACCOUNT_MASTER a1
            ON a1.contextaccountid = a.parentid
        WHERE
              (
              LOWER(cr.name) LIKE '%beta%'
              OR a.alpha_beta_status__c = 'CSM Sends Alpha/Beta Invites'
              OR a.alpha_beta_status__c LIKE '%CSM Sends Alpha/Beta Invites%'
              )
        `;
        
        console.log(`[Active Clients Query] Executing query for feature key: ${cleanFeatureKey}`);
        
        let results;
        try {
            results = await executeSnowflakeQuery(query);
            console.log(`[Active Clients Query] Snowflake query completed successfully`);
        } catch (queryError) {
            console.error(`[Active Clients Query] Snowflake query failed:`, queryError);
            console.error(`[Active Clients Query] Query error stack:`, queryError.stack);
            throw new Error(`Snowflake query execution failed: ${queryError.message}`);
        }
        
        console.log(`[Active Clients Query] Query completed. Found ${results.length} results.`);
        
        // Check memory after query
        const memUsageAfterQuery = process.memoryUsage();
        console.log(`[Active Clients Query] Memory usage after query:`, {
            rss: Math.round(memUsageAfterQuery.rss / 1024 / 1024) + 'MB',
            heapUsed: Math.round(memUsageAfterQuery.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memUsageAfterQuery.heapTotal / 1024 / 1024) + 'MB'
        });
        
        // Use two-step download process for large datasets (same pattern as final client list)
        if (results.length > 200) {
            console.log(`[Active Clients Query] Large dataset detected (${results.length} rows), using two-step download process`);
            
            // Generate a unique download ID
            const downloadId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
            
            // Store the data with metadata
            if (!global.activeClientsDataStore) {
                global.activeClientsDataStore = {};
            }
            
            global.activeClientsDataStore[downloadId] = {
                clientData: results,
                metadata: {
                    featureKey: cleanFeatureKey,
                    timestamp: new Date().toISOString().slice(0, 10)
                },
                username: req.session.username,
                timestamp: Date.now()
            };
            
            console.log(`[Active Clients Query] Stored ${results.length} active clients with ID: ${downloadId}`);
            
            // Set a timeout to clean up the data after 5 minutes
            setTimeout(() => {
                if (global.activeClientsDataStore && global.activeClientsDataStore[downloadId]) {
                    console.log(`[Active Clients Query] Cleaning up stored data for ID: ${downloadId}`);
                    delete global.activeClientsDataStore[downloadId];
                }
            }, 5 * 60 * 1000); // 5 minutes
            
            // Return download URL instead of generating Excel immediately
            return res.json({
                success: true,
                downloadId: downloadId,
                count: results.length,
                message: `Found ${results.length} active clients. Download will begin automatically.`
            });
        } else {
            console.log(`[Active Clients Query] Small dataset (${results.length} rows), generating Excel directly`);
            
            // Generate Excel file directly for smaller datasets
            try {
                console.log(`[Active Clients Query] Starting Excel generation...`);
                const ExcelJS = require('exceljs');
                
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Active Clients');
                
                if (results.length > 0) {
                    // Add headers
                    const headers = Object.keys(results[0]);
                    worksheet.addRow(headers);
                    
                    // Style the header row
                    const headerRow = worksheet.getRow(1);
                    headerRow.font = { bold: true };
                    headerRow.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE6E6FA' } // Light purple
                    };
                    
                    // Add data rows
                    results.forEach(row => {
                        const values = headers.map(header => row[header] !== null ? row[header] : '');
                        worksheet.addRow(values);
                    });
                    
                    // Auto-size columns for smaller datasets
                    worksheet.columns.forEach(column => {
                        let maxLength = 0;
                        column.eachCell({ includeEmpty: true }, (cell) => {
                            const cellLength = cell.value ? cell.value.toString().length : 0;
                            if (cellLength > maxLength) {
                                maxLength = cellLength;
                            }
                        });
                        column.width = maxLength < 10 ? 10 : Math.min(maxLength + 2, 50);
                    });
                } else {
                    worksheet.addRow(['No active clients found for this feature']);
                }
                
                // Set response headers for Excel download
                const filename = `active_clients_${cleanFeatureKey}_${new Date().toISOString().slice(0, 10)}.xlsx`;
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                
                // Write Excel file to response
                await workbook.xlsx.write(res);
                res.end();
                console.log(`[Active Clients Query] Excel file sent successfully: ${filename}`);
            } catch (excelError) {
                console.error('[Active Clients Query] Failed to create Excel file:', excelError);
                throw new Error(`Error generating Excel file: ${excelError.message}`);
            }
        }
        
    } catch (error) {
        console.error(`[Active Clients Query] Error processing request:`, error);
        console.error(`[Active Clients Query] Error stack:`, error.stack);
        
        // Ensure response hasn't been sent yet
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to retrieve active clients data', 
                details: error.message 
            });
        }
    }
});

// Endpoint to download active clients Excel file using downloadId
app.get('/api/download-active-clients', requireVerifiedUser, async (req, res) => {
    try {
        const downloadId = req.query.downloadId;
        const username = req.session.username;
        
        console.log(`[Download Active Clients] GET request received for downloadId: ${downloadId}, user: ${username}`);
        
        // Check if the download ID exists in our store
        if (!global.activeClientsDataStore || !global.activeClientsDataStore[downloadId]) {
            console.error(`[Download Active Clients] Download ID not found: ${downloadId}`);
            return res.status(404).json({ message: 'Download ID not found or expired' });
        }
        
        // Get the stored data
        const storedData = global.activeClientsDataStore[downloadId];
        
        // Verify the request is from the same user who stored the data
        if (storedData.username !== username) {
            console.error(`[Download Active Clients] User mismatch for downloadId: ${downloadId}`);
            return res.status(403).json({ message: 'Access denied' });
        }
        
        const clientData = storedData.clientData;
        const metadata = storedData.metadata || {};
        const { featureKey, timestamp } = metadata;
        
        console.log(`[Download Active Clients] Processing download for ${clientData.length} clients, Feature: ${featureKey}`);
        
        // Clean up the stored data immediately after processing
        delete global.activeClientsDataStore[downloadId];
        
        try {
            const ExcelJS = require('exceljs');
            console.log('[Download Active Clients] Creating Excel workbook');
            
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Active Clients');
            
            if (clientData.length > 0) {
                // Add headers based on first client object properties
                const headers = Object.keys(clientData[0]);
                worksheet.addRow(headers);
                
                // Style the header row
                const headerRow = worksheet.getRow(1);
                headerRow.font = { bold: true };
                headerRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE6E6FA' } // Light purple
                };
                
                // Add client data rows with performance optimization for large datasets
                console.log(`[Download Active Clients] Adding ${clientData.length} data rows...`);
                let rowCount = 0;
                for (const client of clientData) {
                    const row = [];
                    headers.forEach(header => {
                        row.push(client[header] !== null && client[header] !== undefined ? client[header] : '');
                    });
                    worksheet.addRow(row);
                    rowCount++;
                    
                    // Log progress every 1000 rows for large datasets
                    if (rowCount % 1000 === 0) {
                        console.log(`[Download Active Clients] Processed ${rowCount}/${clientData.length} rows`);
                    }
                }
                console.log(`[Download Active Clients] All ${rowCount} data rows added`);
                
                // Optimize column sizing for large datasets
                const sampleSize = Math.min(100, clientData.length);
                worksheet.columns.forEach((column, index) => {
                    let maxLength = 0;
                    // Only check the header and a sample of rows for performance
                    for (let i = 1; i <= sampleSize + 1; i++) {
                        const cell = worksheet.getCell(i, index + 1);
                        const cellValue = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
                        const cellLength = cellValue.length;
                        if (cellLength > maxLength) {
                            maxLength = cellLength;
                        }
                    }
                    column.width = maxLength < 10 ? 10 : Math.min(maxLength + 2, 50); // Cap width at 50
                });
            } else {
                worksheet.addRow(['No active clients found for this feature']);
            }
            
            // Set response headers for Excel download
            const filename = `active_clients_${featureKey}_${timestamp}.xlsx`;
            console.log(`[Download Active Clients] Setting response headers for file: ${filename}`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            console.log(`[Download Active Clients] Starting Excel file write...`);
            await workbook.xlsx.write(res);
            res.end();
            console.log(`[Download Active Clients] Excel file sent successfully: ${filename}`);
            
        } catch (excelError) {
            console.error('[Download Active Clients] Failed to create Excel file:', excelError);
            return res.status(500).json({
                success: false,
                message: `Error generating Excel file: ${excelError.message}`
            });
        }
        
    } catch (error) {
        console.error(`[Download Active Clients] Error processing download:`, error);
        console.error(`[Download Active Clients] Error stack:`, error.stack);
        
        // Ensure response hasn't been sent yet
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to download active clients file', 
                details: error.message 
            });
        }
    }
});

// --- Template Management Access Control ---
// List of usernames allowed to manage templates
const TEMPLATE_ADMIN_USERS = [
    'cmollica',
    'ameucci',
    'holsen',
    'nbetts',
    'kfadden',
    'chejones', 
    'jhazlett',
    'amadamson'
];

// Middleware to check if user has template management access
function requireTemplateAdmin(req, res, next) {
    // First ensure user is logged in
    if (!req.session || !req.session.username) {
        return res.status(401).json({ message: 'Authentication required' });
    }
    
    // Then check if user is in the allowed list
    if (!TEMPLATE_ADMIN_USERS.includes(req.session.username.toLowerCase())) {
        console.log(`[Template Access Denied] User ${req.session.username} attempted to access template management`);
        return res.status(403).json({ 
            message: 'Access denied. Please contact an administrator for template management access.'
        });
    }
    
    // User has access, proceed
    next();
}

// --- Template Management API Endpoints ---

// Create template management log table if it doesn't exist
async function ensureTemplateLogTableExists() {
    // Uses shared ODBC utility instead of Snowflake SDK
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS corpanalytics_business_prod.scratchpad_prdpf.cr_template_management_log (
            LOG_ID VARCHAR(36) NOT NULL, 
            USERNAME VARCHAR(255) NOT NULL,
            TIMESTAMP TIMESTAMP_NTZ NOT NULL,
            ACTION VARCHAR(50) NOT NULL,
            TEMPLATE_NAME VARCHAR(255) NOT NULL,
            TEMPLATE_TYPE VARCHAR(50) NOT NULL,
            BACKUP_PATH VARCHAR(1000),
            FILE_SIZE INT,
            IP_ADDRESS VARCHAR(50),
            DETAILS VARCHAR(1000)
        )`;
    try {
        await executeSnowflakeQuery(createTableQuery);
        console.log('[Template Management] Log table ready');
        return true;
    } catch (error) {
        console.error('[Template Management] Error ensuring log table exists:', error.message);
        return false;
    }
}

// Log template activity to Snowflake
async function logTemplateActivity(username, action, templateName, templateType, backupPath = null, fileSize = null, ipAddress = null, details = null) {
    const insertQuery = `
        INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cr_template_management_log 
        (LOG_ID, USERNAME, TIMESTAMP, ACTION, TEMPLATE_NAME, TEMPLATE_TYPE, BACKUP_PATH, FILE_SIZE, IP_ADDRESS, DETAILS)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const binds = [
        uuidv4(),
        username,
        new Date().toISOString(),
        action,
        templateName,
        templateType,
        backupPath,
        fileSize,
        ipAddress,
        details
    ];

    try {
        await executeSnowflakeQuery(insertQuery, binds);
        console.log(`[Template Management] Activity logged: ${action} on ${templateName} by ${username}`);
        return true;
    } catch (error) {
        console.error('[Template Management] Error logging activity:', error.message);
        return false;
    }
}

// Ensure the log table exists when server starts
ensureTemplateLogTableExists().then(success => {
    if (success) {
        console.log('[Template Management] Log table ready');
    } else {
        console.warn('[Template Management] Failed to ensure log table exists');
    }
});

// List all templates
app.get('/api/templates', requireVerifiedUser, requireTemplateAdmin, (req, res) => {
    try {
        // Check if templates directory exists
        if (!fs.existsSync(TEMPLATE_DIR_PATH)) {
            console.warn(`Templates directory not found: ${TEMPLATE_DIR_PATH}`);
            return res.status(404).json({ message: 'Templates directory not found' });
        }

        // Read templates directory
        const files = fs.readdirSync(TEMPLATE_DIR_PATH);
        const templates = [];

        files.forEach(file => {
            // Skip temporary, backup, or non-docx files
            if (file.startsWith('~$') || file.includes('_backup_') || !file.endsWith('.docx')) return;
            
            const filePath = path.join(TEMPLATE_DIR_PATH, file);
            const stats = fs.statSync(filePath);
            
            if (stats.isFile()) {
                templates.push({
                    name: file,
                    lastModified: stats.mtime,
                    size: stats.size
                });
            }
        });

        res.json(templates);
    } catch (error) {
        console.error('[Template List Error]', error);
        res.status(500).json({ message: 'Error retrieving templates', error: error.message });
    }
});

// Get template info
app.get('/api/templates/:name/info', requireVerifiedUser, requireTemplateAdmin, (req, res) => {
    try {
        const templateName = req.params.name;
        const templatePath = path.join(TEMPLATE_DIR_PATH, templateName);
        
        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ message: 'Template not found' });
        }
        
        const stats = fs.statSync(templatePath);
        
        // For DOCX files, we could use docxtemplater to extract template fields
        // This is a simple implementation that doesn't extract fields
        const templateInfo = {
            name: templateName,
            lastModified: stats.mtime,
            size: stats.size,
            path: templatePath,
            fields: ['CLIENT_FACING_FEATURE_NAME', 'FEATURE_KEY', 'STAGE', 'WAVE_NUMBER', 'ALPHA_NAME', 
                    'ALPHA_START_DATE', 'INVITE_DATE', 'OPT_IN_DEADLINE', 'CSM_NAME']
        };
        
        res.json(templateInfo);
    } catch (error) {
        console.error('[Template Info Error]', error);
        res.status(500).json({ message: 'Error retrieving template info', error: error.message });
    }
});

// Download template
app.get('/api/templates/:name/download', requireVerifiedUser, requireTemplateAdmin, (req, res) => {
    try {
        const templateName = req.params.name;
        const templatePath = path.join(TEMPLATE_DIR_PATH, templateName);
        
        if (!fs.existsSync(templatePath)) {
            return res.status(404).json({ message: 'Template not found' });
        }
        
        res.download(templatePath);
    } catch (error) {
        console.error('[Template Download Error]', error);
        res.status(500).json({ message: 'Error downloading template', error: error.message });
    }
});

// Upload template
app.post('/api/templates/upload', requireVerifiedUser, requireTemplateAdmin, (req, res) => {
    try {
        console.log('[Template Upload] Request received');
        
        // Define valid template names
        const validTemplates = [
            "InviteTemplate_AlphaOptIn", "InviteTemplate_AlphaOptOut",
            "InviteTemplate_BetaOptIn", "InviteTemplate_BetaOptOut"
        ];
        
        // Setup multer storage configuration
        const storage = multer.diskStorage({
            destination: (req, file, cb) => {
                // Check if templates directory exists, if not create it
                if (!fs.existsSync(TEMPLATE_DIR_PATH)) {
                    console.log(`[Template Upload] Creating templates directory: ${TEMPLATE_DIR_PATH}`);
                    fs.mkdirSync(TEMPLATE_DIR_PATH, { recursive: true });
                }
                cb(null, TEMPLATE_DIR_PATH);
            },
            filename: (req, file, cb) => {
                // We'll get the template type from the form data later
                // For now, just use the original filename temporarily
                cb(null, file.originalname);
            }
        });
        
        // Initialize multer with storage configuration
        const upload = multer({
            storage: storage,
            fileFilter: (req, file, cb) => {
                // Only allow .docx files
                if (!file.originalname.endsWith('.docx')) {
                    return cb(new Error('Only .docx files are allowed'));
                }
                cb(null, true);
            },
            limits: {
                fileSize: 10 * 1024 * 1024, // Limit to 10MB
            }
        }).single('templateFile');
        
        // Handle the file upload
        upload(req, res, (err) => {
            if (err) {
                console.error('[Template Upload] Multer error:', err);
                return res.status(400).json({ message: err.message });
            }
            
            // Check if file was uploaded
            if (!req.file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }
            
            // Now that file is uploaded, validate template type and rename file if needed
            const templateType = req.body.templateType;
            console.log(`[Template Upload] Template type: ${templateType}, File: ${req.file.originalname}`);
            
            if (!validTemplates.includes(templateType)) {
                // Remove the temporary file
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ message: `Invalid template type. Must be one of: ${validTemplates.join(', ')}` });
            }
            
            // Rename the file to match the template type
            const newFilename = `${templateType}.docx`;
            const newPath = path.join(TEMPLATE_DIR_PATH, newFilename);
            
            // Check if file with this name already exists
            let backupPath = null;
            if (fs.existsSync(newPath) && req.file.path !== newPath) {
                // If we're replacing an existing template, create a backup first
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                backupPath = path.join(TEMPLATE_DIR_PATH, `${templateType}_backup_${timestamp}.docx`);
                fs.renameSync(newPath, backupPath);
                console.log(`[Template Upload] Created backup of existing template: ${backupPath}`);
            }
            
            // Rename the uploaded file to the correct name
            if (req.file.path !== newPath) {
                fs.renameSync(req.file.path, newPath);
                console.log(`[Template Upload] Renamed template file to: ${newFilename}`);
            }
            
            // Get user info for logging
            const username = req.session.username;
            const ipAddress = req.ip || req.connection.remoteAddress;
            
            // Log to console
            console.log(`[Template Upload] Template ${templateType} updated by ${username}`);
            
            // Log to Snowflake
            const isUpdate = backupPath ? true : false;
            const action = isUpdate ? 'UPDATE' : 'CREATE';
            const details = `File size: ${req.file.size} bytes. Original filename: ${req.file.originalname}`;
            
            logTemplateActivity(
                username,
                action,
                newFilename,
                templateType,
                backupPath,
                req.file.size,
                ipAddress,
                details
            ).catch(error => console.error('[Template Upload] Failed to log activity to Snowflake:', error));
            
            res.json({ 
                message: 'Template uploaded successfully',
                template: {
                    name: newFilename,
                    path: newPath,
                    size: req.file.size,
                    lastModified: new Date()
                }
            });
        });
    } catch (error) {
        console.error('[Template Upload Error]', error);
        res.status(500).json({ message: 'Error uploading template', error: error.message });
    }
});

// -------------------------------------------------------------------
// Start Server and Listen
// -------------------------------------------------------------------
server = app.listen(PORT, '0.0.0.0', () => { // Listen on all available network interfaces (0.0.0.0)
    console.log(`\n🚀 Server running and listening on port ${PORT}`);
    try {
        const nets = require('os').networkInterfaces();
        console.log("   Accessible URLs:");
        console.log(`     - http://localhost:${PORT}`); // Always show localhost
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`     - http://${net.address}:${PORT} (${name})`); // Show external IP
                    // break; // Uncomment if you only want the first external IP per interface name
                }
            }
        }
    } catch (e) {
        // Fallback if network interfaces can't be read
        console.log(`     - http://localhost:${PORT}`);
    }
    console.log("\n--- Configuration Checks ---");
    console.log(`   Static files served from: ${PUBLIC_DIR_PATH}`);
    console.log(`   Ensure required environment variables are set:`);
    console.log(`     - Snowflake: API_USERNAME, API_PASSWORD`);
    console.log(`     - Qualtrics: QUALTRICS_API_TOKEN, QUALTRICS_DATACENTER_ID`);
    console.log(`     - Security:  SESSION_SECRET (!!! IMPORTANT for production !!!)`);
    console.log(`   Verify script paths exist:`);
    console.log(`     - List Gen PS: ${LIST_GENERATION_SCRIPT_PATH} ${fs.existsSync(LIST_GENERATION_SCRIPT_PATH) ? '✅' : '❌ NOT FOUND'}`);
    console.log(`     - List Filter PS: ${LIST_FILTER_SCRIPT_PATH} ${fs.existsSync(LIST_FILTER_SCRIPT_PATH) ? '✅' : '❌ NOT FOUND'}`);
    console.log(`     - Qualtrics PY: ${QUALTRICS_SCRIPT_PATH} ${fs.existsSync(QUALTRICS_SCRIPT_PATH) ? '✅' : '❌ NOT FOUND'}`);
    console.log(`   Verify directory paths exist:`);
    console.log(`     - Templates: ${TEMPLATE_DIR_PATH} ${fs.existsSync(TEMPLATE_DIR_PATH) ? '✅' : '❌ NOT FOUND'}`);
    console.log(`     - Doc Output: ${OUTPUT_DIR_PATH} ${fs.existsSync(OUTPUT_DIR_PATH) ? '✅' : '⚠️ Does not exist (will try to create)'}`);
    console.log(`   Ensure Node.js process has read/write/execute permissions as needed.`);
    console.log("--------------------------");
});

// Add global error handlers to prevent server crashes
process.on('uncaughtException', (error) => {
    console.error('[CRITICAL] Uncaught Exception:', error);
    console.error('[CRITICAL] Stack trace:', error.stack);
    console.error('[CRITICAL] Server will continue running but this should be investigated');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Rejection at:', promise);
    console.error('[CRITICAL] Reason:', reason);
    console.error('[CRITICAL] Server will continue running but this should be investigated');
});

// Set a longer server timeout for potentially long-running scripts
server.timeout = 10 * 60 * 1000; // 10 minutes (adjust as needed)

console.log("Server script loaded. Waiting for requests...");

// --- Global Error Handlers (Optional but Recommended) ---
process.on('unhandledRejection', (reason, promise) => {
  console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
  // Application specific logging, throwing an error, or other logic here
  // Consider logging the stack trace: console.error(reason.stack || reason);
});

process.on('uncaughtException', (err, origin) => {
  console.error('\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.error('CRITICAL: Uncaught Exception.');
  console.error('Exception:', err);
  console.error('Origin:', origin);
  console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
  // Log the error, potentially attempt graceful shutdown before exiting
  // IMPORTANT: After an uncaught exception, the application state is unreliable.
  // It's often recommended to terminate the process.
  // process.exit(1); // Uncomment to forcefully exit on uncaught exception
});

// --- END OF FILE server.js ---