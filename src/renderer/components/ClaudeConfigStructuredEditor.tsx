import React from 'react';
import { Locale, t } from '../i18n';

interface Props {
  cfg: any;
  onChange: (newCfg: any) => void;
  locale: Locale;
}

/**
 * Pure form editor for the most common Claude Code settings fields.
 * Mutates the parsed config object via `onChange` while preserving any
 * unknown fields (hooks, plugins, etc.) untouched.
 */
export function ClaudeConfigStructuredEditor({ cfg, onChange, locale }: Props) {
  const setField = (path: string[], value: any) => {
    const next = JSON.parse(JSON.stringify(cfg));
    let obj = next;
    for (let i = 0; i < path.length - 1; i++) {
      if (typeof obj[path[i]] !== 'object' || obj[path[i]] === null) obj[path[i]] = {};
      obj = obj[path[i]];
    }
    if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
      delete obj[path[path.length - 1]];
    } else {
      obj[path[path.length - 1]] = value;
    }
    onChange(next);
  };

  const allowedTools: string[] = Array.isArray(cfg?.permissions?.allowedTools) ? cfg.permissions.allowedTools : [];
  const disallowedTools: string[] = Array.isArray(cfg?.permissions?.disallowedTools) ? cfg.permissions.disallowedTools : [];
  const mcpServers: Record<string, any> = (cfg?.mcpServers && typeof cfg.mcpServers === 'object') ? cfg.mcpServers : {};

  return (
    <div className="cc-structured">
      {/* Model */}
      <div className="cc-field">
        <label className="cc-field-label">{t(locale, 'settings.cc_model')}</label>
        <input
          type="text"
          className="cc-input"
          placeholder="claude-opus-4-6"
          value={cfg.model || ''}
          onChange={e => setField(['model'], e.target.value || undefined)}
        />
      </div>

      {/* Effort level */}
      <div className="cc-field">
        <label className="cc-field-label">{t(locale, 'settings.cc_effortLevel')}</label>
        <div className="settings-radio-group" style={{ margin: 0 }}>
          {['low', 'medium', 'high'].map(level => (
            <label key={level} className={`settings-radio ${cfg.effortLevel === level ? 'active' : ''}`} style={{ padding: '5px 12px' }}>
              <input type="radio" name="cc-effort" checked={cfg.effortLevel === level} onChange={() => setField(['effortLevel'], level)} />
              {level}
            </label>
          ))}
        </div>
      </div>

      {/* Always thinking */}
      <div className="cc-field cc-field-row">
        <label className="cc-field-label">{t(locale, 'settings.cc_alwaysThinking')}</label>
        <label className="toggle-switch">
          <input type="checkbox" checked={!!cfg.alwaysThinkingEnabled} onChange={() => setField(['alwaysThinkingEnabled'], !cfg.alwaysThinkingEnabled || undefined)} />
          <span className="toggle-slider" />
        </label>
      </div>

      {/* Permissions defaultMode */}
      <div className="cc-field">
        <label className="cc-field-label">{t(locale, 'settings.cc_defaultMode')}</label>
        <div className="settings-radio-group" style={{ margin: 0, flexWrap: 'wrap' }}>
          {['ask', 'acceptEdits', 'plan', 'bypassPermissions'].map(mode => (
            <label key={mode} className={`settings-radio ${cfg.permissions?.defaultMode === mode ? 'active' : ''}`} style={{ padding: '5px 10px' }}>
              <input type="radio" name="cc-defmode" checked={cfg.permissions?.defaultMode === mode} onChange={() => setField(['permissions', 'defaultMode'], mode)} />
              {mode}
            </label>
          ))}
        </div>
      </div>

      {/* Allowed tools */}
      <div className="cc-field">
        <label className="cc-field-label">{t(locale, 'settings.cc_allowedTools')}</label>
        <div className="cc-string-list">
          {allowedTools.map((tool, i) => (
            <div key={i} className="cc-string-row">
              <input type="text" className="cc-input" value={tool} onChange={e => {
                const next = [...allowedTools];
                next[i] = e.target.value;
                setField(['permissions', 'allowedTools'], next);
              }} />
              <button className="cc-string-delete" onClick={() => {
                setField(['permissions', 'allowedTools'], allowedTools.filter((_, idx) => idx !== i));
              }}>&times;</button>
            </div>
          ))}
          <button className="settings-btn secondary cc-add-btn" onClick={() => setField(['permissions', 'allowedTools'], [...allowedTools, ''])}>
            + {t(locale, 'settings.cc_addTool')}
          </button>
        </div>
      </div>

      {/* Disallowed tools */}
      <div className="cc-field">
        <label className="cc-field-label">{t(locale, 'settings.cc_disallowedTools')}</label>
        <div className="cc-string-list">
          {disallowedTools.map((tool, i) => (
            <div key={i} className="cc-string-row">
              <input type="text" className="cc-input" value={tool} onChange={e => {
                const next = [...disallowedTools];
                next[i] = e.target.value;
                setField(['permissions', 'disallowedTools'], next);
              }} />
              <button className="cc-string-delete" onClick={() => {
                setField(['permissions', 'disallowedTools'], disallowedTools.filter((_, idx) => idx !== i));
              }}>&times;</button>
            </div>
          ))}
          <button className="settings-btn secondary cc-add-btn" onClick={() => setField(['permissions', 'disallowedTools'], [...disallowedTools, ''])}>
            + {t(locale, 'settings.cc_addTool')}
          </button>
        </div>
      </div>

      {/* MCP servers */}
      <div className="cc-field">
        <label className="cc-field-label">{t(locale, 'settings.cc_mcpServers')}</label>
        <p className="settings-desc">{t(locale, 'settings.cc_mcpServersDesc')}</p>
        <div className="cc-mcp-list">
          {Object.entries(mcpServers).map(([name, server]: [string, any]) => (
            <div key={name} className="cc-mcp-row">
              <div className="cc-mcp-row-head">
                <input
                  type="text"
                  className="cc-input"
                  value={name}
                  onChange={e => {
                    const newName = e.target.value;
                    if (!newName || newName === name) return;
                    const next = { ...mcpServers };
                    delete next[name];
                    next[newName] = server;
                    setField(['mcpServers'], next);
                  }}
                />
                <button className="cc-string-delete" onClick={() => {
                  const next = { ...mcpServers };
                  delete next[name];
                  setField(['mcpServers'], Object.keys(next).length ? next : undefined);
                }}>&times;</button>
              </div>
              <input
                type="text"
                className="cc-input"
                placeholder="command"
                value={server.command || ''}
                onChange={e => setField(['mcpServers', name], { ...server, command: e.target.value })}
              />
              <input
                type="text"
                className="cc-input"
                placeholder="args (space-separated)"
                value={Array.isArray(server.args) ? server.args.join(' ') : ''}
                onChange={e => setField(['mcpServers', name], { ...server, args: e.target.value.split(/\s+/).filter(Boolean) })}
              />
            </div>
          ))}
          <button className="settings-btn secondary cc-add-btn" onClick={() => {
            const newName = `server-${Object.keys(mcpServers).length + 1}`;
            setField(['mcpServers'], { ...mcpServers, [newName]: { command: '', args: [] } });
          }}>
            + {t(locale, 'settings.cc_addMcp')}
          </button>
        </div>
      </div>

      <p className="settings-desc" style={{ marginTop: 10 }}>
        {t(locale, 'settings.cc_advancedNote')}
      </p>
    </div>
  );
}
