import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { execFile } from 'child_process';
import { SessionDetector } from './sessionDetector';
import { GitManager } from './gitManager';
import { PtyManager } from './ptyManager';
import { TokenTracker } from './tokenTracker';
import { SettingsStore } from './settingsStore';
import { TerminalStore } from './terminalStore';
import { SessionMetaStore } from './sessionMetaStore';

app.setName('Claude Session Manager');

let mainWindow: BrowserWindow | null = null;
let sessionDetector: SessionDetector;
let ptyManager: PtyManager;
let tokenTracker: TokenTracker;
let settingsStore: SettingsStore;
let terminalStore: TerminalStore;
let sessionMetaStore: SessionMetaStore;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Claude Session Manager',
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function execFilePromise(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve) => {
    execFile(cmd, args, () => resolve());
  });
}

function setupIPC() {
  sessionDetector = new SessionDetector();
  ptyManager = new PtyManager();
  tokenTracker = new TokenTracker();
  settingsStore = new SettingsStore();
  terminalStore = new TerminalStore();
  sessionMetaStore = new SessionMetaStore();

  // --- Session meta (rename, archive) ---
  ipcMain.handle('session-meta-get-all', async () => sessionMetaStore.getAll());
  ipcMain.handle('session-meta-rename', async (_event, projectPath: string, name: string) => {
    sessionMetaStore.rename(projectPath, name);
  });
  ipcMain.handle('session-meta-archive', async (_event, projectPath: string) => {
    sessionMetaStore.archive(projectPath);
  });
  ipcMain.handle('session-meta-unarchive', async (_event, projectPath: string) => {
    sessionMetaStore.unarchive(projectPath);
  });

  // --- Settings ---
  ipcMain.handle('settings-get', async () => settingsStore.get());
  ipcMain.handle('settings-save', async (_event, settings: any) => settingsStore.save(settings));
  ipcMain.handle('settings-detect-ides', async () => settingsStore.detectAllIDEs());
  ipcMain.handle('settings-reset', async () => settingsStore.resetToDefaults());

  // --- Terminal persistence ---
  ipcMain.handle('terminals-load', async () => terminalStore.load());
  ipcMain.handle('terminals-save', async (_event, state: any) => terminalStore.save(state));

  // --- Sessions ---
  ipcMain.handle('get-sessions', async () => sessionDetector.detectSessions());

  // --- Git ---
  ipcMain.handle('get-modified-files', async (_event, projectPath: string) => GitManager.getModifiedFiles(projectPath));
  ipcMain.handle('get-git-branch', async (_event, projectPath: string) => GitManager.getCurrentBranch(projectPath));

  // --- Actions ---
  ipcMain.handle('action-commit', async (_event, projectPath: string) => GitManager.openCommitInTerminal(projectPath));
  ipcMain.handle('action-create-pr', async (_event, projectPath: string) => GitManager.createPR(projectPath));
  ipcMain.handle('action-worktree', async (_event, projectPath: string) => GitManager.createWorktree(projectPath));

  ipcMain.handle('action-open-ide', async (_event, projectPath: string, ideId: string) => {
    const settings = settingsStore.get();
    const ide = settings.ides.find(i => i.id === ideId);
    if (ide) {
      const args = ide.args.map(a => a === '.' ? projectPath : a);
      await execFilePromise(ide.command, args);
    }
  });

  // Open a specific file in an IDE
  ipcMain.handle('action-open-file-in-ide', async (_event, projectPath: string, filePath: string, ideId: string) => {
    const settings = settingsStore.get();
    const ide = settings.ides.find(i => i.id === ideId);
    if (!ide) return;

    const fullFilePath = path.join(projectPath, filePath);

    if (ide.command === 'open' && ide.args[0] === '-a') {
      // JetBrains IDEs: open -a "PhpStorm" --args <file>
      await execFilePromise('open', ['-a', ide.args[1], fullFilePath]);
    } else {
      // CLI-based IDEs (code, cursor, subl, zed): command <file>
      await execFilePromise(ide.command, [fullFilePath]);
    }
  });

  // Get enabled IDEs for file picker
  ipcMain.handle('get-enabled-ides', async () => {
    const settings = settingsStore.get();
    return settings.ides.filter(i => i.installed && i.enabled);
  });

  ipcMain.handle('action-open-finder', async (_event, projectPath: string) => shell.showItemInFolder(projectPath));
  ipcMain.handle('action-open-terminal', async (_event, projectPath: string) => execFilePromise('open', ['-a', 'Terminal', projectPath]));

  // --- PTY ---
  ipcMain.handle('pty-create', async (_event, projectPath: string, resumeId?: string) => {
    const id = ptyManager.create(projectPath, resumeId);
    ptyManager.onData(id, (data: string) => {
      mainWindow?.webContents.send('pty-data', id, data);
    });
    return id;
  });

  // Shell-only PTY (no claude auto-launch)
  ipcMain.handle('pty-create-shell', async (_event, projectPath: string) => {
    const id = ptyManager.createShell(projectPath);
    ptyManager.onData(id, (data: string) => {
      mainWindow?.webContents.send('pty-data', id, data);
    });
    return id;
  });

  ipcMain.handle('pty-write', async (_event, id: string, data: string) => ptyManager.write(id, data));
  ipcMain.handle('pty-resize', async (_event, id: string, cols: number, rows: number) => ptyManager.resize(id, cols, rows));
  ipcMain.handle('pty-destroy', async (_event, id: string) => ptyManager.destroy(id));

  // --- Token usage ---
  ipcMain.handle('get-token-usage', async () => tokenTracker.getUsage());

  // --- Auto-refresh ---
  let refreshInterval: NodeJS.Timeout | null = null;

  ipcMain.handle('start-session-refresh', async () => {
    if (refreshInterval) clearInterval(refreshInterval);
    const settings = settingsStore.get();
    const interval = (settings.refreshInterval || 15) * 1000;
    refreshInterval = setInterval(async () => {
      try {
        const sessions = await sessionDetector.detectSessions();
        mainWindow?.webContents.send('sessions-updated', sessions);
      } catch {}
    }, interval);
  });

  ipcMain.handle('stop-session-refresh', async () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  });
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  ptyManager?.destroyAll();
  app.quit();
});
