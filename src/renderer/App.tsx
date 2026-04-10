import React, { useState, useEffect, useCallback } from 'react';
import { ClaudeSession, ModifiedFile, TokenUsage, AppSettings, TerminalTab, SavedTerminalState, SessionMeta } from './types';
import { Locale, t } from './i18n';
import { SessionSidebar } from './components/SessionSidebar';
import { TerminalPanel } from './components/TerminalPanel';
import { RightSidebar } from './components/RightSidebar';
import { StatusBar } from './components/StatusBar';
import { SettingsPanel } from './components/SettingsPanel';

const DEFAULT_SETTINGS: AppSettings = {
  locale: 'fr', refreshInterval: 15,
  sessionsPosition: 'left', sessionsSortMode: 'default',
  showFilesPanel: true, showActionsPanel: true,
  ides: [], quickActions: [],
};

let tabCounter = 0;
function nextTabId() { return `tab-${++tabCounter}-${Date.now()}`; }

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [sessionMeta, setSessionMeta] = useState<Record<string, SessionMeta>>({});
  const [ready, setReady] = useState(false);

  const locale: Locale = settings.locale || 'fr';

  // --- Persistence: save tabs whenever they change ---
  useEffect(() => {
    if (tabs.length === 0) return;
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
          setTabs(saved.tabs);
          setActiveTabId(saved.activeTabId || saved.tabs[0].id);
        }
      }).catch(() => {}),
    ]).finally(() => {
      setReady(true);
      hideSplash();
    });
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
    const tokenInterval = setInterval(loadTokenUsage, 60000);
    return () => {
      cleanup();
      window.api.stopSessionRefresh();
      clearInterval(tokenInterval);
    };
  }, [loadSessions, loadTokenUsage]);

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

  // --- Select session: create initial Claude tab if none for this project ---
  const handleSelectSession = (session: ClaudeSession) => {
    setSelectedSession(session);

    // Check if we already have tabs for this project
    const projectTabs = tabs.filter(tab => tab.projectPath === session.projectPath);
    if (projectTabs.length > 0) {
      // Just switch to the first existing tab for this project
      setActiveTabId(projectTabs[0].id);
    } else {
      // Create a Claude tab for this project
      const newTab: TerminalTab = {
        id: nextTabId(),
        projectPath: session.projectPath,
        label: 'Claude',
        type: 'claude',
        command: '',
        resumeSessionId: session.conversationId,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  };

  // --- Tab management ---
  const handleAddClaudeTab = () => {
    if (!selectedSession) return;
    const newTab: TerminalTab = {
      id: nextTabId(),
      projectPath: selectedSession.projectPath,
      label: `Claude ${tabs.filter(t => t.type === 'claude' && t.projectPath === selectedSession.projectPath).length + 1}`,
      type: 'claude',
      command: '',
      resumeSessionId: selectedSession.conversationId,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleAddShellTab = () => {
    if (!selectedSession) return;
    const shellCount = tabs.filter(t => t.type === 'shell' && t.projectPath === selectedSession.projectPath).length;
    const newTab: TerminalTab = {
      id: nextTabId(),
      projectPath: selectedSession.projectPath,
      label: `Shell ${shellCount + 1}`,
      type: 'shell',
      command: '',
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
    const projectPath = selectedSession?.projectPath || process.env.HOME || '/';
    const newTab: TerminalTab = {
      id: nextTabId(),
      projectPath,
      label: 'Claude',
      type: 'claude',
      command: '',
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

  const handleRenameSession = async (projectPath: string, name: string) => {
    await window.api.sessionMetaRename(projectPath, name);
    await loadSessionMeta();
  };

  const handleArchiveSession = async (projectPath: string) => {
    await window.api.sessionMetaArchive(projectPath);
    await loadSessionMeta();
    // Deselect if archived
    if (selectedSession?.projectPath === projectPath) setSelectedSession(null);
  };

  const handleUnarchiveSession = async (projectPath: string) => {
    await window.api.sessionMetaUnarchive(projectPath);
    await loadSessionMeta();
  };

  // Enrich sessions with meta (custom names, archive status)
  const enrichedSessions = sessions.map(s => {
    const meta = sessionMeta[s.projectPath];
    return {
      ...s,
      customName: meta?.customName,
      archived: meta?.archived || false,
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
  const visibleTabs = selectedSession
    ? tabs.filter(tab => tab.projectPath === selectedSession.projectPath)
    : [];

  return (
    <div className="app">
      <div className="titlebar">
        <span className="titlebar-text">{t(locale, 'app.title')}</span>
        <button className="settings-gear" onClick={() => setSettingsOpen(true)} title={t(locale, 'settings.title')}>
          &#9881;
        </button>
      </div>

      <div className={`main-content ${settings.sessionsPosition === 'right' ? 'sessions-right' : ''}`}>
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
          sortMode={sortMode}
          locale={locale}
        />

        <TerminalPanel
          session={selectedSession}
          branch={branch}
          locale={locale}
          allTabs={tabs}
          visibleTabs={visibleTabs}
          activeTabId={activeTabId}
          onActivateTab={setActiveTabId}
          onCloseTab={handleCloseTab}
          onAddShellTab={handleAddShellTab}
          onAddClaudeTab={handleAddClaudeTab}
        />

        {(settings.showFilesPanel || settings.showActionsPanel) && (
          <RightSidebar
            session={selectedSession}
            modifiedFiles={modifiedFiles}
            settings={settings}
            locale={locale}
          />
        )}
      </div>

      <StatusBar
        session={selectedSession}
        tokenUsage={tokenUsage}
        sessionCount={sessions.length}
        locale={locale}
      />

      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
        locale={locale}
      />
    </div>
  );
}
