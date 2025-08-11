/**
 * Startup script for the ROIA-Suite frontend service.
 * This script is used by PM2 to start the React development server.
 */
const { spawn } = require('child_process');
const path = require('path');

// Set the PORT environment variable
process.env.PORT = 8006;
process.env.REACT_APP_API_URL = 'http://localhost:8005';

// Start the React development server
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const reactStart = spawn(npmBin, ['start'], {
  cwd: __dirname,
  env: process.env,
  stdio: 'inherit'
});

reactStart.on('error', (err) => {
  console.error('Failed to start React development server:', err);
  process.exit(1);
});

console.log('React development server started on port 8006');
