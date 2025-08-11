// --- START OF FILE server.js ---
// Purpose: Node.js backend for Product Operations Tools

const express = require('express');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const odbc = require('odbc');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const cheerio = require('cheerio');

const app = express();

// --- Configuration ---
// !! CHECK THESE PATHS !!
const LIST_GENERATION_SCRIPT_PATH = "C:\\Users\\cmollica\\list_generation_project\\list_generation_power_shell.ps1";
const LIST_FILTER_SCRIPT_PATH = "C:\\Users\\cmollica\\list_generation_project\\list_filter_power_shell.ps1";
const TEMPLATE_DIR_PATH = path.join(__dirname, 'templates');
const OUTPUT_DIR_PATH = "C:\\Users\\cmollica\\OneDrive - athenahealth\\Shared Services (Product Operations) - Invite Drafts";
const PUBLIC_DIR_PATH = path.join(__dirname, 'public');
const PORT = 3000;
// !! END CHECK PATHS !!


// --- Middleware ---
// Serve static files (HTML, CSS, JS, Images) from the 'public' directory
app.use(express.static(PUBLIC_DIR_PATH));

// Parse request bodies
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Request Logger
app.use((req, res, next) => {
  console.log(`[Request Logger] ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  if ((req.method === 'POST' || req.method === 'PUT') && req.body) {
    let bodyLog = {}; try { bodyLog = JSON.parse(JSON.stringify(req.body)); if (bodyLog.var2 && bodyLog.var2.length > 200) { bodyLog.var2 = bodyLog.var2.substring(0, 200) + '...[truncated]'; } if (bodyLog.scrubContextList && bodyLog.scrubContextList.length > 200) { bodyLog.scrubContextList = bodyLog.scrubContextList.substring(0, 200) + '...[truncated]'; } console.log(`   Body:`, JSON.stringify(bodyLog)); } catch(e) { console.log('   Body: [Could not serialize body for logging]'); }
  }
  next();
});


// --- Routes ---

// Serve the NEW landing page at the root
app.get('/', (req, res) => {
    const homePath = path.join(PUBLIC_DIR_PATH, 'home.html');
    if (fs.existsSync(homePath)) {
        res.sendFile(homePath);
    } else {
        console.error(`[Server Error] Landing page home.html not found at: ${homePath}`);
        res.status(404).send("Landing page (home.html) not found.");
    }
});

// Serve the ORIGINAL tool page (now renamed) at /list-tools
app.get('/list-tools', (req, res) => {
    const toolPath = path.join(PUBLIC_DIR_PATH, 'list_tools.html');
     if (fs.existsSync(toolPath)) {
        res.sendFile(toolPath);
    } else {
        console.error(`[Server Error] List tool page list_tools.html not found at: ${toolPath}`);
        res.status(404).send("List tool page (list_tools.html) not found.");
    }
});

// --- Add this Route to server.js ---

// Serve the Marketing Content tool page at /marketing-content
app.get('/marketing-content', (req, res) => {
    const marketingPath = path.join(PUBLIC_DIR_PATH, 'marketing_content.html'); // Look in public
     if (fs.existsSync(marketingPath)) {
        res.sendFile(marketingPath);
    } else {
        console.error(`[Server Error] Marketing Content page marketing_content.html not found at: ${marketingPath}`);
        res.status(404).send("Marketing Content tool page not found.");
    }
});

// --- API Endpoints ---

// Endpoint for ORIGINAL List Generation
app.post('/run-powershell', (req, res) => {
    const { var1, var2, var3 } = req.body;
    console.log('[Original List Gen] Received request for /run-powershell');
    console.log(`  User: ${var1}, FileName: ${var3}`);
    const psScriptPath = LIST_GENERATION_SCRIPT_PATH;
    if (!fs.existsSync(psScriptPath)) { console.error(`[PowerShell Error - Original Gen] Script file not found at: ${psScriptPath}`); return res.status(500).send(`Server configuration error: Original list generation PowerShell script not found.`); }
    const psVar1 = var1 || ''; const psVar2 = var2 || ''; const psVar3 = var3 || '';
    const args = ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-NonInteractive', '-File', psScriptPath, psVar1, psVar2, psVar3];
    console.log(`[PowerShell - Original Gen] Executing: powershell.exe ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
    const child = spawn('powershell.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] }); let stdoutOutput = ""; let stderrOutput = "";
    child.stdout.on('data', (data) => { const outputChunk = data.toString(); console.log('[PowerShell STDOUT - Original Gen]', outputChunk); stdoutOutput += outputChunk; });
    child.stderr.on('data', (data) => { const errorChunk = data.toString(); console.error('[PowerShell STDERR - Original Gen]', errorChunk); stderrOutput += errorChunk; });
    child.on('error', (err) => { console.error("[PowerShell - Original Gen] Failed to start script:", err); return res.status(500).send(`Execution error: Failed to start original generation PowerShell process. Error: ${err.message}`); });
    child.on('exit', (code, signal) => { console.log(`[PowerShell - Original Gen] Script exited with code ${code}, signal ${signal}`); if (code !== 0) { console.error(`[PowerShell Error - Original Gen] Script exited non-zero (Code: ${code}, Signal: ${signal})`); console.error("[PowerShell Error Output - Original Gen]", stderrOutput); const errorMessage = `Original list generation script execution failed (Code: ${code}).\nError details:\n${stderrOutput || 'No specific error output captured.'}`; return res.status(500).send(errorMessage); } console.log("[PowerShell Success Output - Original Gen]", stdoutOutput); res.send("List generation request submitted successfully."); });
});

// Endpoint for List Scrubbing
app.post('/run-list-filter', (req, res) => {
    const { var1, var2, var3 } = req.body;
    console.log('[List Scrub] Received request for /run-list-filter');
    console.log(`  User: ${var1}, FileName: ${var3}`);
    const psScriptPath = LIST_FILTER_SCRIPT_PATH;
    if (!fs.existsSync(psScriptPath)) { console.error(`[PowerShell Error - Filter] Script file not found at: ${psScriptPath}`); return res.status(500).send(`Server configuration error: List filter PowerShell script not found.`); }
    const psVar1 = var1 || ''; const psVar2 = var2 || ''; const psVar3 = var3 || '';
    const args = ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-NonInteractive', '-File', psScriptPath, psVar1, psVar2, psVar3];
    console.log(`[PowerShell - Filter] Executing: powershell.exe ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
    const child = spawn('powershell.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] }); let stdoutOutput = ""; let stderrOutput = "";
    child.stdout.on('data', (data) => { const outputChunk = data.toString(); console.log('[PowerShell STDOUT - Filter]', outputChunk); stdoutOutput += outputChunk; });
    child.stderr.on('data', (data) => { const errorChunk = data.toString(); console.error('[PowerShell STDERR - Filter]', errorChunk); stderrOutput += errorChunk; });
    child.on('error', (err) => { console.error("[PowerShell - Filter] Failed to start script:", err); return res.status(500).send(`Execution error: Failed to start list filter PowerShell process. Error: ${err.message}`); });
    child.on('exit', (code, signal) => { console.log(`[PowerShell - Filter] Script exited with code ${code}, signal ${signal}`); if (code !== 0) { console.error(`[PowerShell Error - Filter] Script exited non-zero (Code: ${code}, Signal: ${signal})`); console.error("[PowerShell Error Output - Filter]", stderrOutput); const errorMessage = `List filter script execution failed (Code: ${code}).\nError details:\n${stderrOutput || 'No specific error output captured.'}`; return res.status(500).send(errorMessage); } console.log("[PowerShell Success Output - Filter]", stdoutOutput); res.send("List filter request submitted successfully."); });
});

// Endpoint for Document Generation
app.post('/generate-content', async (req, res) => {
    try {
        const { username, listId, templateName, additionalFields } = req.body;
        const validTemplates = [ "InviteTemplate_AlphaOptIn", "InviteTemplate_AlphaOptOut", "InviteTemplate_BetaOptIn", "InviteTemplate_BetaOptOut" ];
        if (!username || !listId || !templateName) { return res.status(400).json({ message: "Missing required fields: username, listId, or templateName." }); }
        if (!validTemplates.includes(templateName)) { console.warn(`[Generate Content] Invalid template name received: ${templateName}`); return res.status(400).json({ message: `Invalid templateName specified: ${templateName}. Must be one of ${validTemplates.join(', ')}.` }); }
        console.log(`[Generate Content] Request received for user: ${username}, listId: ${listId}, template: ${templateName}`);
        let featureKey, stage, waveNumber; try { ({ featureKey, stage, waveNumber } = parseFileName(listId)); console.log(`[Generate Content] Parsed listId: Feature=${featureKey}, Stage=${stage}, Wave=${waveNumber}`); } catch (parseError) { console.error(`[Generate Content] Error parsing listId '${listId}':`, parseError); return res.status(400).json({ message: `Invalid listId format: ${listId}. ${parseError.message}` }); }
        const featureContent = await getFeatureContentData(featureKey, stage, waveNumber);
        if (!featureContent) { console.warn(`[Generate Content] No matching content found for ${featureKey}, ${stage}, ${waveNumber}`); return res.status(404).json({ message: "Content definition not found for this feature/stage/wave in the database (cr_alpha_content)." }); }
        const data = { ...featureContent, ...additionalFields, CLIENT_FACING_FEATURE_NAME: featureContent.CLIENT_FACING_FEATURE_NAME || '', OPT_IN_DEADLINE: featureContent.OPT_IN_DEADLINE || '', ALPHA_START_DATE: featureContent.ALPHA_START_DATE || '', RELEASE_NOTE_URL: featureContent.RELEASE_NOTE_URL || '', ADDITIONAL_NOTES: featureContent.ADDITIONAL_NOTES || '', FEEDBACK_LINK: featureContent.FEEDBACK_LINK || '', WHY_AM_I_RECEIVING_THIS: featureContent.WHY_AM_I_RECEIVING_THIS || '', BRIEF_DESCRIPTION: featureContent.BRIEF_DESCRIPTION || '', WORKFLOW_CHANGES: featureContent.WORKFLOW_CHANGES || '', TARGETING_REASON: featureContent.TARGETING_REASON, INVITE_DATE: featureContent.INVITE_DATE || '', CRT: featureContent.CRT || '', PROPS_OWNER: featureContent.PROPS_OWNER || '', TASK_DETAILS: featureContent.TASK_DETAILS || '', BETA_END_DATE: featureContent.BETA_END_DATE || '', OPT_OUT_INSTRUCTIONS: featureContent.OPT_OUT_INSTRUCTIONS || '', RELEASE_NOTE: '' };
        const formatDate = (dateInput) => { if (!dateInput || !(typeof dateInput === 'string' || dateInput instanceof Date)) { return ''; } try { const dateObject = new Date(dateInput); if (isNaN(dateObject.getTime())) { console.warn(`[Date Format] Value '${dateInput}' could not be parsed as a valid date. Returning empty.`); return ''; } const year = dateObject.getUTCFullYear(); const monthIndex = dateObject.getUTCMonth(); const day = dateObject.getUTCDate(); const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; if (monthIndex < 0 || monthIndex > 11) return ''; return `${monthNames[monthIndex]} ${day}, ${year}`; } catch (dateError) { console.error(`[Date Format] Error processing date '${dateInput}':`, dateError); return ''; } };
        data.OPT_IN_DEADLINE = formatDate(data.OPT_IN_DEADLINE); data.ALPHA_START_DATE = formatDate(data.ALPHA_START_DATE); data.INVITE_DATE = formatDate(data.INVITE_DATE); data.BETA_END_DATE = formatDate(data.BETA_END_DATE);
        if (!data.CLIENT_FACING_FEATURE_NAME || String(data.CLIENT_FACING_FEATURE_NAME).trim() === '') { const defaultValue = "(Feature Name TBD)"; console.warn(`[Feature Name] CLIENT_FACING_FEATURE_NAME was empty/missing. Using default: "${defaultValue}"`); data.CLIENT_FACING_FEATURE_NAME = defaultValue; } else { data.CLIENT_FACING_FEATURE_NAME = String(data.CLIENT_FACING_FEATURE_NAME).trim(); }
        data.RELEASE_NOTE = '#'; if (data.RELEASE_NOTE_URL && typeof data.RELEASE_NOTE_URL === 'string') { try { const rawUrl = data.RELEASE_NOTE_URL.trim(); const sanitizedHtmlInput = rawUrl.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); if (sanitizedHtmlInput) { const $ = cheerio.load(sanitizedHtmlInput); const linkElement = $('a'); let extractedUrl = ''; if (linkElement.length > 0) { extractedUrl = linkElement.attr('href'); if (!extractedUrl) { console.warn("[Release Note Link] Found <a> tag but no href attribute in:", sanitizedHtmlInput); } } else if (sanitizedHtmlInput.toLowerCase().startsWith('http')) { extractedUrl = sanitizedHtmlInput; console.log("[Release Note Link] No <a> tag found, using raw string as URL:", extractedUrl); } else { console.warn(`[Release Note Link] No <a> tag and raw string "${sanitizedHtmlInput}" doesn't look like URL. Defaulting.`); } if (extractedUrl) { data.RELEASE_NOTE = extractedUrl.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); } } else { console.log("[Release Note Link] Field was empty after initial trim/sanitization."); } } catch (htmlParseError) { console.error("[Release Note Link] Error parsing/sanitizing HTML:", htmlParseError); } } else { console.log("[Release Note Link] Field missing or not a string. Defaulting RELEASE_NOTE to '#'."); }
        const sanitizeText = (textInput, fieldName = "Field", allowEmpty = false) => { if (textInput === null || typeof textInput === 'undefined') { return ""; } if (typeof textInput !== 'string') { textInput = String(textInput); } try { const originalValue = textInput; let sanitizedValue = originalValue.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); sanitizedValue = sanitizedValue.trim(); if (!allowEmpty && sanitizedValue === '') { console.warn(`[Sanitize ${fieldName}] Value became empty after sanitization/trimming.`); } return sanitizedValue; } catch (sanitizeError) { console.error(`[Sanitize ${fieldName}] Error sanitizing:`, sanitizeError); return String(textInput).trim(); } };
        data.BRIEF_DESCRIPTION = sanitizeText(data.BRIEF_DESCRIPTION, "Brief Description"); data.WORKFLOW_CHANGES = sanitizeText(data.WORKFLOW_CHANGES, "Workflow Changes"); data.ADDITIONAL_NOTES = sanitizeText(data.ADDITIONAL_NOTES, "Additional Notes"); data.WHY_AM_I_RECEIVING_THIS = sanitizeText(data.WHY_AM_I_RECEIVING_THIS, "Why Receiving"); data.CRT = sanitizeText(data.CRT, "CRT"); data.PROPS_OWNER = sanitizeText(data.PROPS_OWNER, "Props Owner"); data.TASK_DETAILS = sanitizeText(data.TASK_DETAILS, "Task Details"); data.FEEDBACK_LINK = sanitizeText(data.FEEDBACK_LINK, "Feedback Link"); data.OPT_OUT_INSTRUCTIONS = sanitizeText(data.OPT_OUT_INSTRUCTIONS, "Opt Out Instructions");
        if (data.TARGETING_REASON && typeof data.TARGETING_REASON === 'string') { data.TARGETING_REASON = sanitizeText(data.TARGETING_REASON, "Targeting Reason", true); if (data.TARGETING_REASON === '') { data.TARGETING_REASON = null; } } else if (!data.TARGETING_REASON) { data.TARGETING_REASON = null; } else { data.TARGETING_REASON = null; }
        const defaultAdditionalNotes = "No Additional Notes Provided."; if (!data.ADDITIONAL_NOTES) { data.ADDITIONAL_NOTES = defaultAdditionalNotes; }
        if ((templateName === 'InviteTemplate_AlphaOptOut' || templateName === 'InviteTemplate_BetaOptOut') && !data.OPT_OUT_INSTRUCTIONS) { data.OPT_OUT_INSTRUCTIONS = "Standard opt-out instructions apply."; }
        console.log("[DEBUG] Final data object for Docxtemplater:", JSON.stringify(data, null, 2));
        const templatePath = path.join(TEMPLATE_DIR_PATH, `${templateName}.docx`);
        console.log("[Generate Content] Looking for template file at:", templatePath); if (!fs.existsSync(templatePath)) { console.error(`Template file not found: ${templatePath}`); if (!fs.existsSync(TEMPLATE_DIR_PATH)) console.error(`Template directory not found: ${TEMPLATE_DIR_PATH}`); return res.status(404).json({ message: `Template file '${templateName}.docx' not found on the server.` }); }
        const content = fs.readFileSync(templatePath, 'binary'); const zip = new PizZip(content); let doc; try { doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: function(part) { const tagName=part.value; if(!part.module){return"";} if(part.module==="loop"){return[];} if(part.module==="condition"){return false;} return""; } }); console.log("[Generate Content] Docxtemplater instance created."); } catch (initError) { console.error("[Generate Content] Error creating Docxtemplater instance:", initError); if (initError.message.includes("Corrupted zip")) { return res.status(500).json({ message: "Error loading template: File might be corrupted or not a valid .docx." }); } return res.status(500).json({ message: "Error initializing template processor: " + initError.message }); }
        try { console.log("[Generate Content] Calling doc.render(data)..."); doc.render(data); console.log("[Generate Content] doc.render(data) completed."); } catch (renderError) { console.error("[Generate Content] Error rendering template:", renderError); const e = { message: renderError.message, name: renderError.name, properties: renderError.properties }; console.error("[DEBUG] Render Error details:", JSON.stringify(e, null, 2)); let userMessage = `Error rendering document: ${renderError.message}.`; if (e.properties && e.properties.id === 'scope_not_found') { userMessage += ` Failed to find value for tag: '${e.properties.details}'.`; } else if (e.properties && e.properties.id === 'template_error') { userMessage += ` Template syntax error near tag: '${e.properties.tag}'.`; } else if (e.properties && e.properties.id === 'unopened_tag' || e.properties && e.properties.id === 'unclosed_tag') { userMessage += ` Mismatched tags like '{' or '}' found. Check the template syntax. Tag: '${e.properties.explanation}'`; } else { userMessage += ` Verify template tags and data.`; } return res.status(500).json({ message: userMessage, details: e }); }
        console.log("[Generate Content] Generating output buffer..."); let buf; try { buf = doc.getZip().generate({ type: 'nodebuffer', compression: "DEFLATE", compressionOptions: { level: 9 } }); console.log("[Generate Content] Output buffer generated."); } catch (bufferError) { console.error("[Generate Content] Error generating buffer:", bufferError); return res.status(500).json({ message: "Error finalizing document buffer: " + bufferError.message }); }
        console.log("[Generate Content] Preparing to save file..."); const oneDriveFolder = OUTPUT_DIR_PATH;
        try { if (!fs.existsSync(oneDriveFolder)) { console.log(`[Generate Content] Creating output directory: ${oneDriveFolder}`); fs.mkdirSync(oneDriveFolder, { recursive: true }); } } catch (dirError) { console.error(`[Generate Content] CRITICAL ERROR creating directory ${oneDriveFolder}:`, dirError); return res.status(500).json({ message: `Server config error: Could not create output directory. Error: ${dirError.message}` }); }
        const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-'); const featureNameForFile = featureKey || 'UnknownFeature'; const sanitize = (str) => str ? String(str).replace(/[\\/:*?"<>|#%&{}\s~]/g, '_').replace(/__/g, '_') : ''; const sanitizedFeatureName = sanitize(featureNameForFile).substring(0, 50); const sanitizedStage = sanitize(stage || 'UnknownStage'); const sanitizedWave = sanitize((waveNumber || 'X').toString()); const templateTypeForFile = templateName.replace('InviteTemplate_', ''); const fileName = `${templateTypeForFile}_Invite_${sanitizedFeatureName}_${sanitizedStage}_${sanitizedWave}_${fileTimestamp}.docx`; const outputPath = path.join(oneDriveFolder, fileName); console.log(`[Generate Content] Attempting to save file to: ${outputPath}`);
        try { fs.writeFileSync(outputPath, buf); console.log(`[Generate Content] File saved successfully: ${outputPath}`); try { const derivedContentType = templateName.replace('InviteTemplate_', '').replace(/([A-Z])/g, ' $1').trim(); console.log(`[Generate Content] Attempting to log creation event for: User=${username}, Type=${derivedContentType}, List=${listId}`); await logContentCreation(username, derivedContentType, listId); console.log(`[Generate Content] Logging function call completed.`); } catch (logError) { console.error(`[Generate Content] CRITICAL: Failed to log content creation event to database after file save. Error:`, logError); } res.status(200).json({ savedPath: outputPath }); } catch (writeError) { console.error(`[Generate Content] Error writing file to ${outputPath}:`, writeError); let writeErrorMessage = `Error saving generated file.`; if (writeError.code === 'EPERM') { writeErrorMessage += ' Permission denied.'; } else if (writeError.code === 'EBUSY') { writeErrorMessage += ' File locked/in use.'; } else if (writeError.code === 'ENOSPC') { writeErrorMessage += ' Not enough disk space.'; } else { writeErrorMessage += ` Details: ${writeError.message}`; } return res.status(500).json({ message: writeErrorMessage }); }
    } catch (error) { console.error("[Generate Content] UNHANDLED error:", error); res.status(500).json({ message: "Unexpected internal server error during content generation.", details: error.message }); }
});

