import { useState } from 'react';
import { ADDONS, type AddonId, type AddonSettings } from '../data';
import type { LinkShape } from '../engine/types';
import { linkPath } from './geometry';
import { useLang } from '../i18n/useLang';
import type { Key } from '../i18n';

/**
 * Settings.
 *
 * Language and theme already have controls in the top bar; duplicating them
 * here would give the same setting two homes.
 */
type Tab = 'addons' | 'connection';

const TABS: { id: Tab; label: Key }[] = [
  { id: 'addons', label: 'settings.tabAddons' },
  { id: 'connection', label: 'settings.tabConnection' },
];

const SHAPES: { id: LinkShape; label: Key }[] = [
  { id: 'curve', label: 'settings.shapeCurve' },
  { id: 'straight', label: 'settings.shapeStraight' },
  { id: 'elbow', label: 'settings.shapeElbow' },
];

export default function SettingsDialog({
  addons,
  onToggleAddon,
  linkShape,
  onLinkShape,
  onClose,
}: {
  addons: AddonSettings;
  onToggleAddon: (id: AddonId, on: boolean) => void;
  linkShape: LinkShape;
  onLinkShape: (shape: LinkShape) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>('addons');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('settings.title')}</h2>
        </div>

        <div className="settings-tabs">
          {TABS.map((s) => (
            <button
              key={s.id}
              className={`settings-tab${tab === s.id ? ' on' : ''}`}
              onClick={() => setTab(s.id)}
            >
              {t(s.label)}
            </button>
          ))}
        </div>

        {tab === 'addons' && (
          <>
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
          </>
        )}

        {tab === 'connection' && (
          <>
            <p className="settings-note">{t('settings.connectionNote')}</p>

            <div className="shape-picker">
              {SHAPES.map((s) => (
                <button
                  key={s.id}
                  className={`shape-option${linkShape === s.id ? ' on' : ''}`}
                  onClick={() => onLinkShape(s.id)}
                  aria-pressed={linkShape === s.id}
                >
                  {/* The same path routine the canvas uses, so the preview
                      cannot drift from what a belt actually looks like. */}
                  <svg viewBox="0 0 120 46" width="120" height="46" aria-hidden="true">
                    <path
                      d={linkPath({ x: 8, y: 8 }, { x: 112, y: 38 }, s.id)}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    />
                    <circle cx={8} cy={8} r={3.5} fill="currentColor" />
                    <circle cx={112} cy={38} r={3.5} fill="currentColor" />
                  </svg>
                  <span>{t(s.label)}</span>
                </button>
              ))}
            </div>

            <p className="settings-note">{t('settings.connectionKeep')}</p>
          </>
        )}

        <button className="offer-close" onClick={onClose}>
          {t('build.close')}
        </button>
      </div>
    </div>
  );
}
