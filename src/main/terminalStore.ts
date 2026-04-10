import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SavedTerminalTab {
  id: string;
  projectPath: string;
  label: string;
  command: string;         // The startup command to re-execute on restore
  type: 'claude' | 'shell'; // claude = claude --resume, shell = custom command
  resumeSessionId?: string;
}

export interface SavedTerminalState {
  tabs: SavedTerminalTab[];
  activeTabId: string | null;
}

export class TerminalStore {
  private filePath: string;

  constructor() {
    const configDir = path.join(os.homedir(), '.claude-session-manager');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.filePath = path.join(configDir, 'terminals.json');
  }

  load(): SavedTerminalState {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        if (data && Array.isArray(data.tabs)) {
          return data;
        }
      }
    } catch {}
    return { tabs: [], activeTabId: null };
  }

  save(state: SavedTerminalState): void {
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  clear(): void {
    this.save({ tabs: [], activeTabId: null });
  }
}