// Endpoint: /get-lists (Fetch lists for a specific user)
app.get('/get-lists', async (req, res) => {
    const username = req.query.username; if (!username) { return res.status(400).json({ message: "Missing username parameter." }); }
    console.log(`[/get-lists] Request received for user: ${username}`);
    try { const lists = await getAllListMetadata(username); console.log(`[/get-lists] Found ${lists.length} lists for user ${username}.`); res.json(lists); }
    catch (error) { console.error("[/get-lists] Error retrieving lists:", error); res.status(500).json({ message: "Failed to retrieve lists.", details: error.message }); }
});

// Endpoint: /search-features-by-criteria (Search feature definitions)
app.get('/search-features-by-criteria', async (req, res) => {
    console.log(`\n--- ENTERING /search-features-by-criteria HANDLER ---`);
    console.log(`   Query Params Received:`, req.query);
    const { featureKey, stage, waveNumber } = req.query; const errors = []; const featurePattern = /^FEATURE-\d{3,8}$/i;
    if (!featureKey) { errors.push("featureKey is required."); } else if (!featurePattern.test(featureKey)) { errors.push("Invalid featureKey format (e.g., FEATURE-123)."); }
    if (stage && !/^[a-z0-9]+$/i.test(stage)) { errors.push("Invalid stage format (if provided)."); }
    if (waveNumber && !/^\d+$/.test(waveNumber)) { errors.push("Invalid waveNumber format (must be digits, if provided)."); }
    if (errors.length > 0) { console.warn(`[/search-features-by-criteria] Validation failed:`, errors); return res.status(400).json({ message: "Invalid search criteria.", errors: errors }); }
    try { const upperFeatureKey = featureKey.toUpperCase(); console.log(`[/search-features-by-criteria] Criteria validated. Searching for Feature: ${upperFeatureKey}, Stage: ${stage || 'Any'}, Wave: ${waveNumber || 'Any'}`); const features = await searchFeaturesByCriteria(upperFeatureKey, stage, waveNumber); console.log(`[/search-features-by-criteria] DB search completed. Found ${features.length} feature definitions.`); res.status(200).json(features); console.log(`--- EXITING /search-features-by-criteria HANDLER (Success) ---`); } catch (error) { console.error("[/search-features-by-criteria] ERROR caught during search:", error); res.status(500).json({ message: "Failed to search features due to an internal server error.", details: error.message }); console.log(`--- EXITING /search-features-by-criteria HANDLER (Error) ---`); }
});


