const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { executeSnowflakeQuery } = require('./dbUtils');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const snowflake = require('snowflake-sdk');
const fs = require('fs');


const app = express();

// Parse JSON bodies for all incoming requests
app.use(express.json());
const JWT_KEY = process.env.JWT_SECRET || 'a_secure_secret_key_should_be_in_env';



// --- Admin whitelist ---
const allowedAdmins = new Set(['cmollica', 'ccross']);

function ensureAdmin(req, res, next) {
    if (req.user && allowedAdmins.has(req.user)) return next();
    return res.status(403).json({ error: 'admin only' });
}

// ---------------- JWT auth middleware -----------------
function auth(req,res,next){
    const hdr = req.headers['authorization']||'';
    const m = hdr.match(/^Bearer (.+)$/);
    if(!m) return res.status(401).json({error:'token required'});
    try{ req.user = jwt.verify(m[1], JWT_KEY).user; return next(); }
    catch(e){ return res.status(401).json({error:'bad token'}); }
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

app.get('/admin', auth, ensureAdmin, (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/admin/upload', auth, ensureAdmin, upload.single('pdf'), async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    const log = msg => { res.write(msg + '\n'); console.log('[ADMIN]', msg); };

    try {
        const fileName = path.basename(req.file.originalname);
        const localPath = req.file.path;

        let conn = await snowflakeConnect();

        // cleanup any previous version
        await conn.executeAsync({ sqlText: `DELETE FROM provider_zone_services_pdf_chunks WHERE file_name = ?`, binds: [fileName] });
        await conn.executeAsync({ sqlText: `DELETE FROM provider_zone_services_pdfs WHERE file_name = ?`, binds: [fileName] });
        await conn.executeAsync({ sqlText: `REMOVE @provider_zone_services/${fileName}` });
        log('Old rows removed if present');

        // upload to stage
        await conn.executeAsync({ sqlText: `PUT file://${path.resolve(localPath)} @provider_zone_services auto_compress=false overwrite=true` });
        log('File staged');

        // parse document
        await conn.executeAsync(`INSERT INTO provider_zone_services_pdfs (file_name, parsed)
            SELECT '${fileName}', SNOWFLAKE.CORTEX.PARSE_DOCUMENT(@provider_zone_services, '${fileName}', {'mode':'OCR'});`);
        log('Document parsed');

        // chunk
        await conn.executeAsync(`INSERT INTO provider_zone_services_pdf_chunks (file_name, chunk_id, chunk_text)
            WITH lines AS (
                SELECT '${fileName}' AS file_name,
                       ROW_NUMBER() OVER (ORDER BY l.seq) AS line_no,
                       l.value AS line_text
                FROM provider_zone_services_pdfs r,
                     LATERAL SPLIT_TO_TABLE(r.parsed:content::string, '\n') l
                WHERE r.file_name = '${fileName}'
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
            WHERE LENGTH(chunk_text) > 80;`);
        log('Chunks inserted');

        // embed
        await conn.executeAsync(`UPDATE provider_zone_services_pdf_chunks
            SET chunk_vec = SNOWFLAKE.CORTEX.EMBED_TEXT_1024('snowflake-arctic-embed-l-v2.0', chunk_text)
            WHERE file_name = '${fileName}' AND chunk_vec IS NULL;`);
        log('Embedding complete');

        res.end('Done');
        fs.unlinkSync(localPath);
        conn.destroy();
    } catch (err) {
        console.error('[ADMIN UPLOAD ERROR]', err);
        res.status(500).end('Error during admin upload');
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port} and accessible on your local network.`);
    console.log('Others can access it at http://10.4.74.143:5000');
    console.log('Admin UI at /admin (cmollica & ccross only)');
});
