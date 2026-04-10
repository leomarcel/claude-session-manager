import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

interface SessionIndexEntry {
  sessionId: string;
  created: string;
  modified: string;
  summary?: string;
  firstPrompt?: string;
  messageCount?: number;
  gitBranch?: string;
  projectPath?: string;
  isSidechain?: boolean;
}

export class SessionDetector {
  private claudeConfigDir: string;

  constructor() {
    this.claudeConfigDir = path.join(os.homedir(), '.claude');
  }

  async detectSessions(): Promise<ClaudeSession[]> {
    // 1. Read active PIDs from ~/.claude/sessions/*.json (fast, no subprocess)
    const activeSessions = this.getActivePidSessions();

    // 2. Read stored project sessions from ~/.claude/projects/
    const storedSessions = this.detectFromStorage();

    // 3. Merge: enrich stored sessions with active PID info
    const merged = new Map<string, ClaudeSession>();

    for (const session of storedSessions) {
      merged.set(session.projectPath, session);
    }

    for (const session of activeSessions) {
      const existing = merged.get(session.projectPath);
      if (existing) {
        // Active process enriches stored session
        existing.pid = session.pid;
        existing.status = 'active';
        if (session.conversationId) existing.conversationId = session.conversationId;
      } else {
        merged.set(session.projectPath, session);
      }
    }

    return Array.from(merged.values());
  }

  private getActivePidSessions(): ClaudeSession[] {
    const sessions: ClaudeSession[] = [];
    const sessionsDir = path.join(this.claudeConfigDir, 'sessions');

    if (!fs.existsSync(sessionsDir)) return sessions;

    try {
      const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
      const now = Date.now();

      for (const file of files) {
        try {
          const filePath = path.join(sessionsDir, file);
          const stat = fs.statSync(filePath);

          // Skip files older than 24h
          if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) continue;

          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          const pid = parseInt(file.replace('.json', ''), 10);

          // Check if process is still running
          if (!this.isProcessAlive(pid)) continue;

          const cwd = content.cwd || '';
          if (!cwd) continue;

          sessions.push({
            pid,
            projectPath: cwd,
            projectName: path.basename(cwd),
            model: 'Claude Opus 4',
            status: 'active',
            startTime: content.startedAt ? new Date(content.startedAt).toISOString() : stat.mtime.toISOString(),
            command: `claude (pid ${pid})`,
            conversationId: content.sessionId
          });
        } catch {}
      }
    } catch {}

