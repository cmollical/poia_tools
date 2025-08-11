# --- SCRIPT: list_filter_power_shell.ps1 ---
# Accepts user prompt/contexts, runs Snowflake filter SP, generates Excel output.
# Can save output to shared OneDrive or prepare for server download response.

param(
    [Parameter(Mandatory=$true)]
    [string]$var1,              # Username from the web app (for logging)

    [Parameter(Mandatory=$true)]
    [string]$var2,              # User prompt (contains filters and context list)

    [Parameter(Mandatory=$true)]
    [string]$var3,              # Base file name (e.g., FEATURE-123_Beta_1)

    [Parameter(Mandatory=$false)]
    [Switch]$SaveToDownloads    # If present, save temporarily for server download response
)

$ErrorActionPreference = "Stop"
$VerbosePreference = 'SilentlyContinue'

# ----- Step 1: Retrieve Snowflake credentials -----
Write-Host "Step 1: Retrieving Snowflake credentials..."
$snowflakeUserFromEnv = [Environment]::GetEnvironmentVariable('API_USERNAME', 'Machine')
$snowflakePasswordFromEnv = [Environment]::GetEnvironmentVariable('API_PASSWORD', 'Machine')
if ([string]::IsNullOrEmpty($snowflakeUserFromEnv) -or [string]::IsNullOrEmpty($snowflakePasswordFromEnv)) {
    Write-Error "FATAL: Snowflake credentials (API_USERNAME, API_PASSWORD) not found in Machine environment variables."
    exit 1
}
Write-Host "Credentials retrieved."

# ----- Step 2: Define Snowflake connection properties -----
Write-Host "Step 2: Defining Snowflake connection properties..."
$snowflakeAccount   = "athenahealth.snowflakecomputing.com"
$snowflakeDatabase  = "CORPANALYTICS_BUSINESS_PROD"
$snowflakeSchema    = "SCRATCHPAD_PRDPF"
$snowflakeWarehouse = "CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD"
$snowflakeRole      = "CORPANALYTICS_BDB_PRDPF_PROD_RW"
$snowflakeUser = $snowflakeUserFromEnv # Use retrieved credentials
$connectionString = "Driver={SnowflakeDSIIDriver};Server=$snowflakeAccount;Database=$snowflakeDatabase;Schema=$snowflakeSchema;Warehouse=$snowflakeWarehouse;Role=$snowflakeRole;Uid=$snowflakeUser;Pwd=$snowflakePasswordFromEnv;SF_FETCH_SIZE=1000;"
Write-Host "Connection properties defined."

# ----- Step 3: Process web app input -----
Write-Host "Step 3: Processing input variables..."
$webAppUsername = $var1
# Append domain if not present (adjust domain if needed)
if ($webAppUsername -notmatch '@') { $webAppUsername = $webAppUsername + "@athenahealth.com" }
$logUsername = $webAppUsername # User for logging in DB
$userPrompt = $var2             # Raw prompt from user (includes filters and context list)
$baseFileName = $var3           # Base for output file (e.g., FEATURE-123_Beta_1)
$userPromptSanitized = $userPrompt -replace "'", "''" # Sanitize for SQL insertion
# Accessing the Switch parameter's boolean value
$isTemporaryDownload = $SaveToDownloads.IsPresent
Write-Host "Input variables processed: User='$logUsername', BaseFile='$baseFileName', SaveToDownloads='$isTemporaryDownload'"

# --- Parse the initial list of context IDs from the prompt ---
Write-Host "Parsing initial context IDs from prompt..."
$pastedContexts = @()
# Regex to find "For contexts: 123, 456, 789."
$match = [regex]::Match($userPrompt, "For contexts:\s*([\d,\s]+)\.")
if ($match.Success) {
    $contextString = $match.Groups[1].Value
    # Split by comma, trim whitespace, filter out empty strings, ensure they are numbers only
    $pastedContexts = $contextString -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' -and $_ -ne '' }
    Write-Host "Parsed $($pastedContexts.Count) initial context IDs from prompt string."
} else {
    Write-Warning "Could not parse context IDs from the 'For contexts:' part of the prompt. Proceeding without initial context list for exclusion check."
}

