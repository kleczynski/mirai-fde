import { createAdminInvitation, listAdminInvitations } from '../../server/admin.js';
import { endpoint } from '../../server/vercel.js';

export default async function handler(req: Parameters<ReturnType<typeof endpoint>>[0], res: Parameters<ReturnType<typeof endpoint>>[1]) {
  return endpoint(req.method === 'POST' ? 'POST' : 'GET', req.method === 'POST' ? createAdminInvitation : listAdminInvitations)(req, res);
}
