# Provider Zone Services Chat Bot – Process Guide

This document explains how knowledge files are ingested (staged, parsed, chunked, embedded) and how the chat flow works end‑to‑end in `provider_zone_services_chat_bot/`.

## Overview
- App: Node.js Express with JWT auth.
- Code entry: `server.js`.
- Snowflake access: via ODBC helper `dbUtils.js`.
- Knowledge files: PDFs deployed to Snowflake stage `@provider_zone_services` and persisted in two tables.
- Chat: Calls Snowflake stored procedure `ASK_PROVIDER_PDFS` (invoked as `CALL ask_provider_pdfs(?)`).

## Key Snowflake Objects
- Stage: `@provider_zone_services` (external/internal stage must pre-exist).
- Tables (created externally; structure inferred from code):
  - `PROVIDER_ZONE_SERVICES_PDFS`
    - `FILE_NAME` STRING (original filename)
    - `TEMP_FILE` STRING (actual staged filename used for PUT)
    - `PARSED` VARIANT (JSON output of `SNOWFLAKE.CORTEX.PARSE_DOCUMENT`)
  - `PROVIDER_ZONE_SERVICES_PDF_CHUNKS`
    - `FILE_NAME` STRING
    - `CHUNK_ID` NUMBER
    - `CHUNK_TEXT` STRING
    - `CHUNK_VEC` VECTOR/VARIANT (embedding; set via `SNOWFLAKE.CORTEX.EMBED_TEXT_1024`)
- Chat logs table (auto-created on startup): `PZS_CHAT_BOT`
  - `ID` autoincrement, `USER_NAME` STRING, `QUESTION` STRING,
    `ASKED_AT` TIMESTAMP_LTZ default now, `SUCCESS` BOOLEAN,
    `RESPONSE` STRING, `ERROR_MESSAGE` STRING

### Example DDL (reference)
These are examples that match how the app reads/writes data:
```sql
-- Stage (must already exist)
-- CREATE STAGE provider_zone_services;  -- internal stage example

CREATE TABLE IF NOT EXISTS provider_zone_services_pdfs (
  file_name STRING,
  temp_file STRING,
  parsed VARIANT
);

CREATE TABLE IF NOT EXISTS provider_zone_services_pdf_chunks (
  file_name STRING,
  chunk_id NUMBER,
  chunk_text STRING,
  chunk_vec VECTOR(FLOAT, 1024) -- or VARIANT depending on account settings
);

CREATE TABLE IF NOT EXISTS pzs_chat_bot (
  id NUMBER AUTOINCREMENT PRIMARY KEY,
  user_name STRING,
  question STRING,
  asked_at TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN,
  response STRING,
  error_message STRING
);
```

## Ingestion Pipeline (Adding/Updating Knowledge Files)
All logic is orchestrated by `processDocument()` in `server.js`.

1. Remove prior records (idempotency)
   - Deletes existing rows by `FILE_NAME` from:
     - `provider_zone_services_pdf_chunks`
     - `provider_zone_services_pdfs`
   - Code: `server.js` lines around 322–325.

2. Stage the file to `@provider_zone_services`
   - If a new upload (`localPath` present):
     - Makes a temp copy with a safe name: `temp_upload_<timestamp>.pdf` (avoids spaces)
     - Executes `PUT file://<local> @provider_zone_services/ auto_compress=false overwrite=true`
     - Verifies via `LIST @provider_zone_services/ PATTERN='.*<temp>.*'`
     - Stores the actual staged filename into DB (`TEMP_FILE`)
   - If reprocessing (no `localPath`):
     - Confirms presence via `LIST`/`DIRECTORY(@provider_zone_services)`
   - Code: `server.js` lines ~338–387 (PUT) and 392–409 (reprocess check).

