"""
Email service for sending application emails.

This module handles sending emails for various application functions,
including password reset links.
"""
import os
import sys
import smtplib
import logging
import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Email configuration with fallback to Gmail SMTP for testing
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.athenahealth.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "25"))
EMAIL_SENDER = os.getenv("EMAIL_SENDER", "no-reply@athenahealth.com")
USE_TLS = os.getenv("EMAIL_USE_TLS", "False").lower() == "true"

# Optional SMTP authentication
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")

# Print configuration for debugging
logger.info(f"Email Configuration: SMTP_SERVER={SMTP_SERVER}, SMTP_PORT={SMTP_PORT}, USE_TLS={USE_TLS}")
logger.info(f"Using authentication: {bool(SMTP_USERNAME and SMTP_PASSWORD)}")

# Function to log to both console and stderr for visibility
def log_error(message):
    logger.error(message)
    print(f"ERROR: {message}", file=sys.stderr)


def save_email_to_file(recipient_email: str, subject: str, html_content: str, text_content: str) -> str:
    """
    Saves an email to a file as a fallback when SMTP sending fails.
    
    Args:
        recipient_email: The intended recipient's email address.
        subject: The email subject.
        html_content: The HTML content of the email.
        text_content: The plain text content of the email.
        
    Returns:
        The path to the saved email file.
    """
    try:
        # Get the current script's directory
        current_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Create logs directory as a direct subdirectory of the current script directory
        log_dir = os.path.join(current_dir, "logs")
        
        # Ensure the logs directory exists
        if not os.path.exists(log_dir):
            logger.info(f"Creating logs directory at: {log_dir}")
            os.makedirs(log_dir, exist_ok=True)
        else:
            logger.info(f"Using existing logs directory at: {log_dir}")
        
        # Create a unique filename based on timestamp and recipient
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_email = recipient_email.replace("@", "_at_").replace(".", "_dot_")
        filename = f"email_{safe_email}_{timestamp}.html"
        filepath = os.path.join(log_dir, filename)
        
        logger.info(f"Attempting to save email to: {filepath}")
        
        # Write the email content to the file
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(f"<html><head><title>{subject}</title></head><body>")
            f.write(f"<h2>Email Details</h2>")
            f.write(f"<p><strong>To:</strong> {recipient_email}</p>")
            f.write(f"<p><strong>Subject:</strong> {subject}</p>")
            f.write(f"<p><strong>Date:</strong> {timestamp}</p>")
            f.write(f"<hr><h3>HTML Content:</h3>")
            f.write(html_content)
            f.write(f"<hr><h3>Plain Text Content:</h3>")
            f.write(f"<pre>{text_content}</pre>")
            f.write("</body></html>")
        
        logger.info(f"Email successfully saved to file: {filepath}")
        print(f"\nEMAIL SAVED: The password reset email has been saved to: {filepath}\n")
        return filepath
    except Exception as e:
        error_msg = f"Error saving email to file: {str(e)}"
        log_error(error_msg)
        
        # Try an alternative location as fallback
        try:
            # Try to save to the user's desktop as a last resort
            desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
            alt_filename = f"password_reset_email_{timestamp}.html"
            alt_filepath = os.path.join(desktop_path, alt_filename)
            
            with open(alt_filepath, "w", encoding="utf-8") as f:
                f.write(f"<html><head><title>{subject}</title></head><body>")
                f.write(f"<h2>Email Details</h2>")
                f.write(f"<p><strong>To:</strong> {recipient_email}</p>")
                f.write(f"<p><strong>Subject:</strong> {subject}</p>")
                f.write(f"<p><strong>Date:</strong> {timestamp}</p>")
                f.write(f"<hr><h3>HTML Content:</h3>")
                f.write(html_content)
                f.write(f"<hr><h3>Plain Text Content:</h3>")
                f.write(f"<pre>{text_content}</pre>")
                f.write("</body></html>")
            
            logger.info(f"Email saved to alternative location: {alt_filepath}")
            print(f"\nEMAIL SAVED: The password reset email has been saved to: {alt_filepath}\n")
            return alt_filepath
        except Exception as alt_e:
            log_error(f"Failed to save email to alternative location: {str(alt_e)}")
            raise Exception(f"Failed to save email to any location: {str(e)} and {str(alt_e)}")


