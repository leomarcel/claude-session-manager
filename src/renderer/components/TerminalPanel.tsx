import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { ClaudeSession, TerminalTab, TerminalPreset, AppTheme } from '../types';
import { Locale, t } from '../i18n';
import { ClaudeIcon, TerminalIcon } from './Icons';

interface Props {
  session: ClaudeSession | null;
  branch: string;
  locale: Locale;
  isDemo?: boolean;
  terminalPreset: TerminalPreset;
  terminalFontSize: number;
  appTheme: AppTheme;
  terminalBgColor?: string;
  terminalBgOpacity?: number;
  allTabs: TerminalTab[];
  visibleTabs: TerminalTab[];
  activeTabId: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddShellTab: () => void;
  onAddClaudeTab: () => void;
  onOpenBranchModal?: () => void;
  onOpenHistory?: () => void;
  onOpenNotes?: () => void;
  splitView?: boolean;
  onToggleSplit?: () => void;
}

interface TermInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  ptyId: string | null;
  container: HTMLDivElement;
  ready: boolean;
}

export function TerminalPanel({
  session, branch, locale, isDemo, terminalPreset, terminalFontSize, appTheme, terminalBgColor, terminalBgOpacity, allTabs, visibleTabs, activeTabId,
  onActivateTab, onCloseTab, onAddShellTab, onAddClaudeTab, onOpenBranchModal, onOpenHistory, onOpenNotes, splitView, onToggleSplit
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TermInstance>>(new Map());
  const [loadingTabIds, setLoadingTabIds] = useState<Set<string>>(new Set());
  const [tabStatuses, setTabStatuses] = useState<Map<string, 'busy' | 'idle'>>(new Map());
  const busyTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Terminal theme based on preset + app theme
  const getTermTheme = () => {
    if (appTheme === 'light') {
      return {
        background: '#f8f8fc', foreground: '#1a1a2e', cursor: '#6a58d6',
        cursorAccent: '#f8f8fc', selectionBackground: 'rgba(106, 88, 214, 0.2)',
        black: '#1a1a2e', red: '#e5534b', green: '#2cb67d', yellow: '#e6a817',
        blue: '#3b82f6', magenta: '#7c6aef', cyan: '#06b6d4', white: '#555570',
        brightBlack: '#888898', brightRed: '#f87171', brightGreen: '#34d399',
        brightYellow: '#facc15', brightBlue: '#60a5fa', brightMagenta: '#a78bfa',
        brightCyan: '#22d3ee', brightWhite: '#1a1a2e'
      };
    }
    if (terminalPreset === 'iterm2') {
      return {
        background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
        cursorAccent: '#1e1e2e', selectionBackground: 'rgba(245, 224, 220, 0.2)',
        black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
        blue: '#89b4fa', magenta: '#cba6f7', cyan: '#94e2d5', white: '#bac2de',
        brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#cba6f7',
        brightCyan: '#94e2d5', brightWhite: '#a6adc8'
      };
    }
    if (terminalPreset === 'minimal') {
      return {
        background: '#000000', foreground: '#b0b0b0', cursor: '#ffffff',
        cursorAccent: '#000000', selectionBackground: 'rgba(255, 255, 255, 0.15)',
        black: '#000000', red: '#cc6666', green: '#b5bd68', yellow: '#f0c674',
        blue: '#81a2be', magenta: '#b294bb', cyan: '#8abeb7', white: '#c5c8c6',
        brightBlack: '#666666', brightRed: '#d54e53', brightGreen: '#b9ca4a',
        brightYellow: '#e7c547', brightBlue: '#7aa6da', brightMagenta: '#c397d8',
        brightCyan: '#70c0b1', brightWhite: '#eaeaea'
      };
    }
    // Standard (default)
    return {
      background: '#0d0d12', foreground: '#e0e0e5', cursor: '#7c6aef',
      cursorAccent: '#0d0d12', selectionBackground: 'rgba(124, 106, 239, 0.3)',
      black: '#1a1a24', red: '#ff6b7a', green: '#50e3a0', yellow: '#ffd76a',
      blue: '#64b5f6', magenta: '#9580ff', cyan: '#80e8d0', white: '#e0e0e5',
      brightBlack: '#555570', brightRed: '#ff8a95', brightGreen: '#70f0b8',
      brightYellow: '#ffe690', brightBlue: '#82c8ff', brightMagenta: '#b0a0ff',
      brightCyan: '#a0f0e0', brightWhite: '#f5f5fa'
    };
  };

  // ONE global pty-data listener
  useEffect(() => {
    const cleanup = window.api.onPtyData((ptyId, data) => {
      for (const [tabId, inst] of instancesRef.current) {
        if (inst.ptyId === ptyId) {
          inst.terminal.write(data);

          // Status detection: ❯ prompt = idle, continuous output = busy
          if (data.includes('\u276F') || data.includes('❯')) {
            // Prompt detected = idle
            const timer = busyTimersRef.current.get(tabId);
            if (timer) clearTimeout(timer);
            busyTimersRef.current.delete(tabId);
            setTabStatuses(prev => { const n = new Map(prev); n.set(tabId, 'idle'); return n; });
          } else {
            // Data received = mark busy, reset after 3s of silence
            setTabStatuses(prev => { const n = new Map(prev); n.set(tabId, 'busy'); return n; });
            const existing = busyTimersRef.current.get(tabId);
            if (existing) clearTimeout(existing);
            busyTimersRef.current.set(tabId, setTimeout(() => {
              setTabStatuses(prev => { const n = new Map(prev); n.set(tabId, 'idle'); return n; });
              busyTimersRef.current.delete(tabId);
            }, 3000));
          }

          // First data received = terminal is ready
          if (!inst.ready) {
            inst.ready = true;
            setLoadingTabIds(prev => {
              const next = new Set(prev);
              next.delete(tabId);
              return next;
            });
          }
          break;
        }
      }
    });
    return cleanup;
  }, []);

  // Create/destroy PTY instances — only for initialized non-diff tabs (lazy loading)
  useEffect(() => {
    const current = instancesRef.current;
    const activeTabs = allTabs.filter(t => t.initialized !== false && t.type !== 'diff' && t.type !== 'history' && t.type !== 'notes');
    const allTabIds = new Set(allTabs.map(tab => tab.id));

    for (const [id, inst] of current) {
      if (!allTabIds.has(id)) {
        inst.terminal.dispose();
        if (inst.ptyId) window.api.ptyDestroy(inst.ptyId);
        inst.container.remove();
        current.delete(id);
        setLoadingTabIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }

    for (const tab of activeTabs) {
      if (current.has(tab.id)) continue;
      if (!containerRef.current) continue;

      // Mark as loading
      setLoadingTabIds(prev => new Set(prev).add(tab.id));

      const div = document.createElement('div');
      div.className = 'terminal-instance';
      div.style.display = 'none';
      containerRef.current.appendChild(div);

      const termTheme = getTermTheme();
      const term = new Terminal({
        theme: termTheme,
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
        fontSize: terminalFontSize || 13, lineHeight: 1, cursorBlink: true, cursorStyle: 'bar',
        scrollback: 10000, allowProposedApi: true
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(div);

      const inst: TermInstance = { terminal: term, fitAddon, ptyId: null, container: div, ready: false };
      current.set(tab.id, inst);

      const createPty = tab.type === 'claude'
        ? window.api.ptyCreate(tab.projectPath, tab.resumeSessionId)
        : window.api.ptyCreateShell(tab.projectPath);

      createPty.then((ptyId) => {
        // Tab may have been closed while PTY was being created
        if (!current.has(tab.id)) {
          window.api.ptyDestroy(ptyId);
          return;
        }
        inst.ptyId = ptyId;
        window.api.ptyResize(ptyId, term.cols, term.rows);
        if (tab.type === 'shell' && tab.command) {
          setTimeout(() => window.api.ptyWrite(ptyId, tab.command + '\r'), 600);
        }
      }).catch((err) => {
        inst.ready = true;
        setLoadingTabIds(prev => {
          const next = new Set(prev);
          next.delete(tab.id);
          return next;
        });
        term.writeln(`\x1b[31m${t(locale, 'terminal.error')}\x1b[0m`);
        term.writeln('\x1b[33m' + String(err) + '\x1b[0m');
      });

      term.onData((data) => {
        if (inst.ptyId) window.api.ptyWrite(inst.ptyId, data);
      });
    }
  }, [allTabs, locale]);

  // Show/hide + fit based on activeTabId + split view
  useEffect(() => {
    const visibleIds = new Set<string>();
    if (splitView && visibleTabs.length >= 2) {
      // In split view: show active + next tab
      const activeIdx = visibleTabs.findIndex(t => t.id === activeTabId);
      const splitIdx = activeIdx >= 0 ? (activeIdx + 1) % visibleTabs.length : 1;
      visibleIds.add(visibleTabs[activeIdx >= 0 ? activeIdx : 0].id);
      visibleIds.add(visibleTabs[splitIdx].id);
    } else {
      if (activeTabId) visibleIds.add(activeTabId);
    }

    for (const [id, inst] of instancesRef.current) {
      const isVisible = visibleIds.has(id);
      inst.container.style.display = isVisible ? 'block' : 'none';
      if (splitView && visibleIds.size === 2 && isVisible) {
        inst.container.style.width = '50%';
        inst.container.style.position = 'absolute';
        inst.container.style.top = '0';
        inst.container.style.bottom = '0';
        inst.container.style.left = id === [...visibleIds][0] ? '0' : '50%';
      } else if (isVisible) {
        inst.container.style.width = '';
        inst.container.style.position = 'absolute';
        inst.container.style.top = '0';
        inst.container.style.bottom = '0';
        inst.container.style.left = '0';
        inst.container.style.right = '0';
      }
      if (isVisible) {
        setTimeout(() => {
          inst.fitAddon.fit();
          if (inst.ptyId) {
            window.api.ptyResize(inst.ptyId, inst.terminal.cols, inst.terminal.rows);
          }
          if (id === activeTabId) inst.terminal.focus();
        }, 30);
      }
    }
  }, [activeTabId, splitView, visibleTabs]);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (activeTabId) {
        const inst = instancesRef.current.get(activeTabId);
        if (inst) {
          inst.fitAddon.fit();
          if (inst.ptyId) {
            window.api.ptyResize(inst.ptyId, inst.terminal.cols, inst.terminal.rows);
          }
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [activeTabId, session]);

  useEffect(() => {
    return () => {
      for (const [, inst] of instancesRef.current) {
        inst.terminal.dispose();
        if (inst.ptyId) window.api.ptyDestroy(inst.ptyId);
      }
      instancesRef.current.clear();
    };
  }, []);

  const isLoading = activeTabId ? loadingTabIds.has(activeTabId) : false;

  if (!session) {
    return (
      <div className="center-panel">
        <div className="terminal-placeholder">
          <div className="placeholder-icon">&#9002;</div>
          <div className="placeholder-text">{t(locale, 'app.title')}</div>
          <div className="placeholder-hint">{t(locale, 'terminal.placeholder')}</div>
        </div>
      </div>
    );
  }

  // Demo mode: simplified render
  if (isDemo && session) {
    return (
      <div className="center-panel">
        <div className="terminal-header">
          <div className="terminal-header-left">
            <span className="terminal-project-name">{session.projectName}</span>
            {branch && <span className="terminal-branch" onClick={onOpenBranchModal} style={{ cursor: 'pointer' }} title="Switch branch">{branch}</span>}
          </div>
          <span className="terminal-pid">PID: {session.pid > 0 ? session.pid : '---'}</span>
        </div>
        <div className="tab-bar">
          <div className="tab-item active">
            <span className="tab-icon"><ClaudeIcon size={12} /></span>
            <span className="tab-label">Claude</span>
          </div>
        </div>
        <div className="terminal-container">
          <div className="demo-terminal">
            <div className="demo-line demo-dim">{`  ▐▛███▜▌   Claude Code v2.1.98`}</div>
            <div className="demo-line demo-dim">{`  ▝▜█████▛▘  Opus 4.6 (1M context) · Claude Max`}</div>
            <div className="demo-line demo-dim">{`    ▘▘ ▝▝    ${session.projectPath}`}</div>
            <div className="demo-line" />
            <div className="demo-line demo-separator">{'─'.repeat(80)}</div>
            <div className="demo-line demo-prompt">{`❯ ${session.firstPrompt || 'Hello Claude!'}`}</div>
            <div className="demo-line" />
            <div className="demo-line demo-assistant">{'⏺ I\'ll work on this. Let me analyze the codebase first.'}</div>
            <div className="demo-line" />
            <div className="demo-line demo-tool">{'  Read 5 files, listed 2 directories (ctrl+o to expand)'}</div>
            <div className="demo-line" />
            <div className="demo-line demo-assistant">{'⏺ Here\'s my implementation plan:'}</div>
            <div className="demo-line demo-assistant">{'  1. Update the core module with the new logic'}</div>
            <div className="demo-line demo-assistant">{'  2. Add proper error handling and validation'}</div>
            <div className="demo-line demo-assistant">{'  3. Write comprehensive tests'}</div>
            <div className="demo-line" />
            <div className="demo-line demo-tool">{'  Edit src/auth/middleware.ts (+18, -12)'}</div>
            <div className="demo-line demo-tool">{'  Write src/auth/jwt.ts (+45)'}</div>
            <div className="demo-line demo-tool">{'  Write tests/auth/jwt.test.ts (+67)'}</div>
            <div className="demo-line" />
            <div className="demo-line demo-assistant">{'⏺ All changes are complete and tests pass.'}</div>
            <div className="demo-line" />
            <div className="demo-line demo-separator">{'─'.repeat(80)}</div>
            <div className="demo-line demo-prompt">{'❯ '}<span className="demo-blink">▎</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="center-panel">
      <div className="terminal-header">
        <div className="terminal-header-left">
          <span className="terminal-project-name">{session.projectName}</span>
          {branch && <span className="terminal-branch" onClick={onOpenBranchModal} style={{ cursor: 'pointer' }} title="Switch branch">{branch}</span>}
        </div>
        <span className="terminal-pid">PID: {session.pid > 0 ? session.pid : '---'}</span>
      </div>

      <div className="tab-bar">
        {visibleTabs.map(tab => (
          <div
            key={tab.id}
            className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onActivateTab(tab.id)}
          >
            <span className="tab-icon">
              {tab.type === 'claude' ? <ClaudeIcon size={12} /> :
               tab.type === 'diff' ? <span style={{ fontSize: 10, color: 'var(--blue)' }}>&#916;</span> :
               tab.type === 'history' ? <span style={{ fontSize: 10 }}>&#128337;</span> :
               tab.type === 'notes' ? <span style={{ fontSize: 10 }}>&#128221;</span> :
               <TerminalIcon size={12} />}
            </span>
            <span className="tab-label">{tab.label}</span>
            {loadingTabIds.has(tab.id) && <span className="tab-loading-dot" />}
            {tabStatuses.get(tab.id) === 'busy' && !loadingTabIds.has(tab.id) && <span className="tab-busy-dot" />}
            {visibleTabs.length > 1 && (
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              >
                &times;
              </button>
            )}
          </div>
        ))}
        <div className="tab-add-group">
          {!visibleTabs.some(t => t.type === 'claude') && (
            <button className="tab-add tab-add-claude" onClick={onAddClaudeTab}>
              <ClaudeIcon size={12} />
              <span>+ Claude</span>
            </button>
          )}
          <button className="tab-add tab-add-shell" onClick={onAddShellTab}>
            <TerminalIcon size={12} />
            <span>+ Terminal</span>
          </button>
          <button className="tab-add tab-add-note" onClick={onOpenNotes}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
            <span>+ Note</span>
          </button>
          <button className="tab-add tab-add-history" onClick={onOpenHistory}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span>+ History</span>
          </button>
          {visibleTabs.length >= 2 && (
            <button className={`tab-add ${splitView ? 'tab-split-active' : ''}`} onClick={onToggleSplit} title="Split view (Cmd+\\)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
            </button>
          )}
        </div>
      </div>

      <div className="terminal-container" ref={containerRef} style={{
        ...(terminalBgColor ? { background: terminalBgColor } : {}),
        ...(terminalBgOpacity && terminalBgOpacity < 100 ? { opacity: terminalBgOpacity / 100 } : {}),
      }}>
        {/* Loading overlay */}
        {isLoading && !isDemo && (
          <div className="terminal-loading">
            <img src="assets/mascotte_claude.png" alt="Loading" className="terminal-loading-mascot" width="56" height="56" />
            <div className="terminal-loading-spinner" />
          </div>
        )}
        {/* Diff tab views */}
        {visibleTabs.filter(tab => tab.type === 'diff' && tab.id === activeTabId).map(tab => (
          <DiffTabView key={tab.id} projectPath={tab.projectPath} filePath={tab.diffFilePath || ''} locale={locale} />
        ))}
        {/* History tab views */}
        {visibleTabs.filter(tab => tab.type === 'history' && tab.id === activeTabId).map(tab => (
          <HistoryTabView key={tab.id} projectPath={tab.projectPath} sessionId={tab.resumeSessionId || ''} locale={locale} />
        ))}
        {/* Notes tab views */}
        {visibleTabs.filter(tab => tab.type === 'notes' && tab.id === activeTabId).map(tab => (
          <NotesTabView key={tab.id} projectPath={tab.projectPath} />
        ))}
      </div>
    </div>
  );
}

// Inline diff tab component
function DiffTabView({ projectPath, filePath, locale }: { projectPath: string; filePath: string; locale: Locale }) {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.api.getFileDiff(projectPath, filePath).then(d => {
      setDiff(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectPath, filePath]);

  if (loading) {
    return <div className="diff-tab-loading">{t(locale, 'status.loading')}</div>;
  }

  if (!diff) {
    return <div className="diff-tab-loading">No diff</div>;
  }

  return (
    <div className="diff-tab-content">
      {diff.split('\n').map((line, i) => {
        let cls = 'diff-line';
        if (line.startsWith('+') && !line.startsWith('+++')) cls += ' diff-add';
        else if (line.startsWith('-') && !line.startsWith('---')) cls += ' diff-del';
        else if (line.startsWith('@@')) cls += ' diff-hunk';
        else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) cls += ' diff-meta';
        return <div key={i} className={cls}>{line || ' '}</div>;
      })}
    </div>
  );
}

// History timeline component
function HistoryTabView({ projectPath, sessionId, locale }: { projectPath: string; sessionId: string; locale: Locale }) {
  const [messages, setMessages] = useState<{ type: string; text: string; timestamp: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    window.api.getSessionHistory(projectPath, sessionId).then(m => {
      setMessages(m);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectPath, sessionId]);

  if (loading) return <div className="diff-tab-loading">{t(locale, 'status.loading')}</div>;
  if (messages.length === 0) return <div className="diff-tab-loading">No history</div>;

  return (
    <div className="history-tab-content">
      {messages.map((msg, i) => (
        <div key={i} className={`history-msg history-${msg.type}`}>
          <div className="history-meta">
            <span className={`history-role ${msg.type}`}>{msg.type === 'user' ? 'You' : 'Claude'}</span>
            {msg.timestamp && <span className="history-time">{msg.timestamp.slice(11, 19)}</span>}
          </div>
          <div className="history-text">{msg.text}</div>
        </div>
      ))}
    </div>
  );
}

// Notes component — persisted to ~/.claude-session-manager/notes/<projectPath>.md via IPC
function NotesTabView({ projectPath }: { projectPath: string }) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.notesLoad(projectPath).then(content => {
      if (!cancelled) {
        setText(content || '');
        setLoaded(true);
      }
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [projectPath]);

  const handleChange = (val: string) => {
    setText(val);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      window.api.notesSave(projectPath, val).catch(() => {});
    }, 300);
  };

  // Flush any pending save on unmount so unloading the tab never drops the last keystrokes
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        window.api.notesSave(projectPath, text).catch(() => {});
      }
    };
  }, [projectPath, text]);

  return (
    <div className="notes-tab-content">
      <textarea
        className="notes-textarea"
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={loaded ? 'Write your notes here...' : 'Loading...'}
        spellCheck={false}
      />
    </div>
  );
}
