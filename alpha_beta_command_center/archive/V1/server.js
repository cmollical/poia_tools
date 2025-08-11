// --- START OF FILE server.js ---

const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path'); // Correctly require path
const fs = require('fs');
const odbc = require('odbc');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const cheerio = require('cheerio');

const app = express();

// --- Middleware ---
// Serve static files (like CSS, images) from 'public' if needed, or root if logo is there
// If 'Product Operations Logo Small.png' is in the same directory as server.js/index.html:
app.use(express.static(path.join(__dirname, 'public')));
// If you have a dedicated 'public' folder for assets:
// app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[Request Logger] ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  if (req.method === 'POST' || req.method === 'PUT') {
      console.log(`   Body:`, JSON.stringify(req.body)); // Log body for POST/PUT
  }
  next();
});


// -------------------------------------------------------------------
// /run-powershell endpoint (For List Generation)
// -------------------------------------------------------------------
app.post('/run-powershell', (req, res) => {
  const { var1, var2, var3 } = req.body;
  // --- IMPORTANT: Validate path ---
  const psScriptPath = "C:\\Users\\cmollica\\list_generation_project\\list_generation_power_shell.ps1";
  if (!fs.existsSync(psScriptPath)) {
       console.error(`[PowerShell Error] Script file not found at: ${psScriptPath}`);
       return res.status(500).send(`Server configuration error: PowerShell script not found.`);
  }
  // --- End Path Validation ---

  const args = ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-NonInteractive', '-File', psScriptPath, var1, var2, var3];
  console.log(`[PowerShell] Executing: powershell.exe ${args.join(' ')}`);
  const child = spawn('powershell.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdoutOutput = ""; let stderrOutput = "";
  child.stdout.on('data', (data) => { const outputChunk = data.toString(); console.log('[PowerShell STDOUT]', outputChunk); stdoutOutput += outputChunk; });
  child.stderr.on('data', (data) => { const errorChunk = data.toString(); console.error('[PowerShell STDERR]', errorChunk); stderrOutput += errorChunk; });
  child.on('error', (err) => { console.error("[PowerShell] Failed to start PowerShell script:", err); return res.status(500).send(`Execution error: Failed to start PowerShell process. Error: ${err.message}`); });
  child.on('exit', (code, signal) => {
    console.log(`[PowerShell] Script exited with code ${code}, signal ${signal}`);
    if (code !== 0) { console.error(`[PowerShell Error] Script exited non-zero (Code: ${code}, Signal: ${signal})`); console.error("[PowerShell Error Output]", stderrOutput); const errorMessage = `PowerShell script execution failed (Code: ${code}).\n${stderrOutput || 'No error output captured.'}`; return res.status(500).send(errorMessage); }
    console.log("[PowerShell Success Output]", stdoutOutput);
    // Send a more specific success message related to list generation
    res.send("List generation process initiated successfully.");
  });
});


// -------------------------------------------------------------------
// Endpoint: /generate-content (For Document Generation) - MODIFIED (Only for filename context, logic preserved)
// -------------------------------------------------------------------
app.post('/generate-content', async (req, res) => {
  try {
    // --- MODIFIED: Receive templateName --- // (This modification was in your original provided code)
    const { username, listId, templateName, additionalFields } = req.body;
    const validTemplates = [
        "InviteTemplate_AlphaOptIn",
        "InviteTemplate_AlphaOptOut",
        "InviteTemplate_BetaOptIn",
        "InviteTemplate_BetaOptOut"
    ];

    // --- ADDED: Validation --- // (This validation was in your original provided code)
    if (!username || !listId || !templateName) { return res.status(400).json({ message: "Missing required fields: username, listId, or templateName." }); }
    if (!validTemplates.includes(templateName)) {
        console.warn(`[Generate Content] Invalid template name received: ${templateName}`);
        return res.status(400).json({ message: `Invalid templateName specified: ${templateName}. Must be one of ${validTemplates.join(', ')}.` });
    }
    // --- End Validation ---

    console.log(`[Generate Content] Request received for user: ${username}, listId: ${listId}, template: ${templateName}`);
    let featureKey, stage, waveNumber; try { ({ featureKey, stage, waveNumber } = parseFileName(listId)); console.log(`[Generate Content] Parsed listId: Feature=${featureKey}, Stage=${stage}, Wave=${waveNumber}`); } catch (parseError) { console.error(`[Generate Content] Error parsing listId '${listId}':`, parseError); return res.status(400).json({ message: `Invalid listId format: ${listId}. ${parseError.message}` }); }

    // --- MODIFIED: Use renamed function --- // (This modification was in your original provided code)
    const featureContent = await getFeatureContentData(featureKey, stage, waveNumber);
    if (!featureContent) { console.warn(`[Generate Content] No matching content found for ${featureKey}, ${stage}, ${waveNumber}`); return res.status(404).json({ message: "Content definition not found for this feature/stage/wave in the database (cr_alpha_content)." }); }

    // Consolidate data - start with fetched content, allow overrides/additions (Preserving original structure)
    const data = {
        ...featureContent, // Spread all fetched fields first
        ...additionalFields, // Add/override with fields passed in request body (currently none)
        // --- Explicitly ensure core fields exist, defaulting if necessary ---
        //    (Even if fetched, provides a safety net & makes logic clearer)
        CLIENT_FACING_FEATURE_NAME: featureContent.CLIENT_FACING_FEATURE_NAME || '',
        OPT_IN_DEADLINE: featureContent.OPT_IN_DEADLINE || '', // Will be formatted later
        ALPHA_START_DATE: featureContent.ALPHA_START_DATE || '', // Will be formatted later
        RELEASE_NOTE_URL: featureContent.RELEASE_NOTE_URL || '', // Raw URL/HTML from DB
        ADDITIONAL_NOTES: featureContent.ADDITIONAL_NOTES || '',
        FEEDBACK_LINK: featureContent.FEEDBACK_LINK || '',
        WHY_AM_I_RECEIVING_THIS: featureContent.WHY_AM_I_RECEIVING_THIS || '',
        BRIEF_DESCRIPTION: featureContent.BRIEF_DESCRIPTION || '',
        WORKFLOW_CHANGES: featureContent.WORKFLOW_CHANGES || '',
        TARGETING_REASON: featureContent.TARGETING_REASON, // Keep null/undefined if not present
        INVITE_DATE: featureContent.INVITE_DATE || '', // Will be formatted later
        CRT: featureContent.CRT || '',
        PROPS_OWNER: featureContent.PROPS_OWNER || '',
        TASK_DETAILS: featureContent.TASK_DETAILS || '',
        // --- Fields potentially needed for other templates (ADD MORE AS NEEDED from your DB table) ---
        BETA_END_DATE: featureContent.BETA_END_DATE || '', // Example: add if you have this column
        OPT_OUT_INSTRUCTIONS: featureContent.OPT_OUT_INSTRUCTIONS || '', // Example
        // Initialize field derived from RELEASE_NOTE_URL
        RELEASE_NOTE: '' // This will be populated during processing
    };

    // --- START: Data Processing/Sanitization Section (Applies to all templates) --- // (Preserving original structure)
    // --- Date Formatting (Generic Helper) ---
    const formatDate = (dateInput) => {
        if (!dateInput || !(typeof dateInput === 'string' || dateInput instanceof Date)) {
            return ''; // Return empty string for invalid input
        }
        try {
            const dateObject = new Date(dateInput);
            if (isNaN(dateObject.getTime())) {
                console.warn(`[Date Format] Value '${dateInput}' could not be parsed as a valid date. Returning empty.`);
                return ''; // Return empty if parsing fails
            }
            // Use UTC methods to avoid timezone issues if dates are stored/intended as UTC
            const year = dateObject.getUTCFullYear();
            const monthIndex = dateObject.getUTCMonth();
            const day = dateObject.getUTCDate();
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            if (monthIndex < 0 || monthIndex > 11) return ''; // Invalid month
            return `${monthNames[monthIndex]} ${day}, ${year}`;
        } catch (dateError) {
            console.error(`[Date Format] Error processing date '${dateInput}':`, dateError);
            return ''; // Return empty on error
        }
    };

    // Apply formatting
    data.OPT_IN_DEADLINE = formatDate(data.OPT_IN_DEADLINE);
    data.ALPHA_START_DATE = formatDate(data.ALPHA_START_DATE);
    data.INVITE_DATE = formatDate(data.INVITE_DATE);
    data.BETA_END_DATE = formatDate(data.BETA_END_DATE); // Format potential Beta field
    console.log(`[Date Format] OPT_IN_DEADLINE: ${data.OPT_IN_DEADLINE}, ALPHA_START_DATE: ${data.ALPHA_START_DATE}, INVITE_DATE: ${data.INVITE_DATE}, BETA_END_DATE: ${data.BETA_END_DATE}`);

    // --- Handling for missing CLIENT_FACING_FEATURE_NAME ---
    if (!data.CLIENT_FACING_FEATURE_NAME || String(data.CLIENT_FACING_FEATURE_NAME).trim() === '') {
        const defaultValue = "(Feature Name TBD)";
        console.warn(`[Feature Name] CLIENT_FACING_FEATURE_NAME was empty/missing. Using default: "${defaultValue}"`);
        data.CLIENT_FACING_FEATURE_NAME = defaultValue;
    } else {
        data.CLIENT_FACING_FEATURE_NAME = String(data.CLIENT_FACING_FEATURE_NAME).trim();
    }

    // --- Parsing/Sanitizing RELEASE_NOTE_URL -> RELEASE_NOTE ---
    data.RELEASE_NOTE = '#'; // Default value
    if (data.RELEASE_NOTE_URL && typeof data.RELEASE_NOTE_URL === 'string') {
        try {
            const rawUrl = data.RELEASE_NOTE_URL.trim();
            // Remove control characters FIRST to prevent cheerio errors
            const sanitizedHtmlInput = rawUrl.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

            if (sanitizedHtmlInput) { // Proceed only if not empty after initial trim/sanitize
                 const $ = cheerio.load(sanitizedHtmlInput);
                 const linkElement = $('a');
                 let extractedUrl = '';

                 if (linkElement.length > 0) {
                     extractedUrl = linkElement.attr('href');
                     if (!extractedUrl) {
                         console.warn("[Release Note Link] Found <a> tag but no href attribute in:", sanitizedHtmlInput);
                         // Maybe use link text if it looks like a URL? Or just default.
                     }
                 } else if (sanitizedHtmlInput.toLowerCase().startsWith('http')) {
                      // If no <a> tag, but the string itself looks like a URL
                      extractedUrl = sanitizedHtmlInput;
                      console.log("[Release Note Link] No <a> tag found, using raw string as URL:", extractedUrl);
                 } else {
                      console.warn(`[Release Note Link] No <a> tag and raw string "${sanitizedHtmlInput}" doesn't look like URL. Defaulting.`);
                 }

                 // Final assignment and sanitization
                 if (extractedUrl) {
                     // Sanitize the extracted URL again for safety
                     data.RELEASE_NOTE = extractedUrl.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
                 }
            } else {
                 console.log("[Release Note Link] Field was empty after initial trim/sanitization.");
            }

        } catch (htmlParseError) {
            console.error("[Release Note Link] Error parsing/sanitizing HTML:", htmlParseError);
            // Keep default '#'
        }
    } else {
        console.log("[Release Note Link] Field missing or not a string. Defaulting RELEASE_NOTE to '#'.");
    }
     console.log(`[Release Note Link] Final URL assigned to RELEASE_NOTE: ${data.RELEASE_NOTE}`);


    // --- Generic Sanitization Helper for text fields ---
    const sanitizeText = (textInput, fieldName = "Field", allowEmpty = false) => {
        if (textInput === null || typeof textInput === 'undefined') {
             console.log(`[Sanitize ${fieldName}] Value is null/undefined. Setting empty string.`);
             return "";
        }
        if (typeof textInput !== 'string') {
             console.warn(`[Sanitize ${fieldName}] Value is not a string (Type: ${typeof textInput}). Converting and trimming.`);
             textInput = String(textInput); // Attempt conversion
        }

        try {
            const originalValue = textInput;
            // Remove control characters (excluding tab, newline, carriage return)
            let sanitizedValue = originalValue.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
            if (originalValue !== sanitizedValue) { console.log(`[Sanitize ${fieldName}] Removed control characters.`); }

            sanitizedValue = sanitizedValue.trim();

            if (!allowEmpty && sanitizedValue === '') {
                 console.warn(`[Sanitize ${fieldName}] Value became empty after sanitization/trimming.`);
                 // Decide: return empty or a default? For now, return empty.
            }
            return sanitizedValue;
        } catch (sanitizeError) {
            console.error(`[Sanitize ${fieldName}] Error sanitizing:`, sanitizeError);
            // Fallback to original (or converted string) trimmed, hoping it's safe enough
            return String(textInput).trim();
        }
    };

    // Apply sanitization to text fields
    data.BRIEF_DESCRIPTION = sanitizeText(data.BRIEF_DESCRIPTION, "Brief Description");
    data.WORKFLOW_CHANGES = sanitizeText(data.WORKFLOW_CHANGES, "Workflow Changes");
    data.ADDITIONAL_NOTES = sanitizeText(data.ADDITIONAL_NOTES, "Additional Notes");
    data.WHY_AM_I_RECEIVING_THIS = sanitizeText(data.WHY_AM_I_RECEIVING_THIS, "Why Receiving");
    data.CRT = sanitizeText(data.CRT, "CRT");
    data.PROPS_OWNER = sanitizeText(data.PROPS_OWNER, "Props Owner");
    data.TASK_DETAILS = sanitizeText(data.TASK_DETAILS, "Task Details");
    data.FEEDBACK_LINK = sanitizeText(data.FEEDBACK_LINK, "Feedback Link"); // Usually a URL, but treat as text
    data.OPT_OUT_INSTRUCTIONS = sanitizeText(data.OPT_OUT_INSTRUCTIONS, "Opt Out Instructions"); // Example

    // --- Special handling for TARGETING_REASON (can be intentionally null/empty) ---
     if (data.TARGETING_REASON && typeof data.TARGETING_REASON === 'string') {
         data.TARGETING_REASON = sanitizeText(data.TARGETING_REASON, "Targeting Reason", true); // Allow empty
         if (data.TARGETING_REASON === '') {
             console.log(`[Targeting Reason] Reason became empty after trim. Setting null for conditional logic.`);
             data.TARGETING_REASON = null; // Explicitly set null if empty for easier template logic {#TARGETING_REASON}...{/}
         }
     } else if (!data.TARGETING_REASON) {
          console.log("[DEBUG - Targeting Reason] Value is missing/falsy. Ensuring it's null.");
          data.TARGETING_REASON = null;
     } else {
         console.warn(`[Targeting Reason] Value not a string (Type: ${typeof data.TARGETING_REASON}). Setting null.`);
         data.TARGETING_REASON = null;
     }

    // --- Template-Specific Defaulting (Example) ---
    const defaultAdditionalNotes = "No Additional Notes Provided."; // Shorter default
    if (!data.ADDITIONAL_NOTES) { // Check if empty *after* sanitization
        console.log("[Additional Notes] Field blank after sanitation/trim. Setting default.");
        data.ADDITIONAL_NOTES = defaultAdditionalNotes;
    }

    // Example for Opt-Out specific default (if needed)
    if ((templateName === 'InviteTemplate_AlphaOptOut' || templateName === 'InviteTemplate_BetaOptOut') && !data.OPT_OUT_INSTRUCTIONS) {
        console.log("[Opt Out Instructions] Field blank for Opt-Out template. Setting default.");
        data.OPT_OUT_INSTRUCTIONS = "Standard opt-out instructions apply."; // Placeholder
    }
    // --- END: Data Processing Section ---


    console.log("[DEBUG] Final data object for Docxtemplater:", JSON.stringify(data, null, 2)); // Log final data before rendering
    const templateDir = path.join(__dirname, 'templates');
    // --- MODIFIED: Uses templateName received from request --- // (This modification was in your original provided code)
    const templatePath = path.join(templateDir, `${templateName}.docx`);
    console.log("[Generate Content] Looking for template file at:", templatePath); if (!fs.existsSync(templatePath)) { console.error(`Template file not found: ${templatePath}`); if (!fs.existsSync(templateDir)) console.error(`Template directory not found: ${templateDir}`); return res.status(404).json({ message: `Template file '${templateName}.docx' not found on the server.` }); }
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content); let doc; try { doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: function(part) { const tagName=part.value; if(!part.module){/*console.warn(`[Docxtemplater NullGetter] Tag '${tagName}' resulted in null/undefined.`);*/return"";} if(part.module==="loop"){/*console.warn(`[Docxtemplater NullGetter] Loop '${tagName}' array null/undefined/empty.`);*/return[];} if(part.module==="condition"){/*console.warn(`[Docxtemplater NullGetter] Condition tag '${tagName}' evaluated to null/undefined.`);*/return false;} return""; } }); console.log("[Generate Content] Docxtemplater instance created."); } catch (initError) { console.error("[Generate Content] Error creating Docxtemplater instance:", initError); if (initError.message.includes("Corrupted zip")) { return res.status(500).json({ message: "Error loading template: File might be corrupted or not a valid .docx." }); } return res.status(500).json({ message: "Error initializing template processor: " + initError.message }); }
    try { console.log("[Generate Content] Calling doc.render(data)..."); doc.render(data); console.log("[Generate Content] doc.render(data) completed."); } catch (renderError) { console.error("[Generate Content] Error rendering template:", renderError); const e = { message: renderError.message, name: renderError.name, properties: renderError.properties }; console.error("[DEBUG] Render Error details:", JSON.stringify(e, null, 2)); let userMessage = `Error rendering document: ${renderError.message}.`; if (e.properties && e.properties.id === 'scope_not_found') { userMessage += ` Failed to find value for tag: '${e.properties.details}'. Check if this field exists in the database or was fetched correctly.`; } else if (e.properties && e.properties.id === 'template_error') { userMessage += ` Template syntax error near tag: '${e.properties.tag}'. Check the .docx template file.`; } else if (e.properties && e.properties.id === 'unopened_tag' || e.properties && e.properties.id === 'unclosed_tag') { userMessage += ` Mismatched tags like '{' or '}' found. Check the template syntax. Tag: '${e.properties.explanation}'`; } else { userMessage += ` Verify template tags and data.`; } return res.status(500).json({ message: userMessage, details: e }); }
    console.log("[Generate Content] Generating output buffer..."); let buf; try { buf = doc.getZip().generate({ type: 'nodebuffer', compression: "DEFLATE", compressionOptions: { level: 9 } }); console.log("[Generate Content] Output buffer generated."); } catch (bufferError) { console.error("[Generate Content] Error generating buffer:", bufferError); return res.status(500).json({ message: "Error finalizing document buffer: " + bufferError.message }); }

    // --- MODIFIED: Adjust Output Filename --- // (This modification was in your original provided code)
    console.log("[Generate Content] Preparing to save file...");
    const oneDriveFolder = "C:\\Users\\cmollica\\OneDrive - athenahealth\\Shared Services (Product Operations) - Invite Drafts"; // CHECK THIS PATH
    try { if (!fs.existsSync(oneDriveFolder)) { console.log(`[Generate Content] Creating output directory: ${oneDriveFolder}`); fs.mkdirSync(oneDriveFolder, { recursive: true }); } } catch (dirError) { console.error(`[Generate Content] CRITICAL ERROR creating directory ${oneDriveFolder}:`, dirError); return res.status(500).json({ message: `Server config error: Could not create output directory. Error: ${dirError.message}` }); }
    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-'); const featureNameForFile = featureKey || 'UnknownFeature'; const sanitize = (str) => str ? String(str).replace(/[\\/:*?"<>|#%&{}\s~]/g, '_').replace(/__/g, '_') : ''; const sanitizedFeatureName = sanitize(featureNameForFile).substring(0, 50); const sanitizedStage = sanitize(stage || 'UnknownStage'); const sanitizedWave = sanitize((waveNumber || 'X').toString());
    // --- Extract template type for filename ---
    const templateTypeForFile = templateName.replace('InviteTemplate_', ''); // e.g., "AlphaOptIn"
    const fileName = `${templateTypeForFile}_Invite_${sanitizedFeatureName}_${sanitizedStage}_${sanitizedWave}_${fileTimestamp}.docx`;
    // --- End Filename Adjustment ---
    const outputPath = path.join(oneDriveFolder, fileName); console.log(`[Generate Content] Attempting to save file to: ${outputPath}`);
    try {
        fs.writeFileSync(outputPath, buf);
        console.log(`[Generate Content] File saved successfully: ${outputPath}`);

        // --- *** ADDED: Log Content Creation Event *** --- // (This addition was in your original provided code)
        try {
            // Derive content_type string from templateName (e.g., "Alpha Opt In")
            const derivedContentType = templateName
                .replace('InviteTemplate_', '') // Remove prefix
                .replace(/([A-Z])/g, ' $1') // Add space before capital letters
                .trim(); // Remove leading/trailing spaces

            console.log(`[Generate Content] Attempting to log creation event for: User=${username}, Type=${derivedContentType}, List=${listId}`);
            // Call the logging function asynchronously
            await logContentCreation(username, derivedContentType, listId);
            console.log(`[Generate Content] Logging function call completed.`);

        } catch (logError) {
            // Catch errors specifically from the logging call
            console.error(`[Generate Content] CRITICAL: Failed to log content creation event to database after file save. Error:`, logError);
            // Do not fail the request, just log the error. The file was saved.
        }
        // --- *** END of Logging Addition *** ---

        // Send success response AFTER file save and logging attempt
        res.status(200).json({ savedPath: outputPath });

    } catch (writeError) {
        console.error(`[Generate Content] Error writing file to ${outputPath}:`, writeError);
        let writeErrorMessage = `Error saving generated file.`;
        if (writeError.code === 'EPERM') { writeErrorMessage += ' Permission denied.'; }
        else if (writeError.code === 'EBUSY') { writeErrorMessage += ' File locked/in use.'; }
        else if (writeError.code === 'ENOSPC') { writeErrorMessage += ' Not enough disk space.'; }
        else { writeErrorMessage += ` Details: ${writeError.message}`; }
        return res.status(500).json({ message: writeErrorMessage });
    }
    // Removed res.status(200).json here as it's now inside the try block above // (This comment was in your original provided code)
  } catch (error) {
      console.error("[Generate Content] UNHANDLED error:", error);
      res.status(500).json({ message: "Unexpected internal server error during content generation.", details: error.message });
  }
});


