import { extractInterview } from '../server/agent.js';
import { endpoint } from '../server/vercel.js';

export default endpoint('POST', input => extractInterview(input));
