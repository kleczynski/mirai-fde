import { createAdminNote } from '../../server/admin.js';
import { endpoint } from '../../server/vercel.js';

export default endpoint('POST', createAdminNote);
