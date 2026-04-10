export interface ClaudeSession {
  pid: number;
  projectPath: string;
  projectName: string;
  model: string;
  status: 'active' | 'idle' | 'busy';
  startTime: string;
  command: string;
  conversationId?: string;
  summary?: string;
  firstPrompt?: string;
  messageCount?: number;
  gitBranch?: string;
  customName?: string;
  archived?: boolean;
}

export interface SessionMeta {
  customName?: string;
  archived?: boolean;
  archivedAt?: string;
}

export interface ModifiedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
}

export interface TokenUsage {
  plan: string;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  activeSessions: number;
  totalMessages: number;
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  percentUsed: number;
  resetDate: string;
  model: string;
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

export interface AppSettings {
  locale: 'fr' | 'en';
  refreshInterval: number;
  sessionsPosition: LayoutPosition;
  sessionsSortMode: SessionSortMode;
  showFilesPanel: boolean;
  showActionsPanel: boolean;
  ides: IDEInfo[];
  quickActions: QuickAction[];
}

// --- Terminal tabs ---

export interface TerminalTab {
  id: string;
  projectPath: string;
  label: string;
  type: 'claude' | 'shell';
  command: string;           // Startup command (for restore)
  resumeSessionId?: string;
  ptyId?: string;            // Runtime only — not persisted
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
  actionCommit: (projectPath: string) => Promise<void>;
  actionCreatePR: (projectPath: string) => Promise<void>;
  actionWorktree: (projectPath: string) => Promise<void>;
  actionOpenIDE: (projectPath: string, ide: string) => Promise<void>;
  actionOpenFileInIDE: (projectPath: string, filePath: string, ideId: string) => Promise<void>;
  getEnabledIDEs: () => Promise<IDEInfo[]>;
  actionOpenFinder: (projectPath: string) => Promise<void>;
  actionOpenTerminal: (projectPath: string) => Promise<void>;
  ptyCreate: (projectPath: string, resumeId?: string) => Promise<string>;
  ptyCreateShell: (projectPath: string) => Promise<string>;
  ptyWrite: (id: string, data: string) => Promise<void>;
  ptyResize: (id: string, cols: number, rows: number) => Promise<void>;
  ptyDestroy: (id: string) => Promise<void>;
  onPtyData: (callback: (id: string, data: string) => void) => () => void;
  getTokenUsage: () => Promise<TokenUsage>;
  settingsGet: () => Promise<AppSettings>;
  settingsSave: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  settingsDetectIDEs: () => Promise<IDEInfo[]>;
  settingsReset: () => Promise<AppSettings>;
  terminalsLoad: () => Promise<SavedTerminalState>;
  terminalsSave: (state: SavedTerminalState) => Promise<void>;
  sessionMetaGetAll: () => Promise<Record<string, SessionMeta>>;
  sessionMetaRename: (projectPath: string, name: string) => Promise<void>;
  sessionMetaArchive: (projectPath: string) => Promise<void>;
  sessionMetaUnarchive: (projectPath: string) => Promise<void>;
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}
