param(
    [string]$var1,   # Username from the web app (for logging)
    [string]$var2,   # User prompt
    [string]$var3,   # Base file name
    [string]$explainOnly,  # If 'true', only return SQL explanation without executing
    [string]$optInOut   # Opt-in or Opt-out value from web form
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

    # Generate SQL using Python bridge script (replaces stored procedure call)
    Write-Host "Generating SQL using list_gen_v2 logic via Python bridge..."
    $pythonScriptPath = Join-Path $PSScriptRoot "sql_generator_bridge.py"
    
    if (-not (Test-Path $pythonScriptPath)) {
        Write-Error "Python bridge script not found at: $pythonScriptPath"
        exit 1
    }
    
    # Execute Python bridge script to generate SQL
    # Escape double quotes in prompt to avoid breaking Python arg parsing
    $escapedPrompt = $userPrompt -replace '"', '\"'
    $pythonArgs = @(
        $pythonScriptPath,
        "--mode", "list_generation",
        "--prompt", $escapedPrompt,
        "--username", $logUsername
    )
    
    try {
        Write-Host "Executing Python bridge: python $($pythonArgs -join ' ')"
        $pythonOutput = & python @pythonArgs 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Python bridge script failed with exit code $LASTEXITCODE. Output: $pythonOutput"
            exit 1
        }
        
        Write-Host "Python bridge output received."
        
        # Parse JSON response from Python bridge
        $parsed = $pythonOutput | ConvertFrom-Json
        $generatedSQL = $parsed.generated_sql
        $forcedContexts = $parsed.forcedContextIDs
        $sqlExplanation = $parsed.sql_explanation
        
        Write-Host "SQL generation successful. Generated SQL length: $($generatedSQL.Length) characters"
        if ($forcedContexts -and $forcedContexts.Count -gt 0) {
            Write-Host "Forced context IDs received: $($forcedContexts.Count) contexts"
        }
        
        # If explainOnly mode is requested, return the JSON response immediately
        if ($explainOnly -eq 'true') {
            Write-Host "Explain-only mode detected. Returning SQL explanation without execution."
            
            # Clean up fields and escape ALL problematic JSON characters
            $cleanedExplanation = $sqlExplanation -replace '[\r\n\t\f\b]', ' ' -replace '\s+', ' ' -replace '"', '\\"' -replace '\\', '\\\\' -replace "'", "\\'"
            $cleanedExplanation = $cleanedExplanation.Trim()
            $cleanedSQL = $generatedSQL -replace '[\r\n\t\f\b]', ' ' -replace '\s+', ' ' -replace '"', '\\"' -replace '\\', '\\\\' -replace "'", "\\'"
            $cleanedSQL = $cleanedSQL.Trim()
            
            # Construct single-line JSON to avoid any newlines
            $jsonResponse = "{`"sql_explanation`": `"$cleanedExplanation`", `"forcedContextIDs`": [], `"generated_sql`": `"$cleanedSQL`"}"
            Write-Output $jsonResponse
            exit 0
        }
        
    } catch {
        Write-Error "Failed to execute Python bridge script or parse response. Error: $_"
        Write-Error "Python output: $pythonOutput"
        exit 1
    }
    
    # Create database command object for executing the generated SQL
    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 600

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
    
    Write-Host "Using generated SQL directly (no wrapping needed):"
    $wrappedSQLFlattened = $generatedSQL
    Write-Host $generatedSQL

    Write-Host "Executing generated SQL query..."
    $cmd.CommandText = $generatedSQL
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
    
    # Create a TEMP path to write the workbook first (avoids OneDrive file locking during Save)
    $tempFolder = [System.IO.Path]::GetTempPath()
    $tempExcelBase = "{0}_{1}" -f ([Guid]::NewGuid().ToString('N')), $fileName
    $tempExcelPath = Join-Path $tempFolder $tempExcelBase
    
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
                # Also exclude SOURCE_TIER since we'll use its value to populate RECRUITMENT_METHOD
                if ($colName -ne "RUN_BY" -and $colName -ne "RUN_AT" -and $colName -ne "SOURCE_TIER") {
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
                     # Skip RUN_BY/RUN_AT (added separately) and SOURCE_TIER (used to populate RECRUITMENT_METHOD)
                     if ($colName -ne "RUN_BY" -and $colName -ne "RUN_AT" -and $colName -ne "SOURCE_TIER") {
                        # If this is the RECRUITMENT_METHOD column, populate it with SOURCE_TIER value
                        if ($colName -eq "RECRUITMENT_METHOD") {
                            $colValue = $row.SOURCE_TIER # Use source_tier value for recruitment_method
                        } else {
                            $colValue = $row.$colName # Access property value normally
                        }

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
    # Use a regex match to be resilient to minor text variations (case-insensitive)
    $csmInviteRows = $resultRows | Where-Object { $_.ALPHA_BETA_STATUS -match 'CSM.*Invite' }
    $standardRows  = $resultRows | Where-Object { -not ($_.ALPHA_BETA_STATUS -match 'CSM.*Invite') }
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

        # Build a temp path for the invite export as well
        $tempInviteBase = "{0}_{1}" -f ([Guid]::NewGuid().ToString('N')), $inviteBase
        $tempInvitePath = Join-Path $tempFolder $tempInviteBase
    }

    # ----- Export results to Excel -----
    Write-Host "Exporting data to Excel (temp): $tempExcelPath (will move to $excelFilePath)"
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
            Path         = $tempExcelPath
            AutoSize     = $true
        }
        # Export Metadata sheet
        $metadataRows | Export-Excel @excelParams -WorksheetName "Metadata"

