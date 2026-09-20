import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { handleRequest, type Bindings } from '../src/http.js';
import { BriefStore } from '../src/store.js';
import { performStage, finalizeRun } from '../src/runner.js';
import { STAGES, type Outputs } from '../src/domain/pipeline.js';
import { syntheticSession } from './session-fixture.js';

export async function localIntegration() {
 const local = JSON.parse(readFileSync(process.env.BRIEF_LOCAL_CONFIG ?? '.local/brief-studio/local-supabase.json','utf8'));
 const url = new URL(local.API_URL);
 if (!['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('Integration fixture requires local Supabase');
 const db = createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const store = new BriefStore(db); const userIds: string[] = [];
 async function user(prefix: string) {
  const email = `${prefix}-${crypto.randomUUID()}@example.test`, password = crypto.randomUUID();
  const created = await db.auth.admin.createUser({email,password,email_confirm:true});
  if(created.error) throw new Error('Local fixture user creation failed');
  userIds.push(created.data.user.id);
  const client=createClient(local.API_URL,local.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const signed=await client.auth.signInWithPassword({email,password});
  if(signed.error || !signed.data.session) throw new Error('Local fixture login failed');
  return {email,id:created.data.user.id,token:signed.data.session.access_token,client};
 }
 const admin=await user('brief-admin'), participant=await user('brief-participant');
 const source=syntheticSession();
 const seeded=await db.from('interview_sessions').insert({id:source.id,owner_id:participant.id,status:source.status,scenario_version:'discovery-interview.v1',prompt_version:'discovery-agent.v1',consent:source.consent,started_at:source.startedAt,completed_at:source.completedAt,expires_at:source.expiresAt,state:source,revision:source.revision});
 if(seeded.error) throw new Error(`Local source fixture failed: ${seeded.error.code}`);
 const report=JSON.parse(readFileSync('services/brief-studio/tests/evals/julka.live.json','utf8'));
 const outputs: Outputs=report.outputs;
 const jobs=new Map<string,Promise<void>>(); const events: string[]=[]; let paidTransportCalls=0;
 const env: Bindings={SUPABASE_URL:local.API_URL,SUPABASE_PUBLISHABLE_KEY:local.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:local.SERVICE_ROLE_KEY,MIRAI_ADMIN_EMAILS:admin.email,OPENAI_API_KEY:'replay-only-never-used',BRIEF_PIPELINE:{
  async create({id}) {
   if(jobs.has(id)) throw new Error('Duplicate Workflow');
   const job=(async()=>{
    for(const stage of STAGES) {
     if(stage==='revision' && !outputs.critic?.findings.length) break;
     await performStage(store,async name=>{paidTransportCalls++;return {output:outputs[name],usage:report.usage.find((u:{stage:string})=>u.stage===name)};},id,stage);
    }
    await finalizeRun(store,id);
   })();
   jobs.set(id,job); void job.catch(()=>{});
  },
  async get(id) {if(!jobs.has(id)) throw new Error('Missing Workflow');return {status:async()=>({status:'running'}),sendEvent:async()=>{events.push(id);}};},
 }};
 return {env,db,store,source,admin,participant,jobs,events,get replayCalls(){return paidTransportCalls;},
  request(path:string,method='GET',body?:unknown,token:string|null=admin.token) {return handleRequest(new Request(`https://brief.test${path}`,{method,headers:token?{Authorization:`Bearer ${token}`}:{},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);},
  async cleanup(){for(const id of userIds) await db.auth.admin.deleteUser(id);},
 };
}
