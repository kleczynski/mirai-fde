import { listHostedDemos } from '../../server/demos.js';
import { endpoint } from '../../server/vercel.js';

export default endpoint('GET', listHostedDemos);
