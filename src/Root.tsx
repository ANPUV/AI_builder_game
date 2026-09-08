import { Suspense, lazy, useEffect } from 'react';
import { useAuth } from './auth/useAuth';
import Landing from './site/Landing';
import ResetPage from './site/ResetPage';
import './site/site.css';

/**
 * The game is a lazy chunk, so a visitor who is not signed in never downloads
 * it. That is a build-time split, not a security boundary — the chunk is still
 * a public URL for anyone who reads the manifest. Phase 3 moves it behind an
 * authenticated route; this is the step that makes that cheap.
 */
const Game = lazy(() => import('./ui/App'));

export default function Root() {
  if (import.meta.env.DEV && window.location.pathname === '/preview') {
    return <Suspense fallback={<div className="site-booting">Starting the simulation…</div>}><Game /></Suspense>;
  }
  return <AuthenticatedRoot />;
}

function AuthenticatedRoot() {
  const { state, signedIn, signOut } = useAuth();

  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const resetToken = path === '/reset' ? params.get('token') : null;

  // The game's stylesheet locks body scrolling for its canvas; the public
  // pages need it back.
  const showingSite = state.kind !== 'signedIn' || resetToken !== null;
  useEffect(() => {
    document.body.classList.toggle('site-open', showingSite);
    return () => document.body.classList.remove('site-open');
  }, [showingSite]);

  // A reset link is valid whether or not somebody is signed in, and it is the
  // only reason to be on /reset — so it wins over everything else.
  if (resetToken) return <ResetPage token={resetToken} />;


  if (state.kind === 'loading') return <div className="site-booting">Loading…</div>;

  if (state.kind === 'anonymous') return <Landing onSignedIn={signedIn} />;

  return (
    <Suspense fallback={<div className="site-booting">Starting the simulation…</div>}>
      <Game onSignOut={signOut} />
    </Suspense>
  );
}
