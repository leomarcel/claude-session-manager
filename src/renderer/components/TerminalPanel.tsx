import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { ClaudeSession, TerminalTab } from '../types';
import { Locale, t } from '../i18n';
import { ClaudeIcon, TerminalIcon } from './Icons';

interface Props {
  session: ClaudeSession | null;
  branch: string;
  locale: Locale;
  isDemo?: boolean;
  allTabs: TerminalTab[];
  visibleTabs: TerminalTab[];
  activeTabId: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddShellTab: () => void;
  onAddClaudeTab: () => void;
}

interface TermInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  ptyId: string | null;
  container: HTMLDivElement;
  ready: boolean;
}

export function TerminalPanel({
  session, branch, locale, isDemo, allTabs, visibleTabs, activeTabId,
  onActivateTab, onCloseTab, onAddShellTab, onAddClaudeTab
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TermInstance>>(new Map());
  const [loadingTabIds, setLoadingTabIds] = useState<Set<string>>(new Set());

  // ONE global pty-data listener
  useEffect(() => {
    const cleanup = window.api.onPtyData((ptyId, data) => {
      for (const [tabId, inst] of instancesRef.current) {
        if (inst.ptyId === ptyId) {
          inst.terminal.write(data);
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

  // Create/destroy PTY instances — only for initialized tabs (lazy loading)
  useEffect(() => {
    const current = instancesRef.current;
    const activeTabs = allTabs.filter(t => t.initialized !== false);
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

      const term = new Terminal({
        theme: {
          background: '#0d0d12', foreground: '#e0e0e5', cursor: '#7c6aef',
          cursorAccent: '#0d0d12', selectionBackground: 'rgba(124, 106, 239, 0.3)',
          black: '#1a1a24', red: '#ff6b7a', green: '#50e3a0', yellow: '#ffd76a',
          blue: '#64b5f6', magenta: '#9580ff', cyan: '#80e8d0', white: '#e0e0e5',
          brightBlack: '#555570', brightRed: '#ff8a95', brightGreen: '#70f0b8',
          brightYellow: '#ffe690', brightBlue: '#82c8ff', brightMagenta: '#b0a0ff',
          brightCyan: '#a0f0e0', brightWhite: '#f5f5fa'
        },
        fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
        fontSize: 13, lineHeight: 1, cursorBlink: true, cursorStyle: 'bar',
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

  // Show/hide + fit based on activeTabId
  useEffect(() => {
    for (const [id, inst] of instancesRef.current) {
      const isActive = id === activeTabId;
      inst.container.style.display = isActive ? 'block' : 'none';
      if (isActive) {
        setTimeout(() => {
          inst.fitAddon.fit();
          if (inst.ptyId) {
            window.api.ptyResize(inst.ptyId, inst.terminal.cols, inst.terminal.rows);
          }
          inst.terminal.focus();
        }, 30);
      }
    }
  }, [activeTabId]);

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
            {branch && <span className="terminal-branch">{branch}</span>}
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            PID: {session.pid > 0 ? session.pid : '---'}
          </span>
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
          {branch && <span className="terminal-branch">{branch}</span>}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          PID: {session.pid > 0 ? session.pid : '---'}
        </span>
      </div>

      <div className="tab-bar">
        {visibleTabs.map(tab => (
          <div
            key={tab.id}
            className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onActivateTab(tab.id)}
          >
            <span className="tab-icon">
              {tab.type === 'claude' ? <ClaudeIcon size={12} /> : <TerminalIcon size={12} />}
            </span>
            <span className="tab-label">{tab.label}</span>
            {loadingTabIds.has(tab.id) && <span className="tab-loading-dot" />}
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
        </div>
      </div>

      <div className="terminal-container" ref={containerRef}>
        {/* Loading overlay */}
        {isLoading && !isDemo && (
          <div className="terminal-loading">
            <img src="assets/mascotte_claude.png" alt="Loading" className="terminal-loading-mascot" width="56" height="56" />
            <div className="terminal-loading-spinner" />
          </div>
        )}
      </div>
    </div>
  );
}