// -------------------------------------------------------------------
// Endpoint: /get-lists (Fetch lists for a specific user)
// -------------------------------------------------------------------
app.get('/get-lists', async (req, res) => {
  const username = req.query.username; if (!username) { return res.status(400).json({ message: "Missing username parameter." }); }
  console.log(`[/get-lists] Request received for user: ${username}`);
  try { const lists = await getAllListMetadata(username); console.log(`[/get-lists] Found ${lists.length} lists for user ${username}.`); res.json(lists); }
  catch (error) { console.error("[/get-lists] Error retrieving lists:", error); res.status(500).json({ message: "Failed to retrieve lists.", details: error.message }); }
});

// -------------------------------------------------------------------
// Endpoint: /search-features-by-criteria (Search feature definitions) // --- MODIFIED --- Endpoint Renamed & Purpose Changed
// WAS: /search-lists-by-criteria
// -------------------------------------------------------------------
app.get('/search-features-by-criteria', async (req, res) => { // --- MODIFIED --- Renamed endpoint
  console.log(`\n--- ENTERING /search-features-by-criteria HANDLER ---`); // --- MODIFIED --- Log message
  console.log(`   Query Params Received:`, req.query);
  const { featureKey, stage, waveNumber } = req.query;
  const errors = [];
  const featurePattern = /^FEATURE-\d{3,8}$/i;

  // Validation remains similar, as the input criteria format is the same
  if (!featureKey) { errors.push("featureKey is required."); } else if (!featurePattern.test(featureKey)) { errors.push("Invalid featureKey format (e.g., FEATURE-123)."); }
  if (stage && !/^[a-z0-9]+$/i.test(stage)) { errors.push("Invalid stage format (if provided)."); }
  if (waveNumber && !/^\d+$/.test(waveNumber)) { errors.push("Invalid waveNumber format (must be digits, if provided)."); }

  if (errors.length > 0) {
      console.warn(`[/search-features-by-criteria] Validation failed:`, errors); // --- MODIFIED --- Log message
      return res.status(400).json({ message: "Invalid search criteria.", errors: errors });
  }

  try {
      const upperFeatureKey = featureKey.toUpperCase();
      console.log(`[/search-features-by-criteria] Criteria validated. Searching for Feature: ${upperFeatureKey}, Stage: ${stage || 'Any'}, Wave: ${waveNumber || 'Any'}`); // --- MODIFIED --- Log message

      // --- MODIFIED --- Call the new search function
      const features = await searchFeaturesByCriteria(upperFeatureKey, stage, waveNumber);

      console.log(`[/search-features-by-criteria] DB search completed. Found ${features.length} feature definitions.`); // --- MODIFIED --- Log message
      res.status(200).json(features); // Return the found feature definitions
      console.log(`--- EXITING /search-features-by-criteria HANDLER (Success) ---`); // --- MODIFIED --- Log message

  } catch (error) {
      console.error("[/search-features-by-criteria] ERROR caught during search:", error); // --- MODIFIED --- Log message
      res.status(500).json({ message: "Failed to search features due to an internal server error.", details: error.message }); // --- MODIFIED --- Error message
      console.log(`--- EXITING /search-features-by-criteria HANDLER (Error) ---`); // --- MODIFIED --- Log message
  }
});

