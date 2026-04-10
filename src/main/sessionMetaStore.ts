import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionMeta {
  customName?: string;
  archived?: boolean;
  archivedAt?: string;
}

/** Persists custom session names and archive status keyed by projectPath */
export class SessionMetaStore {
  private filePath: string;
  private data: Record<string, SessionMeta>;

  constructor() {
    const configDir = path.join(os.homedir(), '.claude-session-manager');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.filePath = path.join(configDir, 'session-meta.json');
    this.data = this.load();
  }

  private load(): Record<string, SessionMeta> {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      }
    } catch {}
    return {};
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  getAll(): Record<string, SessionMeta> {
    return { ...this.data };
  }

  get(projectPath: string): SessionMeta {
    return this.data[projectPath] || {};
  }

  rename(projectPath: string, name: string): void {
    if (!this.data[projectPath]) this.data[projectPath] = {};
    this.data[projectPath].customName = name || undefined;
    this.persist();
  }

  archive(projectPath: string): void {
    if (!this.data[projectPath]) this.data[projectPath] = {};
    this.data[projectPath].archived = true;
    this.data[projectPath].archivedAt = new Date().toISOString();
    this.persist();
  }

  unarchive(projectPath: string): void {
    if (this.data[projectPath]) {
      this.data[projectPath].archived = false;
      delete this.data[projectPath].archivedAt;
      this.persist();
    }
  }

  delete(projectPath: string): void {
    delete this.data[projectPath];
    this.persist();
  }
}
