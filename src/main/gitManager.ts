import { execFileSync, execFile } from 'child_process';

export interface ModifiedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
}

export class GitManager {
  static getModifiedFiles(projectPath: string): ModifiedFile[] {
    const files: ModifiedFile[] = [];

    try {
      const output = execFileSync('git', ['status', '--porcelain'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5000
      }).trim();

      if (!output) return files;

      for (const line of output.split('\n')) {
        if (!line.trim()) continue;

        const indexStatus = line[0];
        const workStatus = line[1];
        const filePath = line.substring(3).trim();

        const staged = indexStatus !== ' ' && indexStatus !== '?';
        let status: ModifiedFile['status'] = 'modified';

        const relevantStatus = staged ? indexStatus : workStatus;
        switch (relevantStatus) {
          case 'A': status = 'added'; break;
          case 'D': status = 'deleted'; break;
          case 'R': status = 'renamed'; break;
          case '?': status = 'untracked'; break;
          case 'M': status = 'modified'; break;
          default: status = 'modified';
        }

        files.push({ path: filePath, status, staged });
      }
    } catch {}

    return files;
  }

  static getCurrentBranch(projectPath: string): string {
    try {
      return execFileSync('git', ['branch', '--show-current'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 3000
      }).trim();
    } catch {
      return 'N/A';
    }
  }

  private static escapeAppleScript(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "'\\''").replace(/"/g, '\\"');
  }

  static openCommitInTerminal(projectPath: string): Promise<void> {
    const safe = this.escapeAppleScript(projectPath);
    return new Promise((resolve) => {
      execFile('osascript', [
        '-e', `tell application "Terminal" to do script "cd '${safe}' && git add -p && git commit"`
      ], () => resolve());
    });
  }

  static createPR(projectPath: string): Promise<void> {
    const safe = this.escapeAppleScript(projectPath);
    return new Promise((resolve) => {
      execFile('osascript', [
        '-e', `tell application "Terminal" to do script "cd '${safe}' && gh pr create --web"`
      ], () => resolve());
    });
  }

  static createWorktree(projectPath: string): Promise<void> {
    const safe = this.escapeAppleScript(projectPath);
    return new Promise((resolve) => {
      execFile('osascript', [
        '-e', `tell application "Terminal" to do script "cd '${safe}' && git worktree list"`
      ], () => resolve());
    });
  }
}
