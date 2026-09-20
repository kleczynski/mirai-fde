import { createAdminInvitation, listAdminInvitations, listAdminSessions, getAdminSession, deleteAdminSession, createAdminNote, exportAdminSession } from '../../server/admin.js';
import { getAdminVoiceTrace } from '../../server/voice-trace.js';
import { checkAdminVoiceHealth } from '../../server/voice-health.js';
import { adminBriefRuns } from '../../server/brief-studio.js';
import { endpoint, type VercelRequest, type VercelResponse } from '../../server/vercel.js';

const routes = new Map([
 ['sessions', endpoint('GET', listAdminSessions)],
 ['session', endpoint('POST', getAdminSession)],
 ['delete-session', endpoint('POST', deleteAdminSession)],
 ['session-note', endpoint('POST', createAdminNote)],
 ['session-export', endpoint('POST', exportAdminSession)],
 ['session-trace', endpoint('POST', getAdminVoiceTrace)],
 ['voice-health', endpoint('POST', checkAdminVoiceHealth)],
 ['brief-runs', endpoint('POST', adminBriefRuns)],
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
