import { useRef, useState } from 'react';
import { ADDONS, type AddonId, type AddonSettings } from '../data';
import type { LinkShape } from '../engine/types';
import Flag from './Flag';
import { linkPath } from './geometry';
import type { Theme } from './useTheme';
import { LANGUAGES, type Lang } from '../i18n';
import { useLang } from '../i18n/useLang';
import type { Key } from '../i18n';
import type { Game } from './useGame';

/**
 * Settings.
 *
 * The top bar is the most contested row in the game and was carrying nine
 * buttons, most of which are touched once a session — language, theme, save,
 * export, import and reset all now live on the Others tab here, leaving the
 * bar for the things you actually use while playing: the clock, the speeds
 * and the readouts.
 */
type Tab = 'addons' | 'connection' | 'others';

const TABS: { id: Tab; label: Key }[] = [
  { id: 'addons', label: 'settings.tabAddons' },
  { id: 'connection', label: 'settings.tabConnection' },
  { id: 'others', label: 'settings.tabOthers' },
];

const SHAPES: { id: LinkShape; label: Key }[] = [
  { id: 'curve', label: 'settings.shapeCurve' },
  { id: 'straight', label: 'settings.shapeStraight' },
  { id: 'elbow', label: 'settings.shapeElbow' },
];

export default function SettingsDialog({
  game,
  theme,
  onToggleTheme,
  addons,
  onToggleAddon,
  linkShape,
  onLinkShape,
  onClose,
}: {
  game: Game;
  theme: Theme;
  onToggleTheme: () => void;
  addons: AddonSettings;
  onToggleAddon: (id: AddonId, on: boolean) => void;
  linkShape: LinkShape;
  onLinkShape: (shape: LinkShape) => void;
  onClose: () => void;
}) {
  const { lang, setLang, t } = useLang();
  const [tab, setTab] = useState<Tab>('addons');
  const fileInput = useRef<HTMLInputElement>(null);
  const { save, reset, exportFile, importFile } = game;
  // The next language round the list. With two, that is simply "the other one".
  const nextLang = LANGUAGES[(LANGUAGES.findIndex((l) => l.code === lang) + 1) % LANGUAGES.length];

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

        {tab === 'others' && (
          <>
            <p className="settings-note">{t('settings.othersNote')}</p>

            <div className="settings-row-line">
              <span className="settings-row-name">{t('top.language')}</span>
              <button
                className="lang-btn"
                title={t('top.switchTo', { lang: nextLang.label })}
                aria-label={t('top.switchTo', { lang: nextLang.label })}
                onClick={() => setLang(nextLang.code as Lang)}
              >
                <Flag code={nextLang.code} />
              </button>
            </div>

            <div className="settings-row-line">
              <span className="settings-row-name">
                {theme === 'dark' ? t('top.toLight') : t('top.toDark')}
              </span>
              <button onClick={onToggleTheme}>{theme === 'dark' ? '☀' : '☾'}</button>
            </div>

            <div className="section-title">{t('settings.othersSave')}</div>
            <div className="settings-actions">
              <button onClick={save}>{t('top.save')}</button>
              <button onClick={exportFile} title={t('top.exportTitle')}>
                {t('top.export')}
              </button>
              <button onClick={() => fileInput.current?.click()} title={t('top.importTitle')}>
                {t('top.import')}
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset the input so picking the same file twice still fires.
                e.target.value = '';
                if (file) void importFile(file);
              }}
            />

            <div className="section-title">{t('settings.othersDanger')}</div>
            <button
              className="danger"
              style={{ width: '100%' }}
              onClick={() => {
                if (confirm(t('top.resetConfirm'))) {
                  reset();
                  onClose();
                }
              }}
            >
              {t('top.reset')}
            </button>
          </>
        )}

        <button className="offer-close" onClick={onClose}>
          {t('build.close')}
        </button>
      </div>
    </div>
  );
}
