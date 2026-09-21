import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { HttpError, type ApiInput } from './agent.js';

type Method = 'GET' | 'POST';
export type VercelRequest = IncomingMessage & { body?: unknown };
export type VercelResponse = ServerResponse & {
  status(status: number): VercelResponse;
  json(body: unknown): VercelResponse;
};

function clientIp(req: VercelRequest): string | undefined {
  const forwarded = req.headers['x-vercel-forwarded-for'] ?? req.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(',')[0]?.trim() || req.socket.remoteAddress;
}

function safeHeaders(res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function requestBody(req: VercelRequest): unknown {
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(raw, 'utf8') > 16 * 1024) throw new HttpError(413, 'Żądanie jest zbyt duże.');
  if (typeof req.body !== 'string') return req.body ?? {};
  try { return JSON.parse(req.body); } catch { throw new HttpError(400, 'Niepoprawny JSON.'); }
}

async function run(req: VercelRequest, res: VercelResponse, method: Method, action: (input: ApiInput) => unknown | Promise<unknown>) {
  if (req.method !== method) {
    res.setHeader('Allow', method);
    return res.status(405).json({ error: 'Niedozwolona metoda.' });
  }
  try {
    const result = await action({
      authorization: req.headers.authorization,
      body: method === 'POST' ? requestBody(req) : {},
      query: method === 'GET' ? Object.fromEntries(new URL(req.url ?? '/', 'http://localhost').searchParams) : undefined,
      clientIp: clientIp(req),
    });
    return res.status(200).json(result);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 422 : 500;
    const message = error instanceof HttpError ? error.message : 'Nie udało się przetworzyć danych. Spróbuj ponownie.';
    return res.status(status).json({ error: message });
  }
}

export function endpoint(method: Method, action: (input: ApiInput) => unknown | Promise<unknown>) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    safeHeaders(res);
    return run(req, res, method, action);
  };
}

/**
 * For routes called cross-origin from a client demo's own domain (a separate
 * Cloudflare Worker per client), not from this app's own frontend. No
 * cookies/credentials are involved, so a wildcard origin is safe — the only
 * thing it can do is call this one narrow, rate-limited action.
 */
export function publicEndpoint(method: Method, action: (input: ApiInput) => unknown | Promise<unknown>) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    safeHeaders(res);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', `${method}, OPTIONS`);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return run(req, res, method, action);
  };
}
