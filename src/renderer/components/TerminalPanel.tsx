import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { ClaudeSession, TerminalTab, TerminalPreset, AppTheme, PromptSnippet, UsageDayBucket } from '../types';
import { ClaudeConfigStructuredEditor } from './ClaudeConfigStructuredEditor';
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
  terminalBgImage?: string;
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
  onOpenClaudeMd?: () => void;
  onOpenUsage?: () => void;
  onOpenClaudeConfig?: () => void;
  splitView?: boolean;
  onToggleSplit?: () => void;
}

interface TermInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  ptyId: string | null;
  container: HTMLDivElement;
  ready: boolean;
  lastCols?: number;
  lastRows?: number;
}

export function TerminalPanel({
  session, branch, locale, isDemo, terminalPreset, terminalFontSize, appTheme, terminalBgColor, terminalBgOpacity, terminalBgImage, allTabs, visibleTabs, activeTabId,
  onActivateTab, onCloseTab, onAddShellTab, onAddClaudeTab, onOpenBranchModal, onOpenHistory, onOpenNotes, onOpenClaudeMd, onOpenUsage, onOpenClaudeConfig, splitView, onToggleSplit
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TermInstance>>(new Map());
  const lastFocusedTabRef = useRef<string | null>(null);
  const [loadingTabIds, setLoadingTabIds] = useState<Set<string>>(new Set());
  const [tabStatuses, setTabStatuses] = useState<Map<string, 'busy' | 'idle'>>(new Map());
  const busyTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [snippets, setSnippets] = useState<PromptSnippet[]>([]);
  const [snippetsOpen, setSnippetsOpen] = useState(false);

  // Load snippets when dropdown opens
  useEffect(() => {
    if (!snippetsOpen) return;
    window.api.snippetsLoad().then(setSnippets).catch(() => setSnippets([]));
  }, [snippetsOpen]);

  // Close snippets dropdown on outside click / Escape
  useEffect(() => {
    if (!snippetsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.snippets-dropdown') && !t.closest('.snippets-trigger')) setSnippetsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSnippetsOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [snippetsOpen]);

  const insertSnippet = (snippet: PromptSnippet) => {
    if (!activeTabId) return;
    const inst = instancesRef.current.get(activeTabId);
    if (!inst || !inst.ptyId) return;
    window.api.ptyWrite(inst.ptyId, snippet.content);
    setSnippetsOpen(false);
  };

  // Listen for snippet insertions triggered from outside (e.g. command palette)
  useEffect(() => {
    const onInsert = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail !== 'string' || !activeTabId) return;
      const inst = instancesRef.current.get(activeTabId);
      if (!inst || !inst.ptyId) return;
      window.api.ptyWrite(inst.ptyId, detail);
    };
    window.addEventListener('claude:insert-snippet', onInsert);
    return () => window.removeEventListener('claude:insert-snippet', onInsert);
  }, [activeTabId]);

  const activeTab = visibleTabs.find(t => t.id === activeTabId);
  const showSnippetsButton = activeTab?.type === 'claude' || activeTab?.type === 'shell';

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
    const activeTabs = allTabs.filter(t =>
      t.initialized !== false &&
      t.type !== 'diff' &&
      t.type !== 'history' &&
      t.type !== 'notes' &&
      t.type !== 'claudemd' &&
      t.type !== 'usage' &&
      t.type !== 'claude-config'
    );
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
          const cols = inst.terminal.cols;
          const rows = inst.terminal.rows;
          if (inst.ptyId && (cols !== inst.lastCols || rows !== inst.lastRows)) {
            window.api.ptyResize(inst.ptyId, cols, rows);
            inst.lastCols = cols;
            inst.lastRows = rows;
          }
          if (id === activeTabId && lastFocusedTabRef.current !== activeTabId) {
            inst.terminal.focus();
            lastFocusedTabRef.current = activeTabId;
          }
        }, 30);
      }
    }
  }, [activeTabId, splitView, visibleTabs]);

  // Apply theme/preset changes live to existing terminals
  useEffect(() => {
    const newTheme = getTermTheme();
    for (const [, inst] of instancesRef.current) {
      inst.terminal.options.theme = newTheme;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appTheme, terminalPreset]);

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
      // Clear any pending busy-status timers so they don't fire after unmount
      for (const timer of busyTimersRef.current.values()) clearTimeout(timer);
      busyTimersRef.current.clear();
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

  // Session selected but no tabs open — show the friendly placeholder instead of an empty terminal area
  if (visibleTabs.length === 0) {
    return (
      <div className="center-panel">
        <div className="terminal-placeholder">
          <div className="placeholder-icon">&#9002;</div>
          <div className="placeholder-text">{session.customName || session.projectName}</div>
          <div className="placeholder-hint">{t(locale, 'terminal.noTabs')}</div>
          <div className="placeholder-actions">
            <button className="settings-btn primary" onClick={onAddClaudeTab}>
              <ClaudeIcon size={14} />
              <span style={{ marginLeft: 6 }}>+ Claude</span>
            </button>
            <button className="settings-btn secondary" onClick={onAddShellTab}>
              <TerminalIcon size={14} />
              <span style={{ marginLeft: 6 }}>+ Terminal</span>
            </button>
          </div>
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
            {branch && <span className="terminal-branch">{branch}</span>}
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
      <div className="session-fade-wrap" key={session.conversationId || session.projectPath}>
      <div className="terminal-header">
        <div className="terminal-header-left">
          <span className="terminal-project-name">{session.projectName}</span>
          {branch && <span className="terminal-branch">{branch}</span>}
        </div>
        <div className="terminal-header-right">
          {showSnippetsButton && (
            <div style={{ position: 'relative' }}>
              <button
                className="snippets-trigger"
                onClick={() => setSnippetsOpen(p => !p)}
                title={t(locale, 'terminal.snippets')}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                <span>Snippets</span>
              </button>
              {snippetsOpen && (
                <div className="snippets-dropdown">
                  {snippets.length === 0 ? (
                    <div className="snippets-dropdown-empty">{t(locale, 'terminal.snippetsEmpty')}</div>
                  ) : (
                    snippets.map(s => (
                      <button
                        key={s.id}
                        className="snippets-dropdown-item"
                        onClick={() => insertSnippet(s)}
                        title={s.content}
                      >
                        <span className="snippets-dropdown-title">{s.title || '(untitled)'}</span>
                        <span className="snippets-dropdown-preview">{s.content.slice(0, 60)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          <span className="terminal-pid">PID: {session.pid > 0 ? session.pid : '---'}</span>
        </div>
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
               tab.type === 'claudemd' ? <span style={{ fontSize: 10, color: 'var(--accent)' }}>M↓</span> :
               tab.type === 'usage' ? <span style={{ fontSize: 10, color: 'var(--green)' }}>📊</span> :
               tab.type === 'claude-config' ? <span style={{ fontSize: 10, color: '#ffb044' }}>⚙</span> :
               <TerminalIcon size={12} />}
            </span>
            <span className="tab-label">{tab.label}</span>
            {loadingTabIds.has(tab.id) && <span className="tab-loading-dot" />}
            {tabStatuses.get(tab.id) === 'busy' && !loadingTabIds.has(tab.id) && <span className="tab-busy-dot" />}
            <button
              className={`tab-close ${tab.type === 'claude' ? 'tab-close-always' : ''}`}
              onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
              title={tab.type === 'claude' ? t(locale, 'terminal.disconnect') : undefined}
            >
              &times;
            </button>
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
          {onOpenClaudeMd && (
            <button className="tab-add tab-add-claudemd" onClick={onOpenClaudeMd}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>+ CLAUDE.md</span>
            </button>
          )}
          {onOpenUsage && (
            <button className="tab-add tab-add-usage" onClick={onOpenUsage}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 12V8"/><path d="M14 16v-4"/><path d="M10 16V6"/><path d="M6 16v-2"/></svg>
              <span>+ Usage</span>
            </button>
          )}
          {onOpenClaudeConfig && (
            <button className="tab-add tab-add-claude-config" onClick={onOpenClaudeConfig}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              <span>+ Claude config</span>
            </button>
          )}
          {visibleTabs.length >= 2 && (
            <button className={`tab-add ${splitView ? 'tab-split-active' : ''}`} onClick={onToggleSplit} title="Split view (Cmd+\\)">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
            </button>
          )}
        </div>
      </div>
      </div>

      <div className="terminal-container" ref={containerRef} style={{
        ...(terminalBgColor ? { background: terminalBgColor } : {}),
        ...(terminalBgImage ? {
          backgroundImage: `url("file://${terminalBgImage.replace(/"/g, '%22')}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : {}),
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
        {/* CLAUDE.md tab views */}
        {visibleTabs.filter(tab => tab.type === 'claudemd' && tab.id === activeTabId).map(tab => (
          <ClaudeMdTabView key={tab.id} projectPath={tab.projectPath} locale={locale} />
        ))}
        {/* Usage tab views */}
        {visibleTabs.filter(tab => tab.type === 'usage' && tab.id === activeTabId).map(tab => (
          <UsageTabView key={tab.id} projectPath={tab.projectPath} locale={locale} />
        ))}
        {/* Project Claude config tab views */}
        {visibleTabs.filter(tab => tab.type === 'claude-config' && tab.id === activeTabId).map(tab => (
          <ClaudeConfigTabView key={tab.id} projectPath={tab.projectPath} locale={locale} />
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

// Usage chart — daily tokens / messages / tools, SVG bar chart
function UsageTabView({ projectPath, locale }: { projectPath: string; locale: Locale }) {
  const [series, setSeries] = useState<UsageDayBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(30);
  const [metric, setMetric] = useState<'totalTokens' | 'messages' | 'tools' | 'sessions' | 'cost'>('totalTokens');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.api.usageHistory(projectPath, days).then(res => {
      if (cancelled) return;
      if (res.ok && res.series) {
        setSeries(res.series);
      } else {
        setError(res.error || 'Failed to load');
      }
      setLoading(false);
    }).catch(e => {
      if (!cancelled) { setError(String(e)); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [projectPath, days]);

  // Fill missing days with zeros for a continuous chart
  const continuous = (() => {
    const map = new Map(series.map(b => [b.day, b]));
    const out: UsageDayBucket[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push(map.get(key) || { day: key, messages: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0, tools: 0, sessions: 0 });
    }
    return out;
  })();

  const max = Math.max(1, ...continuous.map(b => b[metric] as number));
  const totals = continuous.reduce((acc, b) => ({
    messages: acc.messages + b.messages,
    totalTokens: acc.totalTokens + b.totalTokens,
    inputTokens: acc.inputTokens + b.inputTokens,
    outputTokens: acc.outputTokens + b.outputTokens,
    cost: acc.cost + b.cost,
    tools: acc.tools + b.tools,
    sessions: acc.sessions + b.sessions,
  }), { messages: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, cost: 0, tools: 0, sessions: 0 });

  const formatNumber = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
  const formatCost = (n: number) => '$' + (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2));

  const W = 800;
  const H = 240;
  const PAD_LEFT = 50;
  const PAD_RIGHT = 12;
  const PAD_TOP = 16;
  const PAD_BOT = 32;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOT;
  const barW = chartW / continuous.length;

  return (
    <div className="usage-tab-content">
      <div className="usage-header">
        <div>
          <h3 className="usage-title">{t(locale, 'usage.title')}</h3>
          <p className="usage-subtitle">{projectPath}</p>
        </div>
        <div className="usage-controls">
          <select className="usage-select" value={days} onChange={e => setDays(parseInt(e.target.value))}>
            <option value={7}>{t(locale, 'usage.last7')}</option>
            <option value={14}>{t(locale, 'usage.last14')}</option>
            <option value={30}>{t(locale, 'usage.last30')}</option>
            <option value={90}>{t(locale, 'usage.last90')}</option>
          </select>
          <select className="usage-select" value={metric} onChange={e => setMetric(e.target.value as any)}>
            <option value="totalTokens">{t(locale, 'usage.metricTokens')}</option>
            <option value="cost">{t(locale, 'usage.metricCost')}</option>
            <option value="messages">{t(locale, 'usage.metricMessages')}</option>
            <option value="tools">{t(locale, 'usage.metricTools')}</option>
            <option value="sessions">{t(locale, 'usage.metricSessions')}</option>
          </select>
        </div>
      </div>

      <div className="usage-stats">
        <div className="usage-stat">
          <span className="usage-stat-label">{t(locale, 'usage.metricCost')}</span>
          <span className="usage-stat-value usage-stat-cost">{formatCost(totals.cost)}</span>
          <span className="usage-stat-sub">{t(locale, 'usage.costEstimate')}</span>
        </div>
        <div className="usage-stat">
          <span className="usage-stat-label">{t(locale, 'usage.metricTokens')}</span>
          <span className="usage-stat-value">{formatNumber(totals.totalTokens)}</span>
          <span className="usage-stat-sub">{formatNumber(totals.inputTokens)} in / {formatNumber(totals.outputTokens)} out</span>
        </div>
        <div className="usage-stat">
          <span className="usage-stat-label">{t(locale, 'usage.metricMessages')}</span>
          <span className="usage-stat-value">{formatNumber(totals.messages)}</span>
        </div>
        <div className="usage-stat">
          <span className="usage-stat-label">{t(locale, 'usage.metricTools')}</span>
          <span className="usage-stat-value">{formatNumber(totals.tools)}</span>
        </div>
        <div className="usage-stat">
          <span className="usage-stat-label">{t(locale, 'usage.metricSessions')}</span>
          <span className="usage-stat-value">{formatNumber(totals.sessions)}</span>
        </div>
      </div>

      {loading ? (
        <div className="usage-empty">{t(locale, 'status.loading')}</div>
      ) : error ? (
        <div className="usage-empty">{error}</div>
      ) : (
        <svg className="usage-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {/* Y axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map(tick => {
            const y = PAD_TOP + chartH - chartH * tick;
            const value = max * tick;
            const label = metric === 'cost' ? formatCost(value) : formatNumber(value);
            return (
              <g key={tick}>
                <line x1={PAD_LEFT} y1={y} x2={W - PAD_RIGHT} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />
                <text x={PAD_LEFT - 6} y={y + 3} fontSize="9" fill="var(--text-muted)" textAnchor="end">{label}</text>
              </g>
            );
          })}

          {/* Bars */}
          {continuous.map((b, i) => {
            const value = b[metric] as number;
            const h = (value / max) * chartH;
            const x = PAD_LEFT + i * barW + 1;
            const y = PAD_TOP + chartH - h;
            return (
              <rect
                key={b.day}
                x={x}
                y={y}
                width={Math.max(1, barW - 2)}
                height={Math.max(0, h)}
                fill="var(--accent)"
                opacity="0.85"
              >
                <title>{b.day}: {metric === 'cost' ? formatCost(value) : formatNumber(value)}</title>
              </rect>
            );
          })}

          {/* X axis labels (every ~Nth day) */}
          {continuous.map((b, i) => {
            const step = Math.ceil(continuous.length / 8);
            if (i % step !== 0 && i !== continuous.length - 1) return null;
            const x = PAD_LEFT + i * barW + barW / 2;
            return (
              <text key={b.day} x={x} y={H - 12} fontSize="9" fill="var(--text-muted)" textAnchor="middle">
                {b.day.slice(5)}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// Project Claude Code config editor — edits <projectPath>/.claude/settings.json
function ClaudeConfigTabView({ projectPath, locale }: { projectPath: string; locale: Locale }) {
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saved' | 'error'; message?: string }>({ kind: 'idle' });
  const [scope, setScope] = useState<'project' | 'project-local'>('project');
  const [view, setView] = useState<'structured' | 'raw'>('structured');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDirty(false);
    setStatus({ kind: 'idle' });
    window.api.claudeConfigLoad(scope, projectPath).then(res => {
      if (cancelled) return;
      setContent(res.exists ? res.content : '{}');
      setFilePath(res.path);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectPath, scope]);

  const parseConfig = (): any => {
    try { return JSON.parse(content || '{}'); } catch { return null; }
  };
  const writeConfig = (obj: any) => {
    setContent(JSON.stringify(obj, null, 2));
    setDirty(true);
    setStatus({ kind: 'idle' });
  };

  const handleSave = async () => {
    const res = await window.api.claudeConfigSave(scope, content, projectPath);
    if (res.ok) {
      setDirty(false);
      setStatus({ kind: 'saved' });
      setTimeout(() => setStatus({ kind: 'idle' }), 2500);
    } else {
      setStatus({ kind: 'error', message: res.error || 'Save failed' });
    }
  };

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed, null, 2));
      setDirty(true);
      setStatus({ kind: 'idle' });
    } catch (e: any) {
      setStatus({ kind: 'error', message: `Invalid JSON: ${e.message}` });
    }
  };

  return (
    <div className="claude-config-tab-content">
      <div className="claudemd-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, overflow: 'hidden' }}>
          <select
            value={scope}
            onChange={e => setScope(e.target.value as 'project' | 'project-local')}
            className="usage-select"
            style={{ fontSize: 10 }}
          >
            <option value="project">.claude/settings.json</option>
            <option value="project-local">.claude/settings.local.json</option>
          </select>
          <span className="claudemd-path" title={filePath}>{filePath}</span>
        </div>
        <div className="settings-radio-group" style={{ margin: 0 }}>
          <label className={`settings-radio ${view === 'structured' ? 'active' : ''}`} style={{ padding: '4px 10px' }}>
            <input type="radio" name="cc-view-tab" checked={view === 'structured'} onChange={() => setView('structured')} />
            {t(locale, 'settings.claudeCodeViewStructured')}
          </label>
          <label className={`settings-radio ${view === 'raw' ? 'active' : ''}`} style={{ padding: '4px 10px' }}>
            <input type="radio" name="cc-view-tab" checked={view === 'raw'} onChange={() => setView('raw')} />
            {t(locale, 'settings.claudeCodeViewRaw')}
          </label>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {view === 'raw' && (
            <button className="settings-btn secondary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleFormat} disabled={loading}>
              {t(locale, 'settings.claudeCodeFormat')}
            </button>
          )}
          <button className="settings-btn primary" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleSave} disabled={!dirty || loading}>
            {t(locale, 'settings.save')}
          </button>
        </div>
      </div>
      <div className="claude-config-tab-body">
        {view === 'raw' && (
          <textarea
            className="claudemd-textarea"
            value={content}
            spellCheck={false}
            onChange={e => { setContent(e.target.value); setDirty(true); setStatus({ kind: 'idle' }); }}
            placeholder={loading ? 'Loading...' : '{}'}
          />
        )}
        {view === 'structured' && (() => {
          const cfg = parseConfig();
          if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
            return (
              <div className="claude-config-status error" style={{ padding: 12 }}>
                {t(locale, 'settings.claudeCodeInvalidJson')}
              </div>
            );
          }
          return <ClaudeConfigStructuredEditor cfg={cfg} onChange={writeConfig} locale={locale} />;
        })()}
      </div>
      {status.kind === 'saved' && (
        <div className="claude-config-status success">✓ {t(locale, 'settings.claudeCodeSaved')}</div>
      )}
      {status.kind === 'error' && (
        <div className="claude-config-status error">{status.message}</div>
      )}
    </div>
  );
}

// CLAUDE.md viewer/editor — reads/writes <projectPath>/CLAUDE.md
function ClaudeMdTabView({ projectPath, locale }: { projectPath: string; locale: Locale }) {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [exists, setExists] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const saveTimer = useRef<number | null>(null);
  // Refs hold the latest value so the cleanup effect always reads fresh state
  // without having to list `text` in its deps array (which would re-fire on every keystroke).
  const textRef = useRef('');
  const projectPathRef = useRef(projectPath);

  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { projectPathRef.current = projectPath; }, [projectPath]);

  useEffect(() => {
    let cancelled = false;
    window.api.claudeMdLoad(projectPath).then(res => {
      if (cancelled) return;
      setText(res.content || '');
      setExists(res.exists);
      setFilePath(res.path);
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [projectPath]);

  const handleChange = (val: string) => {
    setText(val);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      window.api.claudeMdSave(projectPathRef.current, val).then(res => {
        if (res.ok) { setExists(true); setSavedAt(new Date()); }
      }).catch(() => {});
    }, 500);
  };

  // Flush pending save on unmount only (not on text change)
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        window.api.claudeMdSave(projectPathRef.current, textRef.current).catch(() => {});
      }
    };
  }, []);

  return (
    <div className="claudemd-tab-content">
      <div className="claudemd-header">
        <span className="claudemd-path" title={filePath}>{filePath}</span>
        <span className="claudemd-status">
          {!exists && !text ? t(locale, 'claudemd.empty') :
           savedAt ? `${t(locale, 'claudemd.savedAt')} ${savedAt.toLocaleTimeString()}` :
           exists ? t(locale, 'claudemd.loaded') : ''}
        </span>
      </div>
      <textarea
        className="claudemd-textarea"
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder={loaded ? t(locale, 'claudemd.placeholder') : 'Loading...'}
        spellCheck={false}
      />
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
