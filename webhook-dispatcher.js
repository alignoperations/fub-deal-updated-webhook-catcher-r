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

// Root redirect to health
app.get('/', (req, res) => res.redirect('/health'));

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

---

**.env** (for local development)
```dotenv
# Forward to your deal-sync automation and your contact-update service
FORWARD_URLS=https://fub-deal-updated-webhooks-b7ab93e8241f.herokuapp.com/webhook/deal-update,https://fub-deal-sync-automation-c2c7421809c1.herokuapp.com/webhook/deal-update
```

---

**Heroku CLI** (set config var and deploy)
```bash
# Push your code to Heroku
git push heroku main

# Configure your forwarding URLs on Heroku
heroku config:set \
  FORWARD_URLS="https://fub-deal-updated-webhooks-b7ab93e8241f.herokuapp.com/webhook/deal-update,https://fub-deal-sync-automation-c2c7421809c1.herokuapp.com/webhook/deal-update" \
  --app fub-deal-updated-webhooks-b7ab93e8241f

# Verify config vars
heroku config --app fub-deal-updated-webhooks-b7ab93e8241f
```

Now your dispatcher will listen at:
```
https://fub-deal-updated-webhooks-b7ab93e8241f.herokuapp.com/health
https://fub-deal-updated-webhooks-b7ab93e8241f.herokuapp.com/webhook/deal-update
```
