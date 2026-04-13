import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { ClaudeSession, SessionSortMode, LiveStatus, SessionFlag, ConversationMatch } from '../types';
import { Locale, t } from '../i18n';
import { ClaudeIcon, SessionIcon } from './Icons';

interface Props {
  sessions: ClaudeSession[];
  archivedSessions: ClaudeSession[];
  selectedSession: ClaudeSession | null;
  onSelectSession: (session: ClaudeSession) => void;
  onRefresh: () => void | Promise<void>;
  onRename: (key: string, name: string) => void;
  onArchive: (key: string) => void;
  onUnarchive: (key: string) => void;
  onDelete: (key: string) => void;
  onViewHistory: (session: ClaudeSession) => void;
  onReconnect: (session: ClaudeSession) => void;
  onSetFlag: (key: string, flagId: string | null) => void;
  onTogglePin: (key: string, pinned: boolean) => void;
  onExportMarkdown: (session: ClaudeSession) => void;
  flags: SessionFlag[];
  onNewSession: () => void;
  onCreateSessionInProject: (projectPath: string) => void;
  sortMode: SessionSortMode;
  locale: Locale;
}

const LIVE_STATUSES: LiveStatus[] = [
  'running',
  'tool_executing',
  'waiting_input',
  'idle',
  'completed',
  'crashed',
  'disconnected',
];

