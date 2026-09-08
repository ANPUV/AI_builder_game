import { BALANCE, BUILDING_BY_ID, MILESTONE_BY_ID, RECIPE_BY_ID } from '../data';
import { buildingEnabled, type AddonSettings } from '../data/addons';
import { inkOn, money, recipeFlow } from './format';
import { useContent } from '../i18n/useLang';

/**
 * Shown when a milestone completes. A toast is too small to teach anything, and
 * new buildings arriving silently in the build bar is how players miss that the
 * tool they need now exists.
 */
export default function UnlockPanel({
  milestoneId,
  addons,
  onClose,
}: {
  milestoneId: string;
  addons: AddonSettings;
  onClose: () => void;
}) {
  const { bName, bDesc, rName } = useContent();
  const m = MILESTONE_BY_ID[milestoneId];
  if (!m) return null;

  // A milestone unlocks nodes from addons the player may have switched off.
  // Announcing a building they cannot build would be a worse surprise than
  // saying nothing about it.
  const buildings = m.unlocksBuildings
    .map((id) => BUILDING_BY_ID[id])
    .filter((b) => b && buildingEnabled(b.id, addons));
  const recipes = m.unlocksRecipes
    .map((id) => RECIPE_BY_ID[id])
    .filter((r) => r && buildingEnabled(r.buildingId, addons));
  const funding = m.reward * BALANCE.milestoneRewardMultiplier;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="badge good">Milestone complete</span>
          <h2>{m.name}</h2>
          <p>{m.blurb}</p>
          {funding > 0 && (
            <div className="kv">
              <span className="k">Funding</span>
              <span className="mono" style={{ color: 'var(--good)' }}>+{money(funding)}</span>
            </div>
          )}
        </div>

        {buildings.length > 0 && (
          <>
            <div className="section-title">New buildings</div>
            {buildings.map((b) => (
              <div className="unlock-row" key={b.id}>
                <span className="glyph" style={{ background: b.color, color: inkOn(b.color) }}>{b.icon}</span>
                <span className="meta">
                  <span className="name">
                    {bName(b)}
                    <span className="mono unlock-cost">{money(b.cost)}</span>
                  </span>
                  <span className="sub">{bDesc(b)}</span>
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
                <b>{rName(r)}</b>
                <span className="tip-dim">
                  {' on '}{(() => { const rb = BUILDING_BY_ID[r.buildingId]; return rb ? bName(rb) : ''; })()} · {recipeFlow(r)}
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