// -------------------------------------------------------------------
// Helper function: parseFileName
// -------------------------------------------------------------------
function parseFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') {
         throw new Error(`Invalid input: fileName must be a non-empty string.`);
    }
    const parts = fileName.split('_');
    // Expecting format like: FEATURE-123_Alpha_1 or FEATURE-12345_BetaBundled_3
    if (parts.length < 3) { throw new Error(`Invalid file name format: ${fileName}. Expected format: FEATURE-XXX_Stage_WaveNumber`); }
    // Basic validation of parts
    if (!/^FEATURE-\d{3,8}$/i.test(parts[0])) { throw new Error(`Invalid Feature Key format in name: ${parts[0]}`);}
    if (!/^[a-zA-Z0-9]+$/.test(parts[1])) { throw new Error(`Invalid Stage format in name: ${parts[1]}`);}
    if (!/^\d+$/.test(parts[2])) { throw new Error(`Invalid Wave Number format in name: ${parts[2]}`);}

    return { featureKey: parts[0].toUpperCase(), stage: parts[1], waveNumber: parts[2] };
}

// -------------------------------------------------------------------
// Helper function: Build the ODBC connection string
// -------------------------------------------------------------------
function buildConnectionString() {
    // --- Load credentials securely from environment variables ---
    const snowflakeUser = process.env.API_USERNAME;
    const snowflakePassword = process.env.API_PASSWORD;

    if (!snowflakeUser || !snowflakePassword) {
        console.error("CRITICAL ERROR: Missing API_USERNAME or API_PASSWORD environment variables!");
        throw new Error("Server configuration error: Snowflake credentials are not set.");
    }
    // --- Keep other connection parameters here ---
    const snowflakeAccount = "athenahealth.snowflakecomputing.com";
    const snowflakeDatabase = "CORPANALYTICS_BUSINESS_PROD";
    const snowflakeSchema = "SCRATCHPAD_PRDPF";
    const snowflakeWarehouse = "CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD";
    const snowflakeRole = "CORPANALYTICS_BDB_PRDPF_PROD_RW";

    // Construct the connection string
    return `Driver={SnowflakeDSIIDriver};Server=${snowflakeAccount};Database=${snowflakeDatabase};Schema=${snowflakeSchema};Warehouse=${snowflakeWarehouse};Role=${snowflakeRole};Uid=${snowflakeUser};Pwd=${snowflakePassword};`;
}

