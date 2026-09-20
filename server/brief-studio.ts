import { z } from 'zod';
import { requireAdmin } from './admin.js';
import { HttpError, type ApiInput } from './agent.js';
const Action = z.discriminatedUnion('action', [
 z.object({ action: z.literal('start'), sessionId: z.uuid(), requestId: z.uuid() }).strict(),
 z.object({ action: z.literal('list'), sessionId: z.uuid(), cursor: z.uuid().optional() }).strict(),
 z.object({ action: z.literal('get'), runId: z.uuid() }).strict(),
 z.object({ action: z.literal('review'), runId: z.uuid(), briefHash: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(['approve','reject']) }).strict(),
 z.object({ action: z.literal('export'), runId: z.uuid(), format: z.enum(['json','markdown']) }).strict(),
]);
export async function adminBriefRuns(input: ApiInput) {
 await requireAdmin(input);
 const action = Action.parse(input.body);
 const base = process.env.BRIEF_STUDIO_URL;
 if (!base) throw new HttpError(503, 'Brief Studio nie jest jeszcze skonfigurowane.');
 const url = new URL(base);
 if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname) && process.env.NODE_ENV !== 'production')) throw new HttpError(503, 'Nieprawidłowy adres Brief Studio.');
 let path: string; let body: object | undefined;
 if (action.action === 'start') { path = '/runs'; body = { sessionId: action.sessionId, requestId: action.requestId }; }
 else if (action.action === 'list') path = `/runs?sessionId=${action.sessionId}${action.cursor ? `&cursor=${action.cursor}` : ''}`;
 else { path = `/runs/${action.runId}${action.action === 'get' ? '' : '/' + action.action}`; if (action.action === 'review') body = { briefHash: action.briefHash, decision: action.decision }; if (action.action === 'export') body = { format: action.format }; }
 const response = await fetch(new URL(path, url), { method: body ? 'POST' : 'GET', headers: { Authorization: input.authorization!, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000), redirect: 'error' });
 const payload = await response.json();
 if (!response.ok) throw new HttpError(response.status, `Brief Studio: ${payload.error ?? 'request_failed'}`);
 return payload;
}
