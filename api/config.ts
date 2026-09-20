import { getRuntimeConfig } from '../server/agent.js';
import { endpoint } from '../server/vercel.js';

export default endpoint('GET', () => getRuntimeConfig());
