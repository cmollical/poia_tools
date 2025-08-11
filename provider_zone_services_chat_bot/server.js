const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { executeSnowflakeQuery } = require('./dbUtils');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const snowflake = require('snowflake-sdk');
const fs = require('fs');
const cookieParser = require('cookie-parser');


const app = express();

// Parse JSON bodies for all incoming requests
app.use(express.json());
// Parse cookies for all incoming requests
app.use(cookieParser());
const JWT_KEY = process.env.JWT_SECRET || 'a_secure_secret_key_should_be_in_env';



// --- Admin whitelist ---
const ADMIN_FILE_PATH = path.join(__dirname, 'admin_list.json');

// Load admins from file or use defaults
let allowedAdmins;
try {
    if (fs.existsSync(ADMIN_FILE_PATH)) {
        const adminData = JSON.parse(fs.readFileSync(ADMIN_FILE_PATH, 'utf8'));
        allowedAdmins = new Set(adminData.admins);
        console.log('Loaded admin list from file:', Array.from(allowedAdmins));
    } else {
        // Default admin list
        allowedAdmins = new Set(['cmollica', 'ccross', 'ameucci', 'mpardun']);
        // Save the default list
        saveAdminList();
    }
} catch (err) {
    console.error('Error loading admin list:', err);
    // Fallback to default list
    allowedAdmins = new Set(['cmollica', 'ccross', 'ameucci', 'mpardun']);
}

// Function to save admin list to file
function saveAdminList() {
    try {
        fs.writeFileSync(ADMIN_FILE_PATH, JSON.stringify({ admins: Array.from(allowedAdmins) }), 'utf8');
        console.log('Saved admin list to file');
    } catch (err) {
        console.error('Error saving admin list:', err);
    }
}

function ensureAdmin(req, res, next) {
    if (req.user && allowedAdmins.has(req.user)) return next();
    return res.status(403).json({ error: 'admin only' });
}

// ---------------- JWT auth middleware -----------------
function auth(req,res,next){
    // Check for token in authorization header
    const hdr = req.headers['authorization']||'';
    const m = hdr.match(/^Bearer (.+)$/);
    
    // Check for token in cookies
    const cookieHeader = req.headers.cookie || '';
    const cookieMatch = cookieHeader.match(/jwt_token=([^;]+)/);
    
    // Use token from either source
    const token = m ? m[1] : (cookieMatch ? cookieMatch[1] : null);
    
    if(!token) return res.status(401).json({error:'token required'});
    
    try{ 
        req.user = jwt.verify(token, JWT_KEY).user; 
        return next(); 
    }
    catch(e){ 
        return res.status(401).json({error:'bad token'}); 
    }
}



// ---------------- register & login routes --------------------
app.post('/register', async (req,res)=>{
    const { user, pass } = req.body;
    if(!user||!pass) return res.status(400).json({error:'Username and password are required'});
    try{
        const rows = await executeSnowflakeQuery(`SELECT password_hash FROM corpanalytics_business_prod.scratchpad_prdpf.cora_login WHERE user_name=?`,[user]);
        if(rows.length===0) return res.status(403).json({error:'This username is not authorized to register.'});
        if(rows[0].PASSWORD_HASH) return res.status(409).json({error:'A password has already been set for this user.'});
        const hash = bcrypt.hashSync(pass,10);
        await executeSnowflakeQuery(`UPDATE corpanalytics_business_prod.scratchpad_prdpf.cora_login SET password_hash=?, created_at=CURRENT_TIMESTAMP WHERE user_name=?`,[hash,user]);
        return res.json({ok:true});
    }catch(err){ console.error('Registration Error:', err); return res.status(500).json({error:'Server error during registration.'}); }
});

