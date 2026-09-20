import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('keeps both production deployments behind every software and AI quality gate',()=>{
 const workflow=readFileSync('.github/workflows/ci.yml','utf8');
 const jobs=new Map<string,string>();
 const matches=[...workflow.matchAll(/^  ([\w-]+):\n/gm)];
 matches.forEach((m,i)=>jobs.set(m[1],workflow.slice(m.index,matches[i+1]?.index??workflow.length)));
 function ancestors(name:string,seen=new Set<string>()) {
  const job=jobs.get(name);expect(job,`Missing job ${name}`).toBeDefined();
  const needs=/^    needs: \[([^\]]+)\]/m.exec(job!)?.[1].split(',').map(s=>s.trim())??[];
  for(const parent of needs) if(!seen.has(parent)){seen.add(parent);ancestors(parent,seen);}return seen;
 }
 for(const target of ['deploy-brief','deploy']) {
  const reachable=ancestors(target);
  for(const required of ['lint','typecheck','unit-test','build','e2e','brief-e2e','brief-quality']) expect(reachable.has(required),`${target} must depend on ${required}`).toBe(true);
  expect(jobs.get(target)).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
  expect(jobs.get(target)).toContain('environment: production');
 }
 expect(jobs.get('brief-quality')).toContain('npm run eval:brief');
 expect(jobs.get('brief-quality')).not.toContain('OPENAI_API_KEY');
});
