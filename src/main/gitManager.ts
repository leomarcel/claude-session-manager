import { execFileSync } from 'child_process';

export interface ModifiedFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
}

export class GitManager {
  static isGitRepo(projectPath: string): boolean {
    try {
      execFileSync('git', ['rev-parse', '--git-dir'], {
        cwd: projectPath, encoding: 'utf-8', timeout: 3000
      });
      return true;
    } catch {
      return false;
    }
  }

  static getModifiedFiles(projectPath: string): ModifiedFile[] {
    if (!this.isGitRepo(projectPath)) return [];
    const files: ModifiedFile[] = [];
    try {
      const output = execFileSync('git', ['status', '--porcelain'], {
        cwd: projectPath, encoding: 'utf-8', timeout: 5000
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
    if (!this.isGitRepo(projectPath)) return '';
    try {
      return execFileSync('git', ['branch', '--show-current'], {
        cwd: projectPath, encoding: 'utf-8', timeout: 3000
      }).trim();
    } catch {
      return '';
    }
  }

  static getWorktrees(projectPath: string): WorktreeInfo[] {
    if (!this.isGitRepo(projectPath)) return [];
    try {
      const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: projectPath, encoding: 'utf-8', timeout: 5000
      }).trim();
      if (!output) return [];
      const worktrees: WorktreeInfo[] = [];
      let current: Partial<WorktreeInfo> = {};
      for (const line of output.split('\n')) {
        if (line.startsWith('worktree ')) {
          if (current.path) worktrees.push(current as WorktreeInfo);
          current = { path: line.slice(9), branch: '', head: '', bare: false };
        } else if (line.startsWith('HEAD ')) {
          current.head = line.slice(5);
        } else if (line.startsWith('branch ')) {
          current.branch = line.slice(7).replace('refs/heads/', '');
        } else if (line === 'bare') {
          current.bare = true;
        } else if (line === '' && current.path) {
          worktrees.push(current as WorktreeInfo);
          current = {};
        }
      }
      if (current.path) worktrees.push(current as WorktreeInfo);
      return worktrees;
    } catch {
      return [];
    }
  }

  static getRemoteUrl(projectPath: string): string {
    if (!this.isGitRepo(projectPath)) return '';
    try {
      return execFileSync('git', ['remote', 'get-url', 'origin'], {
        cwd: projectPath, encoding: 'utf-8', timeout: 3000
      }).trim();
    } catch {
      return '';
    }
  }

  static getBranches(projectPath: string): { name: string; current: boolean }[] {
    if (!this.isGitRepo(projectPath)) return [];
    try {
      const output = execFileSync('git', ['branch', '--no-color'], {
        cwd: projectPath, encoding: 'utf-8', timeout: 5000
      }).trim();
      if (!output) return [];
      return output.split('\n').map(line => ({
        name: line.replace(/^\*?\s+/, '').trim(),
        current: line.startsWith('*'),
      }));
    } catch {
      return [];
    }
  }

  static switchBranch(projectPath: string, branch: string): { success: boolean; error?: string } {
    if (!this.isGitRepo(projectPath)) return { success: false, error: 'Not a git repo' };
    try {
      execFileSync('git', ['switch', branch], {
        cwd: projectPath, encoding: 'utf-8', timeout: 10000
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.stderr || e.message || String(e) };
    }
  }

  static createWorktreeForBranch(projectPath: string, branch: string, worktreePath: string): { success: boolean; error?: string } {
    if (!this.isGitRepo(projectPath)) return { success: false, error: 'Not a git repo' };
    try {
      execFileSync('git', ['worktree', 'add', worktreePath, branch], {
        cwd: projectPath, encoding: 'utf-8', timeout: 10000
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.stderr || e.message || String(e) };
    }
  }

  static getStagedFiles(projectPath: string): string[] {
    if (!this.isGitRepo(projectPath)) return [];
    try {
      const output = execFileSync('git', ['diff', '--cached', '--name-only'], {
        cwd: projectPath, encoding: 'utf-8', timeout: 5000
      }).trim();
      return output ? output.split('\n') : [];
    } catch {
      return [];
    }
  }
}