app.post('/login', async (req,res)=>{
    const { user, pass } = req.body;
    if(!user||!pass) return res.status(400).json({error:'Username and password are required'});
    try{
        const rows = await executeSnowflakeQuery(`SELECT password_hash FROM corpanalytics_business_prod.scratchpad_prdpf.cora_login WHERE user_name=?`,[user]);
        if(rows.length===0) return res.status(401).json({error:'Invalid credentials'});
        const hash = rows[0].PASSWORD_HASH||'';
        if(!bcrypt.compareSync(pass, hash)) return res.status(401).json({error:'Invalid credentials'});
        await executeSnowflakeQuery(`UPDATE corpanalytics_business_prod.scratchpad_prdpf.cora_login SET last_login_at=CURRENT_TIMESTAMP WHERE user_name=?`,[user]);
        const token = jwt.sign({user}, JWT_KEY, {expiresIn:'8h'});
        
        // Set token as HTTP-only cookie that persists across pages
        res.cookie('jwt_token', token, {
            httpOnly: false, // Set to false so JavaScript can read it
            secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
            maxAge: 8 * 60 * 60 * 1000, // 8 hours in milliseconds
            path: '/', // Available across the entire site
        });
        
        return res.json({token});
    }catch(err){ console.error('Login Error:', err); return res.status(500).json({error:'Server error during login.'}); }
});

// ------------------------------------------
// Snowflake logging helpers
// ------------------------------------------
async function ensureLoggingTable() {
    const ddl = `CREATE TABLE IF NOT EXISTS pzs_chat_bot (
        id NUMBER AUTOINCREMENT PRIMARY KEY,
        user_name STRING,
        question STRING,
        asked_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP,
        success BOOLEAN,
        response STRING,
        error_message STRING
    );`;
    try {
        await executeSnowflakeQuery(ddl);
        console.log('[INIT] Logging table verified/created.');
    } catch (err) {
        console.error('[INIT] Failed to create logging table:', err.message);
    }
}

async function logInteraction(user, question, success, response = null, errorMsg = null) {
    const insertSql = `INSERT INTO pzs_chat_bot (user_name, question, success, response, error_message)
                       VALUES (?, ?, ?, ?, ?);`;
    try {
        await executeSnowflakeQuery(insertSql, [user, question, success, response, errorMsg]);
    } catch (err) {
        console.error('[LOGGING ERROR] Could not insert log row:', err.message);
    }
}

// Function to clean up old files in uploads directory
async function cleanupUploadsDirectory() {
    const uploadsDir = path.join(__dirname, 'uploads');
    const maxAgeHours = 24; // Files older than this will be removed
    
    try {
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
            return;
        }
        
        const files = fs.readdirSync(uploadsDir);
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const file of files) {
            const filePath = path.join(uploadsDir, file);
            const stats = fs.statSync(filePath);
            
            // Calculate file age in hours
            const fileAgeHours = (now - stats.mtime.getTime()) / (1000 * 60 * 60);
            
            if (fileAgeHours > maxAgeHours) {
                fs.unlinkSync(filePath);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`[CLEANUP] Removed ${cleanedCount} old files from uploads directory`);
        }
    } catch (err) {
        console.error('[CLEANUP ERROR]', err);
    }
}

// Run cleanup on startup and periodically
cleanupUploadsDirectory();
setInterval(cleanupUploadsDirectory, 4 * 60 * 60 * 1000); // Every 4 hours

// verify logging table on startup
ensureLoggingTable();

const port = process.env.PORT || 5001;
app.use(express.static(path.join(__dirname, 'public')));

app.get('/files', auth, async (req,res)=>{
    try{
        const rows = await executeSnowflakeQuery('SELECT DISTINCT file_name FROM provider_zone_services_pdf_chunks ORDER BY file_name');
        res.json({files: rows.map(r=>r.FILE_NAME)});
    }catch(err){
        console.error('Files query error',err);
        res.status(500).json({error:'files query failed'});
    }
});

app.get('/history', auth, async (req,res)=>{
    const { start, end } = req.query;
    if(!start || !end) return res.status(400).json({error:'start and end required'});
    try{
        const sql = `SELECT asked_at, question, response FROM pzs_chat_bot WHERE asked_at BETWEEN ? AND ? ORDER BY asked_at DESC LIMIT 100`;
        const rows = await executeSnowflakeQuery(sql,[start,end]);
        res.json({rows});
    }catch(err){
        console.error('History query error',err);
        res.status(500).json({error:'history query failed'});
    }
});

