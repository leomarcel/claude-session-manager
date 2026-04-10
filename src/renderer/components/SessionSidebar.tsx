import React, { useState } from 'react';
import { ClaudeSession, SessionSortMode } from '../types';
import { Locale, t } from '../i18n';
import { ClaudeIcon, SessionIcon } from './Icons';

interface Props {
  sessions: ClaudeSession[];
  archivedSessions: ClaudeSession[];
  selectedSession: ClaudeSession | null;
  onSelectSession: (session: ClaudeSession) => void;
  onRefresh: () => void;
  onRename: (projectPath: string, name: string) => void;
  onArchive: (projectPath: string) => void;
  onUnarchive: (projectPath: string) => void;
  onNewSession: () => void;
  sortMode: SessionSortMode;
  locale: Locale;
}

function getSessionDisplayName(session: ClaudeSession): string {
  if (session.customName) return session.customName;
  if (session.firstPrompt) {
    // Truncate to 50 chars for sidebar display
    return session.firstPrompt.length > 50
      ? session.firstPrompt.slice(0, 50) + '...'
      : session.firstPrompt;
  }
  return session.projectName;
}

export function SessionSidebar({
  sessions, archivedSessions, selectedSession,
  onSelectSession, onRefresh, onRename, onArchive, onUnarchive, onNewSession, sortMode, locale
}: Props) {
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; session: ClaudeSession } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const statusLabel = (status: string) => {
    switch (status) {
      case 'active': return t(locale, 'sidebar.active');
      case 'busy': return t(locale, 'sidebar.busy');
      default: return t(locale, 'sidebar.idle');
    }
  };

  const startRename = (session: ClaudeSession) => {
    setEditingPath(session.projectPath);
    setEditValue(session.customName || session.firstPrompt || session.projectName);
    setContextMenu(null);
  };

  const commitRename = () => {
    if (editingPath) {
      onRename(editingPath, editValue.trim());
      setEditingPath(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, session: ClaudeSession) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, session });
  };

  const closeContextMenu = () => setContextMenu(null);

  const renderSession = (session: ClaudeSession, isArchived = false, hideProjectPath = false) => {
    const displayName = getSessionDisplayName(session);
    const isEditing = editingPath === session.projectPath;

    return (
      <div
        key={`${session.pid}-${session.projectPath}-${session.conversationId || ''}`}
        className={`session-item ${selectedSession?.projectPath === session.projectPath ? 'active' : ''} ${isArchived ? 'archived' : ''}`}
        onClick={() => onSelectSession(session)}
        onContextMenu={(e) => handleContextMenu(e, session)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <ClaudeIcon size={16} />
          {isEditing ? (
            <input
              className="session-rename-input"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditingPath(null);
              }}
              autoFocus
              onClick={e => e.stopPropagation()}
              placeholder={t(locale, 'sidebar.renamePlaceholder')}
            />
          ) : (
            <span
              className="session-name"
              style={{ marginBottom: 0 }}
              onDoubleClick={(e) => { e.stopPropagation(); startRename(session); }}
              title={`${t(locale, 'sidebar.renameTooltip')}\n${session.projectPath}`}
            >
              {displayName}
            </span>
          )}
        </div>
        {!hideProjectPath && (
          <div className="session-path" title={session.projectPath}>
            {session.projectPath}
          </div>
        )}
        {sortMode === 'date' && (
          <div className="session-date">
            {new Date(session.startTime).toLocaleString()}
          </div>
        )}
        {session.firstPrompt && !session.customName && (
          <div className="session-first-prompt" title={session.firstPrompt}>
            {session.projectName}
          </div>
        )}
        <div className="session-meta">
          <div className="session-status">
            <SessionIcon status={session.status} size={12} />
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
              {statusLabel(session.status)}
            </span>
          </div>
          <span className="session-model">{session.model}</span>
          {session.messageCount && session.messageCount > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {session.messageCount} {t(locale, 'sidebar.msgs')}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderGroupedByProject = (list: ClaudeSession[]) => {
    // Group sessions by the last folder name in projectPath
    const groups = new Map<string, { path: string; sessions: ClaudeSession[] }>();
    for (const s of list) {
      const dirName = s.projectPath.split('/').pop() || s.projectPath;
      const existing = groups.get(s.projectPath);
      if (existing) {
        existing.sessions.push(s);
      } else {
        groups.set(s.projectPath, { path: s.projectPath, sessions: [s] });
      }
    }

    // Merge entries with same folder name under the same projectPath
    const merged = new Map<string, { dirName: string; path: string; sessions: ClaudeSession[] }>();
    for (const [path, group] of groups) {
      const dirName = path.split('/').pop() || path;
      const existing = merged.get(dirName);
      if (existing) {
        existing.sessions.push(...group.sessions);
      } else {
        merged.set(dirName, { dirName, path, sessions: group.sessions });
      }
    }

    return Array.from(merged.values()).map(group => (
      <div key={group.path} className="project-group">
        <div className="project-group-header" title={group.path}>
          <span className="project-group-folder">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
              <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
          </span>
          <span className="project-group-name">{group.dirName}</span>
          <span className="project-group-count">{group.sessions.length}</span>
        </div>
        <div className="project-group-sessions">
          {group.sessions.map(s => renderSession(s, false, true))}
        </div>
      </div>
    ));
  };

  return (
    <div className="sidebar-left" onClick={closeContextMenu}>
      <div className="sidebar-header">
        <div className="sidebar-header-row">
          <span>{t(locale, 'sidebar.sessions')} ({sessions.length})</span>
          <button className="refresh-btn" onClick={onRefresh} title={t(locale, 'sidebar.refresh')}>&#x21bb;</button>
        </div>
      </div>

      <div className="session-list">
        {sessions.length === 0 ? (
          <div style={{ padding: '20px 12px', textAlign: 'center' }}>
            <div style={{ opacity: 0.3, marginBottom: 10, display: 'flex', justifyContent: 'center' }}>
              <ClaudeIcon size={36} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t(locale, 'sidebar.noSessions')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6, marginTop: 6 }}>
              {t(locale, 'sidebar.noSessionsHint')}
            </div>
          </div>
        ) : sortMode === 'project' ? (
          renderGroupedByProject(sessions)
        ) : (
          sessions.map(s => renderSession(s))
        )}

        {/* Archived sessions (collapsible) */}
        {archivedSessions.length > 0 && (
          <>
            <button
              className="archived-toggle"
              onClick={() => setShowArchived(prev => !prev)}
            >
              <span className="archived-chevron" style={{ transform: showArchived ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                &#9656;
              </span>
              {t(locale, 'sidebar.archived')} ({archivedSessions.length})
            </button>
            {showArchived && (
              <div className="archived-list">
                {archivedSessions.map(s => renderSession(s, true))}
              </div>
            )}
          </>
        )}
      </div>

      <button className="new-session-btn" onClick={onNewSession}>
        {t(locale, 'sidebar.newSession')}
      </button>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button className="context-menu-item" onClick={() => startRename(contextMenu.session)}>
            &#9998; {t(locale, 'sidebar.rename')}
          </button>
          {contextMenu.session.archived ? (
            <button className="context-menu-item" onClick={() => { onUnarchive(contextMenu.session.projectPath); closeContextMenu(); }}>
              &#9776; {t(locale, 'sidebar.unarchive')}
            </button>
          ) : (
            <button className="context-menu-item archive" onClick={() => { onArchive(contextMenu.session.projectPath); closeContextMenu(); }}>
              &#9776; {t(locale, 'sidebar.archive')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