// --- Helper Functions ---
function parseFileName(fileName) { if (!fileName || typeof fileName !== 'string') { throw new Error(`Invalid input: fileName must be a non-empty string.`); } const parts = fileName.split('_'); if (parts.length < 3) { throw new Error(`Invalid file name format: ${fileName}. Expected format: FEATURE-XXX_Stage_WaveNumber`); } if (!/^FEATURE-\d{3,8}$/i.test(parts[0])) { throw new Error(`Invalid Feature Key format in name: ${parts[0]}`);} if (!/^[a-zA-Z0-9]+$/.test(parts[1])) { throw new Error(`Invalid Stage format in name: ${parts[1]}`);} if (!/^\d+$/.test(parts[2])) { throw new Error(`Invalid Wave Number format in name: ${parts[2]}`);} return { featureKey: parts[0].toUpperCase(), stage: parts[1], waveNumber: parts[2] }; }
function buildConnectionString() { const snowflakeUser = process.env.API_USERNAME; const snowflakePassword = process.env.API_PASSWORD; if (!snowflakeUser || !snowflakePassword) { console.error("CRITICAL ERROR: Missing API_USERNAME or API_PASSWORD environment variables! Server cannot connect to Snowflake."); throw new Error("Server configuration error: Snowflake credentials (API_USERNAME, API_PASSWORD) are not set in environment variables."); } const snowflakeAccount = "athenahealth.snowflakecomputing.com"; const snowflakeDatabase = "CORPANALYTICS_BUSINESS_PROD"; const snowflakeSchema = "SCRATCHPAD_PRDPF"; const snowflakeWarehouse = "CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD"; const snowflakeRole = "CORPANALYTICS_BDB_PRDPF_PROD_RW"; return `Driver={SnowflakeDSIIDriver};Server=${snowflakeAccount};Database=${snowflakeDatabase};Schema=${snowflakeSchema};Warehouse=${snowflakeWarehouse};Role=${snowflakeRole};Uid=${snowflakeUser};Pwd=${snowflakePassword};`; }
async function getFeatureContentData(featureKey, stage, waveNumber) { let connection; console.log(`[DB getFeatureContentData] Attempting connection for ${featureKey}, ${stage}, ${waveNumber}`); try { const connectionString = buildConnectionString(); connection = await odbc.connect(connectionString); console.log(`[DB getFeatureContentData] Connection successful.`); const query = ` SELECT /* Feature Content Fetch (Expanded) */ FEATURE_KEY, STAGE, WAVE_NUMBER, CLIENT_FACING_FEATURE_NAME, PRACTICE_IDS, OPT_IN_DEADLINE, ALPHA_START_DATE, INVITE_DATE, RELEASE_NOTE_URL, ADDITIONAL_NOTES, FEEDBACK_LINK, WHY_AM_I_RECEIVING_THIS, BRIEF_DESCRIPTION, WORKFLOW_CHANGES, TARGETING_REASON, CRT, PROPS_OWNER, TASK_DETAILS FROM corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_content WHERE FEATURE_KEY = ? AND STAGE = ? AND WAVE_NUMBER = ? LIMIT 1; `; console.log(`[DB getFeatureContentData] Executing query...`); const rows = await connection.query(query, [featureKey, stage, waveNumber]); console.log(`[DB getFeatureContentData] Query returned ${rows.length} row(s).`); if (rows.length > 0) { const trimmedRow = {}; for (const key in rows[0]) { if (typeof rows[0][key] === 'string') { trimmedRow[key] = rows[0][key].trim(); } else { trimmedRow[key] = rows[0][key]; } } return trimmedRow; } else { console.log("[DB getFeatureContentData] No matching row found."); return null; } } catch (err) { console.error("[DB Query Error] Error in getFeatureContentData:", err.message); if (err.odbcErrors) { console.error("[DB Query Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2)); } err.message = `Database error during getFeatureContentData for ${featureKey}/${stage}/${waveNumber}: ${err.message}`; throw err; } finally { if (connection) { try { await connection.close(); console.log("[DB Connection] Connection closed for getFeatureContentData."); } catch (closeErr) { console.error("[DB Connection Error] Error closing connection in getFeatureContentData:", closeErr); } } else { console.log("[DB getFeatureContentData] No connection established or already closed."); } } }
async function getListMetadata(username, listId) { let connection; console.log(`[DB getListMetadata] Attempting connection for user: ${username}, listId: ${listId}`); try { const connectionString = buildConnectionString(); connection = await odbc.connect(connectionString); console.log(`[DB getListMetadata] Connection successful.`); const query = ` SELECT /* List Metadata Fetch */ FILE_NAME, "USER", TO_CHAR(INSERT_TIMESTAMP, 'YYYY-MM-DD HH24:MI') AS CREATEDDATE FROM corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests WHERE "USER" = ? AND FILE_NAME = ? ORDER BY INSERT_TIMESTAMP DESC LIMIT 1; `; console.log(`[DB getListMetadata] Executing query...`); const rows = await connection.query(query, [username, listId]); console.log(`[DB getListMetadata] Query returned ${rows.length} row(s).`); return (rows.length > 0) ? rows[0] : null; } catch (err) { console.error("[DB Query Error] Error in getListMetadata:", err.message); if (err.odbcErrors) { console.error("[DB Query Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2)); } err.message = `Database error during getListMetadata for user ${username}, list ${listId}: ${err.message}`; throw err; } finally { if (connection) { try { await connection.close(); console.log("[DB Connection] Connection closed for getListMetadata."); } catch (closeErr) { console.error("[DB Connection Error] Error closing connection in getListMetadata:", closeErr); } } else { console.log("[DB getListMetadata] No connection established or already closed."); } } }
async function getAllListMetadata(username) { let connection; console.log(`[DB getAllListMetadata] Attempting connection for user: ${username}`); try { const connectionString = buildConnectionString(); connection = await odbc.connect(connectionString); console.log(`[DB getAllListMetadata] Connection successful.`); const query = ` SELECT /* User's All Lists Fetch */ FILE_NAME, "USER", TO_CHAR(INSERT_TIMESTAMP, 'YYYY-MM-DD HH24:MI') AS CREATEDDATE FROM corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests WHERE "USER" = ? ORDER BY INSERT_TIMESTAMP DESC; `; console.log(`[DB getAllListMetadata] Executing query...`); const rows = await connection.query(query, [username]); console.log(`[DB getAllListMetadata] Query returned ${rows.length} row(s).`); return rows && Array.isArray(rows) ? rows : []; } catch (err) { console.error("[DB Query Error] Error in getAllListMetadata:", err.message); if (err.odbcErrors) { console.error("[DB Query Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2)); } err.message = `Database error during getAllListMetadata for user ${username}: ${err.message}`; throw err; } finally { if (connection) { try { await connection.close(); console.log("[DB Connection] Connection closed for getAllListMetadata."); } catch (closeErr) { console.error("[DB Connection Error] Error closing connection in getAllListMetadata:", closeErr); } } else { console.log("[DB getAllListMetadata] No connection established or already closed."); } } }
async function searchFeaturesByCriteria(featureKey, stage, waveNumber) { let connection; let criteriaLog = `Feature: ${featureKey}`; if (stage) criteriaLog += `, Stage: ${stage}`; if (waveNumber) criteriaLog += `, Wave: ${waveNumber}`; console.log(`[DB searchFeaturesByCriteria] Attempting connection for criteria: ${criteriaLog}`); try { const connectionString = buildConnectionString(); connection = await odbc.connect(connectionString); console.log(`[DB searchFeaturesByCriteria] Connection successful.`); let query = ` SELECT /* Search Feature Definitions by Criteria */ FEATURE_KEY, STAGE, WAVE_NUMBER, CLIENT_FACING_FEATURE_NAME FROM corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_content WHERE UPPER(FEATURE_KEY) = ? `; const params = [featureKey.toUpperCase()]; if (stage && stage !== '') { query += ` AND STAGE = ?`; params.push(stage); console.log(`[DB searchFeaturesByCriteria] Adding STAGE = ${stage} to query.`); } if (waveNumber && waveNumber !== '') { query += ` AND WAVE_NUMBER = ?`; params.push(waveNumber); console.log(`[DB searchFeaturesByCriteria] Adding WAVE_NUMBER = ${waveNumber} to query.`); } query += ` ORDER BY FEATURE_KEY, STAGE, WAVE_NUMBER;`; console.log(`[DB searchFeaturesByCriteria] Executing query: ${query.replace(/\s+/g, ' ').trim()}`); console.log(`[DB searchFeaturesByCriteria] With parameters: ${JSON.stringify(params)}`); const rows = await connection.query(query, params); console.log(`[DB searchFeaturesByCriteria] Query returned ${rows.length} feature definition row(s).`); const trimmedRows = rows.map(row => { const trimmedRow = {}; for (const key in row) { if (typeof row[key] === 'string') { trimmedRow[key] = row[key].trim(); } else { trimmedRow[key] = row[key]; } } return trimmedRow; }); return trimmedRows && Array.isArray(trimmedRows) ? trimmedRows : []; } catch (err) { console.error("[DB Query Error] Error in searchFeaturesByCriteria:", err.message); if (err.odbcErrors) { console.error("[DB Query Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2)); } err.message = `Database error during searchFeaturesByCriteria for ${criteriaLog}: ${err.message}`; throw err; } finally { if (connection) { try { await connection.close(); console.log("[DB Connection] Connection closed for searchFeaturesByCriteria."); } catch (closeErr) { console.error("[DB Connection Error] Error closing connection in searchFeaturesByCriteria:", closeErr); } } else { console.log("[DB searchFeaturesByCriteria] No connection established or already closed."); } } }
async function logContentCreation(username, contentType, listName) { let connection; const timestamp = new Date(); console.log(`[DB logContentCreation] Attempting to log event: User=${username}, Type=${contentType}, List=${listName}, Time=${timestamp.toISOString()}`); try { const connectionString = buildConnectionString(); connection = await odbc.connect(connectionString); console.log(`[DB logContentCreation] Connection successful.`); const query = ` INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cr_alpha_beta_content_creation ("USER", "TIMESTAMP", "CONTENT_TYPE", "LIST_NAME") VALUES (?, ?, ?, ?); `; const params = [ username, timestamp.toISOString(), contentType, listName ]; console.log(`[DB logContentCreation] Executing INSERT using query()...`); const result = await connection.query(query, params); console.log(`[DB logContentCreation] Insert successful (or command sent). Result:`, result); } catch (err) { console.error("[DB Insert Error] Error in logContentCreation:", err.message); if (err.odbcErrors) { console.error("[DB Insert Error] ODBC Details:", JSON.stringify(err.odbcErrors, null, 2)); } } finally { if (connection) { try { await connection.close(); console.log("[DB Connection] Connection closed for logContentCreation."); } catch (closeErr) { console.error("[DB Connection Error] Error closing connection in logContentCreation:", closeErr); } } else { console.log("[DB logContentCreation] No connection established or already closed."); } } }


// -------------------------------------------------------------------
// Start Server
// -------------------------------------------------------------------
server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running and listening on port ${PORT}`);
    console.log(`Access via http://localhost:${PORT} or http://10.5.104.29:${PORT}`);
    console.log(`Serving static files from: ${PUBLIC_DIR_PATH}`);
    console.log(`Root ('/') should serve: ${path.join(PUBLIC_DIR_PATH, 'home.html')}`);
    console.log(`'/list-tools' should serve: ${path.join(PUBLIC_DIR_PATH, 'list_tools.html')}`);
    console.log(`Ensure required environment variables (API_USERNAME, API_PASSWORD) are set.`);
    console.log(`Ensure PowerShell scripts and template/output directories exist and paths are correct.`);
});
server.timeout = 10 * 60 * 1000; // 10 minutes

console.log("Server script loaded. Waiting for requests...");

// --- END OF FILE server.js ---