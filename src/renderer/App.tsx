import React, { useState, useEffect, useCallback } from 'react';
import { ClaudeSession, ModifiedFile, TokenUsage, AppSettings, TerminalTab, SavedTerminalState, SessionMeta } from './types';
import { Locale, t } from './i18n';
import { DEMO_SESSIONS, DEMO_FILES, DEMO_TOKEN_USAGE } from './demoData';
import { SessionSidebar } from './components/SessionSidebar';
import { TerminalPanel } from './components/TerminalPanel';
import { RightSidebar } from './components/RightSidebar';
import { StatusBar } from './components/StatusBar';
import { WorktreeModal } from './components/WorktreeModal';
import { BranchModal } from './components/BranchModal';
import { UpdateToast } from './components/UpdateToast';
import { SettingsPanel } from './components/SettingsPanel';
import { NewSessionModal } from './components/NewSessionModal';

const DEFAULT_SETTINGS: AppSettings = {
  locale: 'en', refreshInterval: 15, usageRefreshInterval: 5,
  sessionsPosition: 'left', sessionsSortMode: 'project',
  showFilesPanel: true, showActionsPanel: true,
  theme: 'dark', terminalPreset: 'iterm2', terminalFontSize: 13, externalTerminal: 'terminal',
  notificationsEnabled: true, demoMode: false, trayEnabled: true, autoUpdate: true,
  terminalBgColor: '', terminalBgOpacity: 100,
  ides: [], quickActions: [],
};

let tabCounter = 0;
function nextTabId() { return `tab-${++tabCounter}-${Date.now()}`; }

/** Unique key for a session — uses conversationId if available, else a generated fallback */
function getSessionKey(session: ClaudeSession): string {
  return session.conversationId || `${session.projectPath}:${session.startTime}`;
}

function hideSplash() {
  const el = document.getElementById('splash');
  if (el) el.classList.add('hidden');
}

export function App() {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ClaudeSession | null>(null);
  const [modifiedFiles, setModifiedFiles] = useState<ModifiedFile[]>([]);
  const [branch, setBranch] = useState('');
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState<{ version: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sessionMeta, setSessionMeta] = useState<Record<string, SessionMeta>>({});

  const locale: Locale = settings.locale || 'en';
  const isDemo = settings.demoMode;

  // --- Persistence: save tabs whenever they change ---
  useEffect(() => {
    const state: SavedTerminalState = {
      tabs: tabs.map(({ ptyId, ...rest }) => rest), // strip runtime ptyId
      activeTabId,
    };
    window.api.terminalsSave(state);
  }, [tabs, activeTabId]);

  const loadSessionMeta = useCallback(async () => {
    try { setSessionMeta(await window.api.sessionMetaGetAll()); } catch {}
  }, []);

  // --- Load settings + restore tabs + session meta on mount ---
  useEffect(() => {
    const minDelay = new Promise(resolve => setTimeout(resolve, 2000));
    Promise.all([
      minDelay,
      window.api.settingsGet().then(setSettings).catch(() => {}),
      loadSessionMeta(),
      window.api.terminalsLoad().then((saved) => {
        if (saved.tabs.length > 0) {
          // Restored tabs start uninitialized — PTY created only when selected
          setTabs(saved.tabs.map(t => ({ ...t, initialized: false })));
          setActiveTabId(saved.activeTabId || saved.tabs[0].id);
        }
      }).catch(() => {}),
    ]).finally(() => {
      hideSplash();
    });
  }, []);

  // Listen for auto-updater events
  useEffect(() => {
    const cleanup = window.api.onUpdateDownloaded((info) => setUpdateReady(info));
    return cleanup;
  }, []);

  // --- Sessions ---
  const loadSessions = useCallback(async () => {
    try { setSessions(await window.api.getSessions()); } catch {}
  }, []);

  const loadTokenUsage = useCallback(async () => {
    try { setTokenUsage(await window.api.getTokenUsage()); } catch {}
  }, []);

  useEffect(() => {
    loadSessions();
    loadTokenUsage();
    window.api.startSessionRefresh();
    const cleanup = window.api.onSessionsUpdated(setSessions);
    const usageMs = (settings.usageRefreshInterval || 5) * 60 * 1000;
    const tokenInterval = setInterval(loadTokenUsage, usageMs);

    // Listen for tray session selection
    const trayCleanup = window.api.onTraySelectSession((projectPath) => {
      const session = sessions.find(s => s.projectPath === projectPath);
      if (session) handleSelectSession(session);
    });

    const settingsCleanup = window.api.onOpenSettings(() => setSettingsOpen(true));

    // Keyboard shortcuts
    const shortcutCleanup = window.api.onShortcut((action) => {
      if (action.startsWith('session-')) {
        const idx = parseInt(action.split('-')[1], 10) - 1;
        const activeSess = sessions.filter(s => !(sessionMeta[s.projectPath]?.archived));
        if (activeSess[idx]) handleSelectSession(activeSess[idx]);
      } else if (action === 'new-shell') {
        handleAddShellTab();
      } else if (action === 'new-claude') {
        handleAddClaudeTab();
      } else if (action === 'close-tab') {
        if (activeTabId) handleCloseTab(activeTabId);
      } else if (action === 'split-view') {
        setSplitView(prev => !prev);
      }
    });

    return () => {
      cleanup();
      trayCleanup();
      settingsCleanup();
      shortcutCleanup();
      window.api.stopSessionRefresh();
      clearInterval(tokenInterval);
    };
  }, [loadSessions, loadTokenUsage, settings.usageRefreshInterval]);

  // Update tray menu when sessions or usage change
  useEffect(() => {
    const usageStr = tokenUsage
      ? `Session ${tokenUsage.sessionPercent}% · Week ${tokenUsage.weekPercent}%${tokenUsage.extraSpent ? ` · ${tokenUsage.extraSpent}/${tokenUsage.extraBudget}` : ''}`
      : '';
    // Don't send demo data to tray
    if (!isDemo) {
      window.api.updateTraySessions(
        sessions.map(s => ({ projectName: s.projectName, projectPath: s.projectPath, status: s.status })),
        usageStr
      );
    }
  }, [sessions, tokenUsage, isDemo]);

  // --- Git info for selected session ---
  useEffect(() => {
    if (!selectedSession) { setModifiedFiles([]); setBranch(''); return; }
    const load = async () => {
      try {
        const [files, br] = await Promise.all([
          window.api.getModifiedFiles(selectedSession.projectPath),
          window.api.getGitBranch(selectedSession.projectPath)
        ]);
        setModifiedFiles(files);
        setBranch(br);
      } catch {}
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [selectedSession]);

  // --- Select session: create initial Claude tab if none for this session ---
  const handleSelectSession = (session: ClaudeSession) => {
    setSelectedSession(session);

    if (isDemo) return;

    const sKey = getSessionKey(session);
    const sessionTabs = tabs.filter(tab => tab.sessionKey === sKey);
    if (sessionTabs.length > 0) {
      const hasUninit = sessionTabs.some(t => !t.initialized);
      if (hasUninit) {
        setTabs(prev => prev.map(t =>
          t.sessionKey === sKey ? { ...t, initialized: true } : t
        ));
      }
      const previouslyActive = sessionTabs.find(t => t.id === activeTabId);
      setActiveTabId(previouslyActive?.id ?? sessionTabs[0].id);
    } else {
      const newTab: TerminalTab = {
        id: nextTabId(),
        projectPath: session.projectPath,
        sessionKey: sKey,
        label: 'Claude',
        type: 'claude',
        command: '',
        resumeSessionId: session.conversationId,
        initialized: true,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  };

  // --- Tab management ---
  const handleAddClaudeTab = () => {
    if (!selectedSession) return;
    const sKey = getSessionKey(selectedSession);
    const newTab: TerminalTab = {
      id: nextTabId(),
      projectPath: selectedSession.projectPath,
      sessionKey: sKey,
      label: `Claude ${tabs.filter(t => t.type === 'claude' && t.sessionKey === sKey).length + 1}`,
      type: 'claude',
      command: '',
      resumeSessionId: selectedSession.conversationId,
      initialized: true,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleAddShellTab = () => {
    if (!selectedSession) return;
    const sKey = getSessionKey(selectedSession);
    const shellCount = tabs.filter(t => t.type === 'shell' && t.sessionKey === sKey).length;
    const newTab: TerminalTab = {
      id: nextTabId(),
      projectPath: selectedSession.projectPath,
      sessionKey: sKey,
      label: `Shell ${shellCount + 1}`,
      type: 'shell',
      command: '',
      initialized: true,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (tabId: string) => {
    const remaining = tabs.filter(t => t.id !== tabId);
    setTabs(remaining);
    setActiveTabId(prev => {
      if (prev !== tabId) return prev;
      if (remaining.length === 0) return null;
      const idx = tabs.findIndex(t => t.id === tabId);
      return remaining[Math.min(idx, remaining.length - 1)].id;
    });
  };

  const handleNewSession = () => {
    setNewSessionOpen(true);
  };

  const handleCreateSession = (projectPath: string) => {
    // Generate a unique conversation ID for this new session
    const newConvId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create a synthetic session
    const newSession: ClaudeSession = {
      pid: 0,
      projectPath,
      projectName: projectPath.split('/').pop() || projectPath,
      model: 'Claude Opus 4',
      status: 'active',
      startTime: new Date().toISOString(),
      command: 'claude (new)',
      conversationId: newConvId,
    };

    const sKey = getSessionKey(newSession);

    const newTab: TerminalTab = {
      id: nextTabId(),
      projectPath,
      sessionKey: sKey,
      label: 'Claude',
      initialized: true,
      type: 'claude',
      command: '',
      resumeSessionId: 'new',
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);

    // Always add as a new session (multiple sessions per project allowed)
    setSessions(prev => [newSession, ...prev]);
    setSelectedSession(newSession);
  };

  const handleRunInShell = (command: string) => {
    if (!selectedSession) return;
    const newTab: TerminalTab = {
      id: nextTabId(),
      projectPath: selectedSession.projectPath,
      sessionKey: getSessionKey(selectedSession),
      label: command.split(' ')[0] || 'Shell',
      type: 'shell',
      command,
      initialized: true,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleSaveSettings = async (partial: Partial<AppSettings>) => {
    try {
      const updated = await window.api.settingsSave(partial);
      setSettings(updated);
      window.api.stopSessionRefresh();
      window.api.startSessionRefresh();
    } catch {}
  };

  const handleRenameSession = async (key: string, name: string) => {
    await window.api.sessionMetaRename(key, name);
    await loadSessionMeta();
  };

  const handleArchiveSession = async (key: string) => {
    await window.api.sessionMetaArchive(key);
    await loadSessionMeta();
    if (selectedSession && getSessionKey(selectedSession) === key) setSelectedSession(null);
  };

  const handleUnarchiveSession = async (key: string) => {
    await window.api.sessionMetaUnarchive(key);
    await loadSessionMeta();
  };

  // Demo mode overrides
  const displaySessions = isDemo ? DEMO_SESSIONS : sessions;
  const displayFiles = isDemo ? DEMO_FILES : modifiedFiles;
  const displayTokenUsage = isDemo ? DEMO_TOKEN_USAGE : tokenUsage;
  const displayBranch = isDemo ? 'feature/jwt-auth' : branch;

  const enrichedSessions = displaySessions.map(s => {
    const sKey = getSessionKey(s);
    const meta = sessionMeta[sKey] || sessionMeta[s.projectPath] || {};
    return {
      ...s,
      customName: meta.customName,
      archived: meta.archived || false,
      liveStatus: s.liveStatus || 'disconnected',
    };
  });

  // Sort sessions based on settings
  const sortMode = settings.sessionsSortMode || 'default';
  const sortSessions = (list: ClaudeSession[]) => {
    const sorted = [...list];
    if (sortMode === 'date') {
      sorted.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    } else if (sortMode === 'project') {
      sorted.sort((a, b) => {
        const dirA = a.projectPath.split('/').pop() || '';
        const dirB = b.projectPath.split('/').pop() || '';
        return dirA.localeCompare(dirB);
      });
    }
    return sorted;
  };

  const activeSessions = sortSessions(enrichedSessions.filter(s => !s.archived));
  const archivedSessions = sortSessions(enrichedSessions.filter(s => s.archived));

  // Tabs visible in the tab bar (current session only)
  const selectedKey = selectedSession ? getSessionKey(selectedSession) : '';
  const visibleTabs = selectedSession
    ? tabs.filter(tab => tab.sessionKey === selectedKey)
    : [];

  return (
    <div className={`app ${settings.theme === 'light' ? 'theme-light' : ''}`}>
      <div className="titlebar">
        <img src="assets/mascotte_claude.png" alt="" width="18" height="18" className="titlebar-logo" draggable={false} />
        <span className="titlebar-text">{t(locale, 'app.title')}</span>
        <button className="settings-gear" onClick={() => setSettingsOpen(true)} title={t(locale, 'settings.title')}>
          &#9881;
        </button>
      </div>

      <div className={`main-content ${settings.sessionsPosition === 'right' ? 'sessions-right' : ''}`}>
        {showLeftPanel && (
          <SessionSidebar
            sessions={activeSessions}
            archivedSessions={archivedSessions}
            selectedSession={selectedSession}
            onSelectSession={handleSelectSession}
            onRefresh={loadSessions}
            onRename={handleRenameSession}
            onArchive={handleArchiveSession}
            onUnarchive={handleUnarchiveSession}
            onNewSession={handleNewSession}
            onCreateSessionInProject={handleCreateSession}
            sortMode={sortMode}
            locale={locale}
          />
        )}

        <TerminalPanel
          session={selectedSession}
          branch={displayBranch}
          locale={locale}
          isDemo={isDemo}
          terminalPreset={settings.terminalPreset}
          terminalFontSize={settings.terminalFontSize}
          appTheme={settings.theme}
          terminalBgColor={settings.terminalBgColor}
          terminalBgOpacity={settings.terminalBgOpacity}
          allTabs={tabs}
          visibleTabs={visibleTabs}
          activeTabId={activeTabId}
          onActivateTab={setActiveTabId}
          onCloseTab={handleCloseTab}
          onAddShellTab={handleAddShellTab}
          onAddClaudeTab={handleAddClaudeTab}
          onOpenBranchModal={() => setBranchOpen(true)}
          onOpenHistory={() => {
            if (!selectedSession) return;
            const sKey = getSessionKey(selectedSession);
            const newTab: TerminalTab = {
              id: nextTabId(), projectPath: selectedSession.projectPath, sessionKey: sKey,
              label: 'History', type: 'history', command: '',
              resumeSessionId: selectedSession.conversationId, initialized: true,
            };
            setTabs(prev => [...prev, newTab]);
            setActiveTabId(newTab.id);
          }}
          onOpenNotes={() => {
            if (!selectedSession) return;
            const sKey = getSessionKey(selectedSession);
            const existing = tabs.find(t => t.type === 'notes' && t.sessionKey === sKey);
            if (existing) { setActiveTabId(existing.id); return; }
            const newTab: TerminalTab = {
              id: nextTabId(), projectPath: selectedSession.projectPath, sessionKey: sKey,
              label: 'Notes', type: 'notes', command: '', initialized: true,
            };
            setTabs(prev => [...prev, newTab]);
            setActiveTabId(newTab.id);
          }}
          splitView={splitView}
          onToggleSplit={() => setSplitView(p => !p)}
        />

        {showRightPanel && (settings.showFilesPanel || settings.showActionsPanel) && (
          <RightSidebar
            session={selectedSession}
            modifiedFiles={displayFiles}
            settings={settings}
            locale={locale}
            onRunInShell={handleRunInShell}
            onOpenWorktreeModal={() => setWorktreeOpen(true)}
            onOpenDiffTab={(filePath) => {
              if (!selectedSession) return;
              const newTab: TerminalTab = {
                id: nextTabId(),
                projectPath: selectedSession.projectPath,
                sessionKey: getSessionKey(selectedSession),
                label: `diff ${filePath.split('/').pop()}`,
                type: 'diff',
                command: '',
                diffFilePath: filePath,
                initialized: true,
              };
              setTabs(prev => [...prev, newTab]);
              setActiveTabId(newTab.id);
            }}
          />
        )}
      </div>

      <StatusBar
        session={selectedSession}
        tokenUsage={displayTokenUsage}
        sessionCount={displaySessions.length}
        locale={locale}
        showLeftPanel={settings.sessionsPosition === 'right' ? showRightPanel : showLeftPanel}
        showRightPanel={settings.sessionsPosition === 'right' ? showLeftPanel : showRightPanel}
        onToggleLeftPanel={() => settings.sessionsPosition === 'right' ? setShowRightPanel(p => !p) : setShowLeftPanel(p => !p)}
        onToggleRightPanel={() => settings.sessionsPosition === 'right' ? setShowLeftPanel(p => !p) : setShowRightPanel(p => !p)}
        onRefreshUsage={async () => {
          try { setTokenUsage(await window.api.getTokenUsage(true)); } catch {}
        }}
      />

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
        locale={locale}
      />

      <NewSessionModal
        isOpen={newSessionOpen}
        onClose={() => setNewSessionOpen(false)}
        onCreate={handleCreateSession}
        sessions={sessions}
        locale={locale}
      />

      {selectedSession && (
        <>
          <WorktreeModal
            isOpen={worktreeOpen}
            onClose={() => setWorktreeOpen(false)}
            projectPath={selectedSession.projectPath}
            locale={locale}
          />
          <BranchModal
            isOpen={branchOpen}
            onClose={() => setBranchOpen(false)}
            projectPath={selectedSession.projectPath}
            locale={locale}
          />
        </>
      )}

      {updateReady && (
        <UpdateToast
          version={updateReady.version}
          onInstall={() => window.api.updaterInstall()}
          onDismiss={() => setUpdateReady(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
