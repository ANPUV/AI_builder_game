import { ADDONS, type AddonSettings, type AddonTrack } from '../data';
import { useLang } from '../i18n/useLang';

/**
 * Settings.
 *
 * Only the optional content tracks for now. Language and theme already have
 * controls in the top bar; duplicating them here would give the same setting
 * two homes.
 */
export default function SettingsDialog({
  addons,
  onToggleAddon,
  onClose,
}: {
  addons: AddonSettings;
  onToggleAddon: (track: AddonTrack, on: boolean) => void;
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
          <label key={addon.track} className="settings-row">
            <input
              type="checkbox"
              checked={addons[addon.track]}
              onChange={(e) => onToggleAddon(addon.track, e.target.checked)}
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
