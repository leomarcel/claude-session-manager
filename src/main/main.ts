import { app, BrowserWindow, ipcMain, shell, dialog, Notification, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import { execFile, execFileSync } from 'child_process';
import { SessionDetector } from './sessionDetector';
import { GitManager } from './gitManager';
import { PtyManager } from './ptyManager';
import { TokenTracker } from './tokenTracker';
import { SettingsStore } from './settingsStore';
import { TerminalStore } from './terminalStore';
import { SessionMetaStore } from './sessionMetaStore';
import { logger } from './logger';

logger.init();

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

  // --- Logs ---
  ipcMain.handle('logs-get', async () => logger.getAll());
  ipcMain.handle('logs-clear', async () => logger.clear());

  // --- Settings ---
  ipcMain.handle('settings-get', async () => settingsStore.get());
  ipcMain.handle('settings-save', async (_event, settings: any) => {
    const result = settingsStore.save(settings);
    // Toggle tray based on setting
    if (result.trayEnabled && !tray) {
      createTray();
    } else if (!result.trayEnabled && tray) {
      tray.destroy();
      tray = null;
    }
    return result;
  });
  ipcMain.handle('settings-detect-ides', async () => settingsStore.detectAllIDEs());
  ipcMain.handle('settings-reset', async () => settingsStore.resetToDefaults());

  // --- Terminal persistence ---
  ipcMain.handle('terminals-load', async () => terminalStore.load());
  ipcMain.handle('terminals-save', async (_event, state: any) => terminalStore.save(state));

  // --- Sessions ---
  ipcMain.handle('get-sessions', async () => {
    const sessions = await sessionDetector.detectSessions();
    logger.add('debug', 'sessions', `Detected ${sessions.length} sessions`);
    return sessions;
  });

  // --- Git ---
  ipcMain.handle('get-modified-files', async (_event, projectPath: string) => GitManager.getModifiedFiles(projectPath));
  ipcMain.handle('get-git-branch', async (_event, projectPath: string) => GitManager.getCurrentBranch(projectPath));

  // --- Git data ---
  ipcMain.handle('get-worktrees', async (_event, projectPath: string) => GitManager.getWorktrees(projectPath));
  ipcMain.handle('get-staged-files', async (_event, projectPath: string) => GitManager.getStagedFiles(projectPath));

  ipcMain.handle('get-file-diff', async (_event, projectPath: string, filePath: string) => {
    try {
      // Try staged diff first, then unstaged
      let diff = '';
      try {
        diff = execFileSync('git', ['diff', '--cached', '--', filePath], {
          cwd: projectPath, encoding: 'utf-8', timeout: 5000
        });
      } catch {}
      if (!diff) {
        try {
          diff = execFileSync('git', ['diff', '--', filePath], {
            cwd: projectPath, encoding: 'utf-8', timeout: 5000
          });
        } catch {}
      }
      // For untracked files, show file content as "new file"
      if (!diff) {
        try {
          const content = require('fs').readFileSync(require('path').join(projectPath, filePath), 'utf-8');
          diff = `--- /dev/null\n+++ b/${filePath}\n` + content.split('\n').map((l: string) => `+${l}`).join('\n');
        } catch {}
      }
      return diff;
    } catch {
      return '';
    }
  });

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
    logger.add('info', 'action', `Opening ${filePath} in ${ideId}`);
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

  ipcMain.handle('dialog-select-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select project folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('action-open-terminal', async (_event, projectPath: string) => {
    const s = settingsStore.get();
    const termApps: Record<string, string> = {
      terminal: 'Terminal',
      iterm2: 'iTerm',
      warp: 'Warp',
      alacritty: 'Alacritty',
    };
    const appName = termApps[s.externalTerminal] || 'Terminal';
    await execFilePromise('open', ['-a', appName, projectPath]);
  });

  // --- PTY ---
  ipcMain.handle('pty-create', async (_event, projectPath: string, resumeId?: string) => {
    logger.add('info', 'pty', `Creating claude PTY for ${projectPath}${resumeId ? ` (resume: ${resumeId.slice(0, 8)}...)` : ''}`);
    const id = ptyManager.create(projectPath, resumeId);
    ptyManager.onData(id, (data: string) => {
      mainWindow?.webContents.send('pty-data', id, data);
    });
    return id;
  });

  // Shell-only PTY (no claude auto-launch)
  ipcMain.handle('pty-create-shell', async (_event, projectPath: string) => {
    logger.add('info', 'pty', `Creating shell PTY for ${projectPath}`);
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
  ipcMain.handle('get-token-usage', async () => {
    const s = settingsStore.get();
    const cacheTtl = (s.usageRefreshInterval || 2) * 60 * 1000;
    return tokenTracker.getUsage(cacheTtl);
  });

  // --- Auto-refresh + notifications ---
  let refreshInterval: NodeJS.Timeout | null = null;
  const previousStatuses = new Map<string, string>();

  ipcMain.handle('start-session-refresh', async () => {
    if (refreshInterval) clearInterval(refreshInterval);
    const settings = settingsStore.get();
    const interval = (settings.refreshInterval || 15) * 1000;
    refreshInterval = setInterval(async () => {
      try {
        const sessions = await sessionDetector.detectSessions();
        mainWindow?.webContents.send('sessions-updated', sessions);

        // Check for busy → idle transitions (notifications)
        const s = settingsStore.get();
        if (s.notificationsEnabled) {
          for (const session of sessions) {
            const prev = previousStatuses.get(session.projectPath);
            if (prev === 'active' && session.status === 'idle') {
              new Notification({
                title: 'Claude Session Manager',
                body: `${session.projectName} — Claude is waiting for input`,
              }).show();
            }
          }
        }
        // Update previous statuses
        for (const session of sessions) {
          previousStatuses.set(session.projectPath, session.status);
        }
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

let tray: Tray | null = null;

let trayUsageLabel = '';

function createTray() {
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'mascotte_claude.png');
  let trayIcon: Electron.NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Claude Session Manager');
  updateTrayMenu([], '');
}

function updateTrayMenu(sessions: { projectName: string; projectPath: string; status: string }[], usage: string) {
  if (!tray) return;
  trayUsageLabel = usage;

  const sessionItems: Electron.MenuItemConstructorOptions[] = sessions.slice(0, 10).map(s => ({
    label: `${s.status === 'active' ? '● ' : '○ '}${s.projectName}`,
    click: () => {
      mainWindow?.show();
      mainWindow?.focus();
      mainWindow?.webContents.send('tray-select-session', s.projectPath);
    }
  }));

  const menuItems: Electron.MenuItemConstructorOptions[] = [];

  // Usage stats at the top
  if (usage) {
    menuItems.push({ label: usage, enabled: false });
    menuItems.push({ type: 'separator' });
  }

  // Sessions
  menuItems.push(...sessionItems);
  if (sessionItems.length > 0) menuItems.push({ type: 'separator' });

  // Actions
  menuItems.push(
    { label: 'Open', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { label: 'Settings...', accelerator: 'Cmd+,', click: () => {
      mainWindow?.show(); mainWindow?.focus();
      mainWindow?.webContents.send('open-settings');
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  );

  tray.setContextMenu(Menu.buildFromTemplate(menuItems));
}

function createAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings...',
          accelerator: 'Cmd+,',
          click: () => {
            mainWindow?.show();
            mainWindow?.focus();
            mainWindow?.webContents.send('open-settings');
          }
        },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  logger.add('info', 'app', `Claude Session Manager starting (Electron ${process.versions.electron}, Node ${process.versions.node})`);
  setupIPC();
  createWindow();
  if (settingsStore.get().trayEnabled) createTray();
  createAppMenu();
  logger.add('info', 'app', 'Window created, IPC handlers registered');
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Update tray menu when sessions change
ipcMain.on('update-tray-sessions', (_event, sessions, usage) => {
  updateTrayMenu(sessions, usage || trayUsageLabel);
});

app.on('window-all-closed', () => {
  ptyManager?.destroyAll();
  app.quit();
});
