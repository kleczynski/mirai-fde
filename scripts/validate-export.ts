import { readFileSync } from 'node:fs';
import { DiscoverySchema } from '../src/domain/contract';
const file=process.argv[2];
if(!file) throw new Error('Usage: npx tsx scripts/validate-export.ts path/to/export.json');
const result=DiscoverySchema.parse(JSON.parse(readFileSync(file,'utf8')));
const findings=[...result.participantContext,...result.painPoints,...result.workflows,...result.tools,...result.constraints,...result.automationOpportunities,result.recommendedNextStep];
if(findings.some(f=>f.review.status==='unreviewed')) throw new Error('Export has unreviewed findings');
console.log(`Valid ${result.schemaVersion}: ${result.transcript.length} segments, ${findings.length} confirmed findings, ${findings.filter(f=>f.review.status==='corrected').length} corrections.`);
