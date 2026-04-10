import React, { useEffect, useRef } from 'react';
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
  allTabs: TerminalTab[];       // Every tab across all projects (drives PTY lifecycle)
  visibleTabs: TerminalTab[];   // Tabs shown in the tab bar (current project only)
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
}

export function TerminalPanel({
  session, branch, locale, allTabs, visibleTabs, activeTabId,
  onActivateTab, onCloseTab, onAddShellTab, onAddClaudeTab
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instancesRef = useRef<Map<string, TermInstance>>(new Map());

  // ONE global pty-data listener (never re-created)
  useEffect(() => {
    const cleanup = window.api.onPtyData((ptyId, data) => {
      for (const inst of instancesRef.current.values()) {
        if (inst.ptyId === ptyId) {
          inst.terminal.write(data);
          break;
        }
      }
    });
    return cleanup;
  }, []);

  // Create/destroy PTY instances based on ALL tabs (not just visible ones)
  // This ensures terminals stay alive when switching sessions
  useEffect(() => {
    const current = instancesRef.current;
    const allTabIds = new Set(allTabs.map(tab => tab.id));

    // Destroy instances for tabs that no longer exist (explicitly closed)
    for (const [id, inst] of current) {
      if (!allTabIds.has(id)) {
        inst.terminal.dispose();
        if (inst.ptyId) window.api.ptyDestroy(inst.ptyId);
        inst.container.remove();
        current.delete(id);
      }
    }

    // Create instances for new tabs
    for (const tab of allTabs) {
      if (current.has(tab.id)) continue;
      if (!containerRef.current) continue;

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
        fontSize: 13, lineHeight: 1.4, cursorBlink: true, cursorStyle: 'bar',
        scrollback: 10000, allowProposedApi: true
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.loadAddon(new WebLinksAddon());
      term.open(div);

      const inst: TermInstance = { terminal: term, fitAddon, ptyId: null, container: div };
      current.set(tab.id, inst);

      const createPty = tab.type === 'claude'
        ? window.api.ptyCreate(tab.projectPath, tab.resumeSessionId)
        : window.api.ptyCreateShell(tab.projectPath);

      createPty.then((ptyId) => {
        inst.ptyId = ptyId;
        window.api.ptyResize(ptyId, term.cols, term.rows);
        if (tab.type === 'shell' && tab.command) {
          setTimeout(() => window.api.ptyWrite(ptyId, tab.command + '\r'), 600);
        }
      }).catch((err) => {
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

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      for (const [, inst] of instancesRef.current) {
        inst.terminal.dispose();
        if (inst.ptyId) window.api.ptyDestroy(inst.ptyId);
      }
      instancesRef.current.clear();
    };
  }, []);

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

      {/* Tab bar shows only visibleTabs (current project) */}
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
          <button className="tab-add tab-add-claude" onClick={onAddClaudeTab}>
            <ClaudeIcon size={12} />
            <span>+ Claude</span>
          </button>
          <button className="tab-add tab-add-shell" onClick={onAddShellTab}>
            <TerminalIcon size={12} />
            <span>+ Terminal</span>
          </button>
        </div>
      </div>

      {/* All terminal instances live here, toggled via display:none/block */}
      <div className="terminal-container" ref={containerRef} />
    </div>
  );
}
