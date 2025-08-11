"""
Database utilities for Snowflake connections.
Similar to the successful Ask Amy implementation.
"""
import os
from typing import Dict, List, Optional, Union, Any
import snowflake.connector
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def build_connection_config() -> Dict[str, str]:
    """
    Builds the Snowflake connection configuration using environment variables.
    Similar to Ask Amy's buildConnectionString function.
    """
    snowflake_user = os.environ.get("SNOWFLAKE_USERNAME")
    snowflake_password = os.environ.get("SNOWFLAKE_PASSWORD")

    if not snowflake_user or not snowflake_password:
        print("CRITICAL ERROR: Missing SNOWFLAKE_USERNAME or SNOWFLAKE_PASSWORD environment variables!")
        raise ValueError("Server configuration error: Snowflake credentials are not set.")

    # Connection parameters
    return {
        "account": "athenahealth",
        "user": snowflake_user,
        "password": snowflake_password,
        "role": "CORPANALYTICS_BDB_PRDPF_PROD_RW",
        "warehouse": "CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD",
        "database": "CORPANALYTICS_BUSINESS_PROD",
        "schema": "SCRATCHPAD_PRDPF",
        "autocommit": True,
    }

def execute_snowflake_query(query: str, params: List = None) -> Any:
    """
    Executes a Snowflake query with optional parameters.
    Handles connection management similar to Ask Amy's executeSnowflakeQuery function.
    """
    params = params or []
    print(f"[DB Execute] Attempting query: {query[:150].replace(chr(10), ' ')}... Params: {params}")
    
    try:
        connection_config = build_connection_config()
        with snowflake.connector.connect(**connection_config) as conn:
            with conn.cursor(snowflake.connector.cursor.DictCursor) as cursor:
                cursor.execute(query, params)
                result = cursor.fetchall()
                print(f"[DB Execute] Query executed successfully. Rows: {len(result)}")
                return result
    except Exception as e:
        print(f"[DB Query Error] Failed Query: {query[:150].replace(chr(10), ' ')}...")
        print(f"[DB Query Error] Params: {params}")
        print(f"[DB Query Error] Error Message: {str(e)}")
        raise

# User authentication functions
USER_TABLE = "CR_APP_USERS"

def get_user_by_username(username: str) -> Optional[Dict]:
    """
    Retrieves a user from the database by username.
    """
    if not username:
        print("Warning: Empty username provided to get_user_by_username")
        return None
        
    print(f"Looking up user with username: '{username}'")
    
    # Try exact match first
    query = f"SELECT USERNAME, PASSWORD_HASH, IS_ACTIVE, FIRST_NAME FROM {USER_TABLE} WHERE LOWER(USERNAME) = %s"
    try:
        result = execute_snowflake_query(query, [username.lower()])
        if result and len(result) > 0:
            print(f"Found user with exact match: {result[0]['USERNAME']}")
            return result[0]
            
        # If not found and username contains @, try with just the username part
        if '@' in username:
            username_only = username.split('@')[0]
            print(f"Trying with username part only: '{username_only}'")
            result = execute_snowflake_query(query, [username_only.lower()])
            if result and len(result) > 0:
                print(f"Found user with username part: {result[0]['USERNAME']}")
                return result[0]
                
        # If still not found, try a more flexible search
        print(f"Trying flexible search for username: '{username}'")
        flex_query = f"SELECT USERNAME, PASSWORD_HASH, IS_ACTIVE, FIRST_NAME FROM {USER_TABLE} WHERE USERNAME ILIKE %s LIMIT 1"
        result = execute_snowflake_query(flex_query, [f"%{username.lower()}%"])
        if result and len(result) > 0:
            print(f"Found user with flexible match: {result[0]['USERNAME']}")
            return result[0]
            
        print(f"No user found for '{username}'")
        return None
    except Exception as e:
        print(f"Database error in get_user_by_username: {e}")
        return None

def update_user_last_login(username: str) -> None:
    """Updates the last login timestamp for a user."""
    query = f"UPDATE {USER_TABLE} SET LAST_LOGIN_TS = CURRENT_TIMESTAMP() WHERE LOWER(USERNAME) = %s"
    try:
        execute_snowflake_query(query, [username.lower()])
    except Exception as e:
        print(f"Database error in update_user_last_login: {e}")

def reset_user_password(username: str) -> bool:
    """Resets a user's password by setting it to NULL."""
    query = f"UPDATE {USER_TABLE} SET PASSWORD_HASH = NULL WHERE LOWER(USERNAME) = %s"
    try:
        execute_snowflake_query(query, [username.lower()])
        return True
    except Exception as e:
        print(f"Database error in reset_user_password: {e}")
        return False

def update_password(username: str, password_hash: str) -> bool:
    """Updates a user's password hash."""
    query = f"UPDATE {USER_TABLE} SET PASSWORD_HASH = %s WHERE LOWER(USERNAME) = %s"
    try:
        execute_snowflake_query(query, [password_hash, username.lower()])
        return True
    except Exception as e:
        print(f"Database error in update_password: {e}")
        return False
