import express from 'express';
import { config } from '../config';
import { handleMessage } from '../bot/handlers';

export function createWebServer(): express.Application {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Simple web input form
  app.get('/', (_req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head><title>NEXUS Input</title>
<style>
  body { font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 0 20px; }
  textarea { width: 100%; height: 200px; margin: 10px 0; padding: 10px; font-size: 14px; }
  button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
  #result { white-space: pre-wrap; margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px; }
</style>
</head>
<body>
  <h1>NEXUS PE CRM</h1>
  <form id="form">
    <textarea id="msg" placeholder="Enter your message..."></textarea>
    <button type="submit">Send</button>
  </form>
  <div id="result"></div>
  <script>
    document.getElementById('form').onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById('msg').value;
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      const data = await res.json();
      document.getElementById('result').textContent = data.result;
    };
  </script>
</body>
</html>`);
  });

  // API endpoint for processing messages
  app.post('/api/message', async (req, res) => {
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    try {
      const result = await handleMessage(message, 0);
      res.json({ result });
    } catch (err) {
      console.error('[Web Error]', err);
      res.status(500).json({ error: 'Processing failed' });
    }
  });

  return app;
}