app.post('/ask', auth, async (req, res) => {
    const { question } = req.body;
    const currentUser = req.user || 'generic';

    if (!question) {
        await logInteraction(currentUser, '', false, null, 'No question supplied');
        return res.status(400).json({ error: 'Question is required.' });
    }

    const query = `CALL ask_provider_pdfs(?)`;

    try {
        console.log(`Executing query: ${query} with question: ${question}`);
        const result = await executeSnowflakeQuery(query, [question]);

        if (!result || result.length === 0) {
            throw new Error('No response from Snowflake procedure.');
        }

        // The result from the procedure is in the first column of the first row.
        const procedureResponse = result[0][Object.keys(result[0])[0]];
        const data = JSON.parse(procedureResponse);

        await logInteraction(currentUser, question, true, JSON.stringify(data));
        res.json(data);
    } catch (error) {
        console.error('Error calling Snowflake procedure:', error);
        await logInteraction(currentUser, question, false, null, error.message);
        res.status(500).json({ error: 'Failed to get answer from Snowflake.' });
    }
});

// -------------------------------
// Admin upload routes
// -------------------------------
function snowflakeConnect() {
    return snowflake.createConnection({
        account: process.env.SF_ACCOUNT || 'athenahealth',
        username: process.env.SNOWFLAKE_USERNAME,
        password: process.env.SNOWFLAKE_PASSWORD,
        warehouse: 'CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD',
        database: 'CORPANALYTICS_BUSINESS_PROD',
        schema: 'SCRATCHPAD_PRDPF',
        role: 'CORPANALYTICS_BDB_PRDPF_PROD_RW'
    }).connectAsync();
}

// --------------------- Admin Management API -----------------------
app.get('/api/admins', auth, ensureAdmin, (req, res) => {
    try {
        res.json({ admins: Array.from(allowedAdmins) });
    } catch (err) {
        console.error('Error getting admin list:', err);
        res.status(500).json({ error: 'Failed to get admin list' });
    }
});

app.post('/api/admins', auth, ensureAdmin, (req, res) => {
    const { username, action } = req.body;
    
    if (!username || typeof username !== 'string' || !['add', 'remove'].includes(action)) {
        return res.status(400).json({ error: 'Invalid request. Provide username and action (add/remove)' });
    }
    
    try {
        if (action === 'add') {
            allowedAdmins.add(username);
        } else { // remove
            // Prevent removing the last admin
            if (allowedAdmins.size <= 1) {
                return res.status(400).json({ error: 'Cannot remove the last admin' });
            }
            allowedAdmins.delete(username);
        }
        
        // Save updated admin list
        saveAdminList();
        
        res.json({ success: true, admins: Array.from(allowedAdmins) });
    } catch (err) {
        console.error(`Error ${action === 'add' ? 'adding' : 'removing'} admin:`, err);
        res.status(500).json({ error: `Failed to ${action} admin` });
    }
});