# ----- Step 4: Connect to Snowflake and execute procedures/queries -----
$conn = New-Object System.Data.Odbc.OdbcConnection($connectionString)
# *** Variable to store the final output path ***
$finalExcelFilePath = ""
# *** Variable to store the standard filename format for logging (with extension initially) ***
$loggableFileName = ""

try {
    Write-Host "Step 4: Connecting to Snowflake..."
    $conn.Open()
    Write-Host "Snowflake connection successful."

    $cmd = $conn.CreateCommand()
    $cmd.CommandTimeout = 600 # 10 minutes timeout

    # --- Execute the Stored Procedure to get the filtering SQL ---
    $cmd.CommandText = "CALL alpha_beta_list_generation_filter('$userPromptSanitized', '$logUsername');"
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
    Write-Host "Stored procedure executed."

    # --- Parse SP Response for Generated SQL ---
    $generatedSQL = ""
    $expectedKey = "ALPHA_BETA_LIST_GENERATION_FILTER" # Key returned by the SP
    if ($spReturn.ContainsKey($expectedKey)) {
        Write-Host "Found expected key '$expectedKey' in stored procedure response."
        $jsonString = $spReturn[$expectedKey]
        if ($jsonString -and $jsonString -ne [System.DBNull]::Value) {
            try {
                $parsedJson = $jsonString | ConvertFrom-Json
                # Handle potential case variations in JSON property name
                if ($parsedJson.PSObject.Properties.Name -contains 'generated_sql') {
                    $generatedSQL = $parsedJson.generated_sql
                } elseif ($parsedJson.PSObject.Properties.Name -contains 'GENERATED_SQL') {
                    $generatedSQL = $parsedJson.GENERATED_SQL
                } else {
                    Write-Warning "Could not find 'generated_sql' or 'GENERATED_SQL' property within the parsed JSON."
                }
                Write-Host "Successfully parsed JSON response from stored procedure."
            } catch {
                Write-Warning "Failed to parse JSON response from stored procedure: $jsonString --- Error: $_"
                $generatedSQL = "" # Ensure it's empty on parse failure
            }
        } else {
            Write-Warning "Stored procedure returned null or empty response for key '$expectedKey'."
        }
    } else {
        # Log details if the expected key is missing
        $availableKeys = $spReturn.Keys -join ', '
        $fullResponseJson = try { $spReturn | ConvertTo-Json -Depth 3 } catch { "Could not serialize SP response." }
        Write-Warning "Stored procedure response did not contain expected key '$expectedKey'. Available keys: $availableKeys --- Full Response: $fullResponseJson"
    }

    # --- Handle Failure if SQL is Missing ---
    if ([string]::IsNullOrWhiteSpace($generatedSQL)) {
        Write-Warning "Stored procedure did not return valid SQL to execute or failed to parse. Exiting gracefully."
        # Create a minimal failure report Excel file
        $metadata = [PSCustomObject]@{
            "UserPrompt" = $userPrompt
            "Status"     = "Failed - Stored procedure did not return SQL or failed to parse."
            "SP_Response"= ($spReturn | ConvertTo-Json -Depth 3) # Log the raw SP response
        }
        $metadataRows = @($metadata)

        # Determine failure report save location (always OneDrive for failures)
        # !!! ENSURE THIS PATH IS CORRECT ON YOUR SERVER !!!
        $failureFolder = "C:\Users\cmollica\OneDrive - athenahealth\Client List Pulls"
        if (-not (Test-Path $failureFolder)) { New-Item -ItemType Directory -Path $failureFolder -Force | Out-Null }
        $counter = 0
        $failureFileName = ""
        $failureFilePath = ""
        do {
            if ($counter -eq 0) { $failureFileName = "$baseFileName (Failed).xlsx" } else { $failureFileName = "$baseFileName (Failed $counter).xlsx" }
            $failureFilePath = Join-Path $failureFolder $failureFileName
            $counter++
        } while (Test-Path $failureFilePath)

        try {
            if (-not (Get-Module -ListAvailable -Name ImportExcel)) { Install-Module ImportExcel -Scope CurrentUser -Force -Confirm:$false -AcceptLicense | Out-Null }
            Import-Module ImportExcel -Force | Out-Null
            $metadataRows | Export-Excel -Path $failureFilePath -WorksheetName "FailureMetadata" -AutoSize -FreezeTopRow
            Write-Host "Failure metadata saved to $failureFilePath"
        } catch {
            Write-Error "Failed to write failure metadata Excel file: $_"
        }
        # Exit script cleanly after logging failure
        exit 0
    }

    Write-Host "Original generated SQL from stored procedure:"
    Write-Host $generatedSQL

    # --- Clean the generated SQL ---
    $generatedSQL = $generatedSQL.TrimEnd(" `t`r`n;") # Remove trailing whitespace/semicolons
    Write-Host "Cleaned generated SQL (trailing '; ' removed if present):"
    Write-Host $generatedSQL

    # --- Wrap the generated SQL to select final columns ---
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
    $wrappedSQLFlattened = $wrappedSQL -replace "(\r\n|\n)", " " -replace '\s+', ' ' # Flatten for execution
    Write-Host "Wrapped SQL query after flattening:"
    Write-Host $wrappedSQLFlattened

    # --- Execute the Final Wrapped Query ---
    Write-Host "Executing flattened wrapped SQL query..."
    $cmd.CommandText = $wrappedSQLFlattened
    $queryResult = $cmd.ExecuteReader()

    # --- Process Query Results ---
    $resultRows = New-Object System.Collections.Generic.List[System.Object]
    $colNames = @()
    if ($queryResult.HasRows) {
        $colCount = $queryResult.FieldCount
        for ($i = 0; $i -lt $colCount; $i++) { $colNames += $queryResult.GetName($i).ToUpper() } # Get column names (uppercase)

        while ($queryResult.Read()) {
            $rowObj = [PSCustomObject]@{}
            for ($i = 0; $i -lt $colCount; $i++) {
                $colName = $colNames[$i]
                $colValue = $queryResult.GetValue($i)
                # Handle DBNull values
                $finalValue = if ($colValue -eq [System.DBNull]::Value) { $null } else { $colValue }
                $rowObj | Add-Member -NotePropertyName $colName -NotePropertyValue $finalValue
            }
            $resultRows.Add($rowObj)
        }
    }
    $queryResult.Close()
    Write-Host "Retrieved $($resultRows.Count) rows from wrapped query."

    # --- Insert results into log table (alpha_beta_list_generation_results) ---
    Write-Host "Preparing bulk insert for $($resultRows.Count) rows into alpha_beta_list_generation_results table..."
    $runBy = $logUsername
    $runAt = (Get-Date).ToString("o") # ISO 8601 format

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
                if ($colName -ne "RUN_BY" -and $colName -ne "RUN_AT" -and $colName -ne "FILE_NAME") {
                    $columnsList += '"' + $colName + '"' # Quote column names
                }
            }
            # Add the logging columns
            $columnsList += '"RUN_BY"'
            $columnsList += '"RUN_AT"'
            $columnsList += '"FILE_NAME"'
            $columnsSQL = $columnsList -join ","

            # --- Prepare VALUES ---
            $valuesClauses = @() # Array to hold "(val1, val2,...)", "(valA, valB,...)"
            $batchSize = 500   # Insert rows in batches (adjust based on testing/limits)
            $rowsProcessed = 0
            # Ensure filename value for logging
            $fileNameForLog = if ($loggableFileName) { $loggableFileName } else { "$baseFileName.xlsx" }

            for ($i = 0; $i -lt $resultRows.Count; $i++) {
                $row = $resultRows[$i]
                $rowValues = @() # Values for this specific row

                # Format values for each column based on the order derived from $firstRow
                foreach ($prop in $firstRow.PSObject.Properties) {
                     $colName = $prop.Name
                     if ($colName -ne "RUN_BY" -and $colName -ne "RUN_AT" -and $colName -ne "FILE_NAME") {
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
                $rowValues += "'{0}'" -f ($fileNameForLog -replace "'", "''")
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


    # --- Identify and prepare EXCLUDED contexts ---
    Write-Host "Identifying excluded contexts from initial list..."
    $excludedContextsDetails = @() # Initialize/clear the array
    if ($pastedContexts.Count -gt 0) {
        # Get the list of context IDs that ARE in the final results
        $finalContextIDs = $resultRows | Select-Object -ExpandProperty CONTEXTID | ForEach-Object { $_.ToString() } | Select-Object -Unique
        Write-Host "Comparing initial $($pastedContexts.Count) contexts against final $($finalContextIDs.Count) contexts."
        # Find contexts from the initial pasted list that are NOT in the final list
        foreach ($initialCtx in $pastedContexts) {
            if ($finalContextIDs -notcontains $initialCtx) {
                $excludedContextsDetails += [PSCustomObject]@{
                    "ContextID" = $initialCtx
                    "Status"    = "Present in initial list but excluded by filtering criteria."
                }
            }
        }
        Write-Host "Identified $($excludedContextsDetails.Count) excluded contexts from initial list."
    } else {
        Write-Host "No initial contexts were parsed from prompt to check for exclusions."
    }


    # ----- *** MODIFIED: Determine Output Folder/Path and Export *** -----
    Write-Host "Determining output location based on SaveToDownloads flag ($isTemporaryDownload)..."

    # --- START: Calculate the base/potentially-countered filename for logging and potential OneDrive save ---
    #     This determines the "standard" filename format, including checks for existing files in OneDrive
    #     to add counters like (1), (2), etc. This calculated name will be used for logging
    #     and as the actual filename if saving to OneDrive.

    # !!! ENSURE THIS PATH IS CORRECT ON YOUR SERVER !!!
    $oneDriveOutputFolder = "C:\Users\cmollica\OneDrive - athenahealth\Client List Pulls"
    # $loggableFileName is declared outside the try block

    # Ensure the OneDrive *folder* exists for the check, even if not saving there.
    if (-not (Test-Path $oneDriveOutputFolder)) {
        Write-Host "OneDrive folder for unique name check not found: '$oneDriveOutputFolder'. Attempting to create it."
        try {
            New-Item -ItemType Directory -Path $oneDriveOutputFolder -Force -ErrorAction Stop | Out-Null
            Write-Host "OneDrive folder created: '$oneDriveOutputFolder'"
        } catch {
            Write-Warning "Failed to create OneDrive folder '$oneDriveOutputFolder' for unique name check. Will log base filename without counter check. Error: $_"
            # Fallback if folder creation fails - just use the base name + extension
            $loggableFileName = "$baseFileName.xlsx"
        }
    }

    # If the folder exists (or was created), perform the unique check to determine the standard filename
    if ([string]::IsNullOrEmpty($loggableFileName)) { # Only run check if not already set by fallback
        Write-Host "Generating standard unique filename based on '$oneDriveOutputFolder'..."
        $counter = 0
        $baseExcelFileName = "$baseFileName.xlsx"
        $tempCheckPath = ""
        do {
            # Set the filename based on the counter
            if ($counter -eq 0) { $currentCheckName = $baseExcelFileName } else { $currentCheckName = "$baseFileName ($counter).xlsx" }
            # Construct the full path to check for existence
            $tempCheckPath = Join-Path $oneDriveOutputFolder $currentCheckName
            # Store the name that doesn't exist yet
            $loggableFileName = $currentCheckName # This becomes the name without counter, or with the first available counter
            $counter++
        } while (Test-Path $tempCheckPath) # Loop until we find a name that DOES NOT exist
        Write-Host "Determined standard filename (potential counter applied): $loggableFileName"
    }
    # --- END: Calculate the base/potentially-countered filename ---


    # ===== Split results into CSM Invite vs Standard =====
    $csmInviteRows = $resultRows | Where-Object { $_.ALPHA_BETA_STATUS -eq 'CSM Sends Alpha/Beta Invites' }
    $standardRows  = $resultRows | Where-Object { $_.ALPHA_BETA_STATUS -ne 'CSM Sends Alpha/Beta Invites' }

    $resultRows = $standardRows  # keep original filename for logging/export below
    if (-not $loggableFileName) { $loggableFileName = "$baseFileName.xlsx" }

    if ($isTemporaryDownload) {
        # --- Save to a TEMPORARY server location for Node.js to pick up ---
        $tempFolder = [System.IO.Path]::GetTempPath() # Use the OS temporary directory
        
        # Clean format for download - use the base filename directly without timestamps or GUIDs
        $cleanFileName = "$baseFileName.xlsx"
        
        # Create a unique temporary file path by using a folder with timestamp/GUID
        $uniqueTempSubfolder = "list_export_$(Get-Date -Format 'yyyyMMddHHmmss')_$([guid]::NewGuid().ToString().Substring(0,8))"
        $uniqueTempPath = Join-Path $tempFolder $uniqueTempSubfolder
        New-Item -ItemType Directory -Path $uniqueTempPath -Force | Out-Null
        
        # Final path combines the unique temp folder with the clean filename
        $finalExcelFilePath = Join-Path $uniqueTempPath $cleanFileName
        Write-Host "Targeting temporary file for download: $finalExcelFilePath"
        Write-Host "Filename to be logged in DB (base): $($loggableFileName -replace '\.xlsx$', '')" # For clarity show base name
    } else {
        # --- Standard OneDrive path ---
        $outputFolder = $oneDriveOutputFolder # Reuse the path variable
        Write-Host "Targeting OneDrive folder: $outputFolder"
        # Use the previously calculated loggable/standard filename for the actual save path
        $finalExcelFilePath = Join-Path $outputFolder $loggableFileName
        Write-Host "Final output path determined: $finalExcelFilePath"
        # In this case, $loggableFileName is the actual filename part of $finalExcelFilePath
    }

    # Prepare CSM Invite file path
    $inviteFilePath = $null
    if ($csmInviteRows.Count -gt 0) {
        $baseNoExt = [System.IO.Path]::GetFileNameWithoutExtension($loggableFileName)
        Write-Host "DEBUG: Processing CSM Invite naming for baseNoExt: '$baseNoExt'"
        
        # Extract feature number and separate it from environment/wave information
        # Updated regex pattern to handle various filename formats more robustly
        if ($baseNoExt -match '^(FEATURE-\d+)(?:_([A-Za-z]+))?(?:_?(\d+))?(?:\s*\(\d+\))?$') {
            $invFeature = $Matches[1]  # Feature number (e.g., FEATURE-27604)
            $invStage = if ($Matches[2]) { $Matches[2] } else { "Beta" }  # Default to Beta if not specified  
            $invWave = if ($Matches[3]) { $Matches[3] } else { "3" }  # Default to 3 if not specified
            
            Write-Host "DEBUG: Regex matched - Feature: '$invFeature', Stage: '$invStage', Wave: '$invWave'"
            
            # Use consistent naming convention for all features
            $inviteBase = "${invFeature}_CSMInvite${invStage}_${invWave}.xlsx"
            Write-Host "DEBUG: Generated inviteBase: '$inviteBase'"
        } else {
            Write-Host "DEBUG: Regex failed to match '$baseNoExt' - using fallback logic"
            # Improved fallback: try to parse the base filename to extract components
            if ($baseNoExt -match '^(FEATURE-\d+)') {
                $invFeature = $Matches[1]
                # Try to extract stage and wave from the remaining part
                $remaining = $baseNoExt -replace '^FEATURE-\d+_?', ''
                if ($remaining -match '^([A-Za-z]+)_?(\d+)?') {
                    $invStage = $Matches[1]
                    $invWave = if ($Matches[2]) { $Matches[2] } else { "1" }
                    $inviteBase = "${invFeature}_CSMInvite${invStage}_${invWave}.xlsx"
                    Write-Host "DEBUG: Fallback parsing succeeded: '$inviteBase'"
                } else {
                    # Last resort fallback
                    $inviteBase = "${invFeature}_CSMInvite.xlsx"
                    Write-Host "DEBUG: Using basic fallback: '$inviteBase'"
                }
            } else {
                # Ultimate fallback for unexpected formats
                $inviteBase = "${baseNoExt}_CSMInvite.xlsx"
                Write-Host "DEBUG: Using ultimate fallback: '$inviteBase'"
            }
        }
        if ($isTemporaryDownload) {
            $inviteFilePath = Join-Path $tempFolder $inviteBase
        } else {
            $inviteFilePath = Join-Path $outputFolder $inviteBase
        }
    }

    # ----- Export results to Excel using the determined $finalExcelFilePath -----
    Write-Host "Preparing Excel export to $finalExcelFilePath..."
    $metadata = [PSCustomObject]@{
        "UserPrompt" = $userPrompt
        "ExecutedSQL" = $wrappedSQLFlattened # Log the final executed SQL
        "SaveLocation" = if ($isTemporaryDownload) { "ServerTempForDownload" } else { "OneDrive" } # Updated location info
    }
    $metadataRows = @($metadata)

    # Define user-friendly column names for export
    $columnMappings = @{
        "CONTEXTID" = "Context ID"
        "OPTIN_OUT" = "Opt In/Out"
        "RECRUITMENT_METHOD" = "Recruitment Method"
        "EMAIL" = "Email"
        # Add more mappings as needed from your 'alpha_beta_list_generation' table columns
        "PRACTICENAME" = "Practice Name"
        "CSM_NAME" = "CSM Name"
        "CLIENT_RELATIONSHIP_TYPE" = "Client Relationship Type"
        "TIME_ZONE" = "Time Zone"
        # ... etc (Add other relevant column mappings here)
    }

    try {
         # Ensure ImportExcel module is available
         if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
             Write-Host "ImportExcel module not found, attempting to install for current user..."
             Install-Module ImportExcel -Scope CurrentUser -Force -Confirm:$false -AcceptLicense | Out-Null
             Write-Host "ImportExcel installed."
         }
         Import-Module ImportExcel -Force | Out-Null

         # Define common export parameters
         $excelParams = @{
            Path = $finalExcelFilePath  # *** Use the final calculated path ***
            AutoSize = $true
         }

         # Export Metadata sheet
         Write-Host "Exporting Metadata sheet..."
         $metadataRows | Export-Excel @excelParams -WorksheetName "Metadata"

         # Export ALLCONTACTS sheet
         Write-Host "Exporting ALLCONTACTS sheet..."
         if ($resultRows.Count -gt 0) {
            # Remap column names for export
            $actualColumns = $resultRows[0].PSObject.Properties.Name
            $selectProperties = @()
            foreach ($colName in $actualColumns) {
                if ($columnMappings.ContainsKey($colName)) {
                    $newName = $columnMappings[$colName]
                    # Handle potential quotes in column names safely for ScriptBlock
                    $safeColName = $colName -replace '"', '""'
                    $expression = [scriptblock]::Create("`$_.`"$safeColName`"")
                    $selectProperties += @{ Name = $newName; Expression = $expression }
                } else {
                    # Keep original name if no mapping exists
                    $selectProperties += $colName
                }
            }
            $excelExportRows = $resultRows | Select-Object -Property $selectProperties
            $excelExportRows | Export-Excel @excelParams -WorksheetName "ALLCONTACTS" -Append
            Write-Host "$($resultRows.Count) rows exported to ALLCONTACTS."
        } else {
            Write-Host "No result rows to export to ALLCONTACTS sheet."
            # Create an empty sheet with a status message
            @([PSCustomObject]@{ Status = "No data returned by the query" }) | Export-Excel @excelParams -WorksheetName "ALLCONTACTS" -Append
        }

        # Export ExcludedContexts sheet
        Write-Host "Exporting ExcludedContexts sheet..."
        if ($excludedContextsDetails.Count -gt 0) {
             $excludedContextsDetails | Export-Excel @excelParams -WorksheetName "ExcludedContexts" -Append
             Write-Host "Exported $($excludedContextsDetails.Count) excluded contexts details."
        } else {
            Write-Host "No excluded contexts identified to export."
            # Create an empty sheet with a status message
            @([PSCustomObject]@{ Status = "No contexts from the initial list were excluded by the filters, or no initial list provided." }) | Export-Excel @excelParams -WorksheetName "ExcludedContexts" -Append
        }

        # Export CSM Invite subset if exists
        if ($inviteFilePath -and $csmInviteRows.Count -gt 0) {
            Write-Host "Exporting CSM Invite subset to Excel: $inviteFilePath"
            # Apply same column mappings to invite subset
            $inviteSelectProperties = @()
            $inviteActualColumns = $csmInviteRows[0].PSObject.Properties.Name
            foreach ($colName in $inviteActualColumns) {
                if ($columnMappings.ContainsKey($colName)) {
                    $newName = $columnMappings[$colName]
                    $safeColName = $colName -replace '"', '""'
                    $expression = [scriptblock]::Create("`$_.`"$safeColName`"")
                    $inviteSelectProperties += @{ Name = $newName; Expression = $expression }
                } else {
                    $inviteSelectProperties += $colName
                }
            }
            $csmExportRows = $csmInviteRows | Select-Object -Property $inviteSelectProperties
            $csmExportRows | Export-Excel -Path $inviteFilePath -WorksheetName "ALLCONTACTS" -AutoSize
        }

        # ---- If temporary download mode, zip files and echo path for Node ----
        if ($isTemporaryDownload) {
            $filesToZip = @($finalExcelFilePath)
            if ($inviteFilePath -and (Test-Path $inviteFilePath)) { $filesToZip += $inviteFilePath }
            
            # Use clean zip filename without timestamps
            $zipFileName = "${baseFileName}.zip"
            
            # Create a unique zip path (in the unique folder we created earlier)
            $zipPath = Join-Path $uniqueTempPath $zipFileName
            Write-Host "Creating zip $zipPath containing $($filesToZip.Count) file(s)..."
            if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
            Compress-Archive -Path $filesToZip -DestinationPath $zipPath -Force
            Write-Host "Update path variable so calling code also sees correct file"
            $finalExcelFilePath = $zipPath
            Write-Host "DOWNLOAD_FILE_PATH:$zipPath"
            Write-Host "Script finished. Filtered list saved to $zipPath"
        } else {
            Write-Host "Script finished. Filtered list saved to $finalExcelFilePath"
        }

    } catch {
        Write-Error "FATAL: Failed to export data to Excel file '$finalExcelFilePath'. Error: $_"
        exit 1 # Exit script on export failure
    }

    # ----- Log the request details into cr_user_requests -----
    Write-Host "Logging request details into cr_user_requests..."
    $safeWrappedSQL = $wrappedSQLFlattened -replace "'", "''" # Sanitize SQL

    # --- START: Prepare filename for logging (REMOVE extension) ---
    # $loggableFileName currently holds the name like "FEATURE-123_Beta_1.xlsx" or "FEATURE-123_Beta_1 (1).xlsx"
    # We want to remove the .xlsx part for the database log entry.
    $loggableBaseName = $loggableFileName -replace '\.xlsx$', '' # Regex to remove .xlsx from the end
    Write-Host "Original loggable filename (with ext): $loggableFileName"
    Write-Host "Base filename for DB log (no ext): $loggableBaseName"

    # Sanitize the base name for the SQL query.
    $loggedBaseFileNameSanitized = $loggableBaseName -replace "'", "''"
    Write-Host "Using sanitized base filename for DB log: $loggedBaseFileNameSanitized"
    # --- END: Prepare filename for logging ---

    $insertLogSQL = @"
INSERT INTO corpanalytics_business_prod.scratchpad_prdpf.cr_user_requests
    ("USER", PROMPT, GENERATED_SQL, FILE_NAME)
VALUES
    ('$logUsername', '$userPromptSanitized', '$safeWrappedSQL', '$loggedBaseFileNameSanitized');
"@
    try {
        $cmd.CommandText = $insertLogSQL
        $cmd.ExecuteNonQuery() | Out-Null
        Write-Host "Log record inserted successfully into cr_user_requests."
    } catch {
        # Log failure but don't necessarily stop the script if Excel export succeeded
        Write-Warning "Failed to insert log record into cr_user_requests: $_"
        Write-Warning "SQL attempted: $insertLogSQL"
    }

} catch {
    # Catch any unexpected errors during the main processing block
    Write-Error "FATAL SCRIPT ERROR during processing: $_"
    Write-Error "Error occurred at Line: $($_.InvocationInfo.ScriptLineNumber)"
    Write-Error "Error Details: $($_.Exception.Message)"
    # Attempt to write a failure log file even on fatal errors if possible
    try {
        $metadata = [PSCustomObject]@{
            "UserPrompt" = $userPrompt
            "Status"     = "FATAL SCRIPT ERROR"
            "ErrorLine"  = $_.InvocationInfo.ScriptLineNumber
            "ErrorMessage" = $_.Exception.Message
            "StackTrace" = $_.ScriptStackTrace
        }
         # Determine failure report save location (always OneDrive for failures)
         # !!! ENSURE THIS PATH IS CORRECT ON YOUR SERVER !!!
        $failureFolder = "C:\Users\cmollica\OneDrive - athenahealth\Client List Pulls"
        if (-not (Test-Path $failureFolder)) { New-Item -ItemType Directory -Path $failureFolder -Force | Out-Null }
        $counter = 0
        $failureFileName = ""
        $failureFilePath = ""
        do {
            # Use a distinct name for fatal errors
            if ($counter -eq 0) { $failureFileName = "$baseFileName (FATAL_SCRIPT_ERROR).xlsx" } else { $failureFileName = "$baseFileName (FATAL_SCRIPT_ERROR $counter).xlsx" }
            $failureFilePath = Join-Path $failureFolder $failureFileName
            $counter++
        } while (Test-Path $failureFilePath)
         if (-not (Get-Module -ListAvailable -Name ImportExcel)) { Install-Module ImportExcel -Scope CurrentUser -Force -Confirm:$false -AcceptLicense | Out-Null }
         Import-Module ImportExcel -Force | Out-Null
         @($metadata) | Export-Excel -Path $failureFilePath -WorksheetName "FatalErrorMetadata" -AutoSize -FreezeTopRow
         Write-Host "Fatal error details saved to $failureFilePath"
    } catch {
         Write-Warning "Failed to write fatal error metadata file: $_"
    }
    exit 1 # Ensure script exits with non-zero code on fatal error
}
finally {
    # Always attempt to close the Snowflake connection if it was opened
    if ($conn -ne $null -and $conn.State -eq [System.Data.ConnectionState]::Open) {
        Write-Host "Closing Snowflake connection."
        $conn.Close()
    }
}

# Exit with code 0 on success
exit 0