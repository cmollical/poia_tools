const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8001;
const IP = '10.4.74.143';

// Serve static files (like the index.html and any CSS/JS)
app.use(express.static(path.join(__dirname)));

// Route for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server
app.listen(PORT, IP, () => {
    console.log(`POIA Tools landing page server running at http://${IP}:${PORT}`);
});
