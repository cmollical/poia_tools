param(
    [string]$var1,   # Username from the web app (for logging)
    [string]$var2,   # User prompt
    [string]$var3    # Base file name
)

$ErrorActionPreference = "Stop"
$VerbosePreference = 'SilentlyContinue'

# ----- Step 1: Retrieve Snowflake credentials directly from Environment Variables -----
$snowflakeUserFromEnv = [Environment]::GetEnvironmentVariable('API_USERNAME', 'Machine')
$snowflakePasswordFromEnv = [Environment]::GetEnvironmentVariable('API_PASSWORD', 'Machine')

if ([string]::IsNullOrEmpty($snowflakeUserFromEnv) -or [string]::IsNullOrEmpty($snowflakePasswordFromEnv)) {
    Write-Error "Snowflake username or password not found in environment variables (API_USERNAME, API_PASSWORD)."
    exit 1
}

# ----- Step 2: Define your Snowflake connection properties -----
$snowflakeAccount   = "athenahealth.snowflakecomputing.com"
$snowflakeDatabase  = "CORPANALYTICS_BUSINESS_PROD"
$snowflakeSchema    = "SCRATCHPAD_PRDPF"
$snowflakeWarehouse = "CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD"
$snowflakeRole      = "CORPANALYTICS_BDB_PRDPF_PROD_RW"
$snowflakeUser = $snowflakeUserFromEnv

$connectionString = "Driver={SnowflakeDSIIDriver};Server=$snowflakeAccount;Database=$snowflakeDatabase;Schema=$snowflakeSchema;Warehouse=$snowflakeWarehouse;Role=$snowflakeRole;Uid=$snowflakeUser;Pwd=$snowflakePasswordFromEnv;SF_FETCH_SIZE=1000;"

# ----- Step 3: Process web app input for logging -----
$webAppUsername = $var1
if ($webAppUsername -notmatch '@') {
    $webAppUsername = $webAppUsername + "@athenahealth.com"
}
$logUsername = $webAppUsername
$userPrompt = $var2
$baseFileName = $var3
$userPromptSanitized = $userPrompt -replace "'", "''"

