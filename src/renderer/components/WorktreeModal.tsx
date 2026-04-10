import React, { useState, useEffect } from 'react';
import { WorktreeInfo } from '../types';
import { Locale, t } from '../i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  locale: Locale;
}

export function WorktreeModal({ isOpen, onClose, projectPath, locale }: Props) {
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    window.api.getWorktrees(projectPath).then(wt => {
      setWorktrees(wt);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen, projectPath]);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="new-session-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Worktrees</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="new-session-content">
          {loading ? (
            <div className="logs-empty">{t(locale, 'status.loading')}</div>
          ) : worktrees.length === 0 ? (
            <div className="logs-empty">No worktrees</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {worktrees.map((wt, i) => (
                <div key={i} className="worktree-item">
                  <div className="worktree-info">
                    <span className="worktree-branch">
                      {wt.branch || (wt.bare ? '(bare)' : '(detached)')}
                    </span>
                    <span className="worktree-path">{wt.path}</span>
                  </div>
                  <span className="worktree-head">{wt.head.slice(0, 8)}</span>
                </div>
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
