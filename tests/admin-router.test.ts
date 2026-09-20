import { describe, expect, it } from 'vitest';
import handler from '../api/admin/[route]';
import type { VercelRequest, VercelResponse } from '../server/vercel';

async function request(path: string, method: string) {
 const state = { status: 0, body: undefined as unknown };
 const res = { setHeader: () => res, status: (status: number) => { state.status = status; return res; }, json: (body: unknown) => { state.body = body; return res; } } as unknown as VercelResponse;
 await handler({ url: path, method, headers: {}, socket: {}, body: { sessionId: crypto.randomUUID(), runId: crypto.randomUUID() } } as VercelRequest, res);
 return state;
}
describe('shared admin deployment adapter', () => {
 const routes = ['session', 'delete-session', 'session-note', 'session-export', 'session-trace', 'voice-health', 'brief-runs', 'invitations'];
 it.each(routes)('requires authorization for POST %s', async route => {
  expect((await request(`/api/admin/${route}`, 'POST')).status).toBe(401);
 });
 it.each(['sessions', 'invitations'])('requires authorization for GET %s', async route => {
  expect((await request(`/api/admin/${route}?limit=10`, 'GET')).status).toBe(401);
 });
 it.each(routes.filter(route => route !== 'invitations'))('rejects GET for %s', async route => {
  expect((await request(`/api/admin/${route}`, 'GET')).status).toBe(405);
 });
 it('does not route arbitrary names or nested paths or query overrides', async () => {
  for (const path of ['/api/admin/unknown', '/api/admin/session/extra', '/api/admin/unknown?route=session', '/api/admin/toString']) expect((await request(path, 'POST')).status).toBe(404);
 });
});
