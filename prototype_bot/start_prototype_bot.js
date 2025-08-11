// PM2 startup script for HTML Prototype Bot
const { exec } = require('child_process');
const path = require('path');

// Path to the virtual environment's Python interpreter
const pythonPath = path.resolve(__dirname, 'prototype_env', 'Scripts', 'python.exe');
const scriptPath = path.resolve(__dirname, 'html_prototype_bot.py');

// Command to run Streamlit on port 8501 with VM IP address
const command = `"${pythonPath}" -m streamlit run "${scriptPath}" --server.port=8501 --server.address=10.4.74.143`;

// Execute the command
const process = exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
  }
  console.log(`stdout: ${stdout}`);
});

// Log the process output
process.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

process.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

process.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
});
