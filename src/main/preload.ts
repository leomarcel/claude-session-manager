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
  getTokenUsage: () => ipcRenderer.invoke('get-token-usage'),

  // Settings
  settingsGet: () => ipcRenderer.invoke('settings-get'),
  settingsSave: (settings: any) => ipcRenderer.invoke('settings-save', settings),
  settingsDetectIDEs: () => ipcRenderer.invoke('settings-detect-ides'),
  settingsReset: () => ipcRenderer.invoke('settings-reset'),

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
});
