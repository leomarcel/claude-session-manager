import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('api', {
  // Sessions
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  startSessionRefresh: () => ipcRenderer.invoke('start-session-refresh'),
  stopSessionRefresh: () => ipcRenderer.invoke('stop-session-refresh'),
  onSessionsUpdated: (callback: (sessions: any[]) => void) => {
    const handler = (_event: IpcRendererEvent, sessions: any[]) => callback(sessions);
    ipcRenderer.on('sessions-updated', handler);
    return () => { ipcRenderer.removeListener('sessions-updated', handler); };
  },

  // Git
  getModifiedFiles: (projectPath: string) => ipcRenderer.invoke('get-modified-files', projectPath),
  getGitBranch: (projectPath: string) => ipcRenderer.invoke('get-git-branch', projectPath),

  // Git data
  getWorktrees: (projectPath: string) => ipcRenderer.invoke('get-worktrees', projectPath),
  getFileDiff: (projectPath: string, filePath: string) => ipcRenderer.invoke('get-file-diff', projectPath, filePath),
  getStagedFiles: (projectPath: string) => ipcRenderer.invoke('get-staged-files', projectPath),
  getSessionHistory: (projectPath: string, sessionId: string) => ipcRenderer.invoke('get-session-history', projectPath, sessionId),
  getBranches: (projectPath: string) => ipcRenderer.invoke('get-branches', projectPath),
  gitSwitchBranch: (projectPath: string, branch: string) => ipcRenderer.invoke('git-switch-branch', projectPath, branch),
  gitCreateWorktree: (projectPath: string, branch: string, worktreePath: string) => ipcRenderer.invoke('git-create-worktree', projectPath, branch, worktreePath),
  actionOpenIDE: (projectPath: string, ide: string) => ipcRenderer.invoke('action-open-ide', projectPath, ide),
  actionOpenFileInIDE: (projectPath: string, filePath: string, ideId: string) => ipcRenderer.invoke('action-open-file-in-ide', projectPath, filePath, ideId),
  getEnabledIDEs: () => ipcRenderer.invoke('get-enabled-ides'),
  actionOpenFinder: (projectPath: string) => ipcRenderer.invoke('action-open-finder', projectPath),
  dialogSelectFolder: () => ipcRenderer.invoke('dialog-select-folder'),
  actionOpenTerminal: (projectPath: string) => ipcRenderer.invoke('action-open-terminal', projectPath),

  // PTY
  ptyCreate: (projectPath: string, resumeId?: string) => ipcRenderer.invoke('pty-create', projectPath, resumeId),
  ptyCreateShell: (projectPath: string) => ipcRenderer.invoke('pty-create-shell', projectPath),
  ptyWrite: (id: string, data: string) => ipcRenderer.invoke('pty-write', id, data),
  ptyResize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('pty-resize', id, cols, rows),
  ptyDestroy: (id: string) => ipcRenderer.invoke('pty-destroy', id),
  onPtyData: (callback: (id: string, data: string) => void) => {
    const handler = (_event: IpcRendererEvent, id: string, data: string) => callback(id, data);
    ipcRenderer.on('pty-data', handler);
    return () => { ipcRenderer.removeListener('pty-data', handler); };
  },

  // Token usage
  getTokenUsage: (forceRefresh?: boolean) => ipcRenderer.invoke('get-token-usage', forceRefresh),

  // Settings
  settingsGet: () => ipcRenderer.invoke('settings-get'),
  settingsSave: (settings: any) => ipcRenderer.invoke('settings-save', settings),
  settingsDetectIDEs: () => ipcRenderer.invoke('settings-detect-ides'),
  settingsReset: () => ipcRenderer.invoke('settings-reset'),

  // Updater
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    const handler = (_event: IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('update-downloaded', handler);
    return () => { ipcRenderer.removeListener('update-downloaded', handler); };
  },
  updaterInstall: () => ipcRenderer.invoke('updater-install'),
  updaterCheck: () => ipcRenderer.invoke('updater-check'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  notesLoad: (projectPath: string) => ipcRenderer.invoke('notes-load', projectPath),
  notesSave: (projectPath: string, content: string) => ipcRenderer.invoke('notes-save', projectPath, content),
  claudeConfigLoad: (scope: string, projectPath?: string) => ipcRenderer.invoke('claude-config-load', scope, projectPath),
  claudeConfigSave: (scope: string, content: string, projectPath?: string) => ipcRenderer.invoke('claude-config-save', scope, content, projectPath),
  claudeMdLoad: (projectPath: string) => ipcRenderer.invoke('claude-md-load', projectPath),
  claudeMdSave: (projectPath: string, content: string) => ipcRenderer.invoke('claude-md-save', projectPath, content),
  sessionExportMarkdown: (projectPath: string, conversationId: string) => ipcRenderer.invoke('session-export-markdown', projectPath, conversationId),
  usageHistory: (projectPath: string, days?: number) => ipcRenderer.invoke('usage-history', projectPath, days),
  searchConversations: (query: string) => ipcRenderer.invoke('search-conversations', query),
  snippetsLoad: () => ipcRenderer.invoke('snippets-load'),
  snippetsSave: (snippets: any) => ipcRenderer.invoke('snippets-save', snippets),
  dialogSaveFile: (defaultName: string, content: string) => ipcRenderer.invoke('dialog-save-file', defaultName, content),
  dialogSelectImage: () => ipcRenderer.invoke('dialog-select-image'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Shortcuts
  onShortcut: (callback: (action: string) => void) => {
    const handler = (_event: IpcRendererEvent, action: string) => callback(action);
    ipcRenderer.on('shortcut', handler);
    return () => { ipcRenderer.removeListener('shortcut', handler); };
  },

  // App menu
  onOpenSettings: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('open-settings', handler);
    return () => { ipcRenderer.removeListener('open-settings', handler); };
  },

  // Tray
  updateTraySessions: (sessions: any[], usage?: string) => ipcRenderer.send('update-tray-sessions', sessions, usage),
  onTraySelectSession: (callback: (projectPath: string) => void) => {
    const handler = (_event: IpcRendererEvent, projectPath: string) => callback(projectPath);
    ipcRenderer.on('tray-select-session', handler);
    return () => { ipcRenderer.removeListener('tray-select-session', handler); };
  },

  // Terminal persistence
  terminalsLoad: () => ipcRenderer.invoke('terminals-load'),
  terminalsSave: (state: any) => ipcRenderer.invoke('terminals-save', state),

  // Logs
  logsGet: () => ipcRenderer.invoke('logs-get'),
  logsClear: () => ipcRenderer.invoke('logs-clear'),

  // Session meta (rename, archive)
  sessionMetaGetAll: () => ipcRenderer.invoke('session-meta-get-all'),
  sessionMetaRename: (projectPath: string, name: string) => ipcRenderer.invoke('session-meta-rename', projectPath, name),
  sessionMetaArchive: (projectPath: string) => ipcRenderer.invoke('session-meta-archive', projectPath),
  sessionMetaUnarchive: (projectPath: string) => ipcRenderer.invoke('session-meta-unarchive', projectPath),
  sessionMetaSetFlag: (key: string, flagId: string | null) => ipcRenderer.invoke('session-meta-set-flag', key, flagId),
  sessionMetaSetPinned: (key: string, pinned: boolean) => ipcRenderer.invoke('session-meta-set-pinned', key, pinned),
  sessionKill: (pid: number) => ipcRenderer.invoke('session-kill', pid),
  sessionDelete: (args: { key: string; pid: number; projectPath: string; conversationId?: string }) =>
    ipcRenderer.invoke('session-delete', args),
  killAllSessions: () => ipcRenderer.invoke('kill-all-sessions'),
});
