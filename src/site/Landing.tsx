import type { Account } from '../auth/api';
import AuthPanel from './AuthPanel';

/**
 * Content is drawn from the real content spec rather than invented: the counts
 * below match docs/CONTENT-SPEC.md and docs/ADDONS-SPEC.md, and the mechanics
 * described are the ones the engine actually simulates. If the spec changes,
 * these change with it.
 */
const PILLARS = [
  {
    title: 'Rate limits are per provider',
    body: 'An OpenAI Tier 5 buys you nothing on Anthropic. Every model node draws on its own vendor’s pool, so over-demand is a 429, not a brownout.',
  },
  {
    title: 'Contracts, not a spot market',
    body: 'All income comes from contracts that arrive as timed offers, each with a payout and an exposure ceiling. Reference prices are display only.',
  },
  {
    title: 'Customers audit what you route',
    body: 'Compliance is not a checkbox on a menu. Buyers inspect the graph behind the work you sell them, and route badly and they say so.',
  },
  {
    title: 'Numbers that came from somewhere',
    body: 'Every node carries a sourced figure — DeepSeek’s per-million token pricing, ASML’s scanner cost, HBM market share. The economy is scaled for play; the ratios are not.',
  },
];

const STATS = [
  ['53', 'items'],
  ['103', 'buildings'],
  ['135', 'recipes'],
  ['24', 'milestones'],
  ['15', 'contracts'],
];

export default function Landing({ onSignedIn }: { onSignedIn: (account: Account) => void }) {
  return (
    <div className="site">
      <header className="site-header">
        <div className="site-brand">
          AIfor<span>.study</span>
        </div>
        <a href="#access">
          <button type="button">Sign in</button>
        </a>
      </header>

      <main className="site-main">
        <section className="hero">
          <h1>
            Run an AI company as a <em>factory</em>.
          </h1>
          <p>
            A node-graph builder game. Place providers, retrieval, agents, compliance and silicon on a
            canvas, wire them together, and a live simulation runs the business: nodes craft over time, burn
            API spend per call, draw throughput against a rate limit, and sell finished work to customers who
            audit what you route through.
          </p>
          <p className="hero-note">
            In closed beta. Requests are reviewed by hand, one at a time.
          </p>
        </section>

        <h2>What makes it different</h2>
        <div className="grid">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="panel card">
              <h3>{pillar.title}</h3>
              <p>{pillar.body}</p>
            </div>
          ))}
        </div>

        <h2>How big it is</h2>
        <div className="stats">
          {STATS.map(([value, label]) => (
            <div key={label} className="stat-cell">
              <b>{value}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <h2>Ask for a place</h2>
        <AuthPanel onSignedIn={onSignedIn} />
      </main>

      <footer className="site-footer">
        <span>AIfor.study — closed beta</span>
        <span>Built by one person. Replies to mail reach a human.</span>
      </footer>
    </div>
  );
}
