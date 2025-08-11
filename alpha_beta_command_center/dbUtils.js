// --- START OF FILE dbUtils.js ---
// Purpose: Shared database connection and query execution utilities.

const odbc = require('odbc');

// Builds the Snowflake connection string using environment variables.
function buildConnectionString() {
    const snowflakeUser = process.env.API_USERNAME;
    const snowflakePassword = process.env.API_PASSWORD;

    if (!snowflakeUser || !snowflakePassword) {
        console.error("CRITICAL ERROR: Missing API_USERNAME or API_PASSWORD environment variables!");
        // Throwing an error here is better as it prevents proceeding without credentials.
        throw new Error("Server configuration error: Snowflake credentials (API_USERNAME, API_PASSWORD) are not set.");
    }

    const snowflakeAccount = "athenahealth.snowflakecomputing.com"; // Replace if different
    const snowflakeDatabase = "CORPANALYTICS_BUSINESS_PROD";      // Replace if different
    const snowflakeSchema = "SCRATCHPAD_PRDPF";                   // Replace if different
    const snowflakeWarehouse = "CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD"; // Replace if different
    const snowflakeRole = "CORPANALYTICS_BDB_PRDPF_PROD_RW";      // Replace if different

    // Construct the connection string
    return `Driver={SnowflakeDSIIDriver};Server=${snowflakeAccount};Database=${snowflakeDatabase};Schema=${snowflakeSchema};Warehouse=${snowflakeWarehouse};Role=${snowflakeRole};Uid=${snowflakeUser};Pwd=${snowflakePassword};`;
}

// Executes a Snowflake query with optional parameters. Handles connection management.
async function executeSnowflakeQuery(query, params = []) {
    let connection;
    console.log(`[DB Execute] Attempting query: ${query.substring(0,150).replace(/\s+/g, ' ')}... Params: ${JSON.stringify(params)}`); // Log before connect

    try {
        const connectionString = buildConnectionString();
        // console.log(`[DB Execute] Connecting with string: ${connectionString.replace(/Pwd=.*?;/,'Pwd=******;')}`); // Log connection string without password
        connection = await odbc.connect(connectionString);
        console.log(`[DB Execute] Connection successful.`);

        const result = await connection.query(query, params);
        // Check the type of result. SELECT typically returns array, others might return row count or object.
        const resultInfo = Array.isArray(result) ? `Rows: ${result.length}` : `Result: ${JSON.stringify(result)}`;
        console.log(`[DB Execute] Query executed successfully. ${resultInfo}`);
        return result;

    } catch (err) {
        console.error(`[DB Query Error] Failed Query: ${query.substring(0,150).replace(/\s+/g, ' ')}...`);
        console.error(`[DB Query Error] Params: ${JSON.stringify(params)}`);
        console.error(`[DB Query Error] Error Message:`, err.message);
        if (err.odbcErrors) {
            console.error("[DB ODBC Errors]:", JSON.stringify(err.odbcErrors, null, 2));
        }
        // Re-throw a more specific error to be caught by calling functions
        throw new Error(`Database query failed: ${err.message}`);

    } finally {
        if (connection) {
            try {
                await connection.close();
                console.log("[DB Execute] Connection closed.");
            } catch (closeErr) {
                console.error("[DB Connection Error] Failed to close connection:", closeErr);
            }
        }
    }
}

// Export the query function to be used elsewhere
module.exports = {
    executeSnowflakeQuery
    // buildConnectionString could also be exported if needed elsewhere, but usually not.
};
// --- END OF FILE dbUtils.js ---