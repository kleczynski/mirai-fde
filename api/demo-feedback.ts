import { submitDemoFeedback } from '../server/demos.js';
import { publicEndpoint } from '../server/vercel.js';

export default publicEndpoint('POST', submitDemoFeedback);
