import React from 'react';
import EnterpriseWorkflow from './components/EnterpriseWorkflow';
import './components/EnterpriseWorkflow.css';

/**
 * AI-Driven Project Management Suite
 * Enterprise Workflow App
 * 
 * The legacy workflow has been completely removed.
 * Only the Enterprise workflow is available now.
 */
function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <EnterpriseWorkflow 
        onComplete={(results) => {
          console.log('Enterprise workflow completed:', results);
          // Show success message
          if (results && results.length > 0) {
            const successMsg = results.map(r => `${r.type || 'Item'}: ${r.title || r.summary || 'Created'} (${r.key || 'N/A'})`).join('\n');
            alert('Successfully created!\n\n' + successMsg);
          } else {
            alert('Workflow completed successfully!');
          }
        }}
      />
    </div>
  );
}

export default App;