3. Parse the document in Snowflake (OCR)
   - Inserts a row into `provider_zone_services_pdfs` with:
     - `FILE_NAME` = original filename
     - `TEMP_FILE` = staged filename actually present in the stage
     - `PARSED` = `SNOWFLAKE.CORTEX.PARSE_DOCUMENT(@provider_zone_services, '<stagePath>', {'mode':'OCR'})`
   - Code: `server.js` lines ~437–443.

4. Chunk the document
   - Splits `PARSED:content` by newline, groups lines into chunks of ~40 lines, filters out short chunks (`LENGTH(chunk_text) > 80`).
   - Inserts rows into `provider_zone_services_pdf_chunks` with `(FILE_NAME, CHUNK_ID, CHUNK_TEXT)`.
   - Code: `server.js` lines ~445–465.

5. Embed the chunks
   - Updates `CHUNK_VEC` using:
     - `SNOWFLAKE.CORTEX.EMBED_TEXT_1024('snowflake-arctic-embed-l-v2.0', CHUNK_TEXT)`
   - Only updates rows where `CHUNK_VEC IS NULL`.
   - Code: `server.js` lines ~467–472.

6. Clean up temporary local file
   - Local multipart upload is deleted after success.
   - Code: `/admin/upload` handler, `fs.unlinkSync(localPath)`.

### Admin Endpoints for Ingestion
- `POST /admin/upload` (multipart/form-data, field `pdf`)
  - Triggers steps 1–5 above for a new file.
  - Code: `server.js` lines ~483–511.
- `POST /admin/reprocess?filename=<name>`
  - Re-runs steps 3–5 on an existing staged file (no new PUT).
  - Code: `server.js` lines ~512–546.
- `POST /admin/remove?filename=<name>`
  - Deletes rows from both tables and attempts to remove the staged file by `TEMP_FILE` or pattern.
  - Code: `server.js` lines ~659–755.

### Admin UI
- `GET /admin` serves `public/admin.html`.
- `public/admin.js`:
  - Uploads via `/admin/upload` with streaming logs.
  - Lists files via `GET /files` (distinct `FILE_NAME` from chunks table).
  - Reprocess/remove buttons call the corresponding endpoints.
  - “View Text” calls `GET /admin/document-text?filename=...` which returns the `PARSED.content` text.

## Chat Pipeline (RAG)
1. Client sends question
   - Frontend `public/script.js` posts to `POST /ask` with `{ question }` and JWT header.

2. Express `/ask` endpoint (`server.js` ~223–253)
   - Validates input, logs interaction start.
   - Calls Snowflake procedure: `CALL ask_provider_pdfs(?)` with the user’s question.
   - Expects a single-row, single-column response containing a JSON string.
   - Parses JSON and returns to client; also writes a row to `PZS_CHAT_BOT`.

3. Snowflake stored procedure `ASK_PROVIDER_PDFS` (implementation summary)
   - __Constants__:
     - `TOP_K = 6` anchor chunks
     - `EMBED_MODEL = 'snowflake-arctic-embed-l-v2.0'`
     - `CHAT_MODEL = 'claude-3-5-sonnet'`
   - __Query embedding__: computes `q_vec` via `SNOWFLAKE.CORTEX.EMBED_TEXT_1024(EMBED_MODEL, QUESTION)` in CTE `q`.
   - __Anchor retrieval__: selects top-K rows from `provider_zone_services_pdf_chunks` ordered by `VECTOR_COSINE_SIMILARITY(chunk_vec, q_vec)`.
   - __Neighbor expansion__: joins each anchor to its ±1 `chunk_id` neighbors to increase context; uses `DISTINCT` to dedupe.
   - __Context assembly__: aggregates with `LISTAGG(chunk_text, '\n\n') WITHIN GROUP (ORDER BY sim DESC)` into CTE `ctx(chunks)`.
   - __LLM completion__: calls `SNOWFLAKE.CORTEX.COMPLETE(CHAT_MODEL, prompt)` where the prompt instructs to answer ONLY from context and otherwise say “I do not know”.
   - __Sources__: `ARRAY_AGG(DISTINCT file_name)` returns unique document names contributing context.
   - __Return shape__: the JS procedure executes the RAG SQL and returns a VARIANT object `{ question, answer, sources }`.
   - __Safety__: escapes single quotes in the question (`safeQ`) before embedding into the dynamic SQL string; executes via `snowflake.createStatement(...).execute()`.

   Tunables and guidance:
   - Adjust `TOP_K` (anchors) and neighbor window (currently ±1) to trade recall vs. prompt length.
   - Keep the embedding model consistent with ingestion (`processDocument()` uses `EMBED_TEXT_1024('snowflake-arctic-embed-l-v2.0', ...)`) so vector spaces align.
   - The completion model can be swapped if needed; ensure prompt remains grounded-only.

   Example response (what `/ask` expects after parsing the VARIANT to JSON):
   ```json
   { "question": "...", "answer": "...", "sources": ["DocA.pdf", "DocB.pdf"] }
   ```

