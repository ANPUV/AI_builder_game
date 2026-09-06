import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Account } from './api';

export type AuthState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'signedIn'; account: Account };

/**
 * One `/api/me` call on mount decides what the page is. Everything else in the
 * shell reads this, so there is a single source of truth for "is this person
 * allowed to see the game".
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    api
      .me()
      .then(({ user }) => {
        if (!cancelled) setState({ kind: 'signedIn', account: user });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // A 401 is the ordinary "not signed in" answer, not a failure worth
        // reporting. Anything else (a network blip, a 500) lands in the same
        // place: show the landing page rather than a broken screen.
        if (!(error instanceof ApiError)) console.error(error);
        setState({ kind: 'anonymous' });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signedIn = useCallback((account: Account) => {
    setState({ kind: 'signedIn', account });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // Whether or not the request landed, this browser is done with the
      // session — the cookie is gone either way.
      setState({ kind: 'anonymous' });
    }
  }, []);

  return { state, signedIn, signOut };
}
