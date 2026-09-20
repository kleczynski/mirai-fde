import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','MIRAI_ADMIN_EMAILS','OPENAI_API_KEY'];
if(!process.env.RUNNER_TEMP) throw new Error('CI temporary directory required');
const values=Object.fromEntries(names.map(name=>{if(!process.env[name])throw new Error(`Missing ${name}`);return [name,process.env[name]];}));
writeFileSync(join(process.env.RUNNER_TEMP,'brief-runtime-secrets.json'),JSON.stringify(values),{mode:0o600});
