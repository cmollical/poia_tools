// JavaScript launcher for HTML Prototype Bot
const { spawn } = require('child_process');
const path = require('path');

console.log('Starting HTML Prototype Bot launcher...');

// Path to the batch file
const batchFilePath = path.join(__dirname, 'run_streamlit_with_venv.bat');

// Execute the batch file using cmd.exe
const process = spawn('cmd.exe', ['/c', batchFilePath], {
  stdio: 'inherit',
  cwd: __dirname,
  shell: true
});

console.log(`Started batch file: ${batchFilePath}`);

// Handle process events
process.on('error', (err) => {
  console.error(`Failed to start batch file: ${err}`);
});

process.on('exit', (code) => {
  console.log(`Batch file exited with code ${code}`);
  
  // If the process exits with an error, wait and restart
  if (code !== 0) {
    console.log('Restarting in 5 seconds...');
    setTimeout(() => {
      console.log('Restarting HTML Prototype Bot...');
      spawn('cmd.exe', ['/c', batchFilePath], {
        stdio: 'inherit',
        cwd: __dirname,
        shell: true
      });
    }, 5000);
  }
});

// Keep the Node.js process running
process.on('SIGINT', () => {
  console.log('Received SIGINT. Shutting down...');
  process.exit(0);
});

// Keep the script running
setInterval(() => {}, 1000);