    return sessions;
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0); // Signal 0 = just check if alive
      return true;
    } catch {
      return false;
    }
  }

  private detectFromStorage(): ClaudeSession[] {
    const sessions: ClaudeSession[] = [];
    const projectsDir = path.join(this.claudeConfigDir, 'projects');

    if (!fs.existsSync(projectsDir)) return sessions;

    try {
      const entries = fs.readdirSync(projectsDir);

      for (const entry of entries) {
        const fullPath = path.join(projectsDir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isDirectory()) continue;

          // Skip old projects (no activity in 7 days)
          if (Date.now() - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000) continue;

          // Decode project path from directory name
          // Format: -Users-leomarcel--DEV-project  =>  /Users/leomarcel/_DEV/project
          const projectPath = this.decodeProjectPath(entry);
          if (!projectPath || !fs.existsSync(projectPath)) continue;

          // Try to read sessions-index.json for conversation info
          const sessionInfo = this.getLatestSession(fullPath);

          sessions.push({
            pid: 0,
            projectPath,
            projectName: path.basename(projectPath),
            model: sessionInfo?.model || 'Claude Sonnet 4',
            status: 'idle',
            startTime: sessionInfo?.modified || stat.mtime.toISOString(),
            command: 'claude (stored)',
            conversationId: sessionInfo?.sessionId,
            summary: sessionInfo?.summary,
            firstPrompt: sessionInfo?.firstPrompt,
            messageCount: sessionInfo?.messageCount,
            gitBranch: sessionInfo?.gitBranch
          });
        } catch {}
      }
    } catch {}

    // Sort by most recent first
    sessions.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    return sessions;
  }

  private decodeProjectPath(dirName: string): string | null {
    // The encoding replaces / with - and adds a leading -
    // But underscores and other chars can also appear, so we need to be careful
    // Format: -Users-leomarcel--DEV-project
    // The leading - represents the root /
    // Double -- represents a literal - in the path... but wait, _ is represented differently

    // Actually looking at the data: /Users/leomarcel/_DEV/claude-agent => -Users-leomarcel--DEV-claude-agent
    // So / becomes - and _ also becomes -? No, let's check:
    // The directory name encoding simply replaces each / with -
    // /private/var/versions/vpdive4 => -private-var-versions-vpdive4

    // The issue is ambiguity. Best approach: check if the literal decoded path exists
    // Try direct decode first (replace leading - with / and remaining - with /)
    if (!dirName.startsWith('-')) return null;

    // Try to find the actual path by checking ~/.claude/projects/<dir>/*.jsonl files
    // which contain the real cwd
    const projectDir = path.join(this.claudeConfigDir, 'projects', dirName);

    // Read any .jsonl file to extract the real path
    try {
      const files = fs.readdirSync(projectDir);
      const jsonlFile = files.find(f => f.endsWith('.jsonl'));
      if (jsonlFile) {
        const firstLine = fs.readFileSync(path.join(projectDir, jsonlFile), 'utf-8').split('\n')[0];
        if (firstLine) {
          const data = JSON.parse(firstLine);
          if (data.cwd && fs.existsSync(data.cwd)) {
            return data.cwd;
          }
        }
      }
    } catch {}

    // Fallback: try simple decode
    const decoded = dirName.replace(/^-/, '/').replace(/-/g, '/');
    if (fs.existsSync(decoded)) return decoded;

    return null;
  }

  private getLatestSession(projectDir: string): {
    sessionId: string;
    modified: string;
    summary?: string;
    firstPrompt?: string;
    messageCount?: number;
    gitBranch?: string;
    model?: string;
  } | null {
    // Find the most recent .jsonl file
    let latestFile: { name: string; mtime: number } | null = null;
    try {
      const files = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(projectDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (files.length > 0) latestFile = files[0];
    } catch {}

    if (!latestFile) return null;

    const sessionId = latestFile.name.replace('.jsonl', '');
    let model: string | undefined;
    let firstPrompt: string | undefined;
    let summary: string | undefined;
    let messageCount: number | undefined;
    let gitBranch: string | undefined;

    // Try sessions-index.json for summary/messageCount
    const indexPath = path.join(projectDir, 'sessions-index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const index: SessionIndexEntry[] = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        if (Array.isArray(index)) {
          const entry = index.find(e => e.sessionId === sessionId)
            || index.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())[0];
          if (entry) {
            summary = entry.summary;
            firstPrompt = entry.firstPrompt;
            messageCount = entry.messageCount;
            gitBranch = entry.gitBranch;
          }
        }
      } catch {}
    }

    // Read JSONL to extract firstPrompt (if not in index) and model
    try {
      const filePath = path.join(projectDir, latestFile.name);
      const fd = fs.openSync(filePath, 'r');
      // Read first 8KB to find the first user message (fast, avoids reading huge files)
      const buf = Buffer.alloc(8192);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const chunk = buf.toString('utf-8', 0, bytesRead);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          // Extract first user prompt
          if (!firstPrompt && entry.type === 'user' && entry.message?.content) {
            const content = entry.message.content;
            if (typeof content === 'string') {
              firstPrompt = content.length > 120 ? content.slice(0, 120) + '...' : content;
            } else if (Array.isArray(content)) {
              const textBlock = content.find((b: any) => b.type === 'text');
              if (textBlock?.text) {
                firstPrompt = textBlock.text.length > 120 ? textBlock.text.slice(0, 120) + '...' : textBlock.text;
              }
            }
          }
          // Extract model from assistant messages
          if (!model && entry.model) {
            if (entry.model.includes('opus')) model = 'Claude Opus 4';
            else if (entry.model.includes('haiku')) model = 'Claude Haiku 4';
            else model = 'Claude Sonnet 4';
          }
          if (firstPrompt && model) break;
        } catch {}
      }
    } catch {}

    return {
      sessionId,
      modified: new Date(latestFile.mtime).toISOString(),
      summary,
      firstPrompt,
      messageCount,
      gitBranch,
      model
    };
  }
}
