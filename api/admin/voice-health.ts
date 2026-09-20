import { checkAdminVoiceHealth } from '../../server/voice-health.js';
import { endpoint } from '../../server/vercel.js';

export default endpoint('POST', checkAdminVoiceHealth);