const liveStatusLabelKey = (st: LiveStatus): string => {
  const map: Record<LiveStatus, string> = {
    disconnected: 'sidebar.liveDisconnected',
    running: 'sidebar.liveRunning',
    tool_executing: 'sidebar.liveToolExecuting',
    waiting_input: 'sidebar.liveWaitingInput',
    idle: 'sidebar.liveIdle',
    completed: 'sidebar.liveCompleted',
    crashed: 'sidebar.liveCrashed',
  };
  return map[st];
};

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
  onSelectSession, onRefresh, onRename, onArchive, onUnarchive, onDelete, onViewHistory, onReconnect, onSetFlag, onTogglePin, onExportMarkdown, flags, onNewSession, onCreateSessionInProject, sortMode, locale
}: Props) {
  const sortedFlags = [...flags].sort((a, b) => a.order - b.order);
  const flagById = (id?: string) => id ? sortedFlags.find(f => f.id === id) : undefined;
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; session: ClaudeSession } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filterProjects, setFilterProjects] = useState<Set<string>>(new Set());
  const [filterDate, setFilterDate] = useState<'all' | 'today' | 'week'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInContent, setSearchInContent] = useState(false);
  const [contentMatches, setContentMatches] = useState<Map<string, ConversationMatch>>(new Map());
  const [contentSearching, setContentSearching] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState<Set<LiveStatus>>(new Set());
  const [groupByStatus, setGroupByStatus] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [contextMenuStyle, setContextMenuStyle] = useState<React.CSSProperties>({});

  const toggleMultiSelect = (key: string) => {
    setMultiSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const clearMultiSelect = () => setMultiSelected(new Set());

  const handleBulkArchive = async () => {
    for (const key of Array.from(multiSelected)) {
      await onArchive(key);
    }
    clearMultiSelect();
  };
  const handleBulkDelete = () => {
    const msg = t(locale, 'sidebar.bulkDeleteConfirm').replace('{count}', String(multiSelected.size));
    if (!window.confirm(msg)) return;
    Array.from(multiSelected).forEach(key => onDelete(key));
    clearMultiSelect();
  };
  const handleBulkSetFlag = (flagId: string | null) => {
    Array.from(multiSelected).forEach(key => onSetFlag(key, flagId));
    clearMultiSelect();
  };

  // Debounced full-text search inside conversations
  useEffect(() => {
    if (!searchInContent || !searchQuery || searchQuery.trim().length < 2) {
      setContentMatches(new Map());
      return;
    }
    let cancelled = false;
    setContentSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await window.api.searchConversations(searchQuery);
        if (cancelled) return;
        if (res.ok && res.matches) {
          const map = new Map<string, ConversationMatch>();
          for (const m of res.matches) {
            map.set(m.conversationId, m);
            map.set(`${m.projectPath}:fallback`, m);
          }
          setContentMatches(map);
        }
      } catch {}
      if (!cancelled) setContentSearching(false);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, searchInContent]);

  // Reposition the context menu after mount so it never overflows the viewport
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setContextMenuStyle({});
      return;
    }
    const rect = contextMenuRef.current.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = contextMenu.y;
    let left = contextMenu.x;
    if (top + rect.height + margin > vh) top = Math.max(margin, vh - rect.height - margin);
    if (left + rect.width + margin > vw) left = Math.max(margin, vw - rect.width - margin);
    setContextMenuStyle({ top, left });
  }, [contextMenu]);

  // Close the context menu on any outside click, Escape, or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    const onScroll = () => setContextMenu(null);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [contextMenu]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const start = Date.now();
    try { await onRefresh(); } finally {
      const elapsed = Date.now() - start;
      const minDuration = 600;
      if (elapsed < minDuration) await new Promise(r => setTimeout(r, minDuration - elapsed));
      setRefreshing(false);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'active': return t(locale, 'sidebar.active');
      case 'busy': return t(locale, 'sidebar.busy');
      default: return t(locale, 'sidebar.idle');
    }
  };

  const sessionKey = (s: ClaudeSession) => s.conversationId || `${s.projectPath}:${s.startTime}`;

  const startRename = (session: ClaudeSession) => {
    setEditingPath(sessionKey(session));
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
    const isEditing = editingPath === sessionKey(session);

    const sKey = sessionKey(session);
    const isMultiSelected = multiSelected.has(sKey);

    return (
      <div
        key={sKey}
        className={`session-item ${selectedSession?.projectPath === session.projectPath && selectedSession?.conversationId === session.conversationId ? 'active' : ''} ${isArchived ? 'archived' : ''} ${isMultiSelected ? 'multi-selected' : ''}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) {
            toggleMultiSelect(sKey);
          } else if (multiSelected.size > 0) {
            // Single click while multi-select active: clear and select normally
            clearMultiSelect();
            onSelectSession(session);
          } else {
            onSelectSession(session);
          }
        }}
        onContextMenu={(e) => handleContextMenu(e, session)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
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
            <>
              {session.pinned && (
                <span className="session-pin-icon" title={t(locale, 'sidebar.pinned')}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="2"/><path d="M5 17h14l-1.5-3.5a4 4 0 0 1-.5-2V7a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v4.5a4 4 0 0 1-.5 2L5 17z"/></svg>
                </span>
              )}
              <span
                className="session-name"
                style={{ marginBottom: 0 }}
                onDoubleClick={(e) => { e.stopPropagation(); startRename(session); }}
                title={`${t(locale, 'sidebar.renameTooltip')}\n${session.projectPath}`}
              >
                {displayName}
              </span>
            </>
          )}
          {session.isWorktree && <span className="worktree-badge">worktree</span>}
        </div>
        {session.isWorktree && session.worktreeBranch && (
          <div className="session-worktree-info">
            {session.worktreeBranch} &middot; {session.projectPath.split('/').pop()}
          </div>
        )}
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
          <span className={`live-inline live-${session.liveStatus || 'disconnected'}`}>
            <span className={`live-dot live-${session.liveStatus || 'disconnected'}`} />
            {t(locale, liveStatusLabelKey(session.liveStatus || 'disconnected'))}
          </span>
          {session.model && session.model !== 'Claude' && <span className="session-model">{session.model}</span>}
        </div>
        {session.liveDetail && (
          <div className="session-live-detail" title={session.liveDetail}>
            {session.liveDetail}
          </div>
        )}
        {(() => {
          const flag = flagById(session.flagId);
          if (!flag) return null;
          return (
            <div className="session-flag" style={{ background: flag.color + '22', color: flag.color, borderColor: flag.color + '55' }}>
              <span className="session-flag-dot" style={{ background: flag.color }} />
              {flag.name}
            </div>
          );
        })()}
      </div>
    );
  };

  // Apply search + filters
  const filteredSessions = sessions.filter(s => {
    // Search
    if (searchQuery) {
      if (searchInContent) {
        // Full-text mode: only sessions whose conversationId appears in content matches
        if (!s.conversationId || !contentMatches.has(s.conversationId)) return false;
      } else {
        const q = searchQuery.toLowerCase();
        const haystack = [
          s.projectName, s.projectPath, s.customName || '',
          s.firstPrompt || '', s.summary || '', s.model
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
    }
    // Status filter
    if (filterStatuses.size > 0 && !filterStatuses.has(s.liveStatus || 'disconnected')) return false;
    // Project filter
    if (filterProjects.size > 0 && !filterProjects.has(s.projectPath)) return false;
    // Date filter
    if (filterDate === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      return s.startTime.slice(0, 10) === today;
    }
    if (filterDate === 'week') {
      const now = Date.now();
      const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
      return new Date(s.startTime).getTime() > weekAgo;
    }
    return true;
  });

  const renderGroupedByProject = (list: ClaudeSession[]) => {
    // Group sessions by full projectPath (no collision on same-named folders)
    const groups = new Map<string, { dirName: string; path: string; sessions: ClaudeSession[] }>();
    for (const s of list) {
      const existing = groups.get(s.projectPath);
      if (existing) {
        existing.sessions.push(s);
      } else {
        const dirName = s.projectPath.split('/').pop() || s.projectPath;
        groups.set(s.projectPath, { dirName, path: s.projectPath, sessions: [s] });
      }
    }

    return Array.from(groups.values()).map(group => (
      <div key={group.path} className="project-group">
        <div className="project-group-header" title={group.path}>
          <span className="project-group-folder">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
              <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
            </svg>
          </span>
          <span className="project-group-name">{group.dirName}</span>
          <span className="project-group-count">{group.sessions.length}</span>
          <button className="project-group-add" onClick={(e) => { e.stopPropagation(); onCreateSessionInProject(group.path); }} title="New session">+</button>
        </div>
        <div className="project-group-sessions">
          {groupByStatus ? (() => {
            const byStatus = new Map<LiveStatus, ClaudeSession[]>();
            for (const s of group.sessions) {
              const st = s.liveStatus || 'disconnected';
              if (!byStatus.has(st)) byStatus.set(st, []);
              byStatus.get(st)!.push(s);
            }
            return LIVE_STATUSES.filter(st => byStatus.has(st)).map(st => (
              <div key={st} className="status-subgroup">
                <div className="status-subgroup-header">
                  <span className={`live-dot live-${st}`} />
                  <span>{t(locale, liveStatusLabelKey(st))}</span>
                  <span className="status-subgroup-count">{byStatus.get(st)!.length}</span>
                </div>
                {byStatus.get(st)!.map(s => renderSession(s, false, true))}
              </div>
            ));
          })() : group.sessions.map(s => renderSession(s, false, true))}
        </div>
      </div>
    ));
  };

  return (
    <div className="sidebar-left" onClick={closeContextMenu}>
      <div className="sidebar-header">
        <div className="sidebar-header-row">
          <span>{t(locale, 'sidebar.sessions')} ({filteredSessions.length})</span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className={`refresh-btn ${showFilters ? 'active-filter' : ''}`} onClick={() => setShowFilters(p => !p)} title={t(locale, 'sidebar.filters')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/></svg>
            </button>
            <button className="refresh-btn" onClick={handleRefresh} title={t(locale, 'sidebar.refresh')}>
              <span className={`refresh-icon ${refreshing ? 'spinning' : ''}`}>&#x21bb;</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bulk action bar (visible when multi-select active) */}
      {multiSelected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{multiSelected.size} {t(locale, 'sidebar.bulkSelected')}</span>
          <div className="bulk-actions">
            <button className="bulk-btn" onClick={handleBulkArchive} title={t(locale, 'sidebar.archive')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            </button>
            <button className="bulk-btn bulk-btn-danger" onClick={handleBulkDelete} title={t(locale, 'sidebar.deletePermanently')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <select
              className="bulk-flag-select"
              value=""
              onChange={e => {
                const val = e.target.value;
                if (val === '__none__') handleBulkSetFlag(null);
                else if (val) handleBulkSetFlag(val);
              }}
              title={t(locale, 'sidebar.setFlag')}
            >
              <option value="">{t(locale, 'sidebar.setFlag')}…</option>
              <option value="__none__">{t(locale, 'sidebar.flagNone')}</option>
              {sortedFlags.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button className="bulk-btn bulk-btn-cancel" onClick={clearMultiSelect} title={t(locale, 'sidebar.bulkCancel')}>
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="session-search">
        <svg className="session-search-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input
          className="session-search-input"
          type="text"
          placeholder={searchInContent ? t(locale, 'sidebar.searchContent') : t(locale, 'sidebar.search')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <button
          className={`session-search-mode ${searchInContent ? 'active' : ''}`}
          onClick={() => setSearchInContent(p => !p)}
          title={t(locale, 'sidebar.searchToggleHint')}
        >
          {contentSearching ? '…' : 'Aa'}
        </button>
        {searchQuery && (
          <button className="session-search-clear" onClick={() => setSearchQuery('')}>&times;</button>
        )}
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="filter-panel">
          {/* Date filter (date sort only) */}
          {sortMode === 'date' && (
            <div className="filter-section">
              <div className="filter-label">{t(locale, 'sidebar.filterDate')}</div>
              <div className="filter-row">
                {(['all', 'today', 'week'] as const).map(f => (
                  <button key={f} className={`filter-chip ${filterDate === f ? 'active' : ''}`} onClick={() => setFilterDate(f)}>
                    {t(locale, `sidebar.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status filter — always on top */}
          <div className="filter-section">
            <div className="filter-label">{t(locale, 'sidebar.filterStatus')}</div>
            <div className="filter-row">
              {LIVE_STATUSES.map(st => (
                <button key={st}
                  className={`filter-chip ${filterStatuses.has(st) ? 'active' : ''}`}
                  onClick={() => setFilterStatuses(prev => {
                    const next = new Set(prev);
                    if (next.has(st)) next.delete(st); else next.add(st);
                    return next;
                  })}
                >
                  <span className={`live-dot live-${st}`} />
                  {t(locale, liveStatusLabelKey(st))}
                </button>
              ))}
            </div>
          </div>

          {/* Group by status switch (project mode only) */}
          {sortMode === 'project' && (
            <div className="filter-section">
              <button
                type="button"
                className="filter-switch"
                onClick={() => setGroupByStatus(p => !p)}
                aria-pressed={groupByStatus}
              >
                <span className="filter-switch-label">{t(locale, 'sidebar.groupByStatus')}</span>
                <span className={`filter-switch-track ${groupByStatus ? 'on' : ''}`}>
                  <span className="filter-switch-thumb" />
                </span>
              </button>
            </div>
          )}

          {/* Project list (project mode only) */}
          {sortMode === 'project' && (() => {
            const allProjects = [...new Set(sessions.map(s => s.projectPath))];
            return (
              <div className="filter-section">
                <div className="filter-label">
                  <span>{t(locale, 'sidebar.filterProjects')}</span>
                  {filterProjects.size > 0 && (
                    <button className="filter-label-clear" onClick={() => setFilterProjects(new Set())}>
                      {t(locale, 'sidebar.filterAll')}
                    </button>
                  )}
                </div>
                <div className="filter-project-list">
                  {allProjects.map(p => {
                    const name = p.split('/').pop() || p;
                    const isActive = filterProjects.has(p);
                    const count = sessions.filter(s => s.projectPath === p).length;
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`filter-project-row ${isActive ? 'active' : ''}`}
                        onClick={() => {
                          setFilterProjects(prev => {
                            const next = new Set(prev);
                            if (next.has(p)) next.delete(p); else next.add(p);
                            return next;
                          });
                        }}
                        title={p}
                      >
                        <span className="filter-project-check" aria-hidden="true">
                          {isActive && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          )}
                        </span>
                        <span className="filter-project-name">{name}</span>
                        <span className="filter-project-count">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="session-list">
        {filteredSessions.length === 0 ? (
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
          renderGroupedByProject(filteredSessions)
        ) : (
          filteredSessions.map(s => renderSession(s))
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
          ref={contextMenuRef}
          className="context-menu"
          style={contextMenuStyle.top !== undefined ? contextMenuStyle : { top: contextMenu.y, left: contextMenu.x, visibility: 'hidden' }}
        >
          <button
            className="context-menu-item"
            onClick={() => { onTogglePin(sessionKey(contextMenu.session), !contextMenu.session.pinned); closeContextMenu(); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={contextMenu.session.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3.5a4 4 0 0 1-.5-2V7a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v4.5a4 4 0 0 1-.5 2L5 17z"/></svg>
            {contextMenu.session.pinned ? t(locale, 'sidebar.unpin') : t(locale, 'sidebar.pin')}
          </button>
          <button
            className="context-menu-item"
            onClick={() => { onViewHistory(contextMenu.session); closeContextMenu(); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {t(locale, 'sidebar.viewHistory')}
          </button>
          <button
            className="context-menu-item"
            onClick={() => { onReconnect(contextMenu.session); closeContextMenu(); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            {t(locale, 'sidebar.reconnect')}
          </button>
          <button
            className="context-menu-item"
            onClick={() => { onExportMarkdown(contextMenu.session); closeContextMenu(); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {t(locale, 'sidebar.exportMarkdown')}
          </button>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={() => startRename(contextMenu.session)}>
            &#9998; {t(locale, 'sidebar.rename')}
          </button>
          {sortedFlags.length > 0 && (
            <>
              <div className="context-menu-divider" />
              <div className="context-menu-label">{t(locale, 'sidebar.setFlag')}</div>
              <button
                className={`context-menu-item ${!contextMenu.session.flagId ? 'active-status' : ''}`}
                onClick={() => { onSetFlag(sessionKey(contextMenu.session), null); closeContextMenu(); }}
              >
                <span className="session-flag-dot" style={{ background: 'transparent', border: '1px dashed var(--text-muted)' }} />
                {t(locale, 'sidebar.flagNone')}
              </button>
              {sortedFlags.map(f => (
                <button
                  key={f.id}
                  className={`context-menu-item ${contextMenu.session.flagId === f.id ? 'active-status' : ''}`}
                  onClick={() => { onSetFlag(sessionKey(contextMenu.session), f.id); closeContextMenu(); }}
                >
                  <span className="session-flag-dot" style={{ background: f.color }} />
                  {f.name}
                </button>
              ))}
            </>
          )}
          <div className="context-menu-divider" />
          {contextMenu.session.archived ? (
            <button className="context-menu-item" onClick={() => { onUnarchive(sessionKey(contextMenu.session)); closeContextMenu(); }}>
              &#9776; {t(locale, 'sidebar.unarchive')}
            </button>
          ) : (
            <button className="context-menu-item archive" onClick={() => { onArchive(sessionKey(contextMenu.session)); closeContextMenu(); }}>
              &#9776; {t(locale, 'sidebar.archive')}
            </button>
          )}
          <div className="context-menu-divider" />
          <button
            className="context-menu-item delete"
            onClick={() => { onDelete(sessionKey(contextMenu.session)); closeContextMenu(); }}
          >
            &#128465; {t(locale, 'sidebar.deletePermanently')}
          </button>
        </div>
      )}
    </div>
  );
}
