import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as data from './data';
import * as factory from './engine/factory';
import * as simulate from './engine/simulate';
import App from './ui/App';
import './index.css';

if (import.meta.env.DEV) {
  const problems = data.validateContent();
  if (problems.length) {
    console.warn(`[content] ${problems.length} problem(s) in src/data:\n - ` + problems.join('\n - '));
  }
  // Balancing console. `__ai.state` is the live world; mutate it with the
  // factory helpers and the UI picks the change up on the next frame.
  (window as unknown as { __ai: unknown }).__ai = { data, factory, simulate, state: null };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
