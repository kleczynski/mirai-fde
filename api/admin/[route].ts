// Vercel Hobby caps a deployment at 12 Serverless Functions. Every admin
// route used to be its own file; adding the hosted-demos endpoints pushed
// the project over that limit and broke production deploys (see git log:
// this exact consolidation existed once before, then was reverted together
// with the unrelated Brief Studio revert). This single dynamic function
// replaces all of them — vercel.json rewrites /api/admin/:route here.
import { createAdminInvitation, createAdminNote, deleteAdminSession, exportAdminSession, getAdminSession, listAdminInvitations, listAdminSessions } from '../../server/admin.js';
import { getHostedDemoDetail, listHostedDemos, markDemoFeedbackHandled, updateHostedDemo } from '../../server/demos.js';
import { checkAdminVoiceHealth } from '../../server/voice-health.js';
import { getAdminVoiceTrace } from '../../server/voice-trace.js';
import { endpoint, type VercelRequest, type VercelResponse } from '../../server/vercel.js';

const routes = new Map([
  ['sessions', endpoint('GET', listAdminSessions)],
  ['session', endpoint('POST', getAdminSession)],
  ['delete-session', endpoint('POST', deleteAdminSession)],
  ['session-note', endpoint('POST', createAdminNote)],
  ['session-export', endpoint('POST', exportAdminSession)],
  ['session-trace', endpoint('POST', getAdminVoiceTrace)],
  ['voice-health', endpoint('POST', checkAdminVoiceHealth)],
  ['hosted-demos', endpoint('GET', listHostedDemos)],
  ['hosted-demo-detail', endpoint('POST', getHostedDemoDetail)],
  ['hosted-demo-update', endpoint('POST', updateHostedDemo)],
  ['hosted-demo-feedback-handled', endpoint('POST', markDemoFeedbackHandled)],
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = url.pathname === '/api/admin/[route]' ? url.searchParams.get('route') : /^\/api\/admin\/([a-z-]+)$/.exec(url.pathname)?.[1];
  if (route === 'invitations') return endpoint(req.method === 'POST' ? 'POST' : 'GET', req.method === 'POST' ? createAdminInvitation : listAdminInvitations)(req, res);
  const action = route ? routes.get(route) : undefined;
  if (action) return action(req, res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(404).json({ error: 'Nieznana trasa admina.' });
}
