/**
 * Full-stack Express server entry point for Elara Atelier (local Node & container hosting).
 * Mounts shared concierge/Telegram routes from createExpressApp, enables optional polling,
 * and serves Vite dev middleware or static dist assets on port 3000.
 */

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  createExpressApp,
  startTelegramPollingIfEnabled,
} from './src/server/createApp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

/**
 * Boot local/container Express server with Vite dev or static dist handler and optional Telegram polling.
 * Inputs: none.
 * Output: Promise resolving once HTTP listener is bound on PORT 3000.
 */
async function startServer(): Promise<void> {
  const { app, store, broadcastSyncEvents } = createExpressApp();

  startTelegramPollingIfEnabled(store, broadcastSyncEvents);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Elara Atelier server listening on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  void startServer();
}
