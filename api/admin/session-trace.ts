import { getAdminVoiceTrace } from '../../server/voice-trace.js';
import { endpoint } from '../../server/vercel.js';

export default endpoint('POST', getAdminVoiceTrace);
