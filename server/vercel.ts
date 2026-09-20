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

export function endpoint(method: Method, action: (input: ApiInput) => unknown | Promise<unknown>) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    safeHeaders(res);
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
  };
}
