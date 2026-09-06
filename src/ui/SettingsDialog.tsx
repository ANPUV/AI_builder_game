import { ADDONS, type AddonId, type AddonSettings } from '../data';
import { useLang } from '../i18n/useLang';

/**
 * Settings.
 *
 * The optional content tracks, plus any feature addons (Venture Capital).
 * Language and theme already have controls in the top bar; duplicating them
 * here would give the same setting two homes.
 */
export default function SettingsDialog({
  addons,
  onToggleAddon,
  onClose,
}: {
  addons: AddonSettings;
  onToggleAddon: (id: AddonId, on: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useLang();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('settings.title')}</h2>
        </div>

        <div className="section-title">{t('settings.addons')}</div>
        <p className="settings-note">{t('settings.addonsNote')}</p>

        {ADDONS.map((addon) => (
          <label key={addon.id} className="settings-row">
            <input
              type="checkbox"
              checked={addons[addon.id]}
              onChange={(e) => onToggleAddon(addon.id, e.target.checked)}
            />
            <span className="settings-row-text">
              <span className="settings-row-name">{addon.name}</span>
              <span className="settings-row-blurb">{addon.blurb}</span>
            </span>
          </label>
        ))}

        <p className="settings-note">{t('settings.addonsKeep')}</p>

        <button className="offer-close" onClick={onClose}>
          {t('build.close')}
        </button>
      </div>
    </div>
  );
}
