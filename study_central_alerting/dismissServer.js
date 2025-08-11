// dismissServer.js
// Small Express server that marks survey IDs as ignored when users click "dismiss" link in Teams.
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { executeSnowflakeQuery } = require('./dbUtils');

const app = express();
// Hard-coded host/IP for external access
const HOST = '10.4.74.143';
const PORT = 3100;

app.use(bodyParser.urlencoded({ extended: false }));

app.get('/dismiss', async (req, res) => {
  const surveyId = req.query.survey_id;
  if (!surveyId) return res.status(400).send('Missing survey_id');
  try {
    await executeSnowflakeQuery(
      `MERGE INTO SCRATCHPAD_PRDPF.SURVEY_ID_IGNORES t
        USING (SELECT ? AS survey_id) s
        ON t.survey_id = s.survey_id
        WHEN MATCHED THEN UPDATE SET active = TRUE, dismissed_at = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT (survey_id, active, dismissed_at) VALUES (s.survey_id, TRUE, CURRENT_TIMESTAMP())`,
      [surveyId]
    );
    res.send(`Survey ${surveyId} dismissed from future alerts.`);
  } catch (err) {
    console.error('[Dismiss] Error', err);
    res.status(500).send('Error dismissing');
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Dismiss server listening on http://${HOST}:${PORT}`);
});
