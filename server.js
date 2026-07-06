// ============================================================================
// Deployment Calendar — Express server entry point
// ============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');

// Import db module to trigger schema initialization on startup
require('./db');

// Import route modules
const eventsRouter = require('./routes/events');
const categoriesRouter = require('./routes/categories');
const itemsRouter = require('./routes/items');
const { startSlackSync } = require('./services/slackSync');

const app = express();

// ============================================================================
// Middleware
// ============================================================================
app.use(cors());
app.use(express.json());

// Serve static frontend assets from the public/ directory
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// API routes
// ============================================================================
app.use('/api/events', eventsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/items', itemsRouter);

// ============================================================================
// Catch-all: serve the frontend SPA for any non-API GET request
// ============================================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================================
// Start the server
// ============================================================================
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Deployment Calendar running at http://localhost:${port}`);

  // Start Slack sync if a bot token is configured
  startSlackSync();
});