// -------------------------------------------------------------------
// getFeatureContentData(featureKey, stage, waveNumber) - RENAMED & EXPANDED (From original code)
// Renamed from getAlphaContent to reflect broader use
// -------------------------------------------------------------------
async function getFeatureContentData(featureKey, stage, waveNumber) {
    let connection;
    console.log(`[DB getFeatureContentData] Attempting connection for ${featureKey}, ${stage}, ${waveNumber}`);
    try {
        const connectionString = buildConnectionString();
        connection = await odbc.connect(connectionString);
        console.log(`[DB getFeatureContentData] Connection successful.`);

        // --- MODIFIED SELECT STATEMENT --- (From original code)
        // Add ALL columns from cr_alpha_content that *any* of your 4 templates might need.
        // If a column doesn't exist for a specific row, Snowflake returns NULL.
        const query = `
            SELECT /* Feature Content Fetch (Expanded) */
                FEATURE_KEY,
                STAGE,
                WAVE_NUMBER,
                CLIENT_FACING_FEATURE_NAME,
                PRACTICE_IDS,
                OPT_IN_DEADLINE,
                ALPHA_START_DATE,
                INVITE_DATE,
                RELEASE_NOTE_URL,
                ADDITIONAL_NOTES,
                FEEDBACK_LINK,
                WHY_AM_I_RECEIVING_THIS,
                BRIEF_DESCRIPTION,
                WORKFLOW_CHANGES,
                TARGETING_REASON,
                CRT,
                PROPS_OWNER,
                TASK_DETAILS
                -- Ensure BETA_END_DATE, OPT_OUT_INSTRUCTIONS etc. are included if needed by templates
            FROM corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_content
            WHERE FEATURE_KEY = ? AND STAGE = ? AND WAVE_NUMBER = ?
            LIMIT 1;
        `;
        console.log(`[DB getFeatureContentData] Executing query...`);
        const rows = await connection.query(query, [featureKey, stage, waveNumber]);
        console.log(`[DB getFeatureContentData] Query returned ${rows.length} row(s).`);
        if (rows.length > 0) {
            const trimmedRow = {};
            // Trim strings, keep others as is
            for (const key in rows[0]) {
                if (typeof rows[0][key] === 'string') {
                    trimmedRow[key] = rows[0][key].trim();
                } else {
                    trimmedRow[key] = rows[0][key]; // Keep numbers, dates, nulls etc.
                }
            }
            // console.log("[DB getFeatureContentData] Returning row:", JSON.stringify(trimmedRow)); // Uncomment for debug
            return trimmedRow;
        } else {
            console.log("[DB getFeatureContentData] No matching row found.");
            return null;
        }
    } catch (err) {
        console.error("[DB Query Error] Error in getFeatureContentData:", err.message);
        if (err.odbcErrors) { console.error("[DB Query Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2)); }
        err.message = `Database error during getFeatureContentData for ${featureKey}/${stage}/${waveNumber}: ${err.message}`;
        throw err; // Re-throw to be caught by the endpoint handler
    } finally {
        if (connection) {
            try { await connection.close(); console.log("[DB Connection] Connection closed for getFeatureContentData."); }
            catch (closeErr) { console.error("[DB Connection Error] Error closing connection in getFeatureContentData:", closeErr); }
        } else { console.log("[DB getFeatureContentData] No connection established or already closed."); }
    }
}


// -------------------------------------------------------------------
// getListMetadata(username, listId) - No changes needed (Preserved from original)
// -------------------------------------------------------------------
async function getListMetadata(username, listId) { let connection; console.log(`[DB getListMetadata] Attempting connection for user: ${username}, listId: ${listId}`); try { const connectionString = buildConnectionString(); connection = await odbc.connect(connectionString); console.log(`[DB getListMetadata] Connection successful.`); const query = ` SELECT /* List Metadata Fetch */ FILE_NAME, "USER", TO_CHAR(INSERT_TIMESTAMP, 'YYYY-MM-DD HH24:MI') AS CREATEDDATE FROM corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests WHERE "USER" = ? AND FILE_NAME = ? ORDER BY INSERT_TIMESTAMP DESC LIMIT 1; `; console.log(`[DB getListMetadata] Executing query...`); const rows = await connection.query(query, [username, listId]); console.log(`[DB getListMetadata] Query returned ${rows.length} row(s).`); return (rows.length > 0) ? rows[0] : null; } catch (err) { console.error("[DB Query Error] Error in getListMetadata:", err.message); if (err.odbcErrors) { console.error("[DB Query Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2)); } err.message = `Database error during getListMetadata for user ${username}, list ${listId}: ${err.message}`; throw err; } finally { if (connection) { try { await connection.close(); console.log("[DB Connection] Connection closed for getListMetadata."); } catch (closeErr) { console.error("[DB Connection Error] Error closing connection in getListMetadata:", closeErr); } } else { console.log("[DB getListMetadata] No connection established or already closed."); } } }

// -------------------------------------------------------------------
// getAllListMetadata(username) - No changes needed (Preserved from original)
// -------------------------------------------------------------------
async function getAllListMetadata(username) { let connection; console.log(`[DB getAllListMetadata] Attempting connection for user: ${username}`); try { const connectionString = buildConnectionString(); connection = await odbc.connect(connectionString); console.log(`[DB getAllListMetadata] Connection successful.`); const query = ` SELECT /* User's All Lists Fetch */ FILE_NAME, "USER", TO_CHAR(INSERT_TIMESTAMP, 'YYYY-MM-DD HH24:MI') AS CREATEDDATE FROM corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests WHERE "USER" = ? ORDER BY INSERT_TIMESTAMP DESC; `; console.log(`[DB getAllListMetadata] Executing query...`); const rows = await connection.query(query, [username]); console.log(`[DB getAllListMetadata] Query returned ${rows.length} row(s).`); return rows && Array.isArray(rows) ? rows : []; } catch (err) { console.error("[DB Query Error] Error in getAllListMetadata:", err.message); if (err.odbcErrors) { console.error("[DB Query Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2)); } err.message = `Database error during getAllListMetadata for user ${username}: ${err.message}`; throw err; } finally { if (connection) { try { await connection.close(); console.log("[DB Connection] Connection closed for getAllListMetadata."); } catch (closeErr) { console.error("[DB Connection Error] Error closing connection in getAllListMetadata:", closeErr); } } else { console.log("[DB getAllListMetadata] No connection established or already closed."); } } }

// -------------------------------------------------------------------
// --- MODIFIED FUNCTION --- searchFeaturesByCriteria(featureKey, stage, waveNumber)
// Searches the cr_alpha_content table for existing feature definitions.
// WAS: searchListsByCriteria
// -------------------------------------------------------------------
async function searchFeaturesByCriteria(featureKey, stage, waveNumber) {
    let connection;
    let criteriaLog = `Feature: ${featureKey}`;
    if (stage) criteriaLog += `, Stage: ${stage}`;
    if (waveNumber) criteriaLog += `, Wave: ${waveNumber}`;
    console.log(`[DB searchFeaturesByCriteria] Attempting connection for criteria: ${criteriaLog}`); // --- MODIFIED --- Log message

    try {
        const connectionString = buildConnectionString();
        connection = await odbc.connect(connectionString);
        console.log(`[DB searchFeaturesByCriteria] Connection successful.`); // --- MODIFIED --- Log message

        // --- MODIFIED --- Query targets cr_alpha_content and selects feature definition fields
        let query = `
            SELECT /* Search Feature Definitions by Criteria */
                FEATURE_KEY,
                STAGE,
                WAVE_NUMBER,
                CLIENT_FACING_FEATURE_NAME
                -- Add other columns from cr_alpha_content if needed by the frontend for display/selection
            FROM corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_content
            WHERE UPPER(FEATURE_KEY) = ?
        `;
        const params = [featureKey.toUpperCase()]; // Parameter for Feature Key

        // --- MODIFIED --- Filter directly on STAGE and WAVE_NUMBER columns
        if (stage && stage !== '') {
            query += ` AND STAGE = ?`; // Filter by Stage column
            params.push(stage);
            console.log(`[DB searchFeaturesByCriteria] Adding STAGE = ${stage} to query.`); // --- MODIFIED --- Log message
        }
        if (waveNumber && waveNumber !== '') {
            // Assuming WAVE_NUMBER is stored as text/varchar. If it's numeric, adjust parameter type if needed.
            query += ` AND WAVE_NUMBER = ?`; // Filter by Wave Number column
            params.push(waveNumber);
            console.log(`[DB searchFeaturesByCriteria] Adding WAVE_NUMBER = ${waveNumber} to query.`); // --- MODIFIED --- Log message
        }

        query += ` ORDER BY FEATURE_KEY, STAGE, WAVE_NUMBER;`; // Optional ordering

        console.log(`[DB searchFeaturesByCriteria] Executing query: ${query.replace(/\s+/g, ' ').trim()}`); // --- MODIFIED --- Log message
        console.log(`[DB searchFeaturesByCriteria] With parameters: ${JSON.stringify(params)}`); // --- MODIFIED --- Log message

        const rows = await connection.query(query, params);
        console.log(`[DB searchFeaturesByCriteria] Query returned ${rows.length} feature definition row(s).`); // --- MODIFIED --- Log message

        // --- NEW --- Trim string values in the results (similar to getFeatureContentData)
        const trimmedRows = rows.map(row => {
            const trimmedRow = {};
            for (const key in row) {
                if (typeof row[key] === 'string') {
                    trimmedRow[key] = row[key].trim();
                } else {
                    trimmedRow[key] = row[key]; // Keep numbers, dates, nulls etc.
                }
            }
            return trimmedRow;
        });

        return trimmedRows && Array.isArray(trimmedRows) ? trimmedRows : [];

    } catch (err) {
        console.error("[DB Query Error] Error in searchFeaturesByCriteria:", err.message); // --- MODIFIED --- Log message
        if (err.odbcErrors) { console.error("[DB Query Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2)); }
        err.message = `Database error during searchFeaturesByCriteria for ${criteriaLog}: ${err.message}`; // --- MODIFIED --- Error message
        throw err; // Re-throw to be caught by the endpoint handler
    } finally {
        if (connection) {
            try {
                await connection.close();
                console.log("[DB Connection] Connection closed for searchFeaturesByCriteria."); // --- MODIFIED --- Log message
            } catch (closeErr) {
                console.error("[DB Connection Error] Error closing connection in searchFeaturesByCriteria:", closeErr); // --- MODIFIED --- Log message
            }
        } else {
            console.log("[DB searchFeaturesByCriteria] No connection established or already closed."); // --- MODIFIED --- Log message
        }
    }
}


// -------------------------------------------------------------------
// Helper function: logContentCreation (CORRECTED) (Preserved from original)
// Logs an entry when content is successfully generated.
// -------------------------------------------------------------------
async function logContentCreation(username, contentType, listName) {
    let connection;
    const timestamp = new Date(); // Capture the current time
    console.log(`[DB logContentCreation] Attempting to log event: User=${username}, Type=${contentType}, List=${listName}, Time=${timestamp.toISOString()}`);

    try {
        const connectionString = buildConnectionString();
        connection = await odbc.connect(connectionString);
        console.log(`[DB logContentCreation] Connection successful.`);

        // --- IMPORTANT: Verify exact column names in your Snowflake table ---
        // Assuming standard names based on your example SELECT. Quote them for safety.
        const query = `
            INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_beta_content_creation
                ("USER", "TIMESTAMP", "CONTENT_TYPE", "LIST_NAME")
            VALUES
                (?, ?, ?, ?);
        `;

        const params = [
            username,
            timestamp.toISOString(), // Pass the ISO string format which ODBC/Snowflake usually handles well for TIMESTAMP types
            contentType,
            listName
        ];

        console.log(`[DB logContentCreation] Executing INSERT using query()...`); // Log change
        // *** CORRECTED LINE: Use .query() instead of .execute() *** (Correction was in original code)
        const result = await connection.query(query, params);
        // For INSERTs with node-odbc, 'result' might be less informative than with SELECTs,
        // often just indicating success/failure or row count if the driver supports it.
        // It might even be undefined or an empty array if no rows are returned.
        // The key is that it shouldn't throw an error if the insert succeeds.
        console.log(`[DB logContentCreation] Insert successful (or command sent). Result:`, result);

    } catch (err) {
        // Log the error but DON'T throw, as logging failure shouldn't stop the main process
        console.error("[DB Insert Error] Error in logContentCreation:", err.message);
        if (err.odbcErrors) {
            console.error("[DB Insert Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2));
        }
        // Optionally, implement retry logic or write to a fallback log file here
    } finally {
        if (connection) {
            try {
                await connection.close();
                console.log("[DB Connection] Connection closed for logContentCreation.");
            } catch (closeErr) {
                console.error("[DB Connection Error] Error closing connection in logContentCreation:", closeErr);
            }
        } else {
            console.log("[DB logContentCreation] No connection established or already closed.");
        }
    }
}
// -------------------------------------------------------------------
// Start Server - Using User Specified Block (Preserved from original)
// -------------------------------------------------------------------
const PORT = 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  // IMPORTANT: This hardcoded IP might not be correct for all environments.
  // '0.0.0.0' means listen on all available interfaces. The actual accessible IP
  // needs to be determined from the machine's network configuration.
  console.log(`Server running on http://10.104.50.124:${PORT}`);
});
server.timeout = 10 * 60 * 1000; // 10 minutes

console.log("Server script loaded. Waiting for requests...");

// --- END OF FILE server.js ---