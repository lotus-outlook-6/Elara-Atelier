/**
 * Vercel Serverless handler source exporting the shared Elara Atelier Express app.
 * Compiled to CommonJS api/index.js inside api/ (with api/package.json type commonjs)
 * so Express runs cleanly on Vercel without ESM/CJS dynamic require errors.
 */

import type { Request, Response } from 'express';
import { createExpressApp } from './createApp';

const { app } = createExpressApp();

/**
 * Vercel Node Serverless request handler delegating directly to the Express application.
 * Inputs: HTTP Request and Response objects.
 * Output: handled HTTP response via Express middleware stack.
 */
export default function handler(req: Request, res: Response): void {
  app(req, res);
}
