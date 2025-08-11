"""
Configuration for pytest to ensure proper module imports.
This file is automatically discovered by pytest and runs before tests.
"""

import os
import sys
from pathlib import Path


# Add backend directory to Python path for imports
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Also add project root to Python path (for absolute imports)
project_root = backend_dir.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Debug output to help diagnose import issues
print(f"Python path updated in conftest.py:")
print(f"Backend dir: {backend_dir}")
print(f"Project root: {project_root}")
print(f"sys.path: {sys.path}")
