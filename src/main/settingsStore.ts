import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

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
export type AppTheme = 'dark' | 'light' | 'auto';

export interface SessionFlag {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface ShortcutBinding {
  id: string;
  accelerator: string;
}

export interface AppSettings {
  locale: 'fr' | 'en';
  refreshInterval: number;
  usageRefreshInterval: number; // in minutes
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
  terminalBgImage: string;
  notificationsEnabled: boolean;
  demoMode: boolean;
  trayEnabled: boolean;
  autoUpdate: boolean;
  flags: SessionFlag[];
  shortcuts: ShortcutBinding[];
  ides: IDEInfo[];
  quickActions: QuickAction[];
}

const DEFAULT_IDES: Omit<IDEInfo, 'installed'>[] = [
  { id: 'vscode', name: 'VS Code', command: 'code', args: ['.'], enabled: true },
  { id: 'cursor', name: 'Cursor', command: 'cursor', args: ['.'], enabled: true },
  { id: 'phpstorm', name: 'PhpStorm', command: 'open', args: ['-a', 'PhpStorm', '.'], enabled: true },
  { id: 'webstorm', name: 'WebStorm', command: 'open', args: ['-a', 'WebStorm', '.'], enabled: true },
  { id: 'intellij', name: 'IntelliJ IDEA', command: 'open', args: ['-a', 'IntelliJ IDEA', '.'], enabled: true },
  { id: 'sublime', name: 'Sublime Text', command: 'subl', args: ['.'], enabled: true },
  { id: 'zed', name: 'Zed', command: 'zed', args: ['.'], enabled: true },
  { id: 'xcode', name: 'Xcode', command: 'open', args: ['-a', 'Xcode', '.'], enabled: false },
];

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  { id: 'branch', type: 'builtin', visible: true, order: 0 },
  { id: 'commit', type: 'builtin', visible: true, order: 1 },
  { id: 'createPR', type: 'builtin', visible: true, order: 2 },
  { id: 'worktree', type: 'builtin', visible: true, order: 3 },
  { id: 'finder', type: 'builtin', visible: true, order: 4 },
  { id: 'terminal', type: 'builtin', visible: true, order: 5 },
];

const DEFAULT_FLAGS: SessionFlag[] = [
  { id: 'todo',    name: 'A faire',  color: '#a0a0b0', order: 0 },
  { id: 'doing',   name: 'En cours', color: '#64b5f6', order: 1 },
  { id: 'review',  name: 'A review', color: '#ffb044', order: 2 },
  { id: 'done',    name: 'Fait',     color: '#50e3a0', order: 3 },
];

export const DEFAULT_SHORTCUTS: ShortcutBinding[] = [
  { id: 'session-1',  accelerator: 'Cmd+1' },
  { id: 'session-2',  accelerator: 'Cmd+2' },
  { id: 'session-3',  accelerator: 'Cmd+3' },
  { id: 'session-4',  accelerator: 'Cmd+4' },
  { id: 'session-5',  accelerator: 'Cmd+5' },
  { id: 'new-shell',  accelerator: 'Cmd+T' },
  { id: 'new-claude', accelerator: 'Cmd+Shift+T' },
  { id: 'close-tab',  accelerator: 'Cmd+W' },
  { id: 'split-view', accelerator: 'Cmd+\\' },
];

export class SettingsStore {
  private settingsPath: string;
  private settings: AppSettings;

  constructor() {
    const configDir = path.join(os.homedir(), '.claude-session-manager');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.settingsPath = path.join(configDir, 'settings.json');
    this.settings = this.load();
  }

