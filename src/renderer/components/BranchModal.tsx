import React, { useState, useEffect } from 'react';
import { Locale, t } from '../i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  locale: Locale;
}

export function BranchModal({ isOpen, onClose, projectPath, locale }: Props) {
  const [branches, setBranches] = useState<{ name: string; current: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [useWorktree, setUseWorktree] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    setSearch('');
    window.api.getBranches(projectPath).then(b => {
      setBranches(b);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen, projectPath]);

  const filteredBranches = search.trim()
    ? branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase().trim()))
    : branches;

  if (!isOpen) return null;

  const handleSwitch = async (branch: string) => {
    setSwitching(true);
    setError('');

    if (useWorktree) {
      const wtPath = `${projectPath}-${branch}`;
      const result = await window.api.gitCreateWorktree(projectPath, branch, wtPath);
      if (!result.success) setError(result.error || 'Failed');
    } else {
      const result = await window.api.gitSwitchBranch(projectPath, branch);
      if (!result.success) setError(result.error || 'Failed');
    }

    setSwitching(false);
    if (!error) {
      // Refresh branches
      const updated = await window.api.getBranches(projectPath);
      setBranches(updated);
    }
  };

  const currentBranch = branches.find(b => b.current)?.name || '';

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="new-session-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Branches</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="new-session-content">
          {/* Worktree toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t(locale, 'branch.useWorktree')}</span>
            <label className="toggle-switch small">
              <input type="checkbox" checked={useWorktree} onChange={() => setUseWorktree(p => !p)} />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Search */}
          <div className="branch-search">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="branch-search-input"
              type="text"
              placeholder={t(locale, 'sidebar.search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button className="branch-search-clear" onClick={() => setSearch('')}>&times;</button>
            )}
          </div>

          {error && (
            <div style={{ fontSize: 11, color: 'var(--red)', background: 'rgba(255,107,122,0.1)', padding: '6px 10px', borderRadius: 6, marginBottom: 8 }}>
              {error}
            </div>
          )}

          {loading ? (
            <div className="logs-empty">{t(locale, 'status.loading')}</div>
          ) : filteredBranches.length === 0 ? (
            <div className="logs-empty">No matching branch</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 300, overflowY: 'auto' }}>
              {filteredBranches.map(b => (
                <button
                  key={b.name}
                  className={`new-session-project ${b.current ? 'selected' : ''}`}
                  onClick={() => !b.current && handleSwitch(b.name)}
                  disabled={switching || b.current}
                  style={{ opacity: b.current ? 0.6 : 1 }}
                >
                  <span className="new-session-project-name">
                    {b.current ? '● ' : '○ '}{b.name}
                  </span>
                  {b.current && <span style={{ fontSize: 9, color: 'var(--green)' }}>current</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="settings-footer">
          <div />
          <button className="settings-btn secondary" onClick={onClose}>
            {t(locale, 'settings.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
