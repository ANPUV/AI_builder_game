import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root';
import './index.css';

if (import.meta.env.DEV) {
  // Loaded dynamically on purpose. A static import here would pull the whole
  // content and engine graph into the shell bundle, which is exactly what
  // Root's lazy() is avoiding — a signed-out visitor should not download the
  // game to look at a landing page.
  void (async () => {
    const [data, factory, simulate] = await Promise.all([
      import('./data'),
      import('./engine/factory'),
      import('./engine/simulate'),
    ]);

    const problems = data.validateContent();
    if (problems.length) {
      console.warn(`[content] ${problems.length} problem(s) in src/data:\n - ` + problems.join('\n - '));
    }

    // Balancing console. `__ai.state` is the live world; mutate it with the
    // factory helpers and the UI picks the change up on the next frame.
    (window as unknown as { __ai: unknown }).__ai = { data, factory, simulate, state: null };
  })();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
