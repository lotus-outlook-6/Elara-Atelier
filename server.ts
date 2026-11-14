/**
 * Full-stack Express server entry point for Elara Atelier.
 * Serves Telegram Bot status/notification endpoints (/api/telegram/*) and mounts
 * Vite dev middleware in development or static dist assets in production on port 3000.
 */

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

interface TelegramNotifyBody {
  bookingId?: string;
  fullName?: string;
  phone?: string;
  treatmentName?: string;
  preferredDateTime?: string;
  telegramMethod?: string;
  telegramValue?: string;
  chatId?: string;
}

/**
 * Send a formatted consultation confirmation message via the Telegram Bot API.
 * Inputs: botToken, chatId, and formatted message text.
 * Output: boolean indicating whether Telegram accepted the message.
 */
async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });
  return response.ok;
}

/**
 * Escape HTML special characters for safe Telegram HTML parse_mode formatting.
 * Inputs: raw string.
 * Output: escaped string.
 */
function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Boot the Express application with Telegram API routes and Vite/static middleware.
 */
async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/telegram/status', (_req, res) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME?.trim() || 'ElaraAtelierBot').replace(
      /^@/,
      ''
    );
    res.json({
      botConfigured: Boolean(botToken),
      botUsername,
    });
  });

  app.post('/api/telegram/notify', async (req, res) => {
    const body = (req.body || {}) as TelegramNotifyBody;
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    const botUsername = (process.env.TELEGRAM_BOT_USERNAME?.trim() || 'ElaraAtelierBot').replace(
      /^@/,
      ''
    );
    const bookingId = String(body.bookingId || 'concierge').replace(/[^a-zA-Z0-9_-]/g, '');
    const deepLink = `https://t.me/${botUsername}?start=${bookingId || 'concierge'}`;

    if (!botToken) {
      res.json({
        ok: true,
        sent: false,
        mode: 'deep_link',
        deepLink,
        message: 'TELEGRAM_BOT_TOKEN not configured; deep link returned.',
      });
      return;
    }

    const recipientChatId =
      body.chatId?.trim() || process.env.TELEGRAM_CONCIERGE_CHAT_ID?.trim() || '';

    if (!recipientChatId) {
      res.json({
        ok: true,
        sent: false,
        mode: 'pending_bot_start',
        deepLink,
        message: 'Patient must press /start on the Telegram bot to register a chat ID.',
      });
      return;
    }

    const summary = [
      '<b>Elara Atelier — Consultation Request</b>',
      `<b>Reference:</b> ${escapeHtml(bookingId)}`,
      `<b>Patient:</b> ${escapeHtml(String(body.fullName || 'Guest'))}`,
      `<b>Treatment:</b> ${escapeHtml(String(body.treatmentName || 'Consultation'))}`,
      `<b>Requested Window:</b> ${escapeHtml(String(body.preferredDateTime || 'TBD'))}`,
      `<b>Phone:</b> ${escapeHtml(String(body.phone || 'N/A'))}`,
      `<b>Telegram (${escapeHtml(String(body.telegramMethod || 'username'))}):</b> ${escapeHtml(String(body.telegramValue || 'N/A'))}`,
      '',
      '<i>Modifications remain open in your Elara Atelier Profile for 4 hours.</i>',
    ].join('\n');

    try {
      const sent = await sendTelegramMessage(botToken, recipientChatId, summary);
      res.json({
        ok: true,
        sent,
        mode: sent ? 'bot_api' : 'deep_link',
        deepLink,
      });
    } catch {
      res.json({
        ok: true,
        sent: false,
        mode: 'deep_link',
        deepLink,
      });
    }
  });

  // Ready-to-connect Telegram Webhook receiver for /start <bookingId> handshakes
  app.post('/api/telegram/webhook', async (req, res) => {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
    const update = req.body as {
      message?: {
        chat?: { id?: number | string };
        from?: { username?: string; first_name?: string };
        text?: string;
      };
    };

    const chatId = update?.message?.chat?.id;
    const text = update?.message?.text || '';

    if (botToken && chatId && text.startsWith('/start')) {
      const payload = text.replace('/start', '').trim();
      const welcome = [
        '<b>Welcome to Elara Atelier Concierge</b>',
        payload
          ? `Your Telegram chat is now linked for reference <code>${escapeHtml(payload)}</code>.`
          : 'Your Telegram chat is ready to receive consultation confirmations and reminders.',
        'Hours: Mon–Sat · 10:00 AM – 7:00 PM · Beverly Hills.',
      ].join('\n');
      await sendTelegramMessage(botToken, String(chatId), welcome).catch(() => {});
    }

    res.json({ ok: true });
  });

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

void startServer();
