import React, { useState } from 'react';
import { ClaudeSession } from '../types';
import { Locale, t } from '../i18n';
import { ClaudeIcon } from './Icons';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (projectPath: string) => void;
  sessions: ClaudeSession[];
  locale: Locale;
}

export function NewSessionModal({ isOpen, onClose, onCreate, sessions, locale }: Props) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  if (!isOpen) return null;

  // Unique project paths from existing sessions
  const existingPaths = [...new Set(sessions.map(s => s.projectPath))];

  const handleBrowse = async () => {
    const folder = await window.api.dialogSelectFolder();
    if (folder) {
      setSelectedPath(folder);
    }
  };

  const handleCreate = () => {
    if (selectedPath) {
      onCreate(selectedPath);
      setSelectedPath(null);
      onClose();
    }
  };

  const handleSelectExisting = (path: string) => {
    setSelectedPath(path);
  };

  const handleDoubleClickExisting = (path: string) => {
    onCreate(path);
    setSelectedPath(null);
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="new-session-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="settings-header">
          <h2>{t(locale, 'sidebar.newSessionTitle')}</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>

        <div className="new-session-content">
          {/* Browse button */}
          <button className="new-session-browse" onClick={handleBrowse}>
            <div className="new-session-browse-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
                <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
                <line x1="12" y1="11" x2="12" y2="17"/>
                <line x1="9" y1="14" x2="15" y2="14"/>
              </svg>
            </div>
            <div className="new-session-browse-text">
              <span className="new-session-browse-label">{t(locale, 'sidebar.newSessionBrowse')}</span>
              <span className="new-session-browse-desc">{t(locale, 'sidebar.newSessionBrowseDesc')}</span>
            </div>
          </button>

          {/* Selected path preview */}
          {selectedPath && (
            <div className="new-session-selected">
              <ClaudeIcon size={16} />
              <span className="new-session-selected-path">{selectedPath}</span>
            </div>
          )}

          {/* Existing projects */}
          {existingPaths.length > 0 && (
            <>
              <div className="new-session-divider">
                <span>{t(locale, 'sidebar.newSessionExisting')}</span>
              </div>
              <div className="new-session-projects">
                {existingPaths.map(p => (
                  <button
                    key={p}
                    className={`new-session-project ${selectedPath === p ? 'selected' : ''}`}
                    onClick={() => handleSelectExisting(p)}
                    onDoubleClick={() => handleDoubleClickExisting(p)}
                  >
                    <span className="new-session-project-name">{p.split('/').pop()}</span>
                    <span className="new-session-project-path">{p}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <div />
          <div className="settings-footer-right">
            <button className="settings-btn secondary" onClick={onClose}>
              {t(locale, 'sidebar.newSessionCancel')}
            </button>
            <button
              className="settings-btn primary"
              onClick={handleCreate}
              disabled={!selectedPath}
            >
              {t(locale, 'sidebar.newSessionCreate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