  private getDefaults(): AppSettings {
    const ides = DEFAULT_IDES.map(ide => ({
      ...ide,
      installed: this.detectIDE(ide),
    }));

    // Auto-generate IDE quick actions from detected+enabled IDEs
    const ideActions: QuickAction[] = ides
      .filter(ide => ide.installed && ide.enabled)
      .map((ide, i) => ({
        id: `ide:${ide.id}`,
        type: 'ide' as const,
        visible: true,
        order: 5 + i,
      }));

    return {
      locale: 'en',
      refreshInterval: 15,
      usageRefreshInterval: 5,
      sessionsPosition: 'left' as LayoutPosition,
      sessionsSortMode: 'project' as SessionSortMode,
      showFilesPanel: true,
      showActionsPanel: true,
      theme: 'dark' as AppTheme,
      terminalTheme: 'dark' as AppTheme,
      terminalPreset: 'iterm2' as TerminalPreset,
      terminalFontSize: 13,
      externalTerminal: 'terminal' as ExternalTerminal,
      terminalBgColor: '',
      terminalBgOpacity: 100,
      terminalBgImage: '',
      notificationsEnabled: true,
      demoMode: false,
      trayEnabled: true,
      autoUpdate: true,
      flags: DEFAULT_FLAGS.map(f => ({ ...f })),
      shortcuts: DEFAULT_SHORTCUTS.map(s => ({ ...s })),
      ides,
      quickActions: [...DEFAULT_QUICK_ACTIONS, ...ideActions],
    };
  }

