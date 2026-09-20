import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { DiscoveryBaseSchema, DiscoverySchema, reviewFinding } from '../src/domain/contract';
import { createSession, createTurn, demoAnswers, questionFor, AGENT_PROMPT } from '../src/domain/interview';
import { extractWithRules } from '../src/domain/extraction';
if (process.argv.includes('--prompt-only')) {
  writeFileSync('docs/elevenlabs-agent-prompt.txt', AGENT_PROMPT + '\n');
  console.log('Wrote agent prompt.');
  process.exit(0);
}
const session=createSession('demo');
for(let i=0;i<10;i++){ session.questionIndex=i;session.turns.push(createTurn('agent',questionFor(i,session.turns),session),createTurn('participant',demoAnswers[i],session)); }
session.questionIndex=10; session.completedAt=new Date().toISOString();
const result=extractWithRules(session);
for(const f of [...result.participantContext,...result.painPoints,...result.workflows,...result.tools,...result.constraints,...result.automationOpportunities,result.recommendedNextStep]) Object.assign(f,reviewFinding(f,f.text));
writeFileSync('docs/mirai.discovery.v1.schema.json',JSON.stringify(z.toJSONSchema(DiscoveryBaseSchema),null,2)+'\n');
writeFileSync('docs/mirai.discovery.v1.example.json',JSON.stringify(DiscoverySchema.parse(result),null,2)+'\n');
writeFileSync('docs/elevenlabs-agent-prompt.txt',AGENT_PROMPT+'\n');
console.log('Wrote JSON Schema, validated example and agent prompt.');
