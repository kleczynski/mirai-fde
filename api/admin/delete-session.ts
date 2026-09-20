import { deleteAdminSession } from '../../server/admin.js';
import { endpoint } from '../../server/vercel.js';

export default endpoint('POST', deleteAdminSession);