# Process ALLCONTACTS data for Excel export
if ($resultRows.Count -gt 0) {
    Write-Host "Processing ALLCONTACTS data for Excel export..."
    
    # --- Check if this is a DarkLaunch request by parsing stage from filename ---
    Write-Host "DEBUG: Checking baseFileName for DarkLaunch stage: '$baseFileName'" -ForegroundColor Cyan
    
    # Parse stage from filename format: FEATURE-123_STAGE_WAVE
    $filenameParts = $baseFileName -split '_'
    $stage = if ($filenameParts.Length -ge 2) { $filenameParts[1] } else { "" }
    
    $isDarkLaunch = $stage -eq "DarkBeta" -or $stage -eq "DarkAlpha"
    Write-Host "DEBUG: Extracted stage: '$stage', DarkLaunch detection result: $isDarkLaunch" -ForegroundColor Cyan
    
    if ($isDarkLaunch) {
        Write-Host "DarkLaunch detected - applying column removal and deduplication..." -ForegroundColor Yellow
        
        # Debug: Show available columns before removal
        if ($resultRows.Count -gt 0) {
            $availableColumns = $resultRows[0].PSObject.Properties.Name | Sort-Object
            Write-Host "DEBUG: Available columns before removal: $($availableColumns -join ', ')" -ForegroundColor Cyan
        }
        
        # Define columns to remove for DarkLaunch (with multiple variations)
        $darkLaunchColumnsToRemove = @(
            "CLIENT_RELATIONSHIP_TYPE",
            "CLIENTRELATIONSHIPTYPE", 
            "Client_Relationship_Type",
            "FULL_NAME", 
            "FULLNAME",
            "Full_Name",
            "EMAIL",
            "Email",
            "USER_ID",
            "USERID",
            "User_ID"
        )
        
        Write-Host "Removing DarkLaunch excluded columns: $($darkLaunchColumnsToRemove -join ', ')"
        
        # Remove specified columns from each row
        $processedRows = @()
        $columnsRemoved = @()
        
        foreach ($row in $resultRows) {
            $newRow = $row.PSObject.Copy()
            $availableColumnsForThisRow = $newRow.PSObject.Properties.Name
            
            foreach ($columnToRemove in $darkLaunchColumnsToRemove) {
                if ($availableColumnsForThisRow -contains $columnToRemove) {
                    Write-Host "DEBUG: Removing column '$columnToRemove'" -ForegroundColor Yellow
                    $newRow.PSObject.Properties.Remove($columnToRemove)
                    if ($columnsRemoved -notcontains $columnToRemove) {
                        $columnsRemoved += $columnToRemove
                    }
                }
            }
            $processedRows += $newRow
        }
        
        Write-Host "DEBUG: Successfully removed columns: $($columnsRemoved -join ', ')" -ForegroundColor Green
        if ($columnsRemoved.Count -eq 0) {
            Write-Host "WARNING: No columns were removed! Check column name matching." -ForegroundColor Red
        }
        
        # Implement deduplication based on remaining columns
        Write-Host "Applying deduplication logic..."
        $deduplicatedRows = @()
        $seenRows = @{}
        
        foreach ($row in $processedRows) {
            # Create a hash key from all remaining properties
            $properties = $row.PSObject.Properties | Sort-Object Name
            $hashKey = ($properties | ForEach-Object { "$($_.Name):$($_.Value)" }) -join "|"
            
            if (-not $seenRows.ContainsKey($hashKey)) {
                $seenRows[$hashKey] = $true
                $deduplicatedRows += $row
            }
        }
        
        $originalCount = $resultRows.Count
        $deduplicatedCount = $deduplicatedRows.Count
        Write-Host "DarkLaunch processing: Removed duplicates ($originalCount -> $deduplicatedCount rows)" -ForegroundColor Green
        
        # Use deduplicated rows for further processing
        $resultRows = $deduplicatedRows
    }
    
    # --- Apply source_tier to recruitment_method mapping for Excel export ---
    Write-Host "Applying source_tier to recruitment_method mapping for Excel export..."
    $excelRows = @()
    foreach ($row in $resultRows) {
        # Create a new object with the mapping applied
        $newRow = $row.PSObject.Copy()
        
        # If recruitment_method exists and source_tier exists, populate recruitment_method with source_tier value
        if ($newRow.PSObject.Properties.Name -contains "RECRUITMENT_METHOD" -and $newRow.PSObject.Properties.Name -contains "SOURCE_TIER") {
            $newRow.RECRUITMENT_METHOD = $newRow.SOURCE_TIER
            # Remove SOURCE_TIER from Excel export since we've used its value
            $newRow.PSObject.Properties.Remove("SOURCE_TIER")
        }
        
        # Add funnel columns based on recruitment_method value
        $recruitmentMethod = if ($newRow.PSObject.Properties.Name -contains "RECRUITMENT_METHOD") { $newRow.RECRUITMENT_METHOD } else { "" }
        
        # Add GEN_FUNNEL (1 if recruitment_method = 'gen' or 'forced', 0 otherwise)
        Add-Member -InputObject $newRow -MemberType NoteProperty -Name "GEN_FUNNEL" -Value $(if ($recruitmentMethod -eq "gen" -or $recruitmentMethod -eq "forced") { 1 } else { 0 })
        
        # Add INT_FUNNEL (1 if recruitment_method = 'int', 0 otherwise)
        Add-Member -InputObject $newRow -MemberType NoteProperty -Name "INT_FUNNEL" -Value $(if ($recruitmentMethod -eq "int") { 1 } else { 0 })
        
        # Add VOC_FUNNEL (1 if recruitment_method = 'voc', 0 otherwise)
        Add-Member -InputObject $newRow -MemberType NoteProperty -Name "VOC_FUNNEL" -Value $(if ($recruitmentMethod -eq "voc") { 1 } else { 0 })
        
        # Add or update OPTIN_OUT column with value from web form
        if ($newRow.PSObject.Properties.Name -contains "OPTIN_OUT") {
            # Property already exists, update its value
            $newRow.OPTIN_OUT = $optInOut
        } else {
            # Property doesn't exist, add it
            Add-Member -InputObject $newRow -MemberType NoteProperty -Name "OPTIN_OUT" -Value $optInOut
        }
        
        $excelRows += $newRow
    }
    
    # Get the actual column names from the first processed result object
    $actualColumns = $excelRows[0].PSObject.Properties.Name
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
    $excelExportRows = $excelRows | Select-Object -Property $selectProperties

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
        
        # Move temp workbook to OneDrive destination with retries to handle transient locks
        $maxAttempts = 6
        for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
            try {
                Copy-Item -LiteralPath $tempExcelPath -Destination $excelFilePath -Force
                Remove-Item -LiteralPath $tempExcelPath -Force -ErrorAction SilentlyContinue
                Write-Host "Excel file moved to $excelFilePath"
                break
            } catch {
                if ($attempt -eq $maxAttempts) {
                    throw "Unable to move temp Excel file to OneDrive destination after $maxAttempts attempts: $($_.Exception.Message)"
                }
                $delay = [Math]::Min(15, [Math]::Pow(2, $attempt))
                Write-Warning "Move attempt $attempt failed: $($_.Exception.Message). Retrying in $delay sec..."
                Start-Sleep -Seconds $delay
            }
        }
    }
    catch {
        Write-Error "Failed to export data to Excel file '$excelFilePath': $_"
        exit 1
    }

    # ---- Export CSM Invite rows to separate file ----
    if ($inviteFilePath -and $csmInviteRows.Count -gt 0) {
        Write-Host "Exporting CSM Invite subset to Excel: $inviteFilePath"

        # Apply the same transformations as the main export
        $csmExcelRows = @()
        foreach ($row in $csmInviteRows) {
            $newRow = $row.PSObject.Copy()

            # Map SOURCE_TIER to RECRUITMENT_METHOD and remove SOURCE_TIER
            if ($newRow.PSObject.Properties.Name -contains "RECRUITMENT_METHOD" -and $newRow.PSObject.Properties.Name -contains "SOURCE_TIER") {
                $newRow.RECRUITMENT_METHOD = $newRow.SOURCE_TIER
                $newRow.PSObject.Properties.Remove("SOURCE_TIER")
            }

            # Add funnel columns based on recruitment method
            $recruitmentMethod = if ($newRow.PSObject.Properties.Name -contains "RECRUITMENT_METHOD") { $newRow.RECRUITMENT_METHOD } else { "" }
            Add-Member -InputObject $newRow -MemberType NoteProperty -Name "GEN_FUNNEL" -Value $(if ($recruitmentMethod -eq "gen" -or $recruitmentMethod -eq "forced") { 1 } else { 0 })
            Add-Member -InputObject $newRow -MemberType NoteProperty -Name "INT_FUNNEL" -Value $(if ($recruitmentMethod -eq "int") { 1 } else { 0 })
            Add-Member -InputObject $newRow -MemberType NoteProperty -Name "VOC_FUNNEL" -Value $(if ($recruitmentMethod -eq "voc") { 1 } else { 0 })

            # Add or update OPTIN_OUT
            if ($newRow.PSObject.Properties.Name -contains "OPTIN_OUT") {
                $newRow.OPTIN_OUT = $optInOut
            } else {
                Add-Member -InputObject $newRow -MemberType NoteProperty -Name "OPTIN_OUT" -Value $optInOut
            }

            $csmExcelRows += $newRow
        }

        # Apply column renaming/mapping
        $inviteSelectProperties = @()
        $inviteActualColumns = $csmExcelRows[0].PSObject.Properties.Name
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

        $csmExportRows = $csmExcelRows | Select-Object -Property $inviteSelectProperties
        $csmExportRows | Export-Excel -Path $tempInvitePath -WorksheetName "ALLCONTACTS" -AutoSize
        
        # Move temp invite workbook to OneDrive destination with retries
        $maxAttempts = 6
        for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
            try {
                Copy-Item -LiteralPath $tempInvitePath -Destination $inviteFilePath -Force
                Remove-Item -LiteralPath $tempInvitePath -Force -ErrorAction SilentlyContinue
                Write-Host "CSM Invite export completed successfully. Moved to $inviteFilePath"
                break
            } catch {
                if ($attempt -eq $maxAttempts) {
                    throw "Unable to move temp CSM Invite Excel file to OneDrive destination after $maxAttempts attempts: $($_.Exception.Message)"
                }
                $delay = [Math]::Min(15, [Math]::Pow(2, $attempt))
                Write-Warning "Invite move attempt $attempt failed: $($_.Exception.Message). Retrying in $delay sec..."
                Start-Sleep -Seconds $delay
            }
        }
    }

    $safeWrappedSQL = $wrappedSQLFlattened -replace "'", "''"
    $safeBaseFileName = $baseFileName -replace "'", "''"

    Write-Host "Inserting log record into cr_user_requests..."
    
    # Prepare SQL explanation for logging (escape single quotes and truncate if needed)
    $safeSqlExplanation = if ($sqlExplanation) { 
        ($sqlExplanation -replace "'", "''").Substring(0, [Math]::Min($sqlExplanation.Length, 1900))
    } else { 
        "No explanation generated" 
    }
    
    # Prepare opt-in/out value for database insertion (escape single quotes)
    $safeOptInOut = if ($optInOut) { $optInOut -replace "'", "''" } else { "" }
    
    $insertSQL = @"
INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests ("USER", "PROMPT", "GENERATED_SQL", "FILE_NAME", "SQL_EXPLANATION", "OPTIN_OUT")
VALUES ('$logUsername', '$userPromptSanitized', '$safeWrappedSQL', '$safeBaseFileName', '$safeSqlExplanation', '$safeOptInOut');
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
