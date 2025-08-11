"""Enhanced Flask app to generate SQL via athenaGPT, execute in Snowflake, and download Excel.
Run:
    python web_sql_tester.py
Then open http://10.4.74.143:3001 in your browser.
Requires Flask and enhanced dependencies (`pip install flask pandas snowflake-connector-python openpyxl`).
"""
import os
import json
from pathlib import Path
from typing import Dict
from datetime import datetime

from flask import Flask, render_template_string, request, jsonify, send_file

# ensure local import
import sys
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from query_generator import generate_sql  # noqa: E402
from query_executor import QueryRunner  # noqa: E402

app = Flask(__name__)

# Create outputs directory
OUTPUTS_DIR = ROOT / "outputs"
OUTPUTS_DIR.mkdir(exist_ok=True)

HTML_TMPL = """
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Alpha/Beta SQL Generator & Executor</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:40px;max-width:1000px}
    textarea{width:100%;height:150px;font-family:monospace}
    pre{background:#f4f4f4;padding:10px;border:1px solid #ccc;white-space:pre-wrap;font-family:monospace}
    button{padding:8px 16px;font-size:16px;margin:5px}
    .primary{background:#007bff;color:white;border:none;border-radius:4px}
    .secondary{background:#6c757d;color:white;border:none;border-radius:4px}
    .success{background:#28a745;color:white;border:none;border-radius:4px}
    .error{color:#dc3545;background:#f8d7da;padding:10px;border:1px solid #f5c6cb;border-radius:4px}
    .success-msg{color:#155724;background:#d4edda;padding:10px;border:1px solid #c3e6cb;border-radius:4px}
    .loading{color:#856404;background:#fff3cd;padding:10px;border:1px solid #ffeaa7;border-radius:4px}
    .history{max-height:400px;overflow-y:auto;background:#f8f9fa;padding:10px;border-radius:4px}
    .history-item{border-bottom:1px solid #dee2e6;padding:10px 0}
    .hidden{display:none}
    .example-btn{background:#f8f9fa;border:1px solid #dee2e6;padding:5px 10px;margin:2px;border-radius:3px;cursor:pointer;font-size:12px}
    .example-btn:hover{background:#e9ecef}
  </style>
</head>
<body>
  <h2>🚀 Alpha/Beta SQL Generator & Executor</h2>
  <p>Generate SQL from natural language, execute in Snowflake, and download Excel results.</p>
  
  <!-- Main Input -->
  <textarea id="prompt" placeholder="e.g. Give me 100 contexts including: 123, 456, 789"></textarea><br><br>
  
  <!-- Options -->
  <label><input type="checkbox" id="verbose"> Show conversation history</label><br>
  <label>Custom filename: <input type="text" id="filename" placeholder="(optional - leave blank for auto-generated)"></label><br><br>
  
  <!-- Action Buttons -->
  <button class="secondary" onclick="generateOnly()">🔍 Generate SQL Only</button>
  <button class="primary" onclick="generateAndExecute()">🚀 Generate & Execute</button>
  <button class="success hidden" id="download-btn" onclick="downloadFile()">📥 Download Excel</button>
  
  <!-- Status Messages -->
  <div id="status" class="hidden"></div>
  
  <!-- Generated SQL -->
  <h3>Generated SQL</h3>
  <pre id="sql"></pre>
  
  <!-- Execution Results -->
  <div id="results" class="hidden">
    <h3>🎯 Execution Results</h3>
    <div id="results-content"></div>
  </div>
  
  <!-- Execution History -->
  <div id="history-section" class="hidden">
    <h3>📈 Execution History</h3>
    <div id="history" class="history"></div>
  </div>

  <script>
    let currentDownloadUrl = null;
    let executionHistory = JSON.parse(localStorage.getItem('executionHistory') || '[]');
    
    // Update history display on page load
    window.addEventListener('load', updateHistoryDisplay);
    
    function showStatus(message, type = 'loading') {
      const statusDiv = document.getElementById('status');
      statusDiv.className = type;
      statusDiv.textContent = message;
      statusDiv.classList.remove('hidden');
    }
    
    function hideStatus() {
      document.getElementById('status').classList.add('hidden');
    }
    
    async function generateOnly() {
      const prompt = document.getElementById('prompt').value;
      const verbose = document.getElementById('verbose').checked;
      
      if (!prompt.trim()) {
        alert('Please enter a request');
        return;
      }
      
      showStatus('Generating SQL...');
      document.getElementById('sql').textContent = '... generating ...';
      
      try {
        const resp = await fetch('/generate', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({prompt, verbose})
        });
        
        const data = await resp.json();
        
        if (data.error) {
          document.getElementById('sql').textContent = 'Error: ' + data.error;
          showStatus('Generation failed', 'error');
        } else {
          document.getElementById('sql').textContent = data.sql;
          hideStatus();
        }
      } catch (e) {
        document.getElementById('sql').textContent = 'Error: ' + e.message;
        showStatus('Generation failed', 'error');
      }
    }
    
    async function generateAndExecute() {
      const prompt = document.getElementById('prompt').value;
      const verbose = document.getElementById('verbose').checked;
      const filename = document.getElementById('filename').value;
      
      if (!prompt.trim()) {
        alert('Please enter a request');
        return;
      }
      
      showStatus('Step 1/3: Generating SQL...', 'loading');
      document.getElementById('sql').textContent = '... generating and executing ...';
      document.getElementById('results').classList.add('hidden');
      document.getElementById('download-btn').classList.add('hidden');
      
      try {
        const resp = await fetch('/execute', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({prompt, verbose, filename})
        });
        
        const data = await resp.json();
        
        if (data.error) {
          document.getElementById('sql').textContent = 'Error: ' + data.error;
          showStatus('Execution failed', 'error');
          return;
        }
        
        // Show generated SQL
        document.getElementById('sql').textContent = data.sql;
        
        // Show results
        const resultsDiv = document.getElementById('results-content');
        resultsDiv.innerHTML = `
          <div class="success-msg">
            ✅ Successfully retrieved ${data.row_count} rows in ${data.execution_time}
          </div>
          <p><strong>Excel file:</strong> ${data.filename}</p>
          <p><strong>Generated on:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
        `;
        
        document.getElementById('results').classList.remove('hidden');
        
        // Set up download
        currentDownloadUrl = '/download/' + encodeURIComponent(data.filename);
        document.getElementById('download-btn').classList.remove('hidden');
        
        // Add to history
        executionHistory.unshift({
          timestamp: data.timestamp,
          request: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
          row_count: data.row_count,
          filename: data.filename,
          execution_time: data.execution_time
        });
        
        // Keep only last 10 entries
        executionHistory = executionHistory.slice(0, 10);
        localStorage.setItem('executionHistory', JSON.stringify(executionHistory));
        updateHistoryDisplay();
        
        showStatus('Execution completed successfully!', 'success-msg');
        
      } catch (e) {
        document.getElementById('sql').textContent = 'Error: ' + e.message;
        showStatus('Execution failed', 'error');
      }
    }
    
    function downloadFile() {
      if (currentDownloadUrl) {
        window.location.href = currentDownloadUrl;
      }
    }
    
    function updateHistoryDisplay() {
      const historyDiv = document.getElementById('history');
      
      if (executionHistory.length === 0) {
        document.getElementById('history-section').classList.add('hidden');
        return;
      }
      
      document.getElementById('history-section').classList.remove('hidden');
      
      historyDiv.innerHTML = executionHistory.map((entry, index) => `
        <div class="history-item">
          <strong>Run ${index + 1}</strong> - ${new Date(entry.timestamp).toLocaleString()}<br>
          <small>${entry.request}</small><br>
          <strong>${entry.row_count}</strong> rows in <strong>${entry.execution_time}</strong>
          <button class="example-btn" onclick="downloadHistoryFile('${entry.filename}')">📥 Download</button>
        </div>
      `).join('');
    }
    
    function downloadHistoryFile(filename) {
      window.location.href = '/download/' + encodeURIComponent(filename);
    }
  </script>
</body>
</html>
"""


