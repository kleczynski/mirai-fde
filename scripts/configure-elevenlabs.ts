import { config } from 'dotenv';
import { AGENT_PROMPT } from '../src/domain/interview';

config({ path: '.env.local', override: false, quiet: true });
config({ path: '.env', override: false, quiet: true });

const apiKey = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_AGENT_ID;
if (!apiKey || !agentId) throw new Error('Ustaw ELEVENLABS_API_KEY i ELEVENLABS_AGENT_ID.');

const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
  body: JSON.stringify({
    name: 'MIRAI Discovery Interview',
    version_description: 'Adaptacyjny discovery interview oparty na pokryciu wiedzy',
    conversation_config: {
      conversation: { max_duration_seconds: 1_200, client_events: ['user_transcript', 'agent_response', 'interruption'] },
      tts: { expressive_mode: false },
      agent: {
        language: 'pl',
        first_message: 'Cześć, jestem MIRAI, agent AI. Czym się zajmujesz? Opowiedz o swojej pracy własnymi słowami.',
        dynamic_variables: { dynamic_variable_placeholders: { interview_context: '{}', coverage_gaps: 'rola i odpowiedzialność', focus_summary: 'jeszcze nieustalony', mirai_session_id: '00000000-0000-0000-0000-000000000000' } },
        prompt: { prompt: AGENT_PROMPT, temperature: 0.35 },
      },
    },
  }),
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) throw new Error(`ElevenLabs odrzucił konfigurację (${response.status}): ${(await response.text()).slice(0, 500)}`);
const result = await response.json() as { agent_id?: string; version_id?: string };
console.log(`Skonfigurowano agenta ${result.agent_id ?? agentId}${result.version_id ? `, wersja ${result.version_id}` : ''}.`);
