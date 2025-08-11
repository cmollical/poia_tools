import os
import secrets
import snowflake.connector
from dotenv import load_dotenv
from datetime import datetime, timedelta

# Load environment variables from .env file
load_dotenv()

# Snowflake configuration
SNOWFLAKE_CFG = dict(
    account="athenahealth",
    user="SVC_JIR_PROPS",
    password=os.getenv("SERVICE_PASS", ""),
    role="CORPANALYTICS_BDB_PRDPF_PROD_RW",
    warehouse="CORPANALYTICS_BDB_PRDPF_WH_READWRITE_PROD",
    database="CORPANALYTICS_BUSINESS_PROD",
    schema="SCRATCHPAD_PRDPF",
    autocommit=True,
)

USER_TABLE = "CR_APP_USERS"
RESET_TOKEN_TABLE = "CR_APP_PASSWORD_RESET_TOKENS"

def get_user_by_username(username: str) -> dict | None:
    """
    Retrieves a user from the database by their username.

    Args:
        username: The username to look up.

    Returns:
        A dictionary containing user data if found, otherwise None.
    """
    if not username:
        print("Warning: Empty username provided to get_user_by_username")
        return None
        
    # Print debug info
    print(f"Looking up user with username: '{username}'")
    
    # First try exact match
    query = f"SELECT USERNAME, PASSWORD_HASH, IS_ACTIVE, FIRST_NAME FROM {USER_TABLE} WHERE LOWER(USERNAME) = %s"
    try:
        with snowflake.connector.connect(**SNOWFLAKE_CFG) as conn:
            with conn.cursor(snowflake.connector.cursor.DictCursor) as cursor:
                cursor.execute(query, (username.lower(),))
                user_data = cursor.fetchone()
                if user_data:
                    print(f"Found user with exact match: {user_data['USERNAME']}")
                    return user_data
                    
                # If not found and username contains @, try with just the username part
                if '@' in username:
                    username_only = username.split('@')[0]
                    print(f"Trying with username part only: '{username_only}'")
                    cursor.execute(query, (username_only.lower(),))
                    user_data = cursor.fetchone()
                    if user_data:
                        print(f"Found user with username part: {user_data['USERNAME']}")
                        return user_data
                        
                # If still not found, try a more flexible search
                print(f"Trying flexible search for username: '{username}'")
                flex_query = f"SELECT USERNAME, PASSWORD_HASH, IS_ACTIVE, FIRST_NAME FROM {USER_TABLE} WHERE USERNAME ILIKE %s LIMIT 1"
                cursor.execute(flex_query, (f"%{username.lower()}%",))
                user_data = cursor.fetchone()
                if user_data:
                    print(f"Found user with flexible match: {user_data['USERNAME']}")
                    return user_data
                    
                print(f"No user found for '{username}'")
                return None
    except Exception as e:
        print(f"Database error in get_user_by_username: {e}")
        return None

def update_user_last_login(username: str):
    """
    Updates the last login timestamp for a user.

    Args:
        username: The username of the user to update.
    """
    query = f"UPDATE {USER_TABLE} SET LAST_LOGIN_TS = CURRENT_TIMESTAMP() WHERE LOWER(USERNAME) = %s"
    try:
        with snowflake.connector.connect(**SNOWFLAKE_CFG) as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (username.lower(),))
    except Exception as e:
        print(f"Database error in update_user_last_login: {e}")


def reset_user_password(username: str) -> bool:
    """
    Resets a user's password by setting it to NULL.
    
    Args:
        username: The username of the user to reset the password for.
        
    Returns:
        True if successful, False otherwise.
    """
    query = f"UPDATE {USER_TABLE} SET PASSWORD_HASH = NULL WHERE LOWER(USERNAME) = %s"
    try:
        with snowflake.connector.connect(**SNOWFLAKE_CFG) as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (username.lower(),))
        return True
    except Exception as e:
        print(f"Database error in reset_user_password: {e}")
        return False


