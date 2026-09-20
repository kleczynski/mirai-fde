import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), signInAnonymously: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth }) }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'test-site-key');
  vi.stubEnv('PROD', true);
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.signInAnonymously.mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('CAPTCHA authentication lifecycle', () => {
  it('consumes the verified token exactly once when establishing identity', async () => {
    const repository = await import('../src/persistence/repository');
    repository.setCaptchaToken('synthetic-once');
    await repository.authenticate();
    expect(auth.signInAnonymously).toHaveBeenCalledWith({ options: { captchaToken: 'synthetic-once' } });
    expect(repository.getCaptchaToken()).toBeNull();
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'synthetic-auth' } } });
    await repository.authenticate();
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });
  it('refuses anonymous sign-in without a verification token', async () => {
    const repository = await import('../src/persistence/repository');
    await expect(repository.authenticate()).rejects.toThrow('Potwierdź weryfikację');
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
  it('does not create a replacement identity when restoring a stale session pointer', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'previous-session-id' });
    const repository = await import('../src/persistence/repository');
    await expect(repository.loadSession()).resolves.toBeNull();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });
});
