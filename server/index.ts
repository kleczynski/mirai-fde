import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createVoiceSession, extractInterview, getRuntimeConfig, HttpError, recordVoiceTelemetry } from './agent.js';
import { confirmAdminSession, createAdminInvitation, createAdminNote, deleteAdminInvitation, deleteAdminSession, exportAdminSession, generateAdminDemoPrompt, getAdminSession, listAdminInvitations, listAdminSessions, retryAdminExtraction, updateAdminSessionStatus } from './admin.js';
import { getHostedDemoDetail, listHostedDemos, markDemoFeedbackHandled, submitDemoFeedback, updateHostedDemo } from './demos.js';
import { getAdminVoiceTrace } from './voice-trace.js';
import { checkAdminVoiceHealth } from './voice-health.js';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });
app.get('/api/config', (_req, res) => res.json(getRuntimeConfig()));
app.post('/api/voice/token', async (req, res) => {
  res.json(await createVoiceSession({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/voice/telemetry', async (req, res) => {
  res.json(await recordVoiceTelemetry({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/extract', async (req, res) => {
  res.json(await extractInterview({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.get('/api/admin/sessions', async (req, res) => {
  res.json(await listAdminSessions({ authorization: req.headers.authorization, body: {}, query: req.query, clientIp: req.ip }));
});
app.get('/api/admin/invitations', async (req, res) => {
  res.json(await listAdminInvitations({ authorization: req.headers.authorization, body: {}, query: req.query, clientIp: req.ip }));
});
app.post('/api/admin/invitations', async (req, res) => {
  res.json(await createAdminInvitation({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/delete-invitation', async (req, res) => {
  res.json(await deleteAdminInvitation({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/session', async (req, res) => {
  res.json(await getAdminSession({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/delete-session', async (req, res) => {
  res.json(await deleteAdminSession({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/session-confirm', async (req, res) => {
  res.json(await confirmAdminSession({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/session-status', async (req, res) => {
  res.json(await updateAdminSessionStatus({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/session-note', async (req, res) => {
  res.json(await createAdminNote({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/session-export', async (req, res) => {
  res.json(await exportAdminSession({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/session-retry-extraction', async (req, res) => {
  res.json(await retryAdminExtraction({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/session-demo-prompt', async (req, res) => {
  res.json(await generateAdminDemoPrompt({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/session-trace', async (req, res) => {
  res.json(await getAdminVoiceTrace({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/voice-health', async (req, res) => {
  res.json(await checkAdminVoiceHealth({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.get('/api/admin/hosted-demos', async (req, res) => {
  res.json(await listHostedDemos({ authorization: req.headers.authorization, body: {}, query: req.query, clientIp: req.ip }));
});
app.post('/api/admin/hosted-demo-detail', async (req, res) => {
  res.json(await getHostedDemoDetail({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/hosted-demo-update', async (req, res) => {
  res.json(await updateHostedDemo({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.post('/api/admin/hosted-demo-feedback-handled', async (req, res) => {
  res.json(await markDemoFeedbackHandled({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
app.options('/api/demo-feedback', (_req, res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.status(204).end(); });
app.post('/api/demo-feedback', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(await submitDemoFeedback({ authorization: req.headers.authorization, body: req.body, clientIp: req.ip }));
});
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
app.use(express.static(dist, { setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=0') }));
app.get('/{*path}', (req, res) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Nie znaleziono.' }) : res.sendFile(path.join(dist, 'index.html')));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(error instanceof HttpError ? error.status : error instanceof z.ZodError ? 422 : 500).json({ error: error instanceof HttpError ? error.message : 'Nie udało się przetworzyć danych. Spróbuj ponownie.' });
});
app.listen(Number(process.env.PORT || 3001), () => console.log('Mirai Discovery API ready on port', process.env.PORT || 3001));
