require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Read comma-separated URLs from FORWARD_URLS env var
const forwardUrls = (process.env.FORWARD_URLS || '')
  .split(',')
  .map(u => u.trim())
  .filter(Boolean);

// Root redirect to health
app.get('/', (req, res) => res.redirect('/health'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Webhook dispatcher endpoint
app.post('/webhook/deal-update', async (req, res) => {
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('Event:', req.get('X-Event'));
  console.log('Resource IDs:', req.body.resourceIds);

  const results = [];
  for (const url of forwardUrls) {
    try {
      const resp = await axios.post(url, req.body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Event': 'dealsUpdated'
        }
      });
      console.log('[FORWARDED] Forwarded to ' + url + ': ' + resp.status);
      results.push({ url, status: resp.status });
    } catch (err) {
      console.error('[ERROR] Error forwarding to ' + url + ':', err.message);
      results.push({ url, error: err.message });
    }
  }
  res.json({ forwarded: results });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('[READY] Webhook dispatcher running on port ' + PORT));