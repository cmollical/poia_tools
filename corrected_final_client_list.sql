-- CORRECTED FINAL CLIENT LIST SQL QUERY
-- Fixed: Using feature number 'FEATURE-27643' instead of full filename 'FEATURE-27643-Alpha-Opt_In'

WITH OptedOutContexts AS (
    SELECT DISTINCT
        TRY_CAST(oo.q2_practice_id AS VARCHAR) AS Context_ID
    FROM CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_Q_OPT_OUT_SURVEY_RESPONSES oo
    JOIN CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_OPT_IN_OUT_SURVEYS s
        ON oo.qualtrics_survey_id = s.qualtrics_survey_id
    WHERE
        oo.q7_opt_out_reason IS NOT NULL
        AND oo.q7_opt_out_reason != ''
        AND s.feature_number = 'FEATURE-27643'  -- FIXED: Use just feature number
        AND s.alpha_beta ILIKE '%Alpha%'
)

SELECT DISTINCT
    CAST(ur.insert_timestamp AS DATE) AS list_generation_date,
    SPLIT_PART(ur.file_name,'_',1) AS Feature,
    SPLIT_PART(ur.file_name,'_',2) AS Stage,
    TRIM(REGEXP_REPLACE(SPLIT_PART(ur.file_name,'_',3),'\\s*\\(([^)]*)\\)','')) AS Wave,
    cl."Context_ID",
    IFNULL(cl."CSM_Tier", cl.csm_tier) AS tier,
    IFNULL(cl."CS_Team", cl.cs_team) AS cs_team,
    IFNULL(cl."CSM_Name", cl.csm_name) AS csm_name,
    IFNULL(cl."Alpha_Beta_Status", cl.alpha_beta_status) AS alpha_beta_status,
    IFNULL(cl."Opt_In_Out", cl.optin_out) AS test_type,
    oi.q3_opt_in_choice AS opt_in,
    oo.q7_opt_out_reason AS opt_out
FROM CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_USER_REQUESTS ur
JOIN CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_CLIENT_LIST cl
    ON SPLIT_PART(ur.file_name,'_',1) = SPLIT_PART(cl.feature_key,'_',1)
    AND SPLIT_PART(ur.file_name,'_',2) = SPLIT_PART(cl.feature_key,'_',2)
    AND TRIM(REGEXP_REPLACE(SPLIT_PART(ur.file_name,'_',3),'\\s*\\(([^)]*)\\)',''))
        = TRIM(REGEXP_REPLACE(SPLIT_PART(cl.feature_key,'_',3),'\\s*\\(([^)]*)\\)',''))
LEFT JOIN CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_OPT_IN_OUT_SURVEYS s
    ON s.feature_number = SPLIT_PART(ur.file_name,'_',1)  -- FIXED: This will now be 'FEATURE-27643'
    AND s.alpha_beta = SPLIT_PART(ur.file_name,'_',2)
LEFT JOIN CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_Q_OPT_IN_SURVEY_RESPONSES oi
    ON oi.qualtrics_survey_id = s.qualtrics_survey_id
    AND TRY_CAST(oi.q4_practice_id AS VARCHAR) = TRY_CAST(cl."Context_ID" AS VARCHAR)
LEFT JOIN CORPANALYTICS_BUSINESS_PROD.SCRATCHPAD_PRDPF.CR_Q_OPT_OUT_SURVEY_RESPONSES oo
    ON oo.qualtrics_survey_id = s.qualtrics_survey_id
    AND TRY_CAST(oo.q2_practice_id AS VARCHAR) = TRY_CAST(cl."Context_ID" AS VARCHAR)
WHERE 
    SPLIT_PART(ur.file_name,'_',1) = 'FEATURE-27643'  -- FIXED: Use just feature number
    AND SPLIT_PART(ur.file_name,'_',2) ILIKE '%Alpha%'
    AND SPLIT_PART(ur.file_name,'_',3) LIKE '1%'
    AND (
        (IFNULL(cl."Opt_In_Out", cl.optin_out) ILIKE '%in%' AND oi.q3_opt_in_choice = 1)
        OR (IFNULL(cl."Opt_In_Out", cl.optin_out) ILIKE '%out%' AND (
            (LOWER(IFNULL(cl."Alpha_Beta_Status", cl.alpha_beta_status))
                NOT ILIKE 'csm sends alpha/beta invites'
             AND cl."Context_ID" NOT IN (SELECT Context_ID FROM OptedOutContexts))
            OR (LOWER(IFNULL(cl."Alpha_Beta_Status", cl.alpha_beta_status))
                ILIKE 'csm sends alpha/beta invites'
             AND oi.q3_opt_in_choice = 1)
        ))
    );
