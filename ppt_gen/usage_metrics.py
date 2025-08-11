#!/usr/bin/env python
"""
Usage metrics tracking for PowerPoint generation app.
Logs user interactions to a Snowflake table for analytics.
"""

from __future__ import annotations
import logging
from datetime import datetime
import socket
import getpass
import traceback
import pandas as pd

# Use the new dbUtils module that matches Ask Amy's approach
from dbUtils import execute_snowflake_query

# Database configuration
DATABASE = "CORPANALYTICS_BUSINESS_PROD"
SCHEMA = "SCRATCHPAD_PRDPF"

# Table name for usage metrics
USAGE_TABLE = "PPT_GENERATE_USAGE"

# Create table SQL
CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {DATABASE}.{SCHEMA}.{USAGE_TABLE} (
    USAGE_ID NUMBER IDENTITY,
    USERNAME VARCHAR(255),
    TEMPLATE_NAME VARCHAR(255),
    ERROR_MESSAGE VARCHAR(4000),
    TIMESTAMP TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    HOSTNAME VARCHAR(255),
    STATUS VARCHAR(50),
    FEATURE_KEYS VARCHAR(16777216)
)
"""

# SQL for inserting usage metrics
INSERT_USAGE_SQL = f"""
INSERT INTO {DATABASE}.{SCHEMA}.{USAGE_TABLE}
(USERNAME, TEMPLATE_NAME, ERROR_MESSAGE, HOSTNAME, STATUS, FEATURE_KEYS)
VALUES (%s, %s, %s, %s, %s, %s)
"""

logger = logging.getLogger(__name__)

def ensure_table_exists():
    """Ensure the usage metrics table exists in Snowflake."""
    try:
        # First check if the table exists
        check_table_sql = f"SHOW TABLES LIKE '{USAGE_TABLE}' IN {DATABASE}.{SCHEMA}"
        results = execute_snowflake_query(check_table_sql)
        
        if not results:
            # Table doesn't exist, create it
            execute_snowflake_query(CREATE_TABLE_SQL)
            logger.info(f"Created {USAGE_TABLE} table in Snowflake")
        else:
            # Table exists, check if it has the expected columns
            columns_sql = f"DESC TABLE {DATABASE}.{SCHEMA}.{USAGE_TABLE}"
            columns = execute_snowflake_query(columns_sql)
            
            # Convert to lowercase for case-insensitive comparison
            column_names = [col.get('name', '').lower() for col in columns]
            
            # If FEATURE_KEYS column doesn't exist, add it
            if 'feature_keys' not in column_names:
                alter_sql = f"ALTER TABLE {DATABASE}.{SCHEMA}.{USAGE_TABLE} ADD COLUMN FEATURE_KEYS VARCHAR(16777216)"
                execute_snowflake_query(alter_sql)
                logger.info(f"Added missing FEATURE_KEYS column to {USAGE_TABLE} table")
                
        logger.info(f"Ensured {USAGE_TABLE} table exists with all required columns")
    except Exception as e:
        logger.error(f"Error ensuring table exists: {e}")
        logger.error(traceback.format_exc())

def log_usage(template_name, error_message=None, status="SUCCESS", feature_keys=None):
    """
    Log usage metrics to Snowflake.
    
    Parameters:
    -----------
    template_name : str
        Name of the PowerPoint template used
    error_message : str, optional
        Error message if any occurred during generation
    status : str, optional
        Status of the operation ("SUCCESS", "ERROR", etc.)
    feature_keys : list, optional
        List of feature keys used in the generation
    """
    try:
        # Get username and hostname
        username = getpass.getuser()
        hostname = socket.gethostname()
        
        # Convert feature keys to a comma-separated string if provided
        feature_keys_str = ",".join(feature_keys) if feature_keys else None

        execute_snowflake_query(INSERT_USAGE_SQL, [
            username,
            template_name,
            error_message if error_message else "",
            hostname,
            status,
            feature_keys_str
        ])
        logger.info(f"Logged usage metrics for user {username} using template {template_name}")
    except Exception as e:
        # Log the error but don't raise - we don't want to break the app if metrics logging fails
        logger.error(f"Error logging usage metrics: {e}")
        logger.error(traceback.format_exc())

# Initialize the table on module import
try:
    ensure_table_exists()
except Exception as e:
    logger.error(f"Failed to initialize usage metrics table: {e}")