## Authentication & Authorization
- Users register/login against Snowflake table `CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CORA_LOGIN`.
  - Registration sets `PASSWORD_HASH` if the username exists and has no password set yet (whitelist model).
  - JWT token stored in sessionStorage and cookie.
- Admins
  - The admin list is persisted in `admin_list.json` in this folder.
  - API: `GET/POST /api/admins` (requires admin). UI in Admin page allows adding/removing admins.

## Configuration
- Environment variables
  - `SNOWFLAKE_USERNAME`, `SNOWFLAKE_PASSWORD` (required; enforced in `dbUtils.js`).
  - `JWT_SECRET` (optional; default present in code; recommend override).
  - `PORT` (optional; default 5001; logs mention 10.4.74.143:5000 for historical context).
  - `SF_ACCOUNT` (optional; fallback `athenahealth`).
- Connection details (hard-coded defaults in `dbUtils.js` / `snowflakeConnect()`):
  - Account: `athenahealth.snowflakecomputing.com`
  - Database: `CORPANALYTICS_BUSINESS_PROD`
  - Schema: `SCRATCHPAD_PRDPF`
  - Warehouse: `CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD`
  - Role: `CORPANALYTICS_BDB_PRDPF_PROD_RW`

## Operational Notes
- Uploaded local files are cleaned from `/uploads/` after processing; background cleanup runs every 4 hours.
- `GET /files` lists documents by reading `provider_zone_services_pdf_chunks`.
- `GET /admin/table-info` inspects both tables (for quick validation of columns and sample rows).
- Logging table `PZS_CHAT_BOT` is created on app start if missing.

## Example API Usage
- Upload a file (Admin):
```bash
curl -X POST \
  -H "Authorization: Bearer <JWT>" \
  -F "pdf=@/path/to/YourDoc.pdf" \
  http://<host>:<port>/admin/upload
```

- Reprocess an existing staged file (Admin):
```bash
curl -X POST -H "Authorization: Bearer <JWT>" \
  "http://<host>:<port>/admin/reprocess?filename=YourDoc.pdf"
```

- Remove a document (Admin):
```bash
curl -X POST -H "Authorization: Bearer <JWT>" \
  "http://<host>:<port>/admin/remove?filename=YourDoc.pdf"
```

- Ask a question (User):
```bash
curl -X POST -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the provider onboarding process?"}' \
  http://<host>:<port>/ask
```

## Building Another Bot Like This
- Replicate the ingestion pattern:
  - Create a stage, two tables (docs + chunks), and a stored procedure for retrieval/generation.
  - Use the same embed model for both chunking and query embedding to maximize similarity accuracy.
- Update constants:
  - Stage name, table names, and the called procedure in `/ask`.
  - Connection config or ENV for your new schema/database.
- Frontend contract:
  - Procedure should return a single JSON string with `answer` and optional `sources`.
- See also memory: “Ask Amy” variant uses different SP, embedding model, and auth table.
