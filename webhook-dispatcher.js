```javascript
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Webhook dispatcher endpoint
app.post('/webhook/deal-update', async (req, res) => {
  console.log('📥 Received webhook:', JSON.stringify(req.body));
  const results = [];
  for (const url of forwardUrls) {
    try {
      const resp = await axios.post(url, req.body, {
        headers: { 'Content-Type': 'application/json' }
      });
      console.log(`✅ Forwarded to ${url}: ${resp.status}`);
      results.push({ url, status: resp.status });
    } catch (err) {
      console.error(`❌ Error forwarding to ${url}:`, err.message);
      results.push({ url, error: err.message });
    }
  }
  res.json({ forwarded: results });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Webhook dispatcher running on port ${PORT}`));
```
