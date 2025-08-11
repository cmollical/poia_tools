from flask_login import UserMixin

class User(UserMixin):
    """User model for Flask-Login."""

    def __init__(self, user_data: dict):
        self.id = user_data.get("USERNAME")
        self.password_hash = user_data.get("PASSWORD_HASH")
        self.is_active_user = user_data.get("IS_ACTIVE", False)
        self.first_name = user_data.get("FIRST_NAME")

    @property
    def is_active(self):
        """
        Flask-Login requires an is_active property.
        This is based on the IS_ACTIVE flag from the database.
        """
        return self.is_active_user