  private load(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const raw = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
        const defaults = this.getDefaults();
        // Merge saved settings with defaults (add new IDEs/actions that didn't exist)
        return this.merge(defaults, raw);
      }
    } catch {}
    return this.getDefaults();
  }

  private merge(defaults: AppSettings, saved: Partial<AppSettings>): AppSettings {
    const merged = { ...defaults };

    if (saved.locale !== undefined) merged.locale = saved.locale;
    if (saved.refreshInterval !== undefined) merged.refreshInterval = saved.refreshInterval;
    if (saved.usageRefreshInterval !== undefined) merged.usageRefreshInterval = saved.usageRefreshInterval;
    if (saved.sessionsPosition !== undefined) merged.sessionsPosition = saved.sessionsPosition;
    if (saved.sessionsSortMode !== undefined) merged.sessionsSortMode = saved.sessionsSortMode;
    if (saved.showFilesPanel !== undefined) merged.showFilesPanel = saved.showFilesPanel;
    if (saved.showActionsPanel !== undefined) merged.showActionsPanel = saved.showActionsPanel;
    if (saved.theme !== undefined) merged.theme = saved.theme;
    // Legacy fallback: if terminalTheme isn't saved yet, default it to the UI theme
    // so existing users see no surprise color change.
    merged.terminalTheme = saved.terminalTheme !== undefined
      ? saved.terminalTheme
      : (saved.theme !== undefined ? saved.theme : defaults.terminalTheme);
    if (saved.terminalPreset !== undefined) merged.terminalPreset = saved.terminalPreset;
    if (saved.terminalFontSize !== undefined) merged.terminalFontSize = saved.terminalFontSize;
    if (saved.externalTerminal !== undefined) merged.externalTerminal = saved.externalTerminal;
    if (saved.terminalBgColor !== undefined) merged.terminalBgColor = saved.terminalBgColor;
    if (saved.terminalBgOpacity !== undefined) merged.terminalBgOpacity = saved.terminalBgOpacity;
    if (saved.terminalBgImage !== undefined) merged.terminalBgImage = saved.terminalBgImage;
    if (saved.notificationsEnabled !== undefined) merged.notificationsEnabled = saved.notificationsEnabled;
    if (saved.demoMode !== undefined) merged.demoMode = saved.demoMode;
    if (saved.trayEnabled !== undefined) merged.trayEnabled = saved.trayEnabled;
    if (Array.isArray(saved.flags) && saved.flags.length > 0) merged.flags = saved.flags;
    if (Array.isArray(saved.shortcuts) && saved.shortcuts.length > 0) merged.shortcuts = saved.shortcuts;

    // Merge IDEs: keep saved enabled state, but update installed status
    if (saved.ides) {
      merged.ides = defaults.ides.map(defaultIde => {
        const savedIde = saved.ides!.find(s => s.id === defaultIde.id);
        return {
          ...defaultIde,
          enabled: savedIde ? savedIde.enabled : defaultIde.enabled,
        };
      });
    }

    // Merge quick actions: keep saved visibility and order, but inject any
    // new built-in defaults at their default position (so newly-shipped actions
    // like `branch` land where they're meant to be, not at the end).
    if (saved.quickActions) {
      const savedMap = new Map(saved.quickActions.map(a => [a.id, a]));
      const existing = saved.quickActions
        .filter(a => defaults.quickActions.some(d => d.id === a.id) || a.type === 'ide')
        .sort((a, b) => a.order - b.order);
      const missing = defaults.quickActions
        .filter(d => !savedMap.has(d.id))
        .sort((a, b) => a.order - b.order);

      const result: QuickAction[] = [...existing];
      for (const m of missing) {
        const idx = Math.min(m.order, result.length);
        result.splice(idx, 0, m);
      }
      merged.quickActions = result.map((a, i) => ({ ...a, order: i }));
    }

    return merged;
  }

  get(): AppSettings {
    return { ...this.settings };
  }

  save(settings: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...settings };
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
    return this.get();
  }

  detectAllIDEs(): IDEInfo[] {
    return this.settings.ides.map(ide => ({
      ...ide,
      installed: this.detectIDE(ide),
    }));
  }

  resetToDefaults(): AppSettings {
    this.settings = this.getDefaults();
    if (fs.existsSync(this.settingsPath)) {
      fs.unlinkSync(this.settingsPath);
    }
    return this.get();
  }

  private detectIDE(ide: Omit<IDEInfo, 'installed'>): boolean {
    // Fallback .app names when the CLI command isn't in PATH
    const appFallbacks: Record<string, string[]> = {
      vscode: ['Visual Studio Code.app', 'VSCodium.app'],
      cursor: ['Cursor.app'],
      sublime: ['Sublime Text.app'],
      zed: ['Zed.app', 'Zed Preview.app'],
    };
    const appExists = (appNames: string[]): boolean => {
      const homeApps = path.join(os.homedir(), 'Applications');
      for (const name of appNames) {
        if (fs.existsSync(path.join('/Applications', name))) return true;
        if (fs.existsSync(path.join(homeApps, name))) return true;
      }
      return false;
    };

    try {
      if (ide.command === 'open' && ide.args[0] === '-a') {
        // JetBrains / open -a based detection
        const appName = ide.args[1];
        const paths = [
          `/Applications/${appName}.app`,
          `${os.homedir()}/Applications/${appName}.app`,
          `/Applications/JetBrains Toolbox/${appName}.app`,
        ];
        try {
          const safeName = appName.replace(/"/g, '');
          const found = execFileSync('mdfind', [
            `kMDItemKind == "Application" && kMDItemDisplayName == "${safeName}*"`
          ], { encoding: 'utf-8', timeout: 3000 }).trim();
          if (found) return true;
        } catch {}
        return paths.some(p => fs.existsSync(p));
      }

      // CLI-based IDEs: try PATH with shell-augmented env first
      const extraPath = [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
        '/bin',
        `${os.homedir()}/.local/bin`,
        `${os.homedir()}/.cargo/bin`,
      ].join(':');
      const combinedPath = `${process.env.PATH || ''}:${extraPath}`;
      try {
        execFileSync('which', [ide.command], {
          encoding: 'utf-8',
          timeout: 2000,
          env: { ...process.env, PATH: combinedPath },
        });
        return true;
      } catch {}

      // Fallback: check for the .app bundle directly
      const apps = appFallbacks[ide.id];
      if (apps && appExists(apps)) return true;

      return false;
    } catch {
      return false;
    }
  }
}
