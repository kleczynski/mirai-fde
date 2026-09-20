import { z } from 'zod';
import { HttpError, type ApiInput } from './agent.js';
import { requireAdmin } from './admin.js';

/** Checks the production credential and agent without returning a signed URL. */
export async function checkAdminVoiceHealth(input: ApiInput) {
  await requireAdmin(input);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) throw new HttpError(503, 'Agent głosowy nie jest skonfigurowany.');
  const environment = process.env.ELEVENLABS_ENVIRONMENT || 'production';
  const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
  url.searchParams.set('agent_id', agentId);
  url.searchParams.set('include_conversation_id', 'true');
  url.searchParams.set('environment', environment);
  const response = await fetch(url, { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new HttpError(502, `ElevenLabs odrzucił próbę połączenia (HTTP ${response.status}).`);
  z.object({ signed_url: z.string().url() }).parse(await response.json());
  return { available: true, agentId, environment };
}
