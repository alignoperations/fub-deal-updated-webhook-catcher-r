require('dotenv').config();
const express = require('express');
const axios = require('axios');

/**
 * Webhook Dispatcher Service
 * Receives FollowUpBoss webhooks and fans them out to multiple endpoints.
 *
 * Configuration via environment variable:
 * DISPATCH_ENDPOINTS - JSON array of URLs to forward to, e.g.
 *    '["https://service1/webhook", "https://service2/webhook"]'
 */

const app = express();
app.use(express.json());

// Parse list of endpoints from env
let endpoints = [];
try {
  const raw = process.env.DISPATCH_ENDPOINTS || '[]';
  endpoints = JSON.parse(raw);
  if (!Array.isArray(endpoints)) endpoints = [];
} catch (err) {
  console.error('🛑 Invalid DISPATCH_ENDPOINTS:', err.message);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), targets: endpoints });
});

// Main dispatcher endpoint
app.post('/webhook/deal-update', async (req, res) => {
  const payload = req.body;
  console.log('📥 Received payload, dispatching to', endpoints.length, 'endpoints');

  const results = await Promise.all(endpoints.map(async (url) => {
    try {
      await axios.post(url, payload, { timeout: 5000 });
      console.log(`🔀 Forwarded to ${url}`);
      return { url, status: 'ok' };
    } catch (err) {
      console.error(`❌ Failed to forward to ${url}:`, err.message);
      return { url, status: 'error', error: err.message };
    }
  }));

  res.json({ status: 'dispatched', results });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dispatcher listening on port ${PORT}`));
