import { useEffect, useRef, useState } from 'react';
import { captchaRequired, captchaSiteKey, setCaptchaToken } from './repository';

type Turnstile = { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (widgetId: string) => void; remove: (widgetId: string) => void };
declare global { interface Window { turnstile?: Turnstile } }

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-mirai-turnstile]');
    const script = existing ?? Object.assign(document.createElement('script'), { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true, defer: true });
    script.dataset.miraiTurnstile = 'true';
    const ready = () => window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile unavailable'));
    script.addEventListener('load', ready, { once: true }); script.addEventListener('error', () => reject(new Error('Turnstile unavailable')), { once: true });
    if (!existing) document.head.appendChild(script);
  });
}

export function Captcha({ onReady }: { onReady?: (ready: boolean) => void }) {
  const target = useRef<HTMLDivElement>(null); const widget = useRef<string | null>(null);
  const [status, setStatus] = useState<'waiting' | 'ready' | 'error'>(captchaSiteKey ? 'waiting' : 'error');
  useEffect(() => {
    if (!captchaRequired || !captchaSiteKey || !target.current) return;
    let active = true; let api: Turnstile | null = null;
    loadTurnstile().then(value => {
      if (!active || !target.current) return; api = value;
      widget.current = api.render(target.current, { sitekey: captchaSiteKey, theme: 'light', appearance: 'interaction-only',
        callback: (token: string) => { setCaptchaToken(token); setStatus('ready'); onReady?.(true); },
        'expired-callback': () => { setCaptchaToken(null); setStatus('waiting'); onReady?.(false); },
        'error-callback': () => { setCaptchaToken(null); setStatus('error'); onReady?.(false); },
      });
    }).catch(() => { setStatus('error'); onReady?.(false); });
    const reset = () => { setCaptchaToken(null); setStatus('waiting'); onReady?.(false); if (api && widget.current) api.reset(widget.current); };
    window.addEventListener('mirai:captcha-reset', reset);
    return () => { active = false; window.removeEventListener('mirai:captcha-reset', reset); setCaptchaToken(null); if (api && widget.current) api.remove(widget.current); };
  }, [onReady]);
  if (!captchaRequired) return null;
  if (!captchaSiteKey) return <p role="alert">Weryfikacja antyspamowa jest chwilowo niedostępna.</p>;
  return <div className="captcha-block"><div ref={target}/><span className="sr-only" aria-live="polite">{status === 'ready' ? 'Weryfikacja zakończona' : status === 'error' ? 'Weryfikacja nie powiodła się' : 'Trwa weryfikacja'}</span></div>;
}