app.get('/admin', auth, ensureAdmin, (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Helper function to process a document in Snowflake
async function processDocument(fileName, localPath = null, conn = null, log) {
    // For Snowflake SQL commands that include the filename directly in the SQL,
    // we need to escape any single quotes in the filename and wrap the entire filename in quotes
    const escapedFileName = fileName.replace(/'/g, "''"); // Double up single quotes for SQL
    
    // Initialize file name variables - these will be set properly during the process
    let stageFileName = fileName;  // The name of the file in the Snowflake stage
    let dbFileName = fileName;     // The name used in database records
    
    // Cleanup any previous version of this document
    await executeSnowflakeQuery(`DELETE FROM provider_zone_services_pdf_chunks WHERE file_name = ?`, [fileName]);
    await executeSnowflakeQuery(`DELETE FROM provider_zone_services_pdfs WHERE file_name = ?`, [fileName]);
    
    // Only remove from stage and upload if we're processing a new file
    if (localPath) {
        try {
            // For Snowflake stage operations with filenames containing spaces, we need to use special syntax
            // For REMOVE command, we can use pattern matching to find the file
            await executeSnowflakeQuery(`REMOVE @provider_zone_services/ pattern='.*${escapedFileName}.*'`);
            log('Old rows removed if present');
        } catch (removeError) {
            // If the file doesn't exist yet, this is normal
            log('No previous file to remove or file not found in stage');
        }

        // Upload new file to stage with a simple name to avoid problems with spaces
        try {
            // First ensure the local path exists
            const resolvedPath = path.resolve(localPath);
            if (!fs.existsSync(resolvedPath)) {
                throw new Error(`Local file not found: ${resolvedPath}`);
            }
            
            // Create a temporary file with a simple name without spaces
            const fileExtension = path.extname(fileName);
            const tempFileName = `temp_upload_${Date.now()}${fileExtension}`;
            stageFileName = tempFileName; // Use this name for stage operations
            const tempFilePath = path.join(path.dirname(resolvedPath), tempFileName);
            
            log(`Creating temporary file: ${tempFilePath}`);
            fs.copyFileSync(resolvedPath, tempFilePath);
            
            try {
                // For Windows paths, convert backslashes to forward slashes
                const tempPathForward = tempFilePath.replace(/\\/g, '/');
                
                // Execute the PUT command with the simplified path
                log(`Uploading with path: file://${tempPathForward}`);
                await executeSnowflakeQuery(
                    `PUT file://${tempPathForward} @provider_zone_services/ auto_compress=false overwrite=true`
                );
                log('File staged');
                
                // Verify the file was uploaded correctly
                const stageFiles = await executeSnowflakeQuery(
                    `LIST @provider_zone_services/ PATTERN='.*${tempFileName}.*'`
                );
                
                if (!stageFiles || stageFiles.length === 0) {
                    throw new Error('Failed to find uploaded file in stage');
                }
                
                log(`File staged successfully as ${stageFileName}, will be referenced in DB as ${dbFileName}`);
                
            } finally {
                // Clean up the temporary file
                try {
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                        log('Temporary file removed');
                    }
                } catch (cleanupError) {
                    log(`Warning: Failed to clean up temporary file: ${cleanupError.message}`);
                }
            }
        } catch (putError) {
            log(`Error staging file: ${putError.message}`);
            throw putError; // Re-throw to halt the process
        }
    } else {
        // For reprocessing, need to confirm the file exists in stage
        try {
            const files = await executeSnowflakeQuery(
                `LIST @provider_zone_services/ PATTERN='.*${escapedFileName}.*'`
            );
            
            if (files && files.length > 0) {
                log(`Found existing file in stage: ${files[0].name}`);
                stageFileName = files[0].name.replace(/^.*\//, ''); // Extract just the filename portion
            } else {
                throw new Error(`File not found in stage: ${fileName}`);
            }
        } catch (error) {
            log(`Error checking stage: ${error.message}`);
            throw error;
        }
    }
    
    // Log the file names we're using for clarity
    log(`Processing with stage filename: ${stageFileName}, database filename: ${dbFileName}`);
    
    try {
        // List the files in the stage to confirm what's actually there
        log('Listing files in stage...');
        const stageContents = await executeSnowflakeQuery(`LIST @provider_zone_services/`);
        if (stageContents && stageContents.length > 0) {
            stageContents.forEach(file => log(`Stage file: ${file.name}`));
        } else {
            log('No files found in stage');
        }
    
        // Parse document - use the temporary filename for stage operations but original filename in database
        log('Starting document parsing...');
        // Get the full path from the stage listing
        let stagePath = stageFileName;
        for (const file of stageContents || []) {
            if (file.name && file.name.includes(stageFileName)) {
                // Extract just the filename part from the full path
                stagePath = file.name.split('/').pop();
                log(`Found file in stage: ${file.name}, using: ${stagePath}`);
                break;
            }
        }
        
        // Store both the original filename and the temporary filename used in the stage
        // This allows us to properly clean up stage files later
        await executeSnowflakeQuery(`INSERT INTO provider_zone_services_pdfs (file_name, temp_file, parsed)
            SELECT ?, ?, SNOWFLAKE.CORTEX.PARSE_DOCUMENT(@provider_zone_services, '${stagePath}', {'mode':'OCR'});`, 
            [dbFileName, stagePath]);
        log('Document parsed successfully');
    
        // Chunk the document - using the original filename in database
        log('Starting document chunking...');
        await executeSnowflakeQuery(`INSERT INTO provider_zone_services_pdf_chunks (file_name, chunk_id, chunk_text)
            WITH lines AS (
                SELECT ? AS file_name,
                       ROW_NUMBER() OVER (ORDER BY l.seq) AS line_no,
                       l.value AS line_text
                FROM provider_zone_services_pdfs r,
                     LATERAL SPLIT_TO_TABLE(r.parsed:content::string, '\n') l
                WHERE r.file_name = ?
            ),
            paragraphs AS (
                SELECT file_name,
                       FLOOR((line_no - 1) / 40) AS para_id,
                       LISTAGG(line_text, '\n') WITHIN GROUP (ORDER BY line_no) AS chunk_text
                FROM lines
                GROUP BY file_name, para_id
            )
            SELECT file_name, para_id + 1, chunk_text
            FROM paragraphs
            WHERE LENGTH(chunk_text) > 80;`, [dbFileName, dbFileName]);
        log('Chunks inserted successfully');
    
        // Create embeddings - using the original filename in database
        log('Starting embedding creation...');
        await executeSnowflakeQuery(`UPDATE provider_zone_services_pdf_chunks
            SET chunk_vec = SNOWFLAKE.CORTEX.EMBED_TEXT_1024('snowflake-arctic-embed-l-v2.0', chunk_text)
            WHERE file_name = ? AND chunk_vec IS NULL;`, [dbFileName]);
        log('Embedding complete');
        
        return { success: true, message: 'Document processed successfully' };
    } catch (error) {
        log(`Error in document processing: ${error.message}`);
        if (error.message.includes('not be found')) {
            log('The file may not have been uploaded properly to the stage or has a different name than expected.');
        }
        throw error;
    }
}

// Upload a new document
app.post('/admin/upload', auth, ensureAdmin, upload.single('pdf'), async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    const log = msg => { res.write(msg + '\n'); console.log('[ADMIN]', msg); };

    try {
        const fileName = path.basename(req.file.originalname);
        const localPath = req.file.path;

        // Log the file information for debugging
        log(`Processing file: ${fileName}, Local path: ${localPath}`);

        // Process the document and capture any returned file information
        const result = await processDocument(fileName, localPath, null, log);
        
        // Log what we got back from processDocument
        if (result) {
            log(`Process result: ${JSON.stringify(result)}`);
        }

        res.end('Done');
        fs.unlinkSync(localPath); // Clean up the uploaded file
    } catch (err) {
        console.error('[ADMIN UPLOAD ERROR]', err);
        res.status(500).end(`Error during admin upload: ${err.message}`);
    }
});

// Reprocess an existing document in the stage
app.post('/admin/reprocess', auth, ensureAdmin, async (req, res) => {
    const fileName = req.query.filename;
    if (!fileName) {
        return res.status(400).end('Filename is required');
    }
    
    res.setHeader('Content-Type', 'text/plain');
    const log = msg => { res.write(msg + '\n'); console.log('[ADMIN]', msg); };
    
    try {
        // Properly escape the filename for the SQL query
        // For stage operations, we need to use parameterized queries where possible
        // But DIRECTORY queries might need special handling
        const escapedFileName = fileName.replace(/'/g, "''");
        
        // Check if the file exists in stage - use parameterized query to handle spaces safely
        const rows = await executeSnowflakeQuery(
            `SELECT relative_path FROM DIRECTORY(@provider_zone_services) WHERE relative_path = ?`, 
            [fileName]
        );
        
        if (!rows || rows.length === 0) {
            return res.status(404).end(`File '${fileName}' not found in stage`);
        }
        
        log(`Reprocessing existing file: ${fileName}`);
        await processDocument(fileName, null, null, log);
        
        res.end('Done');
    } catch (err) {
        console.error('[ADMIN REPROCESS ERROR]', err);
        res.status(500).end(`Error during reprocessing: ${err.message}`);
    }
});

// Diagnostic endpoint to check table structure
app.get('/admin/table-info', auth, ensureAdmin, async (req, res) => {
    try {
        const results = {};
        
        // Check the PDFs table
        try {
            const pdfRows = await executeSnowflakeQuery(`SELECT * FROM provider_zone_services_pdfs LIMIT 1`);
            
            if (pdfRows && pdfRows.length > 0) {
                results.pdfs_table = {
                    exists: true,
                    columns: Object.keys(pdfRows[0]),
                    sample_row: pdfRows[0]
                };
            } else {
                results.pdfs_table = { exists: true, columns: [], isEmpty: true };
            }
        } catch (err) {
            results.pdfs_table = { exists: false, error: err.message };
        }
        
        // Check the chunks table
        try {
            const chunksRows = await executeSnowflakeQuery(`SELECT * FROM provider_zone_services_pdf_chunks LIMIT 1`);
            
            if (chunksRows && chunksRows.length > 0) {
                results.chunks_table = {
                    exists: true,
                    columns: Object.keys(chunksRows[0]),
                    sample_row: chunksRows[0]
                };
            } else {
                results.chunks_table = { exists: true, columns: [], isEmpty: true };
            }
        } catch (err) {
            results.chunks_table = { exists: false, error: err.message };
        }
        
        res.json(results);
    } catch (err) {
        console.error('[TABLE INFO ERROR]', err);
        res.status(500).json({ error: `Error retrieving table information: ${err.message}` });
    }
});

// Get document text directly from the pdfs table
app.get('/admin/document-text', auth, ensureAdmin, async (req, res) => {
    const fileName = req.query.filename;
    if (!fileName) {
        return res.status(400).json({error: 'Filename is required'});
    }
    
    try {
        // Query the pdfs table for document content using the proper executeSnowflakeQuery function
        const query = `SELECT parsed FROM provider_zone_services_pdfs WHERE file_name = ?`;
        const rows = await executeSnowflakeQuery(query, [fileName]);
        
        if (!rows || rows.length === 0) {
            return res.status(404).json({error: `Document '${fileName}' not found in database`});
        }
        
        // Extract the text content from the parsed JSON object
        let documentText = 'No content available';
        
        try {
            // Get the raw data from Snowflake
            const rawData = rows[0].PARSED;
            console.log('[DOCUMENT TEXT] Raw data type:', typeof rawData);
            
            // If it's already a JavaScript object
            if (typeof rawData === 'object' && rawData !== null) {
                console.log('[DOCUMENT TEXT] Processing as object, keys:', Object.keys(rawData));
                if (rawData.content) {
                    documentText = rawData.content;
                }
            }
            // If it's a JSON string that needs parsing
            else if (typeof rawData === 'string') {
                console.log('[DOCUMENT TEXT] Processing as string');
                try {
                    const parsedData = JSON.parse(rawData);
                    console.log('[DOCUMENT TEXT] Successfully parsed JSON, keys:', Object.keys(parsedData));
                    if (parsedData.content) {
                        documentText = parsedData.content;
                    }
                } catch (jsonErr) {
                    console.error('[DOCUMENT TEXT] Failed to parse JSON string:', jsonErr);
                    // If we can't parse it as JSON, just use the raw string
                    documentText = rawData;
                }
            } else if (rawData) {
                // Last resort - try to convert to string if possible
                documentText = String(rawData);
            }
            
            console.log(`[DOCUMENT TEXT] Successfully extracted content, length: ${documentText.length}`);
        } catch (parseErr) {
            console.error('[DOCUMENT TEXT] Error parsing document content:', parseErr);
        }
        
        res.json({
            text: documentText,
            fileName: fileName
        });
    } catch (err) {
        console.error('[ADMIN DOCUMENT TEXT ERROR]', err);
        res.status(500).json({error: `Error retrieving document: ${err.message}`});
    }
});

// Remove a document completely from the system
app.post('/admin/remove', auth, ensureAdmin, async (req, res) => {
    const fileName = req.query.filename;
    if (!fileName) {
        return res.status(400).end('Filename is required');
    }
    
    res.setHeader('Content-Type', 'text/plain');
    const log = msg => { res.write(msg + '\n'); console.log('[ADMIN]', msg); };
    
    try {
        // Escape filename for pattern matching in the stage
        const escapedFileName = fileName.replace(/'/g, "''"); // Double up single quotes for SQL
        
        // Check if the file exists in stage - list files matching pattern
        const stageContents = await executeSnowflakeQuery(`LIST @provider_zone_services/ PATTERN='.*${escapedFileName}.*'`);
        
        // Show what we found in the stage
        if (stageContents && stageContents.length > 0) {
            log(`Found ${stageContents.length} files in stage matching pattern:`);
            stageContents.forEach(file => {
                if (file.name) log(`- ${file.name}`);
            });
        } else {
            log(`Note: No files found in stage matching '${fileName}' but continuing with database cleanup.`);
        }
        
        log(`Removing document: ${fileName}`);
        
        // Step 1: Delete from chunks table
        await executeSnowflakeQuery(
            `DELETE FROM provider_zone_services_pdf_chunks WHERE file_name = ?`, 
            [fileName]
        );
        log(`Deleted chunks from database`);
        
        // Step 2: Delete from PDFs table
        await executeSnowflakeQuery(
            `DELETE FROM provider_zone_services_pdfs WHERE file_name = ?`, 
            [fileName]
        );
        log(`Deleted document metadata from database`);
        
        // Step 3: Get the temp filename from the database and remove from stage
        try {
            log('Checking for stored temp filename in database...');
            
            // Query to get the temp filename stored in the database
            // Note: We may not have temp_file data for documents uploaded before this change
            const tempFileResults = await executeSnowflakeQuery(
                `SELECT temp_file FROM provider_zone_services_pdfs WHERE file_name = ? LIMIT 1`,
                [fileName]
            );
            
            if (tempFileResults && tempFileResults.length > 0 && tempFileResults[0].TEMP_FILE) {
                const tempFileName = tempFileResults[0].TEMP_FILE;
                log(`Found stored temp filename: ${tempFileName}`);
                
                // First check if the file exists in the stage
                const fileCheck = await executeSnowflakeQuery(
                    `LIST @provider_zone_services/ PATTERN='.*${tempFileName}.*'`
                );
                
                if (fileCheck && fileCheck.length > 0) {
                    // Remove the specific file from the stage
                    await executeSnowflakeQuery(
                        `REMOVE @provider_zone_services/'${tempFileName}'`
                    );
                    log(`Successfully removed temp file from stage: ${tempFileName}`);
                } else {
                    log(`Temp file ${tempFileName} not found in stage - may have been removed already`);
                }
            } else {
                log('No temp filename stored in database for this document');
                
                // Fallback to pattern matching as before
                log('Attempting to remove using original filename pattern...');
                await executeSnowflakeQuery(
                    `REMOVE @provider_zone_services/ PATTERN='.*${escapedFileName}.*'`
                );
                log('Attempted to remove files matching original filename pattern');
                
                // List all stage files for debugging
                const stageFiles = await executeSnowflakeQuery(`LIST @provider_zone_services/`);
                if (stageFiles && stageFiles.length > 0) {
                    log(`${stageFiles.length} files still remain in stage`);
                }
            }
        } catch (stageError) {
            log(`Warning: Could not process stage cleanup: ${stageError.message}`);
            // Continue anyway as we've cleaned up the database
        }
        
        res.end('Document successfully removed');
    } catch (err) {
        console.error('[ADMIN REMOVE ERROR]', err);
        res.status(500).end(`Error during document removal: ${err.message}`);
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port} and accessible on your local network.`);
    console.log('Others can access it at http://10.4.74.143:5000');
    console.log('Admin UI at /admin (cmollica & ccross only)');
});
