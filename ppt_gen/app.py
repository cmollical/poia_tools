# c:\Users\jhazlett\athenahealth\R&D Operations Business Analytics - Documents\General\Active Python Scripts\PPT\app.py
import os
import sys
import uuid
import traceback
from datetime import datetime
import codecs

from flask import Flask, render_template, render_template_string, request, redirect, url_for, flash, send_file, Response, jsonify, session
import flask
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_bcrypt import Bcrypt
from email_service import send_password_reset_email
from werkzeug.utils import secure_filename
import jinja2
from jinja2 import FileSystemLoader

# Local imports
import dbUtils as database  # Using new dbUtils module that matches Ask Amy's approach
from auth import User
from usage_metrics import log_usage
from Boulder_by_pillar import boulder_by_pillar_build_deck, boulder_by_pillar_load_data
from DeepDiveSlideGeneration import timeframe_title_fix, parse_feature_keys, parse_release_codes, load_feature_keys_by_release

# --- App Initialization and Configuration ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
OUTPUT_FOLDER = os.path.join(BASE_DIR, "generated")
LOG_FOLDER = os.path.join(BASE_DIR, "logs")
TEMPLATE_FOLDER = os.path.join(BASE_DIR, "templates")
PPT_TEMPLATE_DIR = os.path.join(BASE_DIR, "ppt_templates")

# Custom template loader that handles different encodings
class MultiEncodingFileSystemLoader(FileSystemLoader):
    """A custom template loader that tries multiple encodings when loading template files."""
    
    def get_source(self, environment, template):
        # Try to get the template path
        for searchpath in self.searchpath:
            filepath = os.path.join(searchpath, template)
            if os.path.exists(filepath):
                # Try different encodings
                encodings = ['utf-8', 'latin-1', 'utf-16', 'cp1252']
                for encoding in encodings:
                    try:
                        with codecs.open(filepath, 'r', encoding=encoding) as f:
                            contents = f.read()
                        mtime = os.path.getmtime(filepath)
                        
                        def uptodate():
                            try:
                                return os.path.getmtime(filepath) == mtime
                            except OSError:
                                return False
                                
                        return contents, filepath, uptodate
                    except UnicodeDecodeError:
                        continue
                    except Exception as e:
                        app.logger.error(f"Error loading template {template} with encoding {encoding}: {e}")
                
                # If all encodings fail, try binary mode and decode manually
                try:
                    with open(filepath, 'rb') as f:
                        binary_content = f.read()
                    
                    # Check for UTF-16 BOM
                    if binary_content.startswith(b'\xff\xfe') or binary_content.startswith(b'\xfe\xff'):
                        contents = binary_content.decode('utf-16')
                    else:
                        # Try to decode with utf-8 and ignore errors
                        contents = binary_content.decode('utf-8', errors='ignore')
                    
                    mtime = os.path.getmtime(filepath)
                    
                    def uptodate():
                        try:
                            return os.path.getmtime(filepath) == mtime
                        except OSError:
                            return False
                            
                    return contents, filepath, uptodate
                except Exception as e:
                    app.logger.error(f"Failed to load template {template} in binary mode: {e}")
        
        # If we get here, the template wasn't found
        raise jinja2.exceptions.TemplateNotFound(template)

# Initialize Flask app with custom template loader
app = Flask(__name__, static_folder="static")
app.jinja_loader = MultiEncodingFileSystemLoader(TEMPLATE_FOLDER)
app.config.update(
    UPLOAD_FOLDER=UPLOAD_FOLDER,
    OUTPUT_FOLDER=OUTPUT_FOLDER,
    LOG_FOLDER=LOG_FOLDER,
    SECRET_KEY=os.getenv("FLASK_SECRET_KEY", "a-super-secret-dev-key-that-should-be-changed")
)

# Create runtime directories if they don't exist
for d in (UPLOAD_FOLDER, OUTPUT_FOLDER, PPT_TEMPLATE_DIR, LOG_FOLDER):
    os.makedirs(d, exist_ok=True)