def update_password(username: str, password_hash: str) -> bool:
    """
    Updates a user's password hash.
    
    Args:
        username: The username of the user to update.
        password_hash: The new password hash to set.
        
    Returns:
        True if successful, False otherwise.
    """
    query = f"UPDATE {USER_TABLE} SET PASSWORD_HASH = %s WHERE LOWER(USERNAME) = %s"
    
    try:
        with snowflake.connector.connect(**SNOWFLAKE_CFG) as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (password_hash, username.lower()))
        return True
    except Exception as e:
        print(f"Database error in update_password: {e}")
        return False


def create_password_reset_token(username: str) -> str | None:
    """
    Creates a password reset token for a user.
    
    Args:
        username: The username to create a token for.
        
    Returns:
        The generated token if successful, None otherwise.
    """
    # Verify user exists
    user = get_user_by_username(username)
    if not user:
        return None
        
    # Generate a secure token
    token = secrets.token_urlsafe(32)
    expiration = datetime.utcnow() + timedelta(hours=24)  # Token valid for 24 hours
    
    # Store token in database
    try:
        # First, invalidate any existing tokens for this user
        invalidate_query = f"UPDATE {RESET_TOKEN_TABLE} SET IS_VALID = FALSE WHERE LOWER(USERNAME) = %s"
        
        # Then insert the new token
        insert_query = f"""
        INSERT INTO {RESET_TOKEN_TABLE} 
        (USERNAME, TOKEN, EXPIRATION_TS, IS_VALID, CREATED_TS) 
        VALUES (%s, %s, %s, TRUE, CURRENT_TIMESTAMP())
        """
        
        with snowflake.connector.connect(**SNOWFLAKE_CFG) as conn:
            with conn.cursor() as cursor:
                # Invalidate existing tokens
                cursor.execute(invalidate_query, (username.lower(),))
                
                # Insert new token
                cursor.execute(insert_query, (
                    username.lower(),
                    token,
                    expiration.strftime("%Y-%m-%d %H:%M:%S")
                ))
                
        return token
    except Exception as e:
        print(f"Database error in create_password_reset_token: {e}")
        return None


def verify_reset_token(token: str) -> dict | None:
    """
    Verifies if a password reset token is valid.
    
    Args:
        token: The token to verify.
        
    Returns:
        User information if the token is valid, None otherwise.
    """
    query = f"""
    SELECT u.USERNAME, u.FIRST_NAME 
    FROM {RESET_TOKEN_TABLE} t 
    JOIN {USER_TABLE} u ON LOWER(t.USERNAME) = LOWER(u.USERNAME) 
    WHERE t.TOKEN = %s 
      AND t.IS_VALID = TRUE 
      AND t.EXPIRATION_TS > CURRENT_TIMESTAMP()
    """
    
    try:
        with snowflake.connector.connect(**SNOWFLAKE_CFG) as conn:
            with conn.cursor(snowflake.connector.cursor.DictCursor) as cursor:
                cursor.execute(query, (token,))
                result = cursor.fetchone()
                return result if result else None
    except Exception as e:
        print(f"Database error in verify_reset_token: {e}")
        return None


def invalidate_token(token: str) -> bool:
    """
    Invalidates a password reset token after it has been used.
    
    Args:
        token: The token to invalidate.
        
    Returns:
        True if successful, False otherwise.
    """
    query = f"UPDATE {RESET_TOKEN_TABLE} SET IS_VALID = FALSE WHERE TOKEN = %s"
    
    try:
        with snowflake.connector.connect(**SNOWFLAKE_CFG) as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (token,))
        return True
    except Exception as e:
        print(f"Database error in invalidate_token: {e}")
        return False


def update_password(username: str, password_hash: str) -> bool:
    """
    Updates a user's password hash.
    
    Args:
        username: The username of the user to update.
        password_hash: The new password hash to set.
        
    Returns:
        True if successful, False otherwise.
    """
    query = f"UPDATE {USER_TABLE} SET PASSWORD_HASH = %s WHERE LOWER(USERNAME) = %s"
    
    try:
        with snowflake.connector.connect(**SNOWFLAKE_CFG) as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, (password_hash, username.lower()))
        return True
    except Exception as e:
        print(f"Database error in update_password: {e}")
        return False
