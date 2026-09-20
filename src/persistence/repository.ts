import { createClient } from '@supabase/supabase-js';
import { DiscoverySchema, SessionSchema, type InterviewSession } from '../domain/contract';
import type { Database } from './database.types';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient<Database>(url, key) : null;
export const storageKind = supabase ? 'supabase' : 'local';
export const captchaSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
// A production deployment backed by Supabase must fail closed: anonymous sign-in
// cannot proceed until its production Turnstile site key has been configured.
export const captchaRequired = Boolean(supabase && import.meta.env.PROD);
let captchaToken: string | null = null;
export function setCaptchaToken(token: string | null) { captchaToken = token; }
export function getCaptchaToken() { return captchaToken; }
const LOCAL_KEY = 'mirai.discovery.session.v1';
const POINTER_KEY = 'mirai.discovery.session-id';
export async function authenticate() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    if (captchaRequired && !captchaSiteKey) throw new Error('Weryfikacja antyspamowa nie jest skonfigurowana. Spróbuj ponownie później.');
    if (captchaRequired && !captchaToken) throw new Error('Potwierdź weryfikację antyspamową przed rozpoczęciem rozmowy.');
    const token = captchaToken; captchaToken = null;
    const { error } = await supabase.auth.signInAnonymously(token ? { options: { captchaToken: token } } : undefined);
    if (error) {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('mirai:captcha-reset'));
      throw new Error('Nie udało się otworzyć bezpiecznej sesji. Odśwież weryfikację i spróbuj ponownie.');
    }
  }
}
export async function saveSession(value: InterviewSession) {
  const session = SessionSchema.parse(value);
  if (supabase) {
    await authenticate();
    const { error } = await supabase.rpc('save_interview', { p_session: session });
    if (error) throw new Error(error.message.includes('revision') ? 'Sesja zmieniła się w innej karcie. Odśwież stronę przed kontynuacją.' : 'Nie udało się zapisać sesji w Supabase. Sprawdź połączenie i spróbuj ponownie.');
    localStorage.setItem(POINTER_KEY, session.id);
  } else localStorage.setItem(LOCAL_KEY, JSON.stringify(session));
}
export async function loadSession(): Promise<InterviewSession | null> {
  if (supabase) {
    const id = localStorage.getItem(POINTER_KEY);
    if (!id) return null;
    // Restoring a pointer must not start anonymous authentication before the
    // consent screen has mounted its CAPTCHA. Never assign old data to a new user.
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) return null;
    const { data, error } = await supabase.from('interview_sessions').select('state').eq('id', id).maybeSingle();
    if (error) throw new Error('Nie udało się wznowić sesji. Spróbuj ponownie.');
    if (!data) { localStorage.removeItem(POINTER_KEY); return null; }
    return SessionSchema.parse(data.state);
  }
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return null;
  const parsed = SessionSchema.safeParse(JSON.parse(raw));
  if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) { localStorage.removeItem(LOCAL_KEY); return null; }
  return parsed.data;
}
export async function loadSessionById(id: string): Promise<InterviewSession | null> {
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return null;
  const { data, error } = await supabase.from('interview_sessions').select('state').eq('id', id).maybeSingle();
  if (error) throw new Error('Nie udało się wznowić rozmowy. Spróbuj ponownie.');
  if (!data) return null;
  localStorage.setItem(POINTER_KEY, id);
  return SessionSchema.parse(data.state);
}
export async function claimInvitation(token: string): Promise<{ sessionId: string; canCreate: boolean }> {
  if (!supabase) throw new Error('Zaproszenia wymagają połączenia z Supabase.');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Link zaproszenia jest niepoprawny.');
  await authenticate();
  const { data, error } = await supabase.rpc('claim_interview_invitation_v2', { p_token: token, p_session_id: crypto.randomUUID() });
  if (error) {
    if (/already used/i.test(error.message)) throw new Error('Ten link został już wykorzystany w innej przeglądarce. Poproś o nowe zaproszenie.');
    if (/expired/i.test(error.message)) throw new Error('Ten link wygasł. Poproś o nowe zaproszenie.');
    if (/not found|invalid invitation/i.test(error.message)) throw new Error('Nie znaleziono zaproszenia. Sprawdź link.');
    throw new Error('Nie udało się otworzyć zaproszenia. Spróbuj ponownie.');
  }
  if (!data || typeof data.sessionId !== 'string' || typeof data.canCreate !== 'boolean') throw new Error('Odpowiedź zaproszenia jest niepoprawna.');
  return data;
}
export async function getCompleteSessionResult(id: string) {
  if (supabase) {
    await authenticate();
    const { data, error } = await supabase.from('session_summaries').select('payload, confirmed_at').eq('session_id', id).single();
    if (error || !data?.confirmed_at) throw new Error('Brak zatwierdzonego wyniku sesji.');
    return DiscoverySchema.parse(data.payload);
  }
  const session = await loadSession();
  if (session?.id !== id || session.status !== 'completed') throw new Error('Brak zatwierdzonego wyniku sesji.');
  return DiscoverySchema.parse(session.result);
}
export async function deleteSession(id: string) {
  if (supabase) {
    await authenticate();
    const { error } = await supabase.from('interview_sessions').delete().eq('id', id);
    if (error) throw new Error('Nie udało się usunąć sesji. Spróbuj ponownie.');
  }
  localStorage.removeItem(LOCAL_KEY); localStorage.removeItem(POINTER_KEY);
}
export async function authHeaders() {
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  return { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) };
}
