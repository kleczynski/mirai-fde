import { createVoiceSession } from '../../server/agent.js';
import { endpoint } from '../../server/vercel.js';

export default endpoint('POST', input => createVoiceSession(input));
