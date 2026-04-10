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
  { id: 'commit', type: 'builtin', visible: true, order: 0 },
  { id: 'createPR', type: 'builtin', visible: true, order: 1 },
  { id: 'worktree', type: 'builtin', visible: true, order: 2 },
  { id: 'finder', type: 'builtin', visible: true, order: 3 },
  { id: 'terminal', type: 'builtin', visible: true, order: 4 },
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
      locale: 'fr',
      refreshInterval: 15,
      sessionsPosition: 'left' as LayoutPosition,
      sessionsSortMode: 'default' as SessionSortMode,
      showFilesPanel: true,
      showActionsPanel: true,
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

    if (saved.locale) merged.locale = saved.locale;
    if (saved.refreshInterval) merged.refreshInterval = saved.refreshInterval;
    if (saved.sessionsPosition) merged.sessionsPosition = saved.sessionsPosition;
    if (saved.sessionsSortMode) merged.sessionsSortMode = saved.sessionsSortMode;
    if (saved.showFilesPanel !== undefined) merged.showFilesPanel = saved.showFilesPanel;
    if (saved.showActionsPanel !== undefined) merged.showActionsPanel = saved.showActionsPanel;

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

    // Merge quick actions: keep saved visibility and order
    if (saved.quickActions) {
      const savedMap = new Map(saved.quickActions.map(a => [a.id, a]));
      // Keep saved actions order, add new defaults at the end
      const existing = saved.quickActions.filter(a =>
        defaults.quickActions.some(d => d.id === a.id) || a.type === 'ide'
      );
      const newActions = defaults.quickActions.filter(d =>
        !savedMap.has(d.id)
      );
      merged.quickActions = [...existing, ...newActions];
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
    try {
      if (ide.command === 'open' && ide.args[0] === '-a') {
        // Check if macOS app exists
        const appName = ide.args[1];
        const paths = [
          `/Applications/${appName}.app`,
          `${os.homedir()}/Applications/${appName}.app`,
          `/Applications/JetBrains Toolbox/${appName}.app`,
        ];
        // Also check mdfind for JetBrains apps (they have versioned names)
        try {
          const safeName = appName.replace(/"/g, '');
          const found = execFileSync('mdfind', [
            `kMDItemKind == "Application" && kMDItemDisplayName == "${safeName}*"`
          ], { encoding: 'utf-8', timeout: 3000 }).trim();
          if (found) return true;
        } catch {}

        return paths.some(p => fs.existsSync(p));
      } else {
        // Check if command exists in PATH
        execFileSync('which', [ide.command], { encoding: 'utf-8', timeout: 2000 });
        return true;
      }
    } catch {
      return false;
    }
  }
}
