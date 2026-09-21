import { updateHostedDemo } from '../../server/demos.js';
import { endpoint } from '../../server/vercel.js';

export default endpoint('POST', updateHostedDemo);
