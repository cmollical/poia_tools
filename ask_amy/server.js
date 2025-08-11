const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { executeSnowflakeQuery } = require('./dbUtils');

const app = express();

// Parse JSON bodies for all incoming requests
app.use(express.json());
const JWT_KEY = process.env.JWT_SECRET || 'a_secure_secret_key_should_be_in_env';

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
        const rows = await executeSnowflakeQuery(`SELECT password_hash FROM corpanalytics_business_prod.scratchpad_prdpf.cr_app_users WHERE username=?`,[user]);
        if(rows.length===0) return res.status(403).json({error:'This username is not authorized to register.'});
        if(rows[0].PASSWORD_HASH) return res.status(409).json({error:'A password has already been set for this user.'});
        const hash = bcrypt.hashSync(pass,10);
        await executeSnowflakeQuery(`UPDATE corpanalytics_business_prod.scratchpad_prdpf.cr_app_users SET password_hash=?, created_ts=CURRENT_TIMESTAMP WHERE username=?`,[hash,user]);
        return res.json({ok:true});
    }catch(err){ console.error('Registration Error:', err); return res.status(500).json({error:'Server error during registration.'}); }
});

app.post('/login', async (req,res)=>{
    const { user, pass } = req.body;
    if(!user||!pass) return res.status(400).json({error:'Username and password are required'});
    try{
        const rows = await executeSnowflakeQuery(`SELECT password_hash FROM corpanalytics_business_prod.scratchpad_prdpf.cr_app_users WHERE username=?`,[user]);
        if(rows.length===0) return res.status(401).json({error:'Invalid credentials'});
        const hash = rows[0].PASSWORD_HASH||'';
        if(!bcrypt.compareSync(pass, hash)) return res.status(401).json({error:'Invalid credentials'});
        await executeSnowflakeQuery(`UPDATE corpanalytics_business_prod.scratchpad_prdpf.cr_app_users SET last_login_ts=CURRENT_TIMESTAMP WHERE username=?`,[user]);
        const token = jwt.sign({user}, JWT_KEY, {expiresIn:'8h'});
        return res.json({token});
    }catch(err){ console.error('Login Error:', err); return res.status(500).json({error:'Server error during login.'}); }
});

// ------------------------------------------
// Snowflake logging helpers
// ------------------------------------------
async function ensureLoggingTable() {
    const ddl = `CREATE TABLE IF NOT EXISTS ask_amy_logs (
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
    const insertSql = `INSERT INTO ask_amy_logs (user_name, question, success, response, error_message)
                       VALUES (?, ?, ?, ?, ?);`;
    try {
        await executeSnowflakeQuery(insertSql, [user, question, success, response, errorMsg]);
    } catch (err) {
        console.error('[LOGGING ERROR] Could not insert log row:', err.message);
    }
}

// verify logging table on startup
ensureLoggingTable();

const port = process.env.PORT || 5002;
app.use(express.static(path.join(__dirname, 'public')));

app.get('/history', auth, async (req,res)=>{
    const { start, end } = req.query;
    if(!start || !end) return res.status(400).json({error:'start and end required'});
    try{
        const sql = `SELECT asked_at, question, response FROM ask_amy_logs WHERE asked_at BETWEEN ? AND ? ORDER BY asked_at DESC LIMIT 100`;
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

    const query = `CALL ask_amy(?)`;

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

app.listen(port, '0.0.0.0', () => {
    console.log(`Ask Amy server running on port ${port} and accessible on your local network.`);
});
