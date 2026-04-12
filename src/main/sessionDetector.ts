import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  jsonlPath?: string;
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

interface JsonlAnalysis {
  lastEvent?: any;
  lastAssistantText?: string;
  pendingTool?: { id: string; name: string; input: any };
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

    // 3. Merge: enrich stored sessions with active PID info by conversationId
    const allSessions = [...storedSessions];

    for (const active of activeSessions) {
      const existing = allSessions.find(s =>
        s.conversationId && active.conversationId && s.conversationId === active.conversationId
      );
      if (existing) {
        existing.pid = active.pid;
        existing.status = 'active';
      } else {
        // Active session with no stored match — try to locate its jsonl
        active.jsonlPath = this.findJsonlForSession(active.projectPath, active.conversationId);
        allSessions.push(active);
      }
    }

    // 4. Infer live status from jsonl tail + mtime + process liveness
    for (const s of allSessions) {
      const state = this.inferLiveStatus(s.jsonlPath, s.pid > 0);
      s.liveStatus = state.status;
      s.liveDetail = state.detail;
    }

    // 5. Strip the internal jsonlPath before returning (not needed by renderer)
    for (const s of allSessions) {
      delete s.jsonlPath;
    }

    return allSessions;
  }

  private findJsonlForSession(projectPath: string, conversationId?: string): string | undefined {
    if (!conversationId) return undefined;
    const projectsDir = path.join(this.claudeConfigDir, 'projects');
    if (!fs.existsSync(projectsDir)) return undefined;
    try {
      const entries = fs.readdirSync(projectsDir);
      for (const entry of entries) {
        const decoded = this.decodeProjectPath(entry);
        if (decoded !== projectPath) continue;
        const jsonlPath = path.join(projectsDir, entry, `${conversationId}.jsonl`);
        if (fs.existsSync(jsonlPath)) return jsonlPath;
      }
    } catch {}
    return undefined;
  }

  private analyzeJsonlTail(filePath: string): JsonlAnalysis {
    const result: JsonlAnalysis = {};
    try {
      const stat = fs.statSync(filePath);
      const size = stat.size;
      if (size === 0) return result;

      const blockSize = Math.min(size, 32768); // 32 KB tail
      const start = size - blockSize;
      const fd = fs.openSync(filePath, 'r');
      let chunk: string;
      try {
        const buf = Buffer.alloc(blockSize);
        fs.readSync(fd, buf, 0, blockSize, start);
        chunk = buf.toString('utf-8');
      } finally {
        fs.closeSync(fd);
      }

      const rawLines = chunk.split('\n');
      // Drop the first line if we read mid-line
      if (start > 0 && rawLines.length > 0) rawLines.shift();
      const lines = rawLines.filter(l => l.trim().length > 0);

      const events: any[] = [];
      for (const line of lines) {
        try { events.push(JSON.parse(line)); } catch {}
      }

      if (events.length === 0) return result;

      // Pass 1: walk ascending, track tool_use <-> tool_result pairs
      const toolUses = new Map<string, { name: string; input: any; resolved: boolean; eventIdx: number }>();
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.type === 'assistant') {
          const content = ev.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === 'tool_use' && block.id) {
                toolUses.set(block.id, { name: block.name, input: block.input, resolved: false, eventIdx: i });
              }
            }
          }
        } else if (ev.type === 'user') {
          const content = ev.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block?.type === 'tool_result' && block.tool_use_id) {
                const existing = toolUses.get(block.tool_use_id);
                if (existing) existing.resolved = true;
              }
            }
          }
        }
      }

      // Pass 2: find the latest unresolved tool_use (by event order)
      let latestPending: { id: string; name: string; input: any; eventIdx: number } | null = null;
      for (const [id, info] of toolUses) {
        if (info.resolved) continue;
        if (!latestPending || info.eventIdx > latestPending.eventIdx) {
          latestPending = { id, name: info.name, input: info.input, eventIdx: info.eventIdx };
        }
      }
      if (latestPending) {
        result.pendingTool = { id: latestPending.id, name: latestPending.name, input: latestPending.input };
      }

      // Find last assistant text block (for question detection + detail)
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev.type !== 'assistant') continue;
        const content = ev.message?.content;
        if (typeof content === 'string') {
          result.lastAssistantText = content;
          break;
        }
        if (Array.isArray(content)) {
          // Walk blocks backward, take last text block
          for (let j = content.length - 1; j >= 0; j--) {
            const block = content[j];
            if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
              result.lastAssistantText = block.text;
              break;
            }
          }
          if (result.lastAssistantText) break;
        }
      }

      // Find last meaningful event (user or assistant)
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev.type === 'user' || ev.type === 'assistant') {
          result.lastEvent = ev;
          break;
        }
      }
    } catch {}

    return result;
  }

  private formatToolDetail(name: string, input: any): string {
    if (!name) return '';
    if (typeof input !== 'object' || input === null) return name;

    const basename = (p: string): string => {
      if (typeof p !== 'string' || !p) return '';
      return p.split('/').pop() || p;
    };
    const truncate = (s: string, n: number): string => {
      if (typeof s !== 'string') return '';
      return s.length <= n ? s : s.slice(0, n - 1) + '…';
    };

    switch (name) {
      case 'Read':
      case 'Write':
      case 'Edit':
      case 'NotebookEdit':
        if (input.file_path) return `${name}(${basename(input.file_path)})`;
        return name;
      case 'Bash': {
        const cmd = typeof input.command === 'string' ? input.command.trim().split(/\s+/)[0] : '';
        return cmd ? `Bash(${cmd})` : 'Bash';
      }
      case 'Glob':
        if (input.pattern) return `Glob(${truncate(String(input.pattern), 24)})`;
        return name;
      case 'Grep':
        if (input.pattern) return `Grep(${truncate(String(input.pattern), 20)})`;
        return name;
      case 'Task':
        if (input.description) return `Task(${truncate(String(input.description), 25)})`;
        return name;
      case 'WebFetch':
        if (input.url) {
          try {
            const host = new URL(String(input.url)).hostname;
            return `WebFetch(${host})`;
          } catch {}
        }
        return name;
      default:
        // MCP tools contain double underscores
        return name;
    }
  }

  private inferLiveStatus(jsonlPath: string | undefined, pidAlive: boolean): { status: LiveStatus; detail?: string } {
    if (!jsonlPath || !fs.existsSync(jsonlPath)) return { status: 'disconnected' };

    let ageMs = Infinity;
    try {
      ageMs = Date.now() - fs.statSync(jsonlPath).mtimeMs;
    } catch {}

    const analysis = this.analyzeJsonlTail(jsonlPath);
    const { lastEvent, lastAssistantText, pendingTool } = analysis;

    // --- Process dead ---
    if (!pidAlive) {
      if (pendingTool) {
        return { status: 'crashed', detail: this.formatToolDetail(pendingTool.name, pendingTool.input) };
      }
      if (!lastEvent) return { status: 'completed' };
      if (lastEvent.type === 'assistant') return { status: 'completed' };
      if (lastEvent.type === 'user') return { status: 'crashed' };
      return { status: 'completed' };
    }

    // --- Process alive ---
    if (pendingTool) {
      return { status: 'tool_executing', detail: this.formatToolDetail(pendingTool.name, pendingTool.input) };
    }

    // Fresh write = actively streaming
    if (ageMs < 5000) return { status: 'running' };

    if (lastEvent?.type === 'assistant') {
      // Last message from assistant with no pending tool = Claude finished, user's turn
      let detail: string | undefined;
      if (lastAssistantText) {
        const trimmed = lastAssistantText.trim();
        const endsWithQuestion = /[?？]["')\]\s]*$/.test(trimmed);
        if (endsWithQuestion) {
          // Extract last sentence
          const sentences = trimmed.split(/(?<=[.!?])\s+/);
          const lastSentence = sentences[sentences.length - 1] || trimmed;
          detail = lastSentence.length > 80 ? lastSentence.slice(0, 79) + '…' : lastSentence;
        }
      }
      return { status: 'waiting_input', detail };
    }

    if (lastEvent?.type === 'user') {
      // User just sent, Claude about to respond
      return { status: 'running' };
    }

    if (ageMs > 5 * 60 * 1000) return { status: 'idle' };
    return { status: 'running' };
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
          if (!projectPath) continue;
          // Skip paths outside home to avoid macOS permission prompts
          const homedir = os.homedir();
          if (!projectPath.startsWith(homedir) && !projectPath.startsWith('/private/var')) continue;
          try { if (!fs.existsSync(projectPath)) continue; } catch { continue; }

          // Get all recent sessions for this project
          const allSessionInfos = this.getAllRecentSessions(fullPath);

          // Detect if project is a worktree
          let isWorktree = false;
          let worktreeBranch = '';
          try {
            const dotGit = path.join(projectPath, '.git');
            if (fs.existsSync(dotGit) && fs.statSync(dotGit).isFile()) {
              isWorktree = true;
              try {
                const head = execFileSync('git', ['branch', '--show-current'], {
                  cwd: projectPath, encoding: 'utf-8', timeout: 3000
                }).trim();
                worktreeBranch = head;
              } catch {}
            }
          } catch {}

          for (const sessionInfo of allSessionInfos) {
            sessions.push({
              pid: 0,
              projectPath,
              projectName: path.basename(projectPath),
              model: sessionInfo.model || 'Claude Sonnet 4',
              status: 'idle',
              jsonlPath: path.join(fullPath, `${sessionInfo.sessionId}.jsonl`),
              startTime: sessionInfo.modified || stat.mtime.toISOString(),
              command: 'claude (stored)',
              conversationId: sessionInfo.sessionId,
              summary: sessionInfo.summary,
              firstPrompt: sessionInfo.firstPrompt,
              messageCount: sessionInfo.messageCount,
              gitBranch: sessionInfo.gitBranch,
              isWorktree,
              worktreeBranch: worktreeBranch || undefined
            });
          }
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

  private getAllRecentSessions(projectDir: string): {
    sessionId: string; modified: string; summary?: string; firstPrompt?: string;
    messageCount?: number; gitBranch?: string; model?: string;
  }[] {
    const results: ReturnType<typeof this.getAllRecentSessions> = [];
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    try {
      const files = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(projectDir, f)).mtimeMs }))
        .filter(f => Date.now() - f.mtime < maxAge)
        .sort((a, b) => b.mtime - a.mtime);

      // Limit to 20 most recent sessions per project
      for (const file of files.slice(0, 20)) {
        const sessionId = file.name.replace('.jsonl', '');
        const info = this.extractSessionInfo(projectDir, file.name, file.mtime);
        results.push({ sessionId, ...info });
      }
    } catch {}

    // If no sessions found, return a single empty entry so the project still shows
    if (results.length === 0) {
      const latest = this.getLatestSession(projectDir);
      if (latest) results.push(latest);
    }

    return results;
  }

  private extractSessionInfo(projectDir: string, fileName: string, mtime: number): {
    modified: string; summary?: string; firstPrompt?: string;
    messageCount?: number; gitBranch?: string; model?: string;
  } {
    let model: string | undefined;
    let firstPrompt: string | undefined;

    try {
      const filePath = path.join(projectDir, fileName);
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(8192);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      const chunk = buf.toString('utf-8', 0, bytesRead);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (!firstPrompt && entry.type === 'user' && entry.message?.content) {
            const content = entry.message.content;
            if (typeof content === 'string') {
              firstPrompt = content.length > 120 ? content.slice(0, 120) + '...' : content;
            } else if (Array.isArray(content)) {
              const textBlock = content.find((b: any) => b.type === 'text');
              if (textBlock?.text) firstPrompt = textBlock.text.length > 120 ? textBlock.text.slice(0, 120) + '...' : textBlock.text;
            }
          }
          if (!model && entry.model) {
            if (entry.model.includes('opus')) model = 'Claude Opus 4';
            else if (entry.model.includes('haiku')) model = 'Claude Haiku 4';
            else model = 'Claude Sonnet 4';
          }
          if (firstPrompt && model) break;
        } catch {}
      }
    } catch {}

    return { modified: new Date(mtime).toISOString(), firstPrompt, model };
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
            || index.reduce((latest, e) => new Date(e.modified) > new Date(latest.modified) ? e : latest);
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
