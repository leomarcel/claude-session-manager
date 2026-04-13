import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, IDEInfo, QuickAction, LogEntry } from '../types';
import { t, Locale } from '../i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (settings: Partial<AppSettings>) => void;
  locale: Locale;
}

type Tab = 'general' | 'terminal' | 'ides' | 'actions' | 'updates' | 'logs';

type UpdateCheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'upToDate' }
  | { kind: 'error'; message: string };

export function SettingsPanel({ isOpen, onClose, settings, onSave, locale }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [ides, setIDEs] = useState<IDEInfo[]>(settings.ides);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<string>('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateState, setUpdateState] = useState<UpdateCheckState>({ kind: 'idle' });
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    setDraft(settings);
    setIDEs(settings.ides);
  }, [settings]);

  // Load logs when tab is active, auto-refresh every 2s, auto-scroll
  useEffect(() => {
    if (!isOpen || activeTab !== 'logs') return;
    const loadLogs = () => window.api.logsGet().then(entries => {
      setLogs(entries);
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }).catch(() => {});
    loadLogs();
    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, [isOpen, activeTab]);

  useEffect(() => {
    if (isOpen) {
      window.api.settingsDetectIDEs().then(setIDEs);
      window.api.getAppVersion().then(setAppVersion).catch(() => setAppVersion('?'));
    }
  }, [isOpen]);

  const handleCheckForUpdates = async () => {
    setUpdateState({ kind: 'checking' });
    try {
      const result = await window.api.updaterCheck();
      setLastChecked(new Date());
      if (result?.error) {
        setUpdateState({ kind: 'error', message: result.error });
      } else if (result?.updateAvailable && result.latestVersion) {
        setUpdateState({ kind: 'available', version: result.latestVersion });
      } else {
        setUpdateState({ kind: 'upToDate' });
      }
    } catch (e: any) {
      setLastChecked(new Date());
      setUpdateState({ kind: 'error', message: e?.message || 'Unknown error' });
    }
  };

  if (!isOpen) return null;

  // Save immediately on any change
  const saveNow = (newDraft: AppSettings, newIDEs?: IDEInfo[]) => {
    const currentIDEs = newIDEs || ides;
    const ideActions: QuickAction[] = currentIDEs
      .filter(ide => ide.enabled && ide.installed)
      .map((ide, i) => {
        const existing = newDraft.quickActions.find(a => a.id === `ide:${ide.id}`);
        return { id: `ide:${ide.id}`, type: 'ide' as const, visible: existing?.visible ?? true, order: existing?.order ?? 100 + i };
      });
    const builtinActions = newDraft.quickActions.filter(a => a.type === 'builtin');
    const allActions = [...builtinActions, ...ideActions].map((a, i) => ({ ...a, order: i }));

    onSave({
      ...newDraft,
      ides: currentIDEs.map(ide => ({ ...ide })),
      quickActions: allActions,
    });
  };

  const updateDraft = (partial: Partial<AppSettings>) => {
    const newDraft = { ...draft, ...partial };
    setDraft(newDraft);
    saveNow(newDraft);
  };

  const handleReset = async () => {
    const defaults = await window.api.settingsReset();
    setDraft(defaults);
    setIDEs(defaults.ides);
    saveNow(defaults, defaults.ides);
  };

  const toggleIDE = (id: string) => {
    const newIDEs = ides.map(ide => ide.id === id ? { ...ide, enabled: !ide.enabled } : ide);
    setIDEs(newIDEs);
    saveNow(draft, newIDEs);
  };

  const toggleAction = (id: string) => {
    const newDraft = {
      ...draft,
      quickActions: draft.quickActions.map(a => a.id === id ? { ...a, visible: !a.visible } : a),
    };
    setDraft(newDraft);
    saveNow(newDraft);
  };

  const moveAction = (id: string, direction: -1 | 1) => {
    const actions = [...draft.quickActions].sort((a, b) => a.order - b.order);
    const idx = actions.findIndex(a => a.id === id);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= actions.length) return;
    [actions[idx], actions[newIdx]] = [actions[newIdx], actions[idx]];
    const newDraft = { ...draft, quickActions: actions.map((a, i) => ({ ...a, order: i })) };
    setDraft(newDraft);
    saveNow(newDraft);
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
          {(['general', 'terminal', 'ides', 'actions', 'updates', 'logs'] as Tab[]).map(tab => {
            const labelKey = tab === 'actions' ? 'quickActions' : tab === 'terminal' ? 'terminal' : tab;
            return (
              <button
                key={tab}
                className={`settings-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {t(locale, `settings.${labelKey}`)}
              </button>
            );
          })}
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
                      onChange={() => updateDraft({ locale: 'fr' })}
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
                      onChange={() => updateDraft({ locale: 'en' })}
                    />
                    <span className="radio-flag">EN</span>
                    {t(locale, 'settings.english')}
                  </label>
                </div>
              </div>

              {/* Theme */}
              <div className="settings-group">
                <label className="settings-label">{t(locale, 'settings.theme')}</label>
                <div className="settings-radio-group">
                  <label className={`settings-radio ${draft.theme === 'dark' ? 'active' : ''}`}>
                    <input type="radio" name="theme" checked={draft.theme === 'dark'} onChange={() => updateDraft({ theme: 'dark' })} />
                    {t(locale, 'settings.themeDark')}
                  </label>
                  <label className={`settings-radio ${draft.theme === 'light' ? 'active' : ''}`}>
                    <input type="radio" name="theme" checked={draft.theme === 'light'} onChange={() => updateDraft({ theme: 'light' })} />
                    {t(locale, 'settings.themeLight')}
                  </label>
                </div>
              </div>

              {/* Notifications */}
              <div className="settings-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label className="settings-label">{t(locale, 'settings.notifications')}</label>
                    <p className="settings-desc">{t(locale, 'settings.notificationsDesc')}</p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={draft.notificationsEnabled} onChange={() => updateDraft({ notificationsEnabled: !draft.notificationsEnabled })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              {/* Tray icon */}
              <div className="settings-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label className="settings-label">{t(locale, 'settings.trayIcon')}</label>
                    <p className="settings-desc">{t(locale, 'settings.trayIconDesc')}</p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={draft.trayEnabled} onChange={() => updateDraft({ trayEnabled: !draft.trayEnabled })} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              {/* Demo mode */}
              <div className="settings-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label className="settings-label">{t(locale, 'settings.demoMode')}</label>
                    <p className="settings-desc">{t(locale, 'settings.demoModeDesc')}</p>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={draft.demoMode} onChange={() => updateDraft({ demoMode: !draft.demoMode })} />
                    <span className="toggle-slider" />
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
                          onChange={() => updateDraft({ sessionsPosition: 'left' })}
                        />
                        {t(locale, 'settings.sessionsLeft')}
                      </label>
                      <label className={`settings-radio ${draft.sessionsPosition === 'right' ? 'active' : ''}`} style={{ padding: '5px 12px' }}>
                        <input type="radio" name="sessionsPos" value="right"
                          checked={draft.sessionsPosition === 'right'}
                          onChange={() => updateDraft({ sessionsPosition: 'right' })}
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
                            onChange={() => updateDraft({ sessionsSortMode: mode })}
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
                        onChange={() => updateDraft({ showFilesPanel: !draft.showFilesPanel })}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t(locale, 'settings.showActionsPanel')}</span>
                    <label className="toggle-switch small">
                      <input type="checkbox" checked={draft.showActionsPanel}
                        onChange={() => updateDraft({ showActionsPanel: !draft.showActionsPanel })}
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
                    onChange={e => updateDraft({ refreshInterval: parseInt(e.target.value) })}
                    className="settings-slider"
                  />
                  <span className="settings-slider-value">{draft.refreshInterval}s</span>
                </div>
              </div>

              {/* Usage refresh interval */}
              <div className="settings-group">
                <label className="settings-label">{t(locale, 'settings.usageRefreshInterval')}</label>
                <p className="settings-desc">{t(locale, 'settings.usageRefreshDesc')}</p>
                <div className="settings-slider-row">
                  <input
                    type="range"
                    min="1"
                    max="30"
                    step="1"
                    value={draft.usageRefreshInterval || 2}
                    onChange={e => updateDraft({ usageRefreshInterval: parseInt(e.target.value) })}
                    className="settings-slider"
                  />
                  <span className="settings-slider-value">{draft.usageRefreshInterval || 2}m</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'terminal' && (
            <div className="settings-section">
              {/* Terminal preset */}
              <div className="settings-group">
                <label className="settings-label">{t(locale, 'settings.terminalPreset')}</label>
                <div className="settings-radio-group">
                  {(['default', 'iterm2', 'minimal'] as const).map(preset => (
                    <label key={preset} className={`settings-radio ${draft.terminalPreset === preset ? 'active' : ''}`}>
                      <input type="radio" name="preset" checked={draft.terminalPreset === preset} onChange={() => updateDraft({ terminalPreset: preset })} />
                      {t(locale, `settings.preset${preset.charAt(0).toUpperCase() + preset.slice(1)}`)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Font size */}
              <div className="settings-group">
                <label className="settings-label">{t(locale, 'settings.terminalFontSize')}</label>
                <div className="settings-slider-row">
                  <input type="range" min="10" max="20" step="1" value={draft.terminalFontSize || 13}
                    onChange={e => updateDraft({ terminalFontSize: parseInt(e.target.value) })} className="settings-slider" />
                  <span className="settings-slider-value">{draft.terminalFontSize || 13}px</span>
                </div>
              </div>

              {/* Background color */}
              <div className="settings-group">
                <label className="settings-label">Background color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <input type="color" value={draft.terminalBgColor || '#0d0d12'}
                    onChange={e => updateDraft({ terminalBgColor: e.target.value })}
                    style={{ width: 32, height: 24, border: 'none', background: 'none', cursor: 'pointer' }}
                  />
                  <button className="settings-btn secondary" style={{ padding: '3px 8px', fontSize: 10 }}
                    onClick={() => updateDraft({ terminalBgColor: '' })}>Reset</button>
                </div>
              </div>

              {/* Opacity */}
              <div className="settings-group">
                <label className="settings-label">Background opacity</label>
                <div className="settings-slider-row">
                  <input type="range" min="50" max="100" step="5" value={draft.terminalBgOpacity || 100}
                    onChange={e => updateDraft({ terminalBgOpacity: parseInt(e.target.value) })} className="settings-slider" />
                  <span className="settings-slider-value">{draft.terminalBgOpacity || 100}%</span>
                </div>
              </div>

              {/* External terminal */}
              <div className="settings-group">
                <label className="settings-label">{t(locale, 'settings.externalTerminal')}</label>
                <p className="settings-desc">{t(locale, 'settings.externalTerminalDesc')}</p>
                <div className="settings-radio-group" style={{ marginTop: 6 }}>
                  {([
                    { id: 'terminal', label: 'Terminal.app' },
                    { id: 'iterm2', label: 'iTerm2' },
                    { id: 'warp', label: 'Warp' },
                    { id: 'alacritty', label: 'Alacritty' },
                  ] as const).map(term => (
                    <label key={term.id} className={`settings-radio ${draft.externalTerminal === term.id ? 'active' : ''}`} style={{ padding: '5px 10px' }}>
                      <input type="radio" name="extterm" checked={draft.externalTerminal === term.id}
                        onChange={() => updateDraft({ externalTerminal: term.id })} />
                      {term.label}
                    </label>
                  ))}
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
                  <div
                    key={action.id}
                    className={`settings-action-item ${!action.visible ? 'hidden-action' : ''}`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('action-id', action.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromId = e.dataTransfer.getData('action-id');
                      if (fromId && fromId !== action.id) {
                        const sorted = [...draft.quickActions].sort((a, b) => a.order - b.order);
                        const fromIdx = sorted.findIndex(a => a.id === fromId);
                        const toIdx = sorted.findIndex(a => a.id === action.id);
                        if (fromIdx >= 0 && toIdx >= 0) {
                          const [moved] = sorted.splice(fromIdx, 1);
                          sorted.splice(toIdx, 0, moved);
                          const newDraft = { ...draft, quickActions: sorted.map((a, i) => ({ ...a, order: i })) };
                          setDraft(newDraft);
                          saveNow(newDraft);
                        }
                      }
                    }}
                  >
                    <div className="action-reorder drag-handle">&#9776;</div>
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

          {activeTab === 'updates' && (
            <div className="settings-section">
              {/* Current version */}
              <div className="settings-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label className="settings-label">{t(locale, 'settings.currentVersion')}</label>
                    <p className="settings-desc">{t(locale, 'app.title')}</p>
                  </div>
                  <span className="settings-version-pill">v{appVersion || '…'}</span>
                </div>
              </div>

              {/* Auto-update toggle */}
              <div className="settings-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label className="settings-label">{t(locale, 'settings.autoUpdateEnabled')}</label>
                    <p className="settings-desc">{t(locale, 'settings.autoUpdateHint')}</p>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={draft.autoUpdate !== false}
                      onChange={() => updateDraft({ autoUpdate: !draft.autoUpdate })}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              {/* Manual check */}
              <div className="settings-group">
                <label className="settings-label">{t(locale, 'settings.updateCheckLabel')}</label>
                <p className="settings-desc">
                  {lastChecked
                    ? `${t(locale, 'settings.lastChecked')}: ${lastChecked.toLocaleTimeString()}`
                    : ' '}
                </p>
                <div style={{ marginTop: 8 }}>
                  <button
                    className="settings-btn primary"
                    onClick={handleCheckForUpdates}
                    disabled={updateState.kind === 'checking'}
                  >
                    {updateState.kind === 'checking'
                      ? t(locale, 'settings.checkingForUpdates')
                      : t(locale, 'settings.checkForUpdates')}
                  </button>
                </div>
                {updateState.kind === 'upToDate' && (
                  <div className="settings-update-status success">
                    {t(locale, 'settings.noUpdateAvailable')}
                  </div>
                )}
                {updateState.kind === 'available' && (
                  <div className="settings-update-status available">
                    {t(locale, 'settings.updateAvailable')}: v{updateState.version}
                    {' · '}
                    <button className="settings-link" onClick={() => window.api.updaterInstall()}>
                      {t(locale, 'updater.install')}
                    </button>
                  </div>
                )}
                {updateState.kind === 'error' && (
                  <div className="settings-update-status error">
                    {t(locale, 'settings.updateError')}: {updateState.message}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'logs' && (() => {
            const filtered = logFilter
              ? logs.filter(l =>
                  l.message.toLowerCase().includes(logFilter.toLowerCase()) ||
                  l.source.toLowerCase().includes(logFilter.toLowerCase()) ||
                  l.level.includes(logFilter.toLowerCase())
                )
              : logs;

            return (
              <div className="logs-panel">
                <div className="logs-maintenance">
                  <div className="logs-maintenance-info">
                    <span className="logs-maintenance-label">Danger zone</span>
                    <span className="logs-maintenance-hint">Force-kill every running claude session</span>
                  </div>
                  <button
                    className="settings-btn danger"
                    onClick={async () => {
                      const confirmed = window.confirm(
                        'Kill every live claude session on this machine? Any unsaved work in active sessions will be lost.'
                      );
                      if (!confirmed) return;
                      const result = await window.api.killAllSessions();
                      alert(`Killed ${result.killedCount}/${result.total} claude processes`);
                    }}
                    title="Send SIGTERM then SIGKILL to every active claude session found on the machine"
                  >
                    Kill all claude sessions
                  </button>
                </div>
                <div className="logs-toolbar">
                  <input
                    className="logs-filter"
                    type="text"
                    placeholder={t(locale, 'settings.logsFilter')}
                    value={logFilter}
                    onChange={e => setLogFilter(e.target.value)}
                  />
                  <span className="logs-count">{filtered.length} / {logs.length}</span>
                  <button className="settings-btn secondary" style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={() => { window.api.logsClear(); setLogs([]); }}>
                    {t(locale, 'settings.logsClear')}
                  </button>
                </div>
                <div className="logs-list">
                  {filtered.length === 0 ? (
                    <div className="logs-empty">{t(locale, 'settings.logsEmpty')}</div>
                  ) : (
                    filtered.map((entry, i) => (
                      <div key={i} className={`log-entry log-${entry.level}`}>
                        <span className="log-time">{entry.timestamp.slice(11, 23)}</span>
                        <span className={`log-level-badge log-badge-${entry.level}`}>{entry.level.toUpperCase()}</span>
                        <span className="log-source">{entry.source}</span>
                        <span className="log-message">{entry.message}</span>
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button className="settings-btn secondary" onClick={handleReset}>
            {t(locale, 'settings.reset')}
          </button>
          <button className="settings-btn secondary" onClick={onClose}>
            {t(locale, 'settings.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