# ----- Step 4: Connect to Snowflake and execute the stored procedure -----
$conn = New-Object System.Data.Odbc.OdbcConnection($connectionString)
try {
    Write-Host "Connecting to Snowflake using provided credentials..."
    $conn.Open()
    Write-Host "Snowflake connection successful."

    # Execute the stored procedure passing the sanitized prompt and the log username
    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 600
    $cmd.CommandText = "CALL alpha_beta_list_generation('$userPromptSanitized', '$logUsername');"
    Write-Host "Executing stored procedure: $($cmd.CommandText)"
    $reader = $cmd.ExecuteReader()
    $spReturn = @{}
    while ($reader.Read()) {
        for ($i = 0; $i -lt $reader.FieldCount; $i++) {
            $colName = $reader.GetName($i)
            $colValue = $reader.GetValue($i)
            $spReturn[$colName] = $colValue
        }
    }
    $reader.Close()

    $generatedSQL = ""
    $forcedContexts = @()
    if ($spReturn.ContainsKey("ALPHA_BETA_LIST_GENERATION")) {
        $jsonString = $spReturn["ALPHA_BETA_LIST_GENERATION"]
        if ($jsonString) {
            try {
                $parsed = $jsonString | ConvertFrom-Json
                $generatedSQL = $parsed.generated_sql
                # Adjust this to the property name returned by your SP
                $forcedContexts = $parsed.forcedContextIDs
                Write-Host "Stored procedure returned SQL and forced context IDs."
            } catch {
                Write-Warning "Failed to parse JSON response from stored procedure: $jsonString"
                Write-Warning "Error: $_"
                $generatedSQL = ""
            }
        } else {
             Write-Warning "Stored procedure returned an empty response for ALPHA_BETA_LIST_GENERATION."
        }
    } else {
        Write-Warning "Stored procedure response did not contain key 'ALPHA_BETA_LIST_GENERATION'. Response: $($spReturn | ConvertTo-Json)"
    }

    if ([string]::IsNullOrWhiteSpace($generatedSQL)) {
        Write-Warning "Stored procedure did not return valid SQL to execute. Exiting."
        $metadata = [PSCustomObject]@{
            "UserPrompt" = $userPrompt
            "Status"     = "Failed - Stored procedure did not return SQL."
            "WrappedSQL" = "N/A"
        }
        $metadataRows = @($metadata)
        $oneDriveFolder = "C:\Users\cmollica\OneDrive - athenahealth\Client List Pulls"
        $counter = 0
        do {
            if ($counter -eq 0) { $fileName = "$baseFileName (Failed).xlsx" } else { $fileName = "$baseFileName (Failed $counter).xlsx" }
            $excelFilePath = Join-Path $oneDriveFolder $fileName
            $counter++
        } while (Test-Path $excelFilePath)

        if (-not (Get-Module -ListAvailable -Name ImportExcel)) { Install-Module ImportExcel -Scope CurrentUser -Force | Out-Null }
        Import-Module ImportExcel | Out-Null
        $metadataRows | Export-Excel -Path $excelFilePath -WorksheetName "Metadata" -AutoSize -FreezeTopRow
        exit 0
    }

    Write-Host "Original generated SQL from stored procedure:"
    Write-Host $generatedSQL

    # ----- Clean the generated SQL (NEW STEP) -----
    # Remove any trailing whitespace or semicolons just in case the SP adds one
    $generatedSQL = $generatedSQL.TrimEnd(" `t`r`n;")
    Write-Host "Cleaned generated SQL (trailing '; ' removed if present):"
    Write-Host $generatedSQL

    # ----- Wrap the generated SQL inside a CTE and add additional query logic -----
    $wrappedSQL = @"
WITH base AS (
    $generatedSQL
)
SELECT DISTINCT
    a.* exclude (feature_key, interested)
FROM corpanalytics_business_prod.scratchpad_prdpf.alpha_beta_list_generation a
WHERE a.contextid IN (SELECT contextid FROM base)
  AND a.client_relationship_type IN (SELECT client_relationship_type FROM base)
"@

    Write-Host "Wrapped SQL query before flattening:"
    Write-Host $wrappedSQL

    $wrappedSQLFlattened = $wrappedSQL -replace "(\r\n|\n)", " "
    Write-Host "Wrapped SQL query after flattening:"
    Write-Host $wrappedSQLFlattened

    Write-Host "Executing flattened wrapped SQL query..."
    $cmd.CommandText = $wrappedSQLFlattened
    $queryResult = $cmd.ExecuteReader()
    
    # --- Force column names to uppercase for consistency ---
    $resultRows = New-Object System.Collections.Generic.List[System.Object]
    $colCount = $queryResult.FieldCount
    $colNames = @()
    for ($i = 0; $i -lt $colCount; $i++) {
        # Convert returned column names to uppercase
        $colNames += $queryResult.GetName($i).ToUpper()
    }
    while ($queryResult.Read()) {
        $rowObj = [PSCustomObject]@{}
        for ($i = 0; $i -lt $colCount; $i++) {
            $colName = $colNames[$i]
            $colValue = $queryResult.GetValue($i)
            if ($colValue -eq [System.DBNull]::Value) {
                $rowObj | Add-Member -NotePropertyName $colName -NotePropertyValue $null
            } else {
                $rowObj | Add-Member -NotePropertyName $colName -NotePropertyValue $colValue
            }
        }
        $resultRows.Add($rowObj)
    }
    $queryResult.Close()
    Write-Host "Retrieved $($resultRows.Count) rows from wrapped query."

    # ===== Check if all forced contexts are included in final results =====
    if ($forcedContexts -and $forcedContexts.Count -gt 0) {
        Write-Host "Forced context IDs from stored procedure: $($forcedContexts -join ', ')"
        $missingForcedContexts = @()
        foreach ($forced in $forcedContexts) {
            $found = $resultRows | Where-Object {
                $_.CONTEXTID -and ($_.CONTEXTID.ToString().ToUpper() -eq $forced.ToString().ToUpper())
            }
            if (-not $found) {
                $missingForcedContexts += $forced
            }
        }
        if ($missingForcedContexts.Count -gt 0) {
            Write-Host "Warning: The following forced context(s) are missing from query results: $($missingForcedContexts -join ', ')"
        } else {
            Write-Host "All forced contexts are included in the query results."
        }
    } else {
        Write-Host "No forced contexts were specified in the prompt."
    }

    # ----- Insert results into log table (alpha_beta_list_generation_results) --- BULK INSERT VERSION ---
    Write-Host "Preparing bulk insert for $($resultRows.Count) rows into alpha_beta_list_generation_results table..."
    $runBy = $logUsername # Use the potentially domain-formatted username for logging consistency
    $runAt = (Get-Date).ToString("o") # ISO 8601 format
    
    # ----- Check if FILE_NAME column exists, and add it if it doesn't -----
    Write-Host "Checking if FILE_NAME column exists in the results table..."
    $hasFileNameColumn = $true # Default to true - we'll add the column if needed
    
    try {
        $checkColumnSQL = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='SCRATCHPAD_PRDPF' AND TABLE_NAME='ALPHA_BETA_LIST_GENERATION_RESULTS' AND COLUMN_NAME='FILE_NAME';"
        $cmd.CommandText = $checkColumnSQL
        $columnCheckResult = $cmd.ExecuteReader()
        $columnExists = $false
        
        while ($columnCheckResult.Read()) {
            $columnExists = $true
            break
        }
        $columnCheckResult.Close()
        
        if (-not $columnExists) {
            Write-Host "FILE_NAME column does not exist. Adding it to the table..."
            $addColumnSQL = "ALTER TABLE corpanalytics_business_prod.scratchpad_prdpf.alpha_beta_list_generation_results ADD COLUMN FILE_NAME VARCHAR(255);"
            $cmd.CommandText = $addColumnSQL
            $cmd.ExecuteNonQuery() | Out-Null
            Write-Host "FILE_NAME column added successfully."
        } else {
            Write-Host "FILE_NAME column already exists in the table."
        }
    } catch {
        Write-Warning "Error checking/adding FILE_NAME column: $_"
        Write-Warning "Will attempt to continue with existing schema."
        # We'll still try to include the column
    }
    
    # ----- Generate file name before database insertion -----
    $oneDriveFolder = "C:\Users\cmollica\OneDrive - athenahealth\Client List Pulls"
    if (-not (Test-Path $oneDriveFolder)) {
        Write-Warning "OneDrive folder not found: $oneDriveFolder. Creating it."
        New-Item -ItemType Directory -Path $oneDriveFolder -Force | Out-Null
    }
    $counter = 0
    do {
        if ($counter -eq 0) { $fileName = "$baseFileName.xlsx" } else { $fileName = "$baseFileName ($counter).xlsx" }
        $excelFilePath = Join-Path $oneDriveFolder $fileName
        $counter++
    } while (Test-Path $excelFilePath)
    
    Write-Host "Generated file name for database and export: $fileName"

    if ($resultRows.Count -eq 0) {
        Write-Host "No rows to insert into results log table."
    } else {
        $transaction = $conn.BeginTransaction()
        $cmd.Transaction = $transaction
        try {
            # --- Prepare Columns (assuming same columns for all rows) ---
            $firstRow = $resultRows[0]
            $columnsList = @()
            # Get column names from the first row's properties (already uppercase)
            foreach ($prop in $firstRow.PSObject.Properties) {
                $colName = $prop.Name
                # Exclude RUN_BY/RUN_AT if they accidentally exist in source data
                if ($colName -ne "RUN_BY" -and $colName -ne "RUN_AT") {
                    $columnsList += '"' + $colName + '"' # Quote column names
                }
            }
            # Add the logging columns
            $columnsList += '"RUN_BY"'
            $columnsList += '"RUN_AT"'
            $columnsList += '"FILE_NAME"' # Always add FILE_NAME column now
            $columnsSQL = $columnsList -join ","

            # --- Prepare VALUES ---
            $valuesClauses = @() # Array to hold "(val1, val2,...)", "(valA, valB,...)"
            $batchSize = 500   # Insert rows in batches (adjust based on testing/limits)
            $rowsProcessed = 0

            for ($i = 0; $i -lt $resultRows.Count; $i++) {
                $row = $resultRows[$i]
                $rowValues = @() # Values for this specific row

                # Format values for each column based on the order derived from $firstRow
                foreach ($prop in $firstRow.PSObject.Properties) {
                     $colName = $prop.Name
                     if ($colName -ne "RUN_BY" -and $colName -ne "RUN_AT") {
                        $colValue = $row.$colName # Access property value

                        if ($null -eq $colValue) { $formattedVal = "NULL" }
                        elseif ($colValue -is [string]) { $formattedVal = "'{0}'" -f ($colValue -replace "'", "''") }
                        elseif ($colValue -is [datetime]) { $formattedVal = "'{0}'" -f ($colValue.ToString("yyyy-MM-dd HH:mm:ss.fff")) }
                        elseif ($colValue -is [bool]) { $formattedVal = if ($colValue) { 'TRUE' } else { 'FALSE' } }
                        else { $formattedVal = "$colValue" }
                        $rowValues += $formattedVal
                     }
                }
                # Add formatted values for logging columns
                $rowValues += "'{0}'" -f ($runBy -replace "'", "''")
                $rowValues += "'{0}'" -f $runAt
                $rowValues += "'{0}'" -f ($fileName -replace "'", "''")

                $valuesClauses += "(" + ($rowValues -join ",") + ")" # Add "(val1, val2,...)" to the list

                # --- Execute Batch ---
                $rowsProcessed++
                if (($valuesClauses.Count -ge $batchSize) -or ($i -eq $resultRows.Count - 1)) {
                    Write-Host "Executing batch insert for $($valuesClauses.Count) rows (Total processed: $rowsProcessed)..."
                    $insertSQL = "INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.alpha_beta_list_generation_results ($columnsSQL) VALUES $($valuesClauses -join ',');"
                    # Debug: Log the SQL before executing if needed
                    # Write-Host "Batch SQL: $($insertSQL.Substring(0, 200))..."

                    $cmd.CommandText = $insertSQL
                    $cmd.ExecuteNonQuery() | Out-Null
                    $valuesClauses = @() # Reset for next batch
                }
            } # End foreach row

            $transaction.Commit()
            Write-Host "Successfully inserted/committed all results into log table."

        } catch {
            Write-Error "Error during bulk result insertion into log table: $_"
            $transaction.Rollback()
            Write-Warning "Transaction rolled back due to insertion error."
            # Consider re-throwing or exiting if this failure is critical
            # throw $_ # Re-throw if needed
        }
    } # End if ($resultRows.Count -gt 0)
    # --- END OF BULK INSERT SECTION ---

    # ===== Split results into CSM Invite vs Standard =====
    $csmInviteRows = $resultRows | Where-Object { $_.ALPHA_BETA_STATUS -eq 'CSM Sends Alpha/Beta Invites' }
    $standardRows  = $resultRows | Where-Object { $_.ALPHA_BETA_STATUS -ne 'CSM Sends Alpha/Beta Invites' }
    # Use standard rows for main export and logging
    $resultRows = $standardRows

    # Prepare CSM Invite filename if needed
    $inviteFilePath = $null
    if ($csmInviteRows.Count -gt 0) {
        $baseNoExt = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
        $matchPattern = '^(.+?)(( \(\d+\))?)_(Alpha|Beta)_(\d+)$'
        if ($baseNoExt -match $matchPattern) {
            $invFeature = $Matches[1]
            $dupSuffix  = $Matches[2]  # e.g. " (1)" or ""
            $invStage   = $Matches[4]
            $invWave    = $Matches[5]
            # Desired pattern: FEATURE-12364_CSMInviteAlpha_1[ (dup)]
            $inviteBase = "${invFeature}_CSMInvite${invStage}_${invWave}${dupSuffix}.xlsx"
        } else {
            $inviteBase = "${baseNoExt}_CSMInvite.xlsx"
        }
        $inviteFilePath = Join-Path $oneDriveFolder $inviteBase
    }

    # ----- Export results to Excel -----
    Write-Host "Exporting data to Excel: $excelFilePath"
    $metadata = [PSCustomObject]@{
        "UserPrompt" = $userPrompt
        "WrappedSQL" = $wrappedSQLFlattened
    }
    $metadataRows = @($metadata)
    $excludedContextsDetails = @()

    # Optionally add details of missing forced contexts to ExcludedContextsDetails
    if ($missingForcedContexts -and $missingForcedContexts.Count -gt 0) {
        foreach ($ctx in $missingForcedContexts) {
            $excludedContextsDetails += [PSCustomObject]@{
                "ContextID" = $ctx
                "Status"    = "Forced context missing from final query results; check filter criteria."
            }
        }
    } else {
        Write-Host "No forced contexts missing or no forced contexts to check."
    }

    # --- Column renaming for ALLCONTACTS export ---
    # Update the mapping keys to uppercase
    $columnMappings = @{
        "CONTEXTID"          = "Context ID"
        "OPTIN_OUT"          = "Opt In/Out" 
        "RECRUITMENT_METHOD" = "Recruitment Method"
        "EMAIL"              = "Email"
    }

    if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
        Write-Host "ImportExcel module not found, attempting to install..."
        try {
             Install-Module ImportExcel -Scope CurrentUser -Force -Confirm:$false -AcceptLicense
             Write-Host "ImportExcel installed successfully."
        } catch {
            Write-Error "Failed to install ImportExcel module: $_. Cannot export to Excel."
            exit 1
        }
    }
    Import-Module ImportExcel -Force | Out-Null

    try {
        $excelParams = @{
            Path         = $excelFilePath
            AutoSize     = $true
        }
        # Export Metadata sheet
        $metadataRows | Export-Excel @excelParams -WorksheetName "Metadata"

# Process ALLCONTACTS data for Excel export
if ($resultRows.Count -gt 0) {
    Write-Host "Processing ALLCONTACTS data for Excel export..."
    # Get the actual column names from the first result object (already uppercased earlier)
    $actualColumns = $resultRows[0].PSObject.Properties.Name
    $selectProperties = @() # Array to hold property names and calculated properties for Select-Object

    foreach ($colName in $actualColumns) {
        # $colName is the actual property name (e.g., "CONTEXTID")
        if ($columnMappings.ContainsKey($colName)) {
            # This column needs renaming
            $newName = $columnMappings[$colName] # Get the desired new name (e.g., "Context ID")
            Write-Host "Mapping column '$colName' to '$newName' for Excel." -ForegroundColor Cyan

            # Create a calculated property for Select-Object
            # Use [scriptblock]::Create() to bake the *current value* of $colName into the expression
            # This avoids the closure issue with $using: where the variable value might change by the time Select-Object runs.
            # We need to access the property on the current pipeline object ($_) using the name stored in $colName.
            # Escape any double quotes within the column name itself, although unlikely for standard SQL identifiers.
            $safeColName = $colName -replace '"', '""'
            $expression = [scriptblock]::Create("`$_.`"$safeColName`"") # Creates a scriptblock like { $_."CONTEXTID" }

            $selectProperties += @{ Name = $newName; Expression = $expression }
        }
        else {
            # This column doesn't need renaming, just add its name directly
            $selectProperties += $colName
        }
    }

    Write-Host "Applying column name changes using Select-Object..."
    # Select the properties, applying the renaming defined in $selectProperties
    $excelExportRows = $resultRows | Select-Object -Property $selectProperties

    Write-Host "Exporting renamed data to ALLCONTACTS sheet..."
    # Export the processed data
    $excelExportRows | Export-Excel @excelParams -WorksheetName "ALLCONTACTS" -Append
}
else {
    Write-Host "No result rows to export to ALLCONTACTS sheet."
    # Create an empty object with a status message for the Excel sheet if there's no data
    @([PSCustomObject]@{ Status = "No data returned by the query" }) |
        Export-Excel @excelParams -WorksheetName "ALLCONTACTS" -Append
}

        if ($excludedContextsDetails.Count -gt 0) {
            $excludedContextsDetails | Export-Excel @excelParams -WorksheetName "ExcludedContextsDetails" -Append
        }
        else {
            Write-Host "No excluded contexts to export."
            @([PSCustomObject]@{ Status = "No contexts were excluded by the stored procedure" }) |
                Export-Excel @excelParams -WorksheetName "ExcludedContextsDetails" -Append
        }
        Write-Host "Excel export completed successfully."
    }
    catch {
        Write-Error "Failed to export data to Excel file '$excelFilePath': $_"
        exit 1
    }

    # ---- Export CSM Invite rows to separate file ----
    if ($inviteFilePath -and $csmInviteRows.Count -gt 0) {
        Write-Host "Exporting CSM Invite subset to Excel: $inviteFilePath"

        # Apply the same column mappings used for the main sheet
        $inviteSelectProperties = @()
        $inviteActualColumns = $csmInviteRows[0].PSObject.Properties.Name
        foreach ($colName in $inviteActualColumns) {
            if ($columnMappings.ContainsKey($colName)) {
                $newName = $columnMappings[$colName]
                $safeColName = $colName -replace '"', '""'
                $expression = [scriptblock]::Create("`$_.`"$safeColName`"")
                $inviteSelectProperties += @{ Name = $newName; Expression = $expression }
            }
            else {
                $inviteSelectProperties += $colName
            }
        }
        $csmExportRows = $csmInviteRows | Select-Object -Property $inviteSelectProperties
        $csmExportRows | Export-Excel -Path $inviteFilePath -WorksheetName "ALLCONTACTS" -AutoSize
    }

    $safeWrappedSQL = $wrappedSQLFlattened -replace "'", "''"
    $safeBaseFileName = $baseFileName -replace "'", "''"

    Write-Host "Inserting log record into cr_user_requests..."
    $insertSQL = @"
INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests ("USER", PROMPT, GENERATED_SQL, FILE_NAME)
VALUES ('$logUsername', '$userPromptSanitized', '$safeWrappedSQL', '$safeBaseFileName');
"@
    $cmd.CommandText = $insertSQL
    $cmd.ExecuteNonQuery() | Out-Null
    Write-Host "Log record inserted successfully."

}
catch {
    Write-Error "FATAL ERROR during Snowflake processing: $_"
    Write-Error "Error occurred at Line: $($_.InvocationInfo.ScriptLineNumber)"
    Write-Error "Error Details: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($conn -ne $null -and $conn.State -eq [System.Data.ConnectionState]::Open) {
        Write-Host "Closing Snowflake connection."
        $conn.Close()
    }
}

Write-Host "Script finished. Your list should be available at $excelFilePath"
