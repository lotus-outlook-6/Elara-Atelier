/**
 * Vercel Serverless Function entry point routing all /api/* requests
 * to the shared Elara Atelier Express application without starting a long-lived listener.
 */

import type { Request, Response } from 'express';
import { createExpressApp } from '../src/server/createApp';

const { app } = createExpressApp();

/**
 * Vercel Node Serverless request handler delegating directly to the Express app.
 * Inputs: HTTP Request and Response objects.
 * Output: handled HTTP response via Express middleware stack.
 */
export default function handler(req: Request, res: Response): void {
  app(req, res);
}
