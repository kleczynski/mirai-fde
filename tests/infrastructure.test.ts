import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { endpoint, type VercelRequest, type VercelResponse } from '../server/vercel';

const root = new URL('../', import.meta.url);

/** Every file under api/**\/*.ts (excluding dynamic-route helpers already
 * counted by their bracket file) becomes one Vercel Serverless Function.
 * The Hobby plan caps a deployment at 12 — this walks the real directory so
 * adding a new top-level api/*.ts file without noticing the count is a test
 * failure here, not a broken production deploy discovered after the fact. */
function countApiFunctions(dir: URL): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dir);
    if (entry.isDirectory()) count += countApiFunctions(entryUrl);
    else if (entry.name.endsWith('.ts')) count += 1;
  }
  return count;
}

describe('production infrastructure', () => {
  it('uses the EU Vercel region and keeps API functions bounded', () => {
    const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
    expect(config.framework).toBe('vite');
    expect(config.regions).toEqual(['fra1']);
    expect(config.functions['api/extract.ts'].maxDuration).toBeLessThanOrEqual(60);
    expect(config.functions['api/voice/token.ts'].maxDuration).toBeLessThanOrEqual(30);
    for (const path of ['api/config.ts', 'api/extract.ts', 'api/voice/token.ts', 'api/demo-feedback.ts', 'api/admin/[route].ts']) {
      expect(existsSync(new URL(path, root)), `${path} must be deployed`).toBe(true);
    }
  });

  it('stays within the Vercel Hobby plan limit of 12 Serverless Functions', () => {
    // Consolidate any new admin route into api/admin/[route].ts instead of
    // adding another top-level api/*.ts file — see its file header for why.
    const count = countApiFunctions(new URL('api/', root));
    expect(count).toBeLessThanOrEqual(12);
  });

  it('ships browser security policy for microphone and third-party APIs', () => {
    const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
    const headers = config.headers.flatMap((entry: { headers: Array<{ key: string; value: string }> }) => entry.headers);
    expect(headers).toContainEqual({ key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' });
    const csp = headers.find((header: { key: string }) => header.key === 'Content-Security-Policy')?.value;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://*.supabase.co');
    expect(csp).toContain('https://api.elevenlabs.io');
    expect(csp).toContain('https://challenges.cloudflare.com');
  });

  it('documents every required deploy variable without committing values', () => {
    const template = readFileSync(new URL('.env.example', root), 'utf8');
    for (const name of [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_TURNSTILE_SITE_KEY',
      'SUPABASE_URL',
      'SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'MIRAI_ADMIN_EMAILS',
      'ELEVENLABS_API_KEY',
      'ELEVENLABS_AGENT_ID',
      'OPENAI_API_KEY',
    ]) {
      expect(template).toMatch(new RegExp(`^${name}=`, 'm'));
    }
    expect(template).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY=.+/);
  });

  it('rejects wrong methods and oversized API bodies before invoking providers', async () => {
    const calls: unknown[] = [];
    const handler = endpoint('POST', input => { calls.push(input); return { ok: true }; });
    const response = () => {
      const state = { status: 0, body: undefined as unknown };
      const res = {
        setHeader: () => res,
        status: (status: number) => { state.status = status; return res; },
        json: (body: unknown) => { state.body = body; return res; },
      } as unknown as VercelResponse;
      return { res, state };
    };

    const wrong = response();
    await handler({ method: 'GET', headers: {}, socket: {} } as VercelRequest, wrong.res);
    expect(wrong.state.status).toBe(405);

    const tooLarge = response();
    await handler({ method: 'POST', headers: {}, socket: {}, body: 'x'.repeat(16 * 1024 + 1) } as VercelRequest, tooLarge.res);
    expect(tooLarge.state.status).toBe(413);
    expect(calls).toHaveLength(0);
  });
});
