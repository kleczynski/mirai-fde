import { markDemoFeedbackHandled } from '../../server/demos.js';
import { endpoint } from '../../server/vercel.js';

export default endpoint('POST', markDemoFeedbackHandled);
