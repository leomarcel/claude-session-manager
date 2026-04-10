export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

const MAX_ENTRIES = 500;

class Logger {
  private entries: LogEntry[] = [];
  private originalConsole = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  init() {
    // Intercept console methods
    console.log = (...args: any[]) => {
      this.add('info', 'main', args.map(String).join(' '));
      this.originalConsole.log(...args);
    };
    console.warn = (...args: any[]) => {
      this.add('warn', 'main', args.map(String).join(' '));
      this.originalConsole.warn(...args);
    };
    console.error = (...args: any[]) => {
      this.add('error', 'main', args.map(String).join(' '));
      this.originalConsole.error(...args);
    };
    console.debug = (...args: any[]) => {
      this.add('debug', 'main', args.map(String).join(' '));
      this.originalConsole.debug(...args);
    };

    // Catch unhandled errors
    process.on('uncaughtException', (err) => {
      this.add('error', 'process', `Uncaught: ${err.message}\n${err.stack || ''}`);
    });
    process.on('unhandledRejection', (reason) => {
      this.add('error', 'process', `Unhandled rejection: ${String(reason)}`);
    });

    this.add('info', 'app', 'Logger initialized');
  }

  add(level: LogLevel, source: string, message: string) {
    this.entries.push({
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
    });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
  }

  getAll(): LogEntry[] {
    return [...this.entries];
  }

  clear() {
    this.entries = [];
    this.add('info', 'app', 'Logs cleared');
  }
}

export const logger = new Logger();
