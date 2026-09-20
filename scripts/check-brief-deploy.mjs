const required=['SUPABASE_ACCESS_TOKEN','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','MIRAI_ADMIN_EMAILS','OPENAI_API_KEY','CLOUDFLARE_API_TOKEN','BRIEF_STUDIO_URL'];
for(const key of required) if(!process.env[key]?.trim()) throw new Error(`Missing ${key}`);
if(process.env.SUPABASE_PROJECT_REF!=='ucnmhxcjmfztfxfjlgvk'||process.env.SUPABASE_URL!=='https://ucnmhxcjmfztfxfjlgvk.supabase.co'||process.env.CLOUDFLARE_ACCOUNT_ID!=='61c83af95d6ce17e198b3d60268ef6df') throw new Error('Deployment target differs from dedicated Mirai 2 infrastructure');
if(!new URL(process.env.BRIEF_STUDIO_URL).hostname.startsWith('mirai-brief-studio.')) throw new Error('Unexpected Worker target');
console.log('Dedicated Node 2 configuration present.');