# --- Authentication Setup ---
bcrypt = Bcrypt(app)
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'index'  # Redirect to index page with login modal
login_manager.login_message = 'Please log in to access this page.'
login_manager.login_message_category = 'info'

@login_manager.user_loader
def load_user(user_id):
    """Flask-Login user loader callback."""
    user_data = database.get_user_by_username(user_id)
    if user_data:
        user = User(user_data)
        if user.is_active:
            return user
    return None

# --- Helper Functions ---
def _list_predefined_templates():
    """Returns a list of available .pptx templates."""
    try:
        return [f for f in os.listdir(PPT_TEMPLATE_DIR) if f.endswith('.pptx')]
    except FileNotFoundError:
        return []

def create_user_log(template_type: str, template_name: str, feature_keys: list | None = None):
    """Creates a user-specific log file for a generation event."""
    try:
        username = current_user.id if current_user.is_authenticated else "anonymous"
        timestamp_file = datetime.now().strftime('%Y%m%d%H%M')
        log_filename = f"{username}_{template_type}_ppt_{timestamp_file}.log"
        log_filepath = os.path.join(app.config["LOG_FOLDER"], log_filename)
        
        with open(log_filepath, 'w') as f:
            f.write(f"Presentation generated by: {username}\n")
            f.write(f"Template: {template_name}\n")
            f.write(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            if feature_keys:
                f.write(f"Feature Keys: {', '.join(feature_keys)}\n")
        
        app.logger.info(f"Successfully created user log: {log_filepath}")

    except Exception as e:
        error_message = f"CRITICAL: Failed to create user log file. Error: {e}"
        print(error_message, file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        flash(f"Warning: The presentation was generated, but the usage log could not be created. Details: {e}", "warning")
        app.logger.error(error_message)

# --- Generation Handlers ---
def handle_boulder_generation(template_path):
    """Handles the logic for generating the Boulder presentation."""
    try:
        boulders, features = boulder_by_pillar_load_data()
        output_filename = f"Boulder_Executive_Update_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pptx"
        output_path = os.path.join(app.config["OUTPUT_FOLDER"], output_filename)
        boulder_by_pillar_build_deck(template_path, output_path, boulders, features)
        
        log_usage(template_name=os.path.basename(template_path), status="SUCCESS")
        create_user_log("boulder", os.path.basename(template_path))
        
        response = send_file(output_path, as_attachment=True)
        response.set_cookie('fileDownload', 'true', max_age=20, path='/')
        return response
    except Exception as exc:
        app.logger.error(f"An unexpected error occurred during Boulder generation: {exc}")
        traceback.print_exc(file=sys.stderr)
        flash(f"A critical error occurred during Boulder presentation generation: {exc}", 'error')
        return redirect(url_for('index'))

def handle_deep_dive_generation(template_path):
    """Handles the logic for generating the Deep Dive presentation."""
    try:
        feature_keys_input = request.form.get('feature_keys', "").strip()
        release_codes_input = request.form.get('release_codes', "").strip()
        feature_keys = []

        if release_codes_input:
            release_codes = parse_release_codes(release_codes_input)
            if release_codes:
                feature_keys = load_feature_keys_by_release(release_codes)
        elif feature_keys_input:
            feature_keys = parse_feature_keys(feature_keys_input)

        if not feature_keys:
            flash("No features found. Please check your Feature Keys or Release Codes.", 'error')
            return redirect(url_for('index'))

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"{os.path.basename(template_path).replace('.pptx', '')}_{timestamp}_{str(uuid.uuid4())[:8]}.pptx"
        output_path = os.path.join(app.config["OUTPUT_FOLDER"], output_filename)

        timeframe_title_fix(template_path, output_path, feature_keys)
        
        log_usage(template_name=os.path.basename(template_path), status="SUCCESS", feature_keys=feature_keys)
        create_user_log("deepdive", os.path.basename(template_path), feature_keys)
        
        response = send_file(output_path, as_attachment=True)
        response.set_cookie('fileDownload', 'true', max_age=20, path='/')
        return response
    except Exception as e:
        error_message = f"An unexpected error occurred during Deep Dive generation: {e}"
        app.logger.error(error_message)
        traceback.print_exc(file=sys.stderr)
        flash(error_message, 'error')
        return redirect(url_for('index'))

# --- Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    # Check if user is authenticated
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        # Log the login attempt for debugging
        app.logger.info(f"Login attempt for username: {username}")
        
        user_data = database.get_user_by_username(username)
        
        if user_data:
            user = User(user_data)
            app.logger.info(f"User found: {user.id}, Active: {user.is_active}, Has password: {bool(user.password_hash)}")
            
            # Special handling for NULL passwords (reset case)
            if user.password_hash is None:
                app.logger.warning(f"User {user.id} has NULL password_hash - password reset needed")
                flash(f"Please set a new password for account: {user.id}", 'info')
                # Store username in session for the register page
                session['reset_username'] = user.id
                return redirect(url_for('register'))
            
            # Debug password verification
            try:
                password_match = bcrypt.check_password_hash(user.password_hash, password)
                app.logger.info(f"Password verification result: {password_match}")
                
                if user.is_active and password_match:
                    login_user(user)
                    database.update_user_last_login(user.id)
                    app.logger.info(f"Successful login for user: {user.id}")
                    
                    # Clear any force_password_change flag if it exists
                    if 'force_password_change' in session:
                        app.logger.info(f"Clearing force_password_change flag for user {user.id}")
                        session.pop('force_password_change', None)
                    
                    # Check if the request is AJAX (from modal)
                    if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                        return jsonify(success=True)
                    else:
                        return redirect(url_for('index'))
                else:
                    error_msg = "Invalid username or password"
                    app.logger.warning(f"Failed login attempt for {username}: incorrect password")
            except Exception as e:
                app.logger.error(f"Error during password verification: {str(e)}")
                error_msg = "An error occurred during login. Please try again."
        else:
            error_msg = "Invalid username or password"
            app.logger.warning(f"Failed login attempt: username {username} not found")
        
        # Handle login failure
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return jsonify(success=False, message=error_msg)
        else:
            flash(error_msg, 'error')
            return redirect(url_for('login'))
    
    # For GET requests, check if we should render the full page or just return for the modal
    if request.args.get('modal') == 'true':
        return render_template('login_modal.html')
    else:
        # Render the index page with a flag to show the login modal
        presets = _list_predefined_templates()
        return render_template('index.html', templates=presets, selected_template=None, show_login=True)

@app.route('/logout')
@login_required
def logout():
    logout_user()
    flash('You have been logged out.', 'info')
    return redirect(url_for('login'))


@app.route('/change-password', methods=['GET', 'POST'])
@login_required
def change_password():
    """Handle password change requests"""
    # Check if this is a forced password change (from temporary password)
    force_change = session.get('force_password_change', False)
    app.logger.info(f"Change password page accessed. Force change: {force_change}")
    
    if request.method == 'POST':
        current_password = request.form.get('current_password')
        new_password = request.form.get('new_password')
        confirm_password = request.form.get('confirm_password')
        
        # Validate inputs
        if not current_password or not new_password or not confirm_password:
            flash('All fields are required.', 'error')
            return render_template_string(change_password_template, force_change=force_change)
            
        if new_password != confirm_password:
            flash('New passwords do not match.', 'error')
            return render_template_string(change_password_template, force_change=force_change)
            
        # Validate password complexity
        if len(new_password) < 8:
            flash('Password must be at least 8 characters long.', 'error')
            return render_template_string(change_password_template, force_change=force_change)
            
        if not any(c.isupper() for c in new_password):
            flash('Password must contain at least one uppercase letter.', 'error')
            return render_template_string(change_password_template, force_change=force_change)
            
        if not any(c.islower() for c in new_password):
            flash('Password must contain at least one lowercase letter.', 'error')
            return render_template_string(change_password_template, force_change=force_change)
            
        if not any(c.isdigit() for c in new_password):
            flash('Password must contain at least one number.', 'error')
            return render_template_string(change_password_template, force_change=force_change)
            
        if not any(c in '!@#$%^&*' for c in new_password):
            flash('Password must contain at least one special character (!@#$%^&*).', 'error')
            return render_template_string(change_password_template, force_change=force_change)
        
        # Get current user data
        user_data = database.get_user_by_username(current_user.id)
        
        if not user_data:
            flash('User not found.', 'error')
            return render_template_string(change_password_template, force_change=force_change)
            
        user = User(user_data)
        
        # Verify current password
        if not bcrypt.check_password_hash(user.password_hash, current_password):
            flash('Current password is incorrect.', 'error')
            return render_template_string(change_password_template, force_change=force_change)
            
        # Hash the new password
        hashed_password = bcrypt.generate_password_hash(new_password).decode('utf-8')
        
        # Update password in database
        if database.update_password(current_user.id, hashed_password):
            # Clear the force_password_change flag if it exists
            if 'force_password_change' in session:
                app.logger.info(f"Clearing force_password_change flag for user {current_user.id}")
                session.pop('force_password_change', None)
                
            flash('Your password has been updated successfully.', 'success')
            return redirect(url_for('index'))
        else:
            flash('An error occurred while updating your password.', 'error')
            return render_template_string(change_password_template, force_change=force_change)
    
    return render_template_string(change_password_template, force_change=force_change)

# Inline template for change password page
change_password_template = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Change Password - Product Operations Generator</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">
    <link href="https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            /* Official athenahealth colors */
            --primary: #006BA6;        /* athena blue - primary color */
            --primary-light: #B6DCF2;  /* athena light blue */
            --primary-dark: #004E7C;   /* athena dark blue */
            --purple: #3F2A56;         /* athena purple */
            --purple-light: #65328A;   /* lighter purple */
            --secondary: #56C7A4;      /* athena teal */
            --secondary-light: #D0F0E7; /* light teal */
            --green: #6CC04A;          /* athena green */
            --accent: #FF6F61;         /* coral accent */
            --accent-light: #FFB7B0;   /* light coral */
            --gold: #FFBD4F;           /* gold accent */
            --text: #333333;           /* text color */
            --text-light: #666666;     /* secondary text */
            --background: #F5F5F5;     /* light background */
            --white: #FFFFFF;          /* white */
            --danger: #F9423A;         /* error red */
            --success: #56C7A4;        /* success teal */
            --border-radius: 3px;      /* border radius */
            --shadow: 0 1px 3px rgba(0, 0, 0, 0.1); /* shadow */
            --transition: all 0.2s ease; /* transition */
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: 'Source Sans Pro', sans-serif;
            background-color: var(--background);
            color: var(--text);
            line-height: 1.5;
            padding: 0;
            margin: 0;
            font-size: 16px;
            font-weight: 400;
        }
        
        .container {
            max-width: 500px;
            margin: 2rem auto;
            padding: 2rem;
        }
        
        .card {
            background-color: var(--white);
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
            padding: 2rem;
        }
        
        .card-header {
            background-color: var(--purple);
            margin: -2rem -2rem 2rem -2rem;
            padding: 1.5rem 2rem;
            color: white;
            border-top-left-radius: var(--border-radius);
            border-top-right-radius: var(--border-radius);
        }
        
        .card-header h1 {
            font-size: 1.5rem;
            margin: 0;
            display: flex;
            align-items: center;
        }
        
        .card-header h1 i {
            margin-right: 0.75rem;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
        }
        
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
        }
        
        input[type="password"] {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #ced4da;
            border-radius: var(--border-radius);
            font-size: 1rem;
            transition: border-color 0.2s;
        }
        
        input[type="password"]:focus {
            border-color: var(--purple);
            outline: none;
            box-shadow: 0 0 0 3px rgba(107, 76, 157, 0.25);
        }
        
        .btn {
            display: inline-block;
            font-weight: 500;
            text-align: center;
            white-space: nowrap;
            vertical-align: middle;
            user-select: none;
            border: 1px solid transparent;
            padding: 0.75rem 1.5rem;
            font-size: 1rem;
            line-height: 1.5;
            border-radius: var(--border-radius);
            transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
            cursor: pointer;
        }
        
        .btn-primary {
            color: #fff;
            background-color: var(--purple);
            border-color: var(--purple);
        }
        
        .btn-primary:hover {
            background-color: var(--purple-light);
            border-color: var(--purple-light);
        }
        
        .btn-block {
            display: block;
            width: 100%;
        }
        
        .flash-message {
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: var(--border-radius);
            display: flex;
            align-items: center;
        }
        
        .flash-icon {
            margin-right: 0.75rem;
            font-size: 1.25rem;
        }
        
        .success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .info {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        
        .warning {
            background-color: #fff3cd;
            color: #856404;
            border: 1px solid #ffeeba;
        }
        
        .back-link {
            display: inline-block;
            margin-top: 1rem;
            color: var(--purple);
            text-decoration: none;
            font-weight: 500;
        }
        
        .back-link:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="card-header">
                <h1><i class="fas fa-key"></i> Change Password</h1>
            </div>
            
            {% with messages = get_flashed_messages(with_categories=true) %}
                {% if messages %}
                    {% for category, message in messages %}
                        <div class="flash-message {{ category }}">
                            <i class="fas fa-exclamation-circle flash-icon"></i>
                            <span>{{ message }}</span>
                        </div>
                    {% endfor %}
                {% endif %}
            {% endwith %}
            
            {% if force_change %}
            <div class="flash-message warning">
                <i class="fas fa-exclamation-triangle flash-icon"></i>
                <span>You must change your password before continuing.</span>
            </div>
            {% endif %}
            
            <form method="POST" action="{{ url_for('change_password') }}">
                <div class="form-group">
                    <label for="current_password">Current Password</label>
                    <input type="password" id="current_password" name="current_password" required autofocus>
                </div>
                
                <div class="form-group">
                    <label for="new_password">New Password</label>
                    <input type="password" id="new_password" name="new_password" required>
                </div>
                
                <div class="form-group">
                    <label for="confirm_password">Confirm New Password</label>
                    <input type="password" id="confirm_password" name="confirm_password" required>
                </div>
                
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="fas fa-save"></i> Change Password
                </button>
            </form>
            
            <a href="{{ url_for('index') }}" class="back-link">
                <i class="fas fa-arrow-left"></i> Back to Home
            </a>
        </div>
    </div>
</body>
</html>
'''

@app.route('/reset-password', methods=['GET', 'POST'])
def reset_request():
    """Handle password reset requests with a simplified approach"""
    # If user is already logged in, redirect to home
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    if request.method == 'POST':
        email = request.form.get('email')
        if not email:
            flash('Email is required.', 'error')
            return render_template('reset_request.html')
        
        # Log the email being searched for debugging
        app.logger.info(f"Attempting to reset password for email: {email}")
        
        # Try multiple approaches to find the user
        # First try exact match with email
        user = database.get_user_by_username(email)
        
        # If not found, try username without domain
        if not user and '@' in email:
            username = email.split('@')[0]
            app.logger.info(f"Email not found, trying username: {username}")
            user = database.get_user_by_username(username)
        
        # Log the result for debugging
        if user:
            app.logger.info(f"User found: {user.get('USERNAME')}")
            actual_username = user.get('USERNAME')
            
            # Set the password_hash to NULL in the database
            if database.reset_user_password(actual_username):
                flash('Your password has been reset. Please click the link below to set a new password.', 'success')
                app.logger.info(f"Password reset successful for {actual_username}")
                return render_template('reset_request.html', reset_success=True, username=actual_username)
            else:
                flash('An error occurred while resetting your password. Please try again later.', 'error')
                app.logger.error(f"Failed to reset password for {email}")
        else:
            # Don't reveal that the user doesn't exist for security reasons
            app.logger.info(f"No user found for {email}")
            flash('If the email exists in our system, a password reset link will be provided.', 'info')
        
    return render_template('reset_request.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    """Handle new user registration or password reset for existing users"""
    # If user is already logged in, redirect to home
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    # Check if username is provided in the URL (from reset password flow)
    username_param = request.args.get('username')
    if username_param:
        # Store the username in session
        session['reset_username'] = username_param
    
    # Check if we have a reset username from session
    reset_username = session.get('reset_username')
    
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        
        # Validate inputs
        if not username or not password or not confirm_password:
            flash('All fields are required.', 'error')
            return render_template('reset_confirm.html', username=reset_username)
            
        if password != confirm_password:
            flash('Passwords do not match.', 'error')
            return render_template('reset_confirm.html', username=reset_username)
            
        # Validate password complexity
        if len(password) < 8:
            flash('Password must be at least 8 characters long.', 'error')
            return render_template('reset_confirm.html', username=reset_username)
            
        if not any(c.isupper() for c in password):
            flash('Password must contain at least one uppercase letter.', 'error')
            return render_template('reset_confirm.html', username=reset_username)
            
        if not any(c.islower() for c in password):
            flash('Password must contain at least one lowercase letter.', 'error')
            return render_template('reset_confirm.html', username=reset_username)
            
        if not any(c.isdigit() for c in password):
            flash('Password must contain at least one number.', 'error')
            return render_template('reset_confirm.html', username=reset_username)
            
        if not any(c in '!@#$%^&*' for c in password):
            flash('Password must contain at least one special character (!@#$%^&*).', 'error')
            return render_template('reset_confirm.html', username=reset_username)
        
        # Check if the user exists
        user_data = database.get_user_by_username(username)
        
        if user_data:
            # User exists, update their password
            hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
            if database.update_password(username, hashed_password):
                # Clear the reset_username from session if it exists
                if 'reset_username' in session:
                    session.pop('reset_username', None)
                
                flash('Your password has been updated successfully. You can now log in.', 'success')
                return redirect(url_for('login'))
            else:
                flash('An error occurred while updating your password.', 'error')
                return render_template('reset_confirm.html', username=reset_username)
        else:
            flash('User not found.', 'error')
            return render_template('reset_confirm.html', username=reset_username)
    
    return render_template('reset_confirm.html', username=reset_username)

@app.route('/', methods=['GET'])
def index():
    # Check if user is authenticated
    if not current_user.is_authenticated:
        # If not authenticated, show the index page with login modal
        presets = _list_predefined_templates()
        return render_template("index.html", templates=presets, selected_template=None, show_login=True)
    
    # If authenticated, clear any password change flags and show the normal index page
    if 'force_password_change' in session:
        app.logger.info(f"Clearing force_password_change flag for user {current_user.id}")
        session.pop('force_password_change', None)
    
    # Clear any flash messages related to password changes
    session.pop('_flashes', None)
    
    # If authenticated, show the normal index page
    presets = _list_predefined_templates()
    return render_template("index.html", templates=presets, selected_template=None, show_login=False)

@app.route('/generate', methods=['POST'])
@login_required
def generate():
    selected_template = request.form.get("predefined_template", "")
    if not selected_template:
        flash("Please choose a template from the dropdown.", 'warning')
        return redirect(url_for('index'))

    template_path = os.path.join(PPT_TEMPLATE_DIR, selected_template)
    if not os.path.isfile(template_path):
        flash(f"Template file '{selected_template}' not found.", 'error')
        return redirect(url_for('index'))

    # Route to the correct generation handler based on template name
    if "boulder" in selected_template.lower():
        return handle_boulder_generation(template_path)
    elif "deep_dive" in selected_template.lower():
        return handle_deep_dive_generation(template_path)
    else:
        flash(f"No generation logic defined for template: {selected_template}", 'error')
        return redirect(url_for('index'))

@app.route('/export', methods=['POST'])
@login_required
def export_data():
    """Handle data export to Excel with multiple sheets."""
    feature_keys_input = request.form.get('feature_keys', "").strip()
    release_codes_input = request.form.get('release_codes', "").strip()

    feature_keys = []
    if release_codes_input:
        release_codes = parse_release_codes(release_codes_input)
        if release_codes:
            feature_keys = load_feature_keys_by_release(release_codes)
    elif feature_keys_input:
        feature_keys = parse_feature_keys(feature_keys_input)

    if not feature_keys:
        flash("No features found for the given input. Please enter valid Feature Keys or Release Codes to export.", 'error')
        return redirect(url_for('index'))

    # Fetch the full data for the feature keys
    from DeepDiveSlideGeneration import load_feature_data
    feature_data = load_feature_data(feature_keys)

    if feature_data.empty:
        flash("Could not retrieve data for the selected features.", 'error')
        return redirect(url_for('index'))

    # Create a simplified version with just Feature number, PO, and PO Email
    simplified_data = feature_data[['FEATURE_KEY', 'PO', 'PO_EMAIL']].copy()
    
    # Create Excel file with multiple sheets in memory
    from io import BytesIO
    import pandas as pd
    
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Sheet 1: All data
        feature_data.to_excel(writer, sheet_name='All Data', index=False)
        
        # Sheet 2: Simplified data (Feature, PO, PO Email)
        simplified_data.to_excel(writer, sheet_name='Feature PO Info', index=False)
    
    output.seek(0)

    # Set the appropriate headers for Excel file
    response = Response(
        output.getvalue(),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment;filename=feature_export.xlsx"}
    )
    response.set_cookie('fileDownload', 'true', max_age=20, path='/')
    return response

@app.route('/generate-change-password-template')
def generate_change_password_template():
    """Temporary route to generate a new change_password.html file with proper UTF-8 encoding"""
    change_password_html = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Change Password - Product Operations Generator</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">
    <link href="https://fonts.googleapis.com/css2?family=Source+Sans+Pro:wght@300;400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            /* Official athenahealth colors */
            --primary: #006BA6;        /* athena blue - primary color */
            --primary-light: #B6DCF2;  /* athena light blue */
            --primary-dark: #004E7C;   /* athena dark blue */
            --purple: #3F2A56;         /* athena purple */
            --purple-light: #65328A;   /* lighter purple */
            --secondary: #56C7A4;      /* athena teal */
            --secondary-light: #D0F0E7; /* light teal */
            --green: #6CC04A;          /* athena green */
            --accent: #FF6F61;         /* coral accent */
            --accent-light: #FFB7B0;   /* light coral */
            --gold: #FFBD4F;           /* gold accent */
            --text: #333333;           /* text color */
            --text-light: #666666;     /* secondary text */
            --background: #F5F5F5;     /* light background */
            --white: #FFFFFF;          /* white */
            --danger: #F9423A;         /* error red */
            --success: #56C7A4;        /* success teal */
            --border-radius: 3px;      /* border radius */
            --shadow: 0 1px 3px rgba(0, 0, 0, 0.1); /* shadow */
            --transition: all 0.2s ease; /* transition */
        }
        
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        body {
            font-family: 'Source Sans Pro', sans-serif;
            background-color: var(--background);
            color: var(--text);
            line-height: 1.5;
            padding: 0;
            margin: 0;
            font-size: 16px;
            font-weight: 400;
        }
        
        .container {
            max-width: 500px;
            margin: 2rem auto;
            padding: 2rem;
        }
        
        .card {
            background-color: var(--white);
            border-radius: var(--border-radius);
            box-shadow: var(--shadow);
            padding: 2rem;
        }
        
        .card-header {
            background-color: var(--purple);
            margin: -2rem -2rem 2rem -2rem;
            padding: 1.5rem 2rem;
            color: white;
            border-top-left-radius: var(--border-radius);
            border-top-right-radius: var(--border-radius);
        }
        
        .card-header h1 {
            font-size: 1.5rem;
            margin: 0;
            display: flex;
            align-items: center;
        }
        
        .card-header h1 i {
            margin-right: 0.75rem;
        }
        
        .form-group {
            margin-bottom: 1.5rem;
        }
        
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 500;
        }
        
        input[type="password"] {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #ced4da;
            border-radius: var(--border-radius);
            font-size: 1rem;
            transition: border-color 0.2s;
        }
        
        input[type="password"]:focus {
            border-color: var(--purple);
            outline: none;
            box-shadow: 0 0 0 3px rgba(107, 76, 157, 0.25);
        }
        
        .btn {
            display: inline-block;
            font-weight: 500;
            text-align: center;
            white-space: nowrap;
            vertical-align: middle;
            user-select: none;
            border: 1px solid transparent;
            padding: 0.75rem 1.5rem;
            font-size: 1rem;
            line-height: 1.5;
            border-radius: var(--border-radius);
            transition: color 0.15s ease-in-out, background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
            cursor: pointer;
        }
        
        .btn-primary {
            color: #fff;
            background-color: var(--purple);
            border-color: var(--purple);
        }
        
        .btn-primary:hover {
            background-color: var(--purple-light);
            border-color: var(--purple-light);
        }
        
        .btn-block {
            display: block;
            width: 100%;
        }
        
        .flash-message {
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: var(--border-radius);
            display: flex;
            align-items: center;
        }
        
        .flash-icon {
            margin-right: 0.75rem;
            font-size: 1.25rem;
        }
        
        .success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .info {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        
        .back-link {
            display: inline-block;
            margin-top: 1rem;
            color: var(--purple);
            text-decoration: none;
            font-weight: 500;
        }
        
        .back-link:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="card-header">
                <h1><i class="fas fa-key"></i> Change Password</h1>
            </div>
            
            {% with messages = get_flashed_messages(with_categories=true) %}
                {% if messages %}
                    {% for category, message in messages %}
                        <div class="flash-message {{ category }}">
                            <i class="fas fa-exclamation-circle flash-icon"></i>
                            <span>{{ message }}</span>
                        </div>
                    {% endfor %}
                {% endif %}
            {% endwith %}
            
            {% if force_change %}
            <div class="flash-message warning">
                <i class="fas fa-exclamation-triangle flash-icon"></i>
                <span>You must change your password before continuing.</span>
            </div>
            {% endif %}
            
            <form method="POST" action="{{ url_for('change_password') }}">
                <div class="form-group">
                    <label for="current_password">Current Password</label>
                    <input type="password" id="current_password" name="current_password" required autofocus>
                </div>
                
                <div class="form-group">
                    <label for="new_password">New Password</label>
                    <input type="password" id="new_password" name="new_password" required>
                </div>
                
                <div class="form-group">
                    <label for="confirm_password">Confirm New Password</label>
                    <input type="password" id="confirm_password" name="confirm_password" required>
                </div>
                
                <button type="submit" class="btn btn-primary btn-block">
                    <i class="fas fa-save"></i> Change Password
                </button>
            </form>
            
            <a href="{{ url_for('index') }}" class="back-link">
                <i class="fas fa-arrow-left"></i> Back to Home
            </a>
        </div>
    </div>
</body>
</html>
'''
    
    # Write the template to the file
    try:
        template_path = os.path.join(TEMPLATE_FOLDER, 'change_password.html')
        with open(template_path, 'w', encoding='utf-8') as f:
            f.write(change_password_html)
        return f"Template created successfully at {template_path}"
    except Exception as e:
        return f"Error creating template: {str(e)}"

if __name__ == '__main__':
    # Display server information
    print("\n * Serving Flask app 'app'")
    print(" * Debug mode: on")
    print(" * Running on specific address (10.4.74.143)")
    print(" * Running on http://10.4.74.143:8000")
    print(" * Environment: development")
    
    # Run the Flask application
    app.run(debug=True, host='10.4.74.143', port=8000)
