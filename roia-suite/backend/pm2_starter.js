/**
 * PM2 starter script for ROIA-Suite backend
 * This script uses child_process.spawn to run Python with the virtual environment
 */
const { spawn } = require('child_process');
const path = require('path');

// Define paths
const pythonPath = path.resolve('C:/poia_tools/roia-suite/backend/venv/Scripts/python.exe');
const scriptPath = path.resolve('C:/poia_tools/roia-suite/backend/start_backend.py');

console.log('Starting ROIA-Suite backend with Python path:', pythonPath);
console.log('Script path:', scriptPath);

// Spawn the Python process
const pythonProcess = spawn(pythonPath, [scriptPath], {
  stdio: 'inherit',
  cwd: path.resolve('C:/poia_tools/roia-suite/backend')
});

// Handle process events
pythonProcess.on('error', (err) => {
  console.error('Failed to start Python process:', err);
  process.exit(1);
});

pythonProcess.on('close', (code) => {
  console.log(`Python process exited with code ${code}`);
  process.exit(code);
});