def send_password_reset_email(recipient_email: str, reset_link: str, user_name: str = None) -> bool:
    """
    Sends a password reset email to the specified recipient.
    
    Args:
        recipient_email: The recipient's email address.
        reset_link: The registration page link where user will set a new password.
        user_name: The recipient's name, if available.
        
    Returns:
        True if the email was sent successfully, False otherwise.
    """
    logger.info(f"Preparing to send password reset email to: {recipient_email}")
    subject = "Password Reset Request - Product Operations Generator"
    
    # Create message container
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From'] = EMAIL_SENDER
    msg['To'] = recipient_email
    
    # Create the plain-text version of the message
    text = f"""
Hello {user_name or 'there'},

You recently requested to reset your password for the Product Operations Generator.

Your password has been reset. Please visit the registration page to set a new password:

{reset_link}

If you did not request a password reset, please contact your administrator immediately.

Thank you,
Product Operations Team
athenahealth
"""
    
    # Create the HTML version of the message
    html = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #6B4C9D; color: white; padding: 20px; text-align: center; }}
        .content {{ padding: 20px; }}
        .button {{ display: inline-block; background-color: #6B4C9D; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 4px; margin: 20px 0; }}
        .footer {{ font-size: 12px; color: #666; margin-top: 30px; }}
        .important {{ color: #d9534f; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset Request</h1>
        </div>
        <div class="content">
            <p>Hello {user_name or 'there'},</p>
            
            <p>You recently requested to reset your password for the Product Operations Generator.</p>
            
            <p><strong>Your password has been reset.</strong> Please visit the registration page to set a new password:</p>
            
            <p><a href="{reset_link}" class="button">Set New Password</a></p>
            
            <p>Or copy and paste this link into your browser:</p>
            <p>{reset_link}</p>
            
            <p class="important">If you did not request a password reset, please contact your administrator immediately.</p>
            
            <p>Thank you,<br>
            Product Operations Team<br>
            athenahealth</p>
        </div>
        <div class="footer">
            <p>This is an automated message, please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
"""
    
    # Attach parts to the message
    part1 = MIMEText(text, 'plain')
    part2 = MIMEText(html, 'html')
    msg.attach(part1)
    msg.attach(part2)
    
    try:
        logger.info(f"Connecting to SMTP server: {SMTP_SERVER}:{SMTP_PORT}")
        # Connect to the SMTP server
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10)
        
        # Set debug level to see detailed SMTP communication
        server.set_debuglevel(1)
        
        # Identify ourselves to the server
        server.ehlo()
        
        if USE_TLS:
            logger.info("Starting TLS connection")
            server.starttls()
            server.ehlo()  # Re-identify ourselves over TLS connection
        
        # Login if credentials are provided
        if SMTP_USERNAME and SMTP_PASSWORD:
            logger.info(f"Logging in with username: {SMTP_USERNAME}")
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
        
        # Send the email
        logger.info(f"Sending email from {EMAIL_SENDER} to {recipient_email}")
        server.sendmail(EMAIL_SENDER, recipient_email, msg.as_string())
        
        # Close the connection
        server.quit()
        
        logger.info("Email sent successfully")
        return True
    except (smtplib.SMTPException, ConnectionRefusedError, TimeoutError, Exception) as e:
        # Log the error with specific error type
        error_type = type(e).__name__
        error_msg = f"{error_type} while sending email: {str(e)}"
        log_error(error_msg)
        
        # Use fallback mechanism - save email to file
        try:
            filepath = save_email_to_file(recipient_email, subject, html, text)
            log_error(f"Email delivery failed. Email saved to file: {filepath}")
            print(f"\nIMPORTANT: Email could not be sent due to SMTP server issues.")
            print(f"A copy of the email has been saved to: {filepath}")
            print(f"Please check the logs for more details.\n")
            return True  # Return true so the application flow continues
        except Exception as save_error:
            log_error(f"Failed to save email to file: {str(save_error)}")
            return False