@app.route('/')
def index():
    return render_template_string(HTML_TMPL)


@app.route('/generate', methods=['POST'])
def generate():
    """Generate SQL only."""
    data: Dict = request.get_json(force=True)
    prompt = data.get('prompt', '')
    verbose = bool(data.get('verbose'))
    
    try:
        sql = generate_sql(prompt, verbose=verbose)
        return jsonify({'sql': sql})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/execute', methods=['POST'])
def execute():
    """Generate SQL and execute in Snowflake."""
    data: Dict = request.get_json(force=True)
    prompt = data.get('prompt', '')
    verbose = bool(data.get('verbose'))
    filename = data.get('filename', '').strip() or None
    
    try:
        # Initialize runner
        runner = QueryRunner(output_dir=OUTPUTS_DIR)
        
        # Execute the complete workflow
        result = runner.run_query_request(
            prompt,
            filename=filename,
            verbose=verbose
        )
        
        if result['success']:
            return jsonify({
                'success': True,
                'sql': result['sql'],
                'row_count': result['row_count'],
                'filename': Path(result['excel_file']).name,
                'execution_time': result['execution_time'],
                'timestamp': result['timestamp']
            })
        else:
            return jsonify({'error': result['error']}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/download/<filename>')
def download(filename):
    """Download Excel file."""
    try:
        file_path = OUTPUTS_DIR / filename
        if not file_path.exists():
            return jsonify({'error': 'File not found'}), 404
            
        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print(f"Starting enhanced SQL Generator & Executor...")
    print(f"Outputs will be saved to: {OUTPUTS_DIR}")
    print(f"Open http://10.4.74.143:3001 in your browser")
    app.run(host="10.4.74.143", port=3001, debug=True)
