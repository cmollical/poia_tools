// surveyAlert.js
// Purpose: Daily Qualtrics duplicate-survey detector & Teams notifier
// Run once or schedule with node-cron at 10 AM ET

require('dotenv').config();
const { executeSnowflakeQuery } = require('./dbUtils');
const axios = require('axios');
const cron = require('node-cron');

const TEAMS_WEBHOOK_URL =
  process.env.study_central_teams_webhook ||
  process.env.STUDY_CENTRAL_TEAMS_WEBHOOK ||
  process.env.TEAMS_WEBHOOK_URL;

if (!TEAMS_WEBHOOK_URL) {
  console.error('CRITICAL: study_central_teams_webhook env var not set – aborting.');
  process.exit(1);
}

// Hard-coded base URL for dismiss links (remote server)
const SERVER_BASE_URL = 'http://10.4.74.143:3100';

// --------------- Query -----------------
const DUPLICATE_SURVEY_QUERY = `
WITH base AS (
    SELECT
        survey_id,
        COUNT(DISTINCT study_id) AS study_count
    FROM ux_prod.survey.vw_qualtrics_etl_responses q
    WHERE q.recorded_date >= '2024-01-01'
      AND study_id <> 'missing'
    GROUP BY 1
    HAVING COUNT(DISTINCT study_id) > 1
)
SELECT
    b.survey_id,
    LISTAGG(DISTINCT CAST(st.id AS STRING), ', ') AS study_ids
FROM base b
JOIN ux_prod.survey.vw_qualtrics_etl_responses q
  ON q.survey_id = b.survey_id
JOIN ux_prod.studycentral.study st
  ON TRY_CAST(st.id AS INT) = TRY_CAST(q.study_id AS INT)
WHERE b.survey_id NOT IN (
    SELECT survey_id
    FROM SCRATCHPAD_PRDPF.SURVEY_ID_IGNORES
    WHERE active = TRUE
)
GROUP BY b.survey_id

UNION

SELECT 
    s.qualtrics_survey_id AS survey_id,
    LISTAGG(DISTINCT CAST(s.id AS STRING), ', ') AS study_ids
FROM ux_prod.studycentral.study s
WHERE s.qualtrics_survey_id NOT IN ('', 'na')
  AND s.qualtrics_survey_id IS NOT NULL
GROUP BY 1
HAVING COUNT(DISTINCT s.id) > 1
    SELECT
        survey_id,
        COUNT(DISTINCT study_id) AS study_count
    FROM ux_prod.survey.vw_qualtrics_etl_responses q
    WHERE q.recorded_date >= '2024-01-01'
      AND study_id <> 'missing'
    GROUP BY 1
    HAVING COUNT(DISTINCT study_id) > 1
)
SELECT
    b.survey_id,
    LISTAGG(DISTINCT CAST(st.id AS STRING), ', ') AS study_ids
FROM base b
JOIN ux_prod.survey.vw_qualtrics_etl_responses q ON q.survey_id = b.survey_id
JOIN ux_prod.studycentral.study st ON TRY_CAST(st.id AS INT) = TRY_CAST(q.study_id AS INT)
WHERE b.survey_id NOT IN (
    SELECT survey_id FROM SCRATCHPAD_PRDPF.SURVEY_ID_IGNORES WHERE active = TRUE
)
GROUP BY b.survey_id
ORDER BY b.survey_id;
`;
// ---------------------------------------
// Corrected query without duplication causing SQL compilation error
const DUPLICATE_SURVEY_QUERY_FIXED = `
WITH base AS (
    SELECT
        survey_id
    FROM ux_prod.survey.vw_qualtrics_etl_responses q
    WHERE q.recorded_date >= '2024-01-01'
      AND study_id <> 'missing'
    GROUP BY survey_id
    HAVING COUNT(DISTINCT study_id) > 1
)
SELECT
    b.survey_id,
    LISTAGG(DISTINCT CAST(st.id AS STRING), ', ') AS study_ids
FROM base b
JOIN ux_prod.survey.vw_qualtrics_etl_responses q ON q.survey_id = b.survey_id
JOIN ux_prod.studycentral.study st ON TRY_CAST(st.id AS INT) = TRY_CAST(q.study_id AS INT)
WHERE b.survey_id NOT IN (
    SELECT survey_id FROM SCRATCHPAD_PRDPF.SURVEY_ID_IGNORES WHERE active = TRUE
)
GROUP BY b.survey_id

UNION

SELECT
    s.qualtrics_survey_id AS survey_id,
    LISTAGG(DISTINCT CAST(s.id AS STRING), ', ') AS study_ids
FROM ux_prod.studycentral.study s
WHERE s.qualtrics_survey_id NOT IN ('', 'na')
  AND s.qualtrics_survey_id IS NOT NULL
GROUP BY 1
HAVING COUNT(DISTINCT s.id) > 1
ORDER BY survey_id;
`;
// ---------------------------------------

// Format result rows into Teams message text
function buildTeamsMessage(rows) {
  if (!rows.length) {
    return '✅ No duplicate Qualtrics survey IDs detected today.';
  }

  const header = '@channel ⚠️ *Duplicate Qualtrics survey IDs detected*';
  const lines = rows.map(r => {
    const dismissLink = `${SERVER_BASE_URL}/dismiss?survey_id=${encodeURIComponent(r.SURVEY_ID)}`;
    const studies = r.STUDY_IDS || 'n/a';
    return `• **${r.SURVEY_ID}** – ${studies} – [dismiss](${dismissLink})`;
  });

  return `${header}\n\n${lines.join('\n')}`;
}

async function sendToTeams(text) {
  await axios.post(TEAMS_WEBHOOK_URL, { text });
}

async function runJob() {
  console.log('[AlertJob] Executing duplicate-survey query…');
  const rows = await executeSnowflakeQuery(DUPLICATE_SURVEY_QUERY_FIXED);
  if (!rows.length) {
    console.log('[AlertJob] No duplicates found; nothing to notify.');
    return;
  }
  // Snowflake returns column names as upper-case by default in JS ODBC result
  const text = buildTeamsMessage(rows);
  console.log(`[AlertJob] Sending message with ${rows.length} rows…`);
  await sendToTeams(text);
}

// ---------------- Entry ----------------
if (require.main === module) {
  const mode = process.env.RUN_MODE || 'cron';
  if (mode === 'once') {
    runJob().catch(err => {
      console.error('[AlertJob] Fatal error', err);
      axios.post(TEAMS_WEBHOOK_URL, { text: `@channel ❌ Alert job failed:\n\n\`\`\`\n${err.message}\n\`\`\`` });
      process.exit(1);
    });
  } else {
    // Run every day at 10:00 Eastern
    cron.schedule('0 10 * * *', () => {
      runJob().catch(err => {
        console.error('[AlertJob] Fatal error inside cron', err);
        axios.post(TEAMS_WEBHOOK_URL, { text: `@channel ❌ Alert job failed:\n\n\`\`\`\n${err.message}\n\`\`\`` }).catch(() => {});
      });
    }, { timezone: 'America/New_York' });
    console.log('🕙 Survey alert cron scheduled for 10:00 AM America/New_York');
  }
}

module.exports = runJob;
