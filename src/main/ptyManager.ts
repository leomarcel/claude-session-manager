import * as os from 'os';
import * as fs from 'fs';

let pty: any;
try {
  pty = require('node-pty');
} catch (e) {
  console.warn('node-pty not available, terminal features disabled:', e);
}

interface PtyInstance {
  process: any;
  projectPath: string;
  dataDisposable: { dispose: () => void } | null;
}

export class PtyManager {
  private instances: Map<string, PtyInstance> = new Map();
  private counter = 0;

  create(projectPath: string, resumeSessionId?: string): string {
    const id = `pty-${++this.counter}`;

    if (!pty) {
      throw new Error('node-pty is not available');
    }

    // Use absolute path to shell binary
    const shell = '/bin/zsh';

    // Ensure cwd exists, fallback to home directory
    let cwd = projectPath;
    if (!fs.existsSync(cwd)) {
      cwd = os.homedir();
    }

    // Build a clean PATH that includes common locations
    const homedir = os.homedir();
    const existingPath = process.env.PATH || '';
    const extraPaths = [
      `${homedir}/.local/bin`,
      `${homedir}/.cargo/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin'
    ];
    const fullPath = [...new Set([...existingPath.split(':'), ...extraPaths])].join(':');

    // Build safe claude command using positional args to avoid injection
    let shellArgs: string[];
    if (resumeSessionId) {
      // Use "$1" to safely pass the session ID without shell interpolation
      shellArgs = ['-l', '-c', 'exec claude --resume "$1"', '--', resumeSessionId];
    } else {
      shellArgs = ['-l', '-c', 'exec claude --continue'];
    }

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        PATH: fullPath,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        HOME: homedir,
        SHELL: shell,
        LANG: process.env.LANG || 'en_US.UTF-8'
      }
    });

    this.instances.set(id, {
      process: ptyProcess,
      projectPath: cwd,
      dataDisposable: null
    });

    return id;
  }

  /** Spawn a plain interactive shell (no claude auto-launch) */
  createShell(projectPath: string): string {
    const id = `pty-${++this.counter}`;

    if (!pty) {
      throw new Error('node-pty is not available');
    }

    const shell = '/bin/zsh';
    let cwd = projectPath;
    if (!fs.existsSync(cwd)) {
      cwd = os.homedir();
    }

    const homedir = os.homedir();
    const existingPath = process.env.PATH || '';
    const extraPaths = [
      `${homedir}/.local/bin`,
      `${homedir}/.cargo/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin'
    ];
    const fullPath = [...new Set([...existingPath.split(':'), ...extraPaths])].join(':');

    const ptyProcess = pty.spawn(shell, ['--login'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: {
        ...process.env,
        PATH: fullPath,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        HOME: homedir,
        SHELL: shell,
        LANG: process.env.LANG || 'en_US.UTF-8'
      }
    });

    this.instances.set(id, {
      process: ptyProcess,
      projectPath: cwd,
      dataDisposable: null
    });

    return id;
  }

  onData(id: string, callback: (data: string) => void) {
    const instance = this.instances.get(id);
    if (instance?.process) {
      instance.dataDisposable = instance.process.onData(callback);
    }
  }

  write(id: string, data: string) {
    const instance = this.instances.get(id);
    if (instance?.process) {
      instance.process.write(data);
    }
  }

  resize(id: string, cols: number, rows: number) {
    const instance = this.instances.get(id);
    if (instance?.process) {
      instance.process.resize(cols, rows);
    }
  }

  destroy(id: string) {
    const instance = this.instances.get(id);
    if (instance) {
      instance.dataDisposable?.dispose();
      instance.process?.kill();
      this.instances.delete(id);
    }
  }

  destroyAll() {
    for (const [id] of this.instances) {
      this.destroy(id);
    }
  }
}
