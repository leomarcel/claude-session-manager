export type LiveStatus =
  | 'disconnected'
  | 'running'
  | 'tool_executing'
  | 'waiting_input'
  | 'idle'
  | 'completed'
  | 'crashed';

export interface ClaudeSession {
  pid: number;
  projectPath: string;
  projectName: string;
  model: string;
  status: 'active' | 'idle' | 'busy';
  liveStatus?: LiveStatus;
  liveDetail?: string;
  startTime: string;
  command: string;
  conversationId?: string;
  summary?: string;
  firstPrompt?: string;
  messageCount?: number;
  gitBranch?: string;
  customName?: string;
  archived?: boolean;
  isWorktree?: boolean;
  worktreeBranch?: string;
}

export interface SessionMeta {
  customName?: string;
  archived?: boolean;
  archivedAt?: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
}

export interface ModifiedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
}

export interface TokenUsage {
  plan: string;
  rateLimited: boolean;
  lastUpdated: string;
  sessionPercent: number;
  sessionReset: string;
  weekPercent: number;
  weekReset: string;
  weekSonnetPercent: number;
  extraPercent: number;
  extraSpent: string;
  extraBudget: string;
  extraReset: string;
  percentUsed: number;
  resetDate: string;
  model: string;
  raw: string;
}

export interface IDEInfo {
  id: string;
  name: string;
  command: string;
  args: string[];
  installed: boolean;
  enabled: boolean;
}

export interface QuickAction {
  id: string;
  type: 'builtin' | 'ide' | 'custom';
  visible: boolean;
  order: number;
}

export type LayoutPosition = 'left' | 'right';
export type SessionSortMode = 'default' | 'date' | 'project';
export type TerminalPreset = 'default' | 'iterm2' | 'minimal';
export type ExternalTerminal = 'terminal' | 'iterm2' | 'warp' | 'alacritty';
export type AppTheme = 'dark' | 'light';

export interface AppSettings {
  locale: 'fr' | 'en';
  refreshInterval: number;
  usageRefreshInterval: number;
  sessionsPosition: LayoutPosition;
  sessionsSortMode: SessionSortMode;
  showFilesPanel: boolean;
  showActionsPanel: boolean;
  theme: AppTheme;
  terminalTheme: AppTheme;
  terminalPreset: TerminalPreset;
  terminalFontSize: number;
  externalTerminal: ExternalTerminal;
  terminalBgColor: string;
  terminalBgOpacity: number;
  notificationsEnabled: boolean;
  demoMode: boolean;
  trayEnabled: boolean;
  autoUpdate: boolean;
  ides: IDEInfo[];
  quickActions: QuickAction[];
}

// --- Terminal tabs ---

export interface TerminalTab {
  id: string;
  projectPath: string;
  sessionKey: string;         // Unique key per session (conversationId or generated)
  label: string;
  type: 'claude' | 'shell' | 'diff' | 'history' | 'notes';
  initialized?: boolean;
  diffFilePath?: string;     // For diff tabs: the file to diff
  command: string;           // Startup command (for restore)
  resumeSessionId?: string;
  ptyId?: string;            // Runtime only — not persisted
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

export interface SavedTerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
}

export interface ElectronAPI {
  getSessions: () => Promise<ClaudeSession[]>;
  startSessionRefresh: () => Promise<void>;
  stopSessionRefresh: () => Promise<void>;
  onSessionsUpdated: (callback: (sessions: ClaudeSession[]) => void) => () => void;
  getModifiedFiles: (projectPath: string) => Promise<ModifiedFile[]>;
  getGitBranch: (projectPath: string) => Promise<string>;
  getWorktrees: (projectPath: string) => Promise<WorktreeInfo[]>;
  getFileDiff: (projectPath: string, filePath: string) => Promise<string>;
  getStagedFiles: (projectPath: string) => Promise<string[]>;
  getSessionHistory: (projectPath: string, sessionId: string) => Promise<{ type: string; text: string; timestamp: string }[]>;
  getBranches: (projectPath: string) => Promise<{ name: string; current: boolean }[]>;
  gitSwitchBranch: (projectPath: string, branch: string) => Promise<{ success: boolean; error?: string }>;
  gitCreateWorktree: (projectPath: string, branch: string, worktreePath: string) => Promise<{ success: boolean; error?: string }>;
  actionOpenIDE: (projectPath: string, ide: string) => Promise<void>;
  actionOpenFileInIDE: (projectPath: string, filePath: string, ideId: string) => Promise<void>;
  getEnabledIDEs: () => Promise<IDEInfo[]>;
  actionOpenFinder: (projectPath: string) => Promise<void>;
  dialogSelectFolder: () => Promise<string | null>;
  actionOpenTerminal: (projectPath: string) => Promise<void>;
  ptyCreate: (projectPath: string, resumeId?: string) => Promise<string>;
  ptyCreateShell: (projectPath: string) => Promise<string>;
  ptyWrite: (id: string, data: string) => Promise<void>;
  ptyResize: (id: string, cols: number, rows: number) => Promise<void>;
  ptyDestroy: (id: string) => Promise<void>;
  onPtyData: (callback: (id: string, data: string) => void) => () => void;
  getTokenUsage: (forceRefresh?: boolean) => Promise<TokenUsage>;
  settingsGet: () => Promise<AppSettings>;
  settingsSave: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  settingsDetectIDEs: () => Promise<IDEInfo[]>;
  settingsReset: () => Promise<AppSettings>;
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;
  updaterInstall: () => Promise<void>;
  updaterCheck: () => Promise<{ currentVersion?: string; updateAvailable?: boolean; latestVersion?: string; error?: string }>;
  getAppVersion: () => Promise<string>;
  notesLoad: (projectPath: string) => Promise<string>;
  notesSave: (projectPath: string, content: string) => Promise<void>;
  onShortcut: (callback: (action: string) => void) => () => void;
  onOpenSettings: (callback: () => void) => () => void;
  updateTraySessions: (sessions: { projectName: string; projectPath: string; status: string }[], usage?: string) => void;
  onTraySelectSession: (callback: (projectPath: string) => void) => () => void;
  terminalsLoad: () => Promise<SavedTerminalState>;
  terminalsSave: (state: SavedTerminalState) => Promise<void>;
  logsGet: () => Promise<LogEntry[]>;
  logsClear: () => Promise<void>;
  sessionMetaGetAll: () => Promise<Record<string, SessionMeta>>;
  sessionMetaRename: (projectPath: string, name: string) => Promise<void>;
  sessionMetaArchive: (projectPath: string) => Promise<void>;
  sessionMetaUnarchive: (projectPath: string) => Promise<void>;
  sessionKill: (pid: number) => Promise<{ ok: boolean; reason?: string }>;
  sessionDelete: (args: { key: string; pid: number; projectPath: string; conversationId?: string })
    => Promise<{ ok: boolean; jsonlDeleted: boolean }>;
  killAllSessions: () => Promise<{ killedCount: number; total: number }>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
