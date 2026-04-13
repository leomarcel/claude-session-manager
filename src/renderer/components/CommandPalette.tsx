import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClaudeSession, PromptSnippet } from '../types';

export interface CommandPaletteItem {
  id: string;
  label: string;
  hint?: string;
  category: 'session' | 'project' | 'action' | 'settings' | 'snippet';
  perform: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sessions: ClaudeSession[];
  onSelectSession: (session: ClaudeSession) => void;
  onOpenSettings: (tab?: string) => void;
  onTriggerAction: (action: string) => void;
  onInsertSnippet?: (content: string) => void;
}

// Tiny fuzzy match: every char of `needle` must appear in order in `haystack`
function fuzzy(haystack: string, needle: string): number {
  if (!needle) return 1;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h.includes(n)) return 100 + (n.length / h.length) * 100;
  let hi = 0, score = 0, streak = 0;
  for (const ch of n) {
    const idx = h.indexOf(ch, hi);
    if (idx === -1) return 0;
    if (idx === hi) streak++;
    else streak = 0;
    score += 1 + streak;
    hi = idx + 1;
  }
  return score;
}

export function CommandPalette({ isOpen, onClose, sessions, onSelectSession, onOpenSettings, onTriggerAction, onInsertSnippet }: Props) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [snippets, setSnippets] = useState<PromptSnippet[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHighlighted(0);
      setTimeout(() => inputRef.current?.focus(), 30);
      window.api.snippetsLoad().then(setSnippets).catch(() => {});
    }
  }, [isOpen]);

  // Build the full source list (always)
  const items = useMemo<CommandPaletteItem[]>(() => {
    const out: CommandPaletteItem[] = [];

    // Sessions
    for (const s of sessions) {
      const name = s.customName || s.firstPrompt || s.projectName;
      out.push({
        id: `session:${s.conversationId || s.startTime}`,
        label: name,
        hint: s.projectPath,
        category: 'session',
        perform: () => onSelectSession(s),
      });
    }

    // Unique projects
    const projectsMap = new Map<string, ClaudeSession>();
    for (const s of sessions) {
      if (!projectsMap.has(s.projectPath)) projectsMap.set(s.projectPath, s);
    }
    for (const [projectPath, s] of projectsMap) {
      out.push({
        id: `project:${projectPath}`,
        label: s.projectName,
        hint: projectPath,
        category: 'project',
        perform: () => onSelectSession(s),
      });
    }

    // Settings tabs
    const settingsTabs = [
      { id: 'general', label: 'Settings: General' },
      { id: 'terminal', label: 'Settings: Terminal' },
      { id: 'ides', label: 'Settings: IDEs' },
      { id: 'actions', label: 'Settings: Quick actions' },
      { id: 'flags', label: 'Settings: Flags' },
      { id: 'claudeCode', label: 'Settings: Claude Code' },
      { id: 'snippets', label: 'Settings: Snippets' },
      { id: 'shortcuts', label: 'Settings: Shortcuts' },
      { id: 'updates', label: 'Settings: Updates' },
      { id: 'logs', label: 'Settings: Advanced' },
    ];
    for (const tab of settingsTabs) {
      out.push({
        id: `settings:${tab.id}`,
        label: tab.label,
        category: 'settings',
        perform: () => onOpenSettings(tab.id),
      });
    }

    // Quick actions
    const actions = [
      { id: 'new-shell', label: 'New Terminal' },
      { id: 'new-claude', label: 'New Claude tab' },
      { id: 'close-tab', label: 'Close active tab' },
      { id: 'split-view', label: 'Toggle split view' },
    ];
    for (const a of actions) {
      out.push({
        id: `action:${a.id}`,
        label: a.label,
        category: 'action',
        perform: () => onTriggerAction(a.id),
      });
    }

    // Snippets — insert into the active pty via parent callback (falls back to clipboard)
    for (const s of snippets) {
      out.push({
        id: `snippet:${s.id}`,
        label: s.title || '(untitled snippet)',
        hint: s.content.slice(0, 50),
        category: 'snippet',
        perform: () => {
          if (onInsertSnippet) onInsertSnippet(s.content);
          else navigator.clipboard.writeText(s.content).catch(() => {});
        },
      });
    }

    return out;
  }, [sessions, snippets, onSelectSession, onOpenSettings, onTriggerAction]);

  const ranked = useMemo(() => {
    if (!query.trim()) return items.slice(0, 50);
    return items
      .map(it => ({ it, score: fuzzy(it.label + ' ' + (it.hint || ''), query) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(x => x.it);
  }, [items, query]);

  // Keep highlight in range
  useEffect(() => { setHighlighted(0); }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, ranked.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = ranked[highlighted];
      if (item) { item.perform(); onClose(); }
    }
  };

  if (!isOpen) return null;

  const categoryIcon = (cat: CommandPaletteItem['category']) => {
    switch (cat) {
      case 'session': return '◆';
      case 'project': return '📁';
      case 'action': return '⚡';
      case 'settings': return '⚙';
      case 'snippet': return '✎';
    }
  };

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-modal" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={inputRef}
            className="cmdk-input"
            type="text"
            placeholder="Search sessions, projects, settings, actions, snippets..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="cmdk-kbd">esc</kbd>
        </div>
        <div className="cmdk-results">
          {ranked.length === 0 ? (
            <div className="cmdk-empty">No results</div>
          ) : ranked.map((item, i) => (
            <div
              key={item.id}
              className={`cmdk-item ${i === highlighted ? 'highlighted' : ''}`}
              onClick={() => { item.perform(); onClose(); }}
              onMouseEnter={() => setHighlighted(i)}
            >
              <span className="cmdk-icon">{categoryIcon(item.category)}</span>
              <span className="cmdk-label">{item.label}</span>
              {item.hint && <span className="cmdk-hint">{item.hint}</span>}
              <span className={`cmdk-cat cmdk-cat-${item.category}`}>{item.category}</span>
            </div>
          ))}
        </div>
        <div className="cmdk-footer">
          <span><kbd className="cmdk-kbd">↑↓</kbd> navigate</span>
          <span><kbd className="cmdk-kbd">↵</kbd> select</span>
          <span><kbd className="cmdk-kbd">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
