import { useEffect, useRef } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

/** True only when a site key is configured, so local dev renders no widget. */
export const turnstileEnabled = Boolean(SITE_KEY);

interface Window {
  turnstile?: {
    render: (el: HTMLElement, options: Record<string, unknown>) => string;
    remove: (id: string) => void;
  };
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('turnstile failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('turnstile failed to load'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile, rendered explicitly so it can live inside a React tree
 * without the auto-render script fighting us over the DOM.
 *
 * If the key is unset (local dev) this renders nothing and never calls back —
 * which matches the Worker, where an unset TURNSTILE_SECRET passes every
 * check. Both halves have to be configured for the defence to exist.
 */
export default function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        const turnstile = (window as unknown as Window).turnstile;
        if (cancelled || !turnstile || !holder.current) return;
        widgetId.current = turnstile.render(holder.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          callback: onToken,
        });
      })
      .catch(() => {
        // The Worker treats a Turnstile outage as a pass, so a failed script
        // load must not become a wall the user cannot get past.
      });

    return () => {
      cancelled = true;
      const turnstile = (window as unknown as Window).turnstile;
      if (widgetId.current && turnstile) turnstile.remove(widgetId.current);
    };
  }, [onToken]);

  if (!SITE_KEY) return null;
  return <div ref={holder} style={{ marginBottom: 14 }} />;
}
