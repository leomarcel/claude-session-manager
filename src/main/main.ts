import { app, BrowserWindow, ipcMain, shell, dialog, Notification, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile, execFileSync } from 'child_process';
import { SessionDetector } from './sessionDetector';
import { GitManager } from './gitManager';
import { PtyManager } from './ptyManager';
import { TokenTracker } from './tokenTracker';
import { SettingsStore } from './settingsStore';
import { TerminalStore } from './terminalStore';
import { SessionMetaStore } from './sessionMetaStore';
import { logger } from './logger';
import { autoUpdater } from 'electron-updater';

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

function execFilePromise(cmd: string, args: string[], opts?: { env?: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts || {}, (err) => {
      if (err) reject(err);
      else resolve();
    });
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
  ipcMain.handle('session-meta-set-flag', async (_event, key: string, flagId: string | null) => {
    sessionMetaStore.setFlag(key, flagId);
  });
  ipcMain.handle('session-meta-set-pinned', async (_event, key: string, pinned: boolean) => {
    sessionMetaStore.setPinned(key, pinned);
  });

  // Helper: SIGTERM then escalate to SIGKILL, and remove the stale pid session file
  const killClaudePid = async (pid: number): Promise<boolean> => {
    if (!pid || pid <= 0) return false;
    let killed = false;
    try {
      process.kill(pid, 'SIGTERM');
      killed = true;
      logger.add('info', 'session', `Sent SIGTERM to claude pid ${pid}`);
    } catch (e: any) {
      logger.add('warn', 'session', `SIGTERM failed for pid ${pid}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 400));
    try {
      process.kill(pid, 0);
      try {
        process.kill(pid, 'SIGKILL');
        killed = true;
        logger.add('info', 'session', `Escalated to SIGKILL for pid ${pid}`);
      } catch {}
    } catch {
      // ESRCH = no such process, it's gone
    }
    try {
      const sessionFile = path.join(os.homedir(), '.claude', 'sessions', `${pid}.json`);
      if (fs.existsSync(sessionFile)) fs.unlinkSync(sessionFile);
    } catch {}
    return killed;
  };

  ipcMain.handle('session-kill', async (_event, pid: number) => {
    if (!pid || pid <= 0) return { ok: false, reason: 'invalid pid' };
    const ok = await killClaudePid(pid);
    return { ok };
  });

  // Kill every live claude session on the machine (nuclear option)
  ipcMain.handle('kill-all-sessions', async () => {
    const sessions = await sessionDetector.detectSessions();
    const live = sessions.filter(s => s.pid > 0);
    let killedCount = 0;
    for (const s of live) {
      const ok = await killClaudePid(s.pid);
      if (ok) killedCount++;
    }
    logger.add('info', 'session', `kill-all-sessions: killed ${killedCount}/${live.length}`);
    return { killedCount, total: live.length };
  });

  // Permanent delete: kill process + remove JSONL transcript + remove meta entry
  ipcMain.handle('session-delete', async (_event, args: {
    key: string;
    pid: number;
    projectPath: string;
    conversationId?: string;
  }) => {
    if (args.pid > 0) await killClaudePid(args.pid);

    let jsonlDeleted = false;
    if (args.conversationId) {
      const jsonlPath = sessionDetector.findJsonlForSession(args.projectPath, args.conversationId);
      if (jsonlPath && fs.existsSync(jsonlPath)) {
        // Safety: only delete if path is inside ~/.claude/projects/
        const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
        if (jsonlPath.startsWith(projectsRoot)) {
          try {
            fs.unlinkSync(jsonlPath);
            jsonlDeleted = true;
          } catch (e: any) {
            logger.add('error', 'session', `Delete jsonl failed: ${e.message}`);
          }
        }
      }
    }

    sessionMetaStore.delete(args.key);
    if (args.projectPath !== args.key) sessionMetaStore.delete(args.projectPath);

    logger.add('info', 'session', `Deleted session ${args.conversationId || args.key} (jsonl=${jsonlDeleted})`);
    return { ok: true, jsonlDeleted };
  });

  // --- Logs ---
  ipcMain.handle('logs-get', async () => logger.getAll());
  ipcMain.handle('logs-clear', async () => logger.clear());

  // --- Settings ---
  ipcMain.handle('settings-get', async () => settingsStore.get());
  ipcMain.handle('settings-save', async (_event, settings: any) => {
    const previousShortcuts = JSON.stringify(settingsStore.get().shortcuts || []);
    const result = settingsStore.save(settings);
    // Toggle tray based on setting
    if (result.trayEnabled && !tray) {
      createTray();
    } else if (!result.trayEnabled && tray) {
      tray.destroy();
      tray = null;
    }
    // Rebuild the application menu if shortcuts changed
    const newShortcuts = JSON.stringify(result.shortcuts || []);
    if (previousShortcuts !== newShortcuts) {
      createAppMenu();
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
  // --- Session history ---
  ipcMain.handle('get-session-history', async (_event, projectPath: string, sessionId: string) => {
    try {
      const claudeDir = path.join(require('os').homedir(), '.claude', 'projects');
      const entries = require('fs').readdirSync(claudeDir);
      // Find the project dir
      for (const entry of entries) {
        const jsonlPath = path.join(claudeDir, entry, `${sessionId}.jsonl`);
        if (require('fs').existsSync(jsonlPath)) {
          const content = require('fs').readFileSync(jsonlPath, 'utf-8');
          const messages: { type: string; text: string; timestamp: string }[] = [];
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
              const e = JSON.parse(line);
              if (e.type === 'user' && e.message?.content) {
                const text = typeof e.message.content === 'string' ? e.message.content : e.message.content.find((b: any) => b.type === 'text')?.text || '';
                if (text) messages.push({ type: 'user', text: text.slice(0, 200), timestamp: e.timestamp || '' });
              } else if (e.type === 'assistant' && e.message?.content) {
                const blocks = Array.isArray(e.message.content) ? e.message.content : [{ type: 'text', text: String(e.message.content) }];
                const text = blocks.find((b: any) => b.type === 'text')?.text || '';
                if (text) messages.push({ type: 'assistant', text: text.slice(0, 200), timestamp: e.timestamp || '' });
              }
            } catch {}
          }
          return messages;
        }
      }
    } catch {}
    return [];
  });

  ipcMain.handle('get-branches', async (_event, projectPath: string) => GitManager.getBranches(projectPath));
  ipcMain.handle('git-switch-branch', async (_event, projectPath: string, branch: string) => GitManager.switchBranch(projectPath, branch));
  ipcMain.handle('git-create-worktree', async (_event, projectPath: string, branch: string, worktreePath: string) => GitManager.createWorktreeForBranch(projectPath, branch, worktreePath));

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

  // Fallback .app bundle names for CLI-based IDEs when the CLI command isn't in PATH
  const IDE_APP_FALLBACK: Record<string, string> = {
    vscode: 'Visual Studio Code',
    cursor: 'Cursor',
    sublime: 'Sublime Text',
    zed: 'Zed',
  };

  // Run a CLI IDE command with a PATH-augmented env, fall back to `open -a` if the CLI is missing
  const launchIDE = async (ideId: string, command: string, args: string[]) => {
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
      await execFilePromise(command, args, { env: { ...process.env, PATH: combinedPath } });
      return;
    } catch (e: any) {
      const fallbackApp = IDE_APP_FALLBACK[ideId];
      if (fallbackApp) {
        logger.add('info', 'action', `CLI '${command}' not available, falling back to open -a '${fallbackApp}'`);
        await execFilePromise('open', ['-a', fallbackApp, ...args]);
        return;
      }
      throw e;
    }
  };

  ipcMain.handle('action-open-ide', async (_event, projectPath: string, ideId: string) => {
    const settings = settingsStore.get();
    const ide = settings.ides.find(i => i.id === ideId);
    if (!ide) return;
    const args = ide.args.map(a => a === '.' ? projectPath : a);
    if (ide.command === 'open' && ide.args[0] === '-a') {
      await execFilePromise(ide.command, args);
    } else {
      await launchIDE(ideId, ide.command, args);
    }
  });

  // Open a specific file in an IDE
  ipcMain.handle('action-open-file-in-ide', async (_event, projectPath: string, filePath: string, ideId: string) => {
    logger.add('info', 'action', `Opening ${filePath} in ${ideId}`);
    const settings = settingsStore.get();
    const ide = settings.ides.find(i => i.id === ideId);
    if (!ide) return;

    // Reject paths that escape the home directory
    const homedir = os.homedir();
    const projectResolved = path.resolve(projectPath);
    if (!projectResolved.startsWith(homedir) && !projectResolved.startsWith('/private/var/')) {
      logger.add('warn', 'action', `Rejected open-in-ide for unsafe project path: ${projectPath}`);
      return;
    }
    const fullFilePath = path.resolve(projectResolved, filePath);
    if (!fullFilePath.startsWith(projectResolved)) {
      logger.add('warn', 'action', `Rejected open-in-ide: file outside project: ${filePath}`);
      return;
    }

    if (ide.command === 'open' && ide.args[0] === '-a') {
      // JetBrains IDEs: open -a "PhpStorm" <file>
      await execFilePromise('open', ['-a', ide.args[1], fullFilePath]);
    } else {
      await launchIDE(ideId, ide.command, [fullFilePath]);
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
  // Open an external URL safely in the user's default browser
  ipcMain.handle('open-external', async (_event, url: string) => {
    if (typeof url !== 'string') return { ok: false, error: 'invalid url' };
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'unsupported scheme' };
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('dialog-select-image', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Select background image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
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
  ipcMain.handle('get-token-usage', async (_event, forceRefresh?: boolean) => {
    const cacheTtl = forceRefresh ? 0 : (settingsStore.get().usageRefreshInterval || 5) * 60 * 1000;
    return tokenTracker.getUsage(cacheTtl);
  });

  // --- Updater ---
  ipcMain.handle('updater-check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        currentVersion: app.getVersion(),
        updateAvailable: !!(result?.updateInfo && result.updateInfo.version !== app.getVersion()),
        latestVersion: result?.updateInfo?.version,
      };
    } catch (e: any) {
      return { error: e.message };
    }
  });
  ipcMain.handle('updater-install', async () => {
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle('get-app-version', async () => app.getVersion());

  // --- Claude Code config (~/.claude/settings.json + project .claude/settings.json) ---
  type ClaudeConfigScope = 'global' | 'global-local' | 'project' | 'project-local';
  const resolveClaudeConfigPath = (scope: ClaudeConfigScope, projectPath?: string): string | null => {
    const home = os.homedir();
    switch (scope) {
      case 'global': return path.join(home, '.claude', 'settings.json');
      case 'global-local': return path.join(home, '.claude', 'settings.local.json');
      case 'project':
        if (!projectPath) return null;
        return path.join(projectPath, '.claude', 'settings.json');
      case 'project-local':
        if (!projectPath) return null;
        return path.join(projectPath, '.claude', 'settings.local.json');
    }
  };
  ipcMain.handle('claude-config-load', async (_event, scope: ClaudeConfigScope, projectPath?: string) => {
    const file = resolveClaudeConfigPath(scope, projectPath);
    if (!file) return { exists: false, content: '', path: '', error: 'invalid scope' };
    try {
      if (!fs.existsSync(file)) return { exists: false, content: '', path: file };
      const content = fs.readFileSync(file, 'utf-8');
      return { exists: true, content, path: file };
    } catch (e: any) {
      return { exists: false, content: '', path: file, error: e.message };
    }
  });
  ipcMain.handle('claude-config-save', async (_event, scope: ClaudeConfigScope, content: string, projectPath?: string) => {
    const file = resolveClaudeConfigPath(scope, projectPath);
    if (!file) return { ok: false, error: 'invalid scope' };
    // Validate JSON before writing
    try { JSON.parse(content); } catch (e: any) { return { ok: false, error: `Invalid JSON: ${e.message}` }; }
    try {
      const dir = path.dirname(file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, content, 'utf-8');
      logger.add('info', 'claude-config', `Saved ${scope} → ${file}`);
      return { ok: true };
    } catch (e: any) {
      logger.add('error', 'claude-config', `Save ${scope} failed: ${e.message}`);
      return { ok: false, error: e.message };
    }
  });

  // --- CLAUDE.md per project ---
  // Safety: only allow paths inside the user's home directory (or /private/var on macOS).
  const isSafeProjectPath = (p: string): boolean => {
    try {
      const resolved = path.resolve(p);
      const home = os.homedir();
      return resolved.startsWith(home) || resolved.startsWith('/private/var/');
    } catch { return false; }
  };
  ipcMain.handle('claude-md-load', async (_event, projectPath: string) => {
    if (!isSafeProjectPath(projectPath)) return { exists: false, content: '', path: '', error: 'invalid path' };
    const file = path.join(path.resolve(projectPath), 'CLAUDE.md');
    try {
      if (!fs.existsSync(file)) return { exists: false, content: '', path: file };
      return { exists: true, content: fs.readFileSync(file, 'utf-8'), path: file };
    } catch (e: any) {
      return { exists: false, content: '', path: file, error: e.message };
    }
  });
  ipcMain.handle('claude-md-save', async (_event, projectPath: string, content: string) => {
    if (!isSafeProjectPath(projectPath)) return { ok: false, error: 'invalid path' };
    const file = path.join(path.resolve(projectPath), 'CLAUDE.md');
    try {
      fs.writeFileSync(file, content, 'utf-8');
      logger.add('info', 'claude-md', `Saved ${file}`);
      return { ok: true };
    } catch (e: any) {
      logger.add('error', 'claude-md', `Save failed: ${e.message}`);
      return { ok: false, error: e.message };
    }
  });

  // --- Full-text search across all conversations (async, non-blocking) ---
  ipcMain.handle('search-conversations', async (_event, query: string) => {
    if (!query || query.trim().length < 2) return { ok: true, matches: [] };
    const needle = query.toLowerCase();
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    const fsp = fs.promises;

    try {
      await fsp.access(projectsDir);
    } catch {
      return { ok: true, matches: [] };
    }

    const matches: { conversationId: string; projectPath: string; snippet: string; matchCount: number }[] = [];
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // last 30 days only
    const MAX_RESULTS = 50;

    try {
      const entries = await fsp.readdir(projectsDir);
      outer: for (const entry of entries) {
        if (matches.length >= MAX_RESULTS) break;
        const dir = path.join(projectsDir, entry);
        try {
          const dirStat = await fsp.stat(dir);
          if (!dirStat.isDirectory()) continue;
          const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.jsonl'));
          if (files.length === 0) continue;

          // Resolve cwd from first jsonl
          let cwd = '';
          try {
            const head = (await fsp.readFile(path.join(dir, files[0]), 'utf-8')).split('\n').slice(0, 5);
            for (const line of head) {
              if (!line.trim()) continue;
              try {
                const ev = JSON.parse(line);
                if (ev.cwd) { cwd = ev.cwd; break; }
              } catch {}
            }
          } catch {}
          if (!cwd) continue;

          for (const file of files) {
            if (matches.length >= MAX_RESULTS) break outer;
            const filePath = path.join(dir, file);
            try {
              const stat = await fsp.stat(filePath);
              if (stat.mtimeMs < cutoff) continue;
              if (stat.size > 5 * 1024 * 1024) continue; // skip > 5MB

              const content = await fsp.readFile(filePath, 'utf-8');
              if (!content.toLowerCase().includes(needle)) continue;

              // Extract first matching text snippet
              let snippet = '';
              let matchCount = 0;
              for (const line of content.split('\n')) {
                if (!line.trim()) continue;
                try {
                  const ev = JSON.parse(line);
                  if (ev.type !== 'user' && ev.type !== 'assistant') continue;
                  let text = '';
                  const c = ev.message?.content;
                  if (typeof c === 'string') text = c;
                  else if (Array.isArray(c)) {
                    text = c.filter((b: any) => b?.type === 'text').map((b: any) => b.text || '').join(' ');
                  }
                  const lt = text.toLowerCase();
                  const idx = lt.indexOf(needle);
                  if (idx >= 0) {
                    matchCount++;
                    if (!snippet) {
                      const start = Math.max(0, idx - 30);
                      const end = Math.min(text.length, idx + needle.length + 60);
                      snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
                      snippet = snippet.replace(/\s+/g, ' ');
                    }
                  }
                } catch {}
              }
              if (matchCount > 0) {
                matches.push({
                  conversationId: file.replace('.jsonl', ''),
                  projectPath: cwd,
                  snippet,
                  matchCount,
                });
              }
            } catch {}
          }
        } catch {}
      }
    } catch (e: any) {
      return { ok: false, error: e.message };
    }

    return { ok: true, matches: matches.sort((a, b) => b.matchCount - a.matchCount).slice(0, MAX_RESULTS) };
  });

  // --- Usage history per project (parses JSONLs and aggregates by day) ---
  ipcMain.handle('usage-history', async (_event, projectPath: string, days = 30) => {
    // Clamp days to a sane range to prevent DoS via huge windows
    days = Math.max(1, Math.min(typeof days === 'number' ? days : 30, 365));
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    if (!fs.existsSync(projectsDir)) return { ok: false, error: 'no projects dir' };

    // Find the encoded directory matching projectPath by reading the cwd of the
    // first event of each jsonl (most reliable across encoding variants).
    let projectDir: string | null = null;
    try {
      for (const entry of fs.readdirSync(projectsDir)) {
        const fullEntry = path.join(projectsDir, entry);
        try {
          if (!fs.statSync(fullEntry).isDirectory()) continue;
          const files = fs.readdirSync(fullEntry).filter(f => f.endsWith('.jsonl'));
          if (files.length === 0) continue;
          const head = fs.readFileSync(path.join(fullEntry, files[0]), 'utf-8').split('\n').slice(0, 5);
          for (const line of head) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line);
              if (ev.cwd === projectPath) { projectDir = fullEntry; break; }
            } catch {}
          }
          if (projectDir) break;
        } catch {}
      }
    } catch {}

    if (!projectDir) return { ok: false, error: 'project not found' };

    // Pricing per million tokens (USD), aligned with Anthropic public pricing
    const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreate: number }> = {
      opus:   { input: 15,   output: 75,   cacheRead: 1.5,  cacheCreate: 18.75 },
      sonnet: { input: 3,    output: 15,   cacheRead: 0.3,  cacheCreate: 3.75 },
      haiku:  { input: 0.8,  output: 4,    cacheRead: 0.08, cacheCreate: 1.0 },
    };
    const pricingFor = (model: string) => {
      const m = (model || '').toLowerCase();
      if (m.includes('opus')) return PRICING.opus;
      if (m.includes('haiku')) return PRICING.haiku;
      return PRICING.sonnet;
    };

    // Aggregate per day: messages, inputTokens, outputTokens, tools, cost
    const buckets: Record<string, { messages: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number; cost: number; tools: number; sessions: Set<string> }> = {};
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const jsonlFiles = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
      for (const file of jsonlFiles) {
        const filePath = path.join(projectDir, file);
        const sessionId = file.replace('.jsonl', '');
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            let ev: any;
            try { ev = JSON.parse(line); } catch { continue; }
            if (!ev.timestamp) continue;
            const ts = new Date(ev.timestamp).getTime();
            if (isNaN(ts) || ts < cutoff) continue;
            const day = new Date(ts).toISOString().slice(0, 10);
            if (!buckets[day]) buckets[day] = { messages: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, cost: 0, tools: 0, sessions: new Set() };
            const b = buckets[day];
            b.sessions.add(sessionId);
            if (ev.type === 'user' || ev.type === 'assistant') b.messages++;
            if (ev.type === 'assistant') {
              const usage = ev.message?.usage;
              if (usage) {
                const inT = usage.input_tokens || 0;
                const outT = usage.output_tokens || 0;
                const crT = usage.cache_read_input_tokens || 0;
                const ccT = usage.cache_creation_input_tokens || 0;
                b.inputTokens += inT + crT + ccT;
                b.outputTokens += outT;
                b.cacheReadTokens += crT;
                b.cacheCreationTokens += ccT;
                const p = pricingFor(ev.message?.model || '');
                b.cost += (inT * p.input + outT * p.output + crT * p.cacheRead + ccT * p.cacheCreate) / 1_000_000;
              }
              const content = ev.message?.content;
              if (Array.isArray(content)) {
                b.tools += content.filter((c: any) => c?.type === 'tool_use').length;
              }
            }
          }
        } catch {}
      }
    } catch (e: any) {
      return { ok: false, error: e.message };
    }

    const series = Object.entries(buckets)
      .map(([day, b]) => ({
        day,
        messages: b.messages,
        inputTokens: b.inputTokens,
        outputTokens: b.outputTokens,
        totalTokens: b.inputTokens + b.outputTokens,
        cost: Math.round(b.cost * 10000) / 10000,
        tools: b.tools,
        sessions: b.sessions.size,
      }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return { ok: true, series };
  });

  // --- Export session to Markdown ---
  ipcMain.handle('session-export-markdown', async (_event, projectPath: string, conversationId: string) => {
    const jsonlPath = sessionDetector.findJsonlForSession(projectPath, conversationId);
    if (!jsonlPath || !fs.existsSync(jsonlPath)) return { ok: false, error: 'JSONL not found' };

    let lines: string[];
    try {
      lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(l => l.trim().length > 0);
    } catch (e: any) {
      return { ok: false, error: `Read failed: ${e.message}` };
    }

    const md: string[] = [];
    md.push(`# Claude Session — ${conversationId}`);
    md.push('');
    md.push(`**Project:** \`${projectPath}\``);
    md.push(`**Exported:** ${new Date().toISOString()}`);
    md.push('');
    md.push('---');
    md.push('');

    for (const line of lines) {
      let ev: any;
      try { ev = JSON.parse(line); } catch { continue; }
      if (ev.type !== 'user' && ev.type !== 'assistant') continue;
      const content = ev.message?.content;

      if (ev.type === 'user') {
        if (typeof content === 'string') {
          md.push('## 👤 User');
          md.push('');
          md.push(content);
          md.push('');
        } else if (Array.isArray(content)) {
          const textBlocks = content.filter((b: any) => b?.type === 'text').map((b: any) => b.text);
          const toolResults = content.filter((b: any) => b?.type === 'tool_result');
          if (textBlocks.length > 0) {
            md.push('## 👤 User');
            md.push('');
            md.push(textBlocks.join('\n\n'));
            md.push('');
          }
          for (const tr of toolResults) {
            const result = typeof tr.content === 'string' ? tr.content
              : Array.isArray(tr.content) ? tr.content.map((c: any) => c?.text || '').join('\n')
              : JSON.stringify(tr.content);
            md.push(`> _Tool result_${tr.is_error ? ' (error)' : ''}`);
            md.push('> ```');
            md.push(result.split('\n').map((l: string) => '> ' + l).join('\n'));
            md.push('> ```');
            md.push('');
          }
        }
      } else if (ev.type === 'assistant') {
        if (Array.isArray(content)) {
          md.push('## 🤖 Claude');
          md.push('');
          for (const block of content) {
            if (block?.type === 'text' && block.text) {
              md.push(block.text);
              md.push('');
            } else if (block?.type === 'tool_use') {
              const args = block.input ? JSON.stringify(block.input, null, 2) : '';
              md.push(`**🔧 ${block.name}**`);
              md.push('```json');
              md.push(args);
              md.push('```');
              md.push('');
            }
          }
        }
      }
    }

    return { ok: true, markdown: md.join('\n') };
  });

  // --- Prompt snippets ---
  const snippetsFile = path.join(os.homedir(), '.claude-session-manager', 'prompts.json');
  ipcMain.handle('snippets-load', async () => {
    try {
      if (!fs.existsSync(snippetsFile)) return [];
      return JSON.parse(fs.readFileSync(snippetsFile, 'utf-8'));
    } catch { return []; }
  });
  ipcMain.handle('snippets-save', async (_event, snippets: any[]) => {
    try {
      const dir = path.dirname(snippetsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(snippetsFile, JSON.stringify(snippets, null, 2), 'utf-8');
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // --- File save dialog (used by export Markdown) ---
  ipcMain.handle('dialog-save-file', async (_event, defaultName: string, content: string) => {
    if (!mainWindow) return { ok: false };
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false };
    try {
      fs.writeFileSync(result.filePath, content, 'utf-8');
      return { ok: true, path: result.filePath };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  // --- Notes (file-backed, per project path) ---
  const notesDir = path.join(os.homedir(), '.claude-session-manager', 'notes');
  try { if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true }); } catch {}
  const notesFileFor = (projectPath: string) => {
    const safe = projectPath.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(notesDir, `${safe}.md`);
  };
  ipcMain.handle('notes-load', async (_event, projectPath: string) => {
    try {
      const file = notesFileFor(projectPath);
      if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8');
    } catch (e: any) {
      logger.add('warn', 'notes', `load failed: ${e.message}`);
    }
    return '';
  });
  ipcMain.handle('notes-save', async (_event, projectPath: string, content: string) => {
    try {
      fs.writeFileSync(notesFileFor(projectPath), content, 'utf-8');
    } catch (e: any) {
      logger.add('error', 'notes', `save failed: ${e.message}`);
    }
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

function setupAutoUpdater() {
  if (!app.isPackaged) {
    logger.add('info', 'updater', 'Skipped: app not packaged (dev mode)');
    return;
  }

  const autoUpdateEnabled = settingsStore.get().autoUpdate !== false;

  autoUpdater.autoDownload = autoUpdateEnabled;
  autoUpdater.autoInstallOnAppQuit = autoUpdateEnabled;

  autoUpdater.on('checking-for-update', () => {
    logger.add('debug', 'updater', 'Checking for update...');
  });
  autoUpdater.on('update-available', (info) => {
    logger.add('info', 'updater', `Update available: v${info.version}`);
    mainWindow?.webContents.send('update-available', { version: info.version });
  });
  autoUpdater.on('update-not-available', () => {
    logger.add('debug', 'updater', 'No update available');
  });
  autoUpdater.on('download-progress', (progress) => {
    logger.add('debug', 'updater', `Downloading: ${progress.percent.toFixed(1)}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    logger.add('info', 'updater', `Update downloaded: v${info.version}`);
    mainWindow?.webContents.send('update-downloaded', { version: info.version });
  });
  autoUpdater.on('error', (e) => {
    logger.add('error', 'updater', e.message);
  });

  if (!autoUpdateEnabled) {
    logger.add('info', 'updater', 'Auto-update disabled by user setting');
    return;
  }

  autoUpdater.checkForUpdates().catch((e) => {
    logger.add('warn', 'updater', `Initial check failed: ${e.message}`);
  });
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 60 * 60 * 1000); // hourly
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
    (() => {
      const shortcuts = settingsStore.get().shortcuts || [];
      const acc = (id: string, fallback: string) =>
        shortcuts.find(s => s.id === id)?.accelerator || fallback;
      const send = (action: string) => () => mainWindow?.webContents.send('shortcut', action);
      return {
        label: 'Sessions',
        submenu: [
          { label: 'Session 1', accelerator: acc('session-1', 'Cmd+1'), click: send('session-1') },
          { label: 'Session 2', accelerator: acc('session-2', 'Cmd+2'), click: send('session-2') },
          { label: 'Session 3', accelerator: acc('session-3', 'Cmd+3'), click: send('session-3') },
          { label: 'Session 4', accelerator: acc('session-4', 'Cmd+4'), click: send('session-4') },
          { label: 'Session 5', accelerator: acc('session-5', 'Cmd+5'), click: send('session-5') },
          { type: 'separator' },
          { label: 'New Terminal', accelerator: acc('new-shell', 'Cmd+T'), click: send('new-shell') },
          { label: 'New Claude', accelerator: acc('new-claude', 'Cmd+Shift+T'), click: send('new-claude') },
          { label: 'Close Tab', accelerator: acc('close-tab', 'Cmd+W'), click: send('close-tab') },
          { type: 'separator' },
          { label: 'Split View', accelerator: acc('split-view', 'Cmd+\\'), click: send('split-view') },
        ],
      } as Electron.MenuItemConstructorOptions;
    })(),
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
  setupAutoUpdater();
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
