import { BUILDING_BY_ID, MILESTONE_BY_ID, RECIPE_BY_ID } from '../data';
import { money, recipeFlow } from './format';

/**
 * Shown when a milestone completes. A toast is too small to teach anything, and
 * new buildings arriving silently in the build bar is how players miss that the
 * tool they need now exists.
 */
export default function UnlockPanel({
  milestoneId,
  onClose,
}: {
  milestoneId: string;
  onClose: () => void;
}) {
  const m = MILESTONE_BY_ID[milestoneId];
  if (!m) return null;

  const buildings = m.unlocksBuildings.map((id) => BUILDING_BY_ID[id]).filter(Boolean);
  const recipes = m.unlocksRecipes.map((id) => RECIPE_BY_ID[id]).filter(Boolean);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="badge good">Milestone complete</span>
          <h2>{m.name}</h2>
          <p>{m.blurb}</p>
          <div className="kv">
            <span className="k">Funding</span>
            <span className="mono" style={{ color: 'var(--good)' }}>+{money(m.reward)}</span>
          </div>
        </div>

        {buildings.length > 0 && (
          <>
            <div className="section-title">New buildings</div>
            {buildings.map((b) => (
              <div className="unlock-row" key={b.id}>
                <span className="glyph" style={{ background: b.color }}>{b.icon}</span>
                <span className="meta">
                  <span className="name">
                    {b.name}
                    <span className="mono unlock-cost">{money(b.cost)}</span>
                  </span>
                  <span className="sub">{b.description}</span>
                </span>
              </div>
            ))}
          </>
        )}

        {recipes.length > 0 && (
          <>
            <div className="section-title">New recipes</div>
            {recipes.map((r) => (
              <div className="unlock-recipe" key={r.id}>
                <b>{r.name}</b>
                <span className="tip-dim">
                  {' on '}{BUILDING_BY_ID[r.buildingId]?.name} · {recipeFlow(r)}
                </span>
              </div>
            ))}
          </>
        )}

        <button className="primary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}
