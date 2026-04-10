import React, { useState, useEffect } from 'react';
import { AppSettings, IDEInfo, QuickAction } from '../types';
import { t, Locale } from '../i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: Partial<AppSettings>) => void;
  locale: Locale;
}

type Tab = 'general' | 'ides' | 'actions';

export function SettingsPanel({ isOpen, onClose, settings, onSave, locale }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [ides, setIDEs] = useState<IDEInfo[]>(settings.ides);

  useEffect(() => {
    setDraft(settings);
    setIDEs(settings.ides);
  }, [settings]);

  useEffect(() => {
    if (isOpen) {
      window.api.settingsDetectIDEs().then(setIDEs);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Rebuild quick actions from IDE toggles
    const ideActions: QuickAction[] = ides
      .filter(ide => ide.enabled && ide.installed)
      .map((ide, i) => {
        const existing = draft.quickActions.find(a => a.id === `ide:${ide.id}`);
        return {
          id: `ide:${ide.id}`,
          type: 'ide' as const,
          visible: existing?.visible ?? true,
          order: existing?.order ?? 100 + i,
        };
      });

    const builtinActions = draft.quickActions.filter(a => a.type === 'builtin');
    const allActions = [...builtinActions, ...ideActions].map((a, i) => ({ ...a, order: i }));

    onSave({
      locale: draft.locale,
      refreshInterval: draft.refreshInterval,
      sessionsPosition: draft.sessionsPosition,
      sessionsSortMode: draft.sessionsSortMode,
      showFilesPanel: draft.showFilesPanel,
      showActionsPanel: draft.showActionsPanel,
      ides: ides.map(ide => ({ ...ide })),
      quickActions: allActions,
    });
    onClose();
  };

  const handleReset = async () => {
    const defaults = await window.api.settingsReset();
    setDraft(defaults);
    setIDEs(defaults.ides);
  };

  const toggleIDE = (id: string) => {
    setIDEs(prev => prev.map(ide =>
      ide.id === id ? { ...ide, enabled: !ide.enabled } : ide
    ));
  };

  const toggleAction = (id: string) => {
    setDraft(prev => ({
      ...prev,
      quickActions: prev.quickActions.map(a =>
        a.id === id ? { ...a, visible: !a.visible } : a
      ),
    }));
  };

  const moveAction = (id: string, direction: -1 | 1) => {
    setDraft(prev => {
      const actions = [...prev.quickActions].sort((a, b) => a.order - b.order);
      const idx = actions.findIndex(a => a.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= actions.length) return prev;
      [actions[idx], actions[newIdx]] = [actions[newIdx], actions[idx]];
      return {
        ...prev,
        quickActions: actions.map((a, i) => ({ ...a, order: i })),
      };
    });
  };

  const getActionLabel = (action: QuickAction): string => {
    if (action.type === 'ide') {
      const ideId = action.id.replace('ide:', '');
      const ide = ides.find(i => i.id === ideId);
      return ide?.name || ideId;
    }
    const labelMap: Record<string, string> = {
      commit: t(locale, 'actions.commit'),
      createPR: t(locale, 'actions.createPR'),
      worktree: t(locale, 'actions.worktree'),
      finder: t(locale, 'actions.openFinder'),
      terminal: t(locale, 'actions.openTerminal'),
    };
    return labelMap[action.id] || action.id;
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <h2>{t(locale, 'settings.title')}</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        {/* Tabs */}
        <div className="settings-tabs">
          {(['general', 'ides', 'actions'] as Tab[]).map(tab => (
            <button
              key={tab}
              className={`settings-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {t(locale, `settings.${tab === 'actions' ? 'quickActions' : tab}`)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="settings-content">
          {activeTab === 'general' && (
            <div className="settings-section">
              {/* Language */}
              <div className="settings-group">
                <label className="settings-label">{t(locale, 'settings.language')}</label>
                <p className="settings-desc">{t(locale, 'settings.languageDesc')}</p>
                <div className="settings-radio-group">
                  <label className={`settings-radio ${draft.locale === 'fr' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="locale"
                      value="fr"
                      checked={draft.locale === 'fr'}
                      onChange={() => setDraft(prev => ({ ...prev, locale: 'fr' }))}
                    />
                    <span className="radio-flag">FR</span>
                    {t(locale, 'settings.french')}
                  </label>
                  <label className={`settings-radio ${draft.locale === 'en' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="locale"
                      value="en"
                      checked={draft.locale === 'en'}
                      onChange={() => setDraft(prev => ({ ...prev, locale: 'en' }))}
                    />
                    <span className="radio-flag">EN</span>
                    {t(locale, 'settings.english')}
                  </label>
                </div>
              </div>

              {/* Layout */}
              <div className="settings-group">
                <label className="settings-label">{t(locale, 'settings.layout')}</label>
                <p className="settings-desc">{t(locale, 'settings.layoutDesc')}</p>

                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Sessions position */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t(locale, 'settings.sessionsPosition')}</span>
                    <div className="settings-radio-group" style={{ margin: 0 }}>
                      <label className={`settings-radio ${draft.sessionsPosition === 'left' ? 'active' : ''}`} style={{ padding: '5px 12px' }}>
                        <input type="radio" name="sessionsPos" value="left"
                          checked={draft.sessionsPosition === 'left'}
                          onChange={() => setDraft(prev => ({ ...prev, sessionsPosition: 'left' }))}
                        />
                        {t(locale, 'settings.sessionsLeft')}
                      </label>
                      <label className={`settings-radio ${draft.sessionsPosition === 'right' ? 'active' : ''}`} style={{ padding: '5px 12px' }}>
                        <input type="radio" name="sessionsPos" value="right"
                          checked={draft.sessionsPosition === 'right'}
                          onChange={() => setDraft(prev => ({ ...prev, sessionsPosition: 'right' }))}
                        />
                        {t(locale, 'settings.sessionsRight')}
                      </label>
                    </div>
                  </div>

                  {/* Sessions sort */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t(locale, 'settings.sessionsSort')}</span>
                    <div className="settings-radio-group" style={{ margin: 0 }}>
                      {(['default', 'date', 'project'] as const).map(mode => (
                        <label key={mode} className={`settings-radio ${draft.sessionsSortMode === mode ? 'active' : ''}`} style={{ padding: '5px 10px' }}>
                          <input type="radio" name="sessionsSort" value={mode}
                            checked={draft.sessionsSortMode === mode}
                            onChange={() => setDraft(prev => ({ ...prev, sessionsSortMode: mode }))}
                          />
                          {t(locale, `settings.sort${mode.charAt(0).toUpperCase() + mode.slice(1)}`)}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Toggle panels */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t(locale, 'settings.showFilesPanel')}</span>
                    <label className="toggle-switch small">
                      <input type="checkbox" checked={draft.showFilesPanel}
                        onChange={() => setDraft(prev => ({ ...prev, showFilesPanel: !prev.showFilesPanel }))}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t(locale, 'settings.showActionsPanel')}</span>
                    <label className="toggle-switch small">
                      <input type="checkbox" checked={draft.showActionsPanel}
                        onChange={() => setDraft(prev => ({ ...prev, showActionsPanel: !prev.showActionsPanel }))}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Refresh interval */}
              <div className="settings-group">
                <label className="settings-label">{t(locale, 'settings.refreshInterval')}</label>
                <p className="settings-desc">{t(locale, 'settings.refreshDesc')}</p>
                <div className="settings-slider-row">
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={draft.refreshInterval}
                    onChange={e => setDraft(prev => ({ ...prev, refreshInterval: parseInt(e.target.value) }))}
                    className="settings-slider"
                  />
                  <span className="settings-slider-value">{draft.refreshInterval}s</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ides' && (
            <div className="settings-section">
              <p className="settings-desc" style={{ marginBottom: 16 }}>
                {t(locale, 'settings.availableIDEsDesc')}
              </p>
              <div className="settings-ide-list">
                {ides.map(ide => (
                  <div key={ide.id} className={`settings-ide-item ${!ide.installed ? 'not-installed' : ''}`}>
                    <div className="ide-info">
                      <span className="ide-name">{ide.name}</span>
                      <span className={`ide-status ${ide.installed ? 'installed' : ''}`}>
                        {ide.installed ? t(locale, 'settings.detected') : t(locale, 'settings.notDetected')}
                      </span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={ide.enabled && ide.installed}
                        disabled={!ide.installed}
                        onChange={() => toggleIDE(ide.id)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="settings-section">
              <p className="settings-desc" style={{ marginBottom: 16 }}>
                {t(locale, 'settings.actionsConfigDesc')}
              </p>
              <div className="settings-actions-list">
                {[...draft.quickActions].sort((a, b) => a.order - b.order).map(action => (
                  <div key={action.id} className={`settings-action-item ${!action.visible ? 'hidden-action' : ''}`}>
                    <div className="action-reorder">
                      <button onClick={() => moveAction(action.id, -1)} className="reorder-btn">&uarr;</button>
                      <button onClick={() => moveAction(action.id, 1)} className="reorder-btn">&darr;</button>
                    </div>
                    <span className="action-item-name">{getActionLabel(action)}</span>
                    <span className={`action-type-badge ${action.type}`}>{action.type}</span>
                    <label className="toggle-switch small">
                      <input
                        type="checkbox"
                        checked={action.visible}
                        onChange={() => toggleAction(action.id)}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button className="settings-btn secondary" onClick={handleReset}>
            {t(locale, 'settings.reset')}
          </button>
          <div className="settings-footer-right">
            <button className="settings-btn secondary" onClick={onClose}>
              {t(locale, 'settings.cancel')}
            </button>
            <button className="settings-btn primary" onClick={handleSave}>
              {t(locale, 'settings.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
