import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { BuildBriefBaseSchema, BuildBriefSchema } from '../services/brief-studio/src/domain/contract.js';
import { julkaBuildBriefExample } from '../services/brief-studio/src/domain/fixtures.js';
writeFileSync('docs/mirai.build-brief.v1.schema.json', JSON.stringify(z.toJSONSchema(BuildBriefBaseSchema), null, 2) + '\n');
writeFileSync('docs/mirai.build-brief.v1.example.json', JSON.stringify(BuildBriefSchema.parse(julkaBuildBriefExample), null, 2) + '\n');
console.log('Wrote mirai.build-brief.v1 JSON Schema and a validated Julka/Revolut example.');
