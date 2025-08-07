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

// Deduplication storage
const pendingWebhooks = new Map(); // key -> { payload, timeout, lastUpdated }
const DEDUPE_DELAY_MS = 15 * 1000; // 15 seconds

// Generate a deduplication key from the webhook data
function generateDedupeKey(body, event) {
  // Use resourceIds if available, otherwise fall back to a hash of the body
  const resourceIds = body?.resourceIds;
  if (resourceIds && Array.isArray(resourceIds) && resourceIds.length > 0) {
    return `${event}-${resourceIds.sort().join(',')}`;
  }
  
  // Fallback: create a simple hash from the stringified body
  const bodyStr = JSON.stringify(body);
  let hash = 0;
  for (let i = 0; i < bodyStr.length; i++) {
    const char = bodyStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `${event}-${hash}`;
}

// Forward webhook to all configured URLs
async function forwardWebhook(payload, originalEvent) {
  console.log('=== FORWARDING WEBHOOK ===');
  console.log('Event:', originalEvent);
  console.log('Resource IDs:', payload?.resourceIds || '[MISSING]');

  const results = [];
  for (const url of forwardUrls) {
    try {
      const resp = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      console.log('[FORWARDED] Forwarded to ' + url + ': ' + resp.status);
      results.push({ url, status: resp.status });
    } catch (err) {
      console.error('[ERROR] Error forwarding to ' + url + ':', err.message);
      results.push({ url, error: err.message });
    }
  }
  return results;
}

// Root redirect to health
app.get('/', (req, res) => res.redirect('/health'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    pendingWebhooks: pendingWebhooks.size
  });
});

// Webhook dispatcher endpoint with deduplication
app.post('/webhook/deal-update', async (req, res) => {
  console.log('=== WEBHOOK RECEIVED ===');
  console.log('[HEADERS]', JSON.stringify(req.headers, null, 2));
  console.log('[BODY]', JSON.stringify(req.body, null, 2));

  const receivedEvent = req.get('X-Event') || 'undefined';
  const finalEvent = receivedEvent !== 'undefined' ? receivedEvent : 'dealsUpdated';
  
  const payload = {
    ...req.body,
    event: finalEvent
  };

  // Generate deduplication key
  const dedupeKey = generateDedupeKey(req.body, finalEvent);
  console.log('[DEDUPE] Key:', dedupeKey);

  // Check if we have a pending webhook for this key
  const existing = pendingWebhooks.get(dedupeKey);
  
  if (existing) {
    // Clear the existing timeout
    clearTimeout(existing.timeout);
    console.log('[DEDUPE] Cancelled previous webhook, updating with new data');
  }

  // Set up new timeout to forward after delay
  const timeout = setTimeout(async () => {
    console.log('[DEDUPE] Timeout reached, forwarding webhook for key:', dedupeKey);
    
    const webhookData = pendingWebhooks.get(dedupeKey);
    if (webhookData) {
      pendingWebhooks.delete(dedupeKey);
      await forwardWebhook(webhookData.payload, finalEvent);
    }
  }, DEDUPE_DELAY_MS);

  // Store the webhook data with timeout
  pendingWebhooks.set(dedupeKey, {
    payload,
    timeout,
    lastUpdated: new Date()
  });

  console.log('[DEDUPE] Webhook queued, will forward in', DEDUPE_DELAY_MS / 1000, 'seconds');
  console.log('[DEDUPE] Currently pending:', pendingWebhooks.size, 'webhooks');

  // Respond immediately to acknowledge receipt
  res.json({ 
    status: 'queued',
    dedupeKey,
    willForwardIn: DEDUPE_DELAY_MS / 1000 + ' seconds',
    pendingCount: pendingWebhooks.size
  });
});

// Debug endpoint to see pending webhooks
app.get('/debug/pending', (req, res) => {
  const pending = Array.from(pendingWebhooks.entries()).map(([key, data]) => ({
    key,
    lastUpdated: data.lastUpdated,
    resourceIds: data.payload?.resourceIds
  }));
  
  res.json({
    count: pending.length,
    webhooks: pending
  });
});

// Catch-all route for rogue hits
app.all('*', (req, res) => {
  console.log('[DEBUG] Unknown route hit:', req.method, req.originalUrl);
  res.status(404).send('Not found');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('[READY] Webhook dispatcher with deduplication running on port ' + PORT));