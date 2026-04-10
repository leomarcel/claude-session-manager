import React, { useState, useEffect } from 'react';
import { ClaudeSession, ModifiedFile, AppSettings, IDEInfo } from '../types';
import { Locale, t } from '../i18n';
import { GitIcon, PRIcon, WorktreeIcon, PhpStormIcon, VSCodeIcon, IntelliJIcon, FinderIcon, TerminalIcon } from './Icons';

interface Props {
  session: ClaudeSession | null;
  modifiedFiles: ModifiedFile[];
  settings: AppSettings;
  locale: Locale;
}

const STATUS_LABELS: Record<string, string> = {
  modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: '?'
};

// Map IDE ids to icon components
function getIDEIcon(ideId: string, size = 16): React.ReactNode {
  switch (ideId) {
    case 'vscode': case 'cursor': return <VSCodeIcon size={size} />;
    case 'phpstorm': case 'webstorm': return <PhpStormIcon size={size} />;
    case 'intellij': return <IntelliJIcon size={size} />;
    default: return <span style={{ fontSize: 10, fontWeight: 700 }}>{ideId.slice(0, 2).toUpperCase()}</span>;
  }
}

export function RightSidebar({ session, modifiedFiles, settings, locale }: Props) {
  const [filePicker, setFilePicker] = useState<{ filePath: string; x: number; y: number } | null>(null);
  const [enabledIDEs, setEnabledIDEs] = useState<IDEInfo[]>([]);

  useEffect(() => {
    window.api.getEnabledIDEs().then(setEnabledIDEs).catch(() => {});
  }, [settings]);

  const handleFileClick = (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    if (enabledIDEs.length === 1) {
      // Only one IDE: open directly
      window.api.actionOpenFileInIDE(session!.projectPath, filePath, enabledIDEs[0].id);
    } else if (enabledIDEs.length > 1) {
      // Multiple IDEs: show picker
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setFilePicker({ filePath, x: rect.left, y: rect.bottom + 4 });
    }
  };

  const openFileInIDE = (ideId: string) => {
    if (filePicker && session) {
      window.api.actionOpenFileInIDE(session.projectPath, filePicker.filePath, ideId);
    }
    setFilePicker(null);
  };

  if (!session) {
    return (
      <div className="sidebar-right">
        <div className="files-panel">
          <div className="sidebar-header">{t(locale, 'files.title')}</div>
          <div className="files-empty">{t(locale, 'files.noProject')}</div>
        </div>
        <div className="actions-panel">
          <div className="sidebar-header">{t(locale, 'actions.title')}</div>
          <div className="actions-list" />
        </div>
      </div>
    );
  }

  const stagedCount = modifiedFiles.filter(f => f.staged).length;

  // Build actions list from settings
  type ActionDef = {
    id: string;
    name: string;
    desc: string;
    icon: React.ReactNode;
    iconClass: string;
    action: () => void;
  };

  const builtinActions: Record<string, ActionDef> = {
    commit: {
      id: 'commit', name: t(locale, 'actions.commit'), desc: t(locale, 'actions.commitDesc'),
      icon: <GitIcon size={16} />, iconClass: 'git',
      action: () => window.api.actionCommit(session.projectPath)
    },
    createPR: {
      id: 'createPR', name: t(locale, 'actions.createPR'), desc: t(locale, 'actions.createPRDesc'),
      icon: <PRIcon size={16} />, iconClass: 'pr',
      action: () => window.api.actionCreatePR(session.projectPath)
    },
    worktree: {
      id: 'worktree', name: t(locale, 'actions.worktree'), desc: t(locale, 'actions.worktreeDesc'),
      icon: <WorktreeIcon size={16} />, iconClass: 'worktree',
      action: () => window.api.actionWorktree(session.projectPath)
    },
    finder: {
      id: 'finder', name: t(locale, 'actions.openFinder'), desc: t(locale, 'actions.openFinderDesc'),
      icon: <FinderIcon size={16} />, iconClass: 'finder',
      action: () => window.api.actionOpenFinder(session.projectPath)
    },
    terminal: {
      id: 'terminal', name: t(locale, 'actions.openTerminal'), desc: t(locale, 'actions.openTerminalDesc'),
      icon: <TerminalIcon size={16} />, iconClass: 'terminal',
      action: () => window.api.actionOpenTerminal(session.projectPath)
    },
  };

  // Build visible actions from settings order
  const visibleActions: ActionDef[] = [];

  const sortedActions = [...(settings.quickActions || [])].sort((a, b) => a.order - b.order);

  for (const qa of sortedActions) {
    if (!qa.visible) continue;

    if (qa.type === 'builtin' && builtinActions[qa.id]) {
      visibleActions.push(builtinActions[qa.id]);
    } else if (qa.type === 'ide') {
      const ideId = qa.id.replace('ide:', '');
      const ide = settings.ides.find(i => i.id === ideId);
      if (ide && ide.enabled) {
        const nameKey = `actions.open${ideId.charAt(0).toUpperCase() + ideId.slice(1)}`;
        const descKey = `${nameKey}Desc`;
        visibleActions.push({
          id: qa.id,
          name: t(locale, nameKey) !== nameKey ? t(locale, nameKey) : ide.name,
          desc: t(locale, descKey) !== descKey ? t(locale, descKey) : `Open in ${ide.name}`,
          icon: getIDEIcon(ideId),
          iconClass: 'ide',
          action: () => window.api.actionOpenIDE(session.projectPath, ideId)
        });
      }
    }
  }

  // Fallback: if no actions configured, show defaults
  if (visibleActions.length === 0) {
    visibleActions.push(
      builtinActions.commit,
      builtinActions.createPR,
      builtinActions.worktree,
      builtinActions.finder,
      builtinActions.terminal
    );
  }

  return (
    <div className="sidebar-right">
      {settings.showFilesPanel && <div className="files-panel">
        <div className="sidebar-header">
          <div className="sidebar-header-row">
            <span>{t(locale, 'files.title')}</span>
            <span className="files-count">
              {modifiedFiles.length} {modifiedFiles.length !== 1 ? t(locale, 'files.countPlural') : t(locale, 'files.count')}
              {stagedCount > 0 && ` (${stagedCount} ${t(locale, 'files.staged')})`}
            </span>
          </div>
        </div>

        {modifiedFiles.length === 0 ? (
          <div className="files-empty">{t(locale, 'files.noChanges')}</div>
        ) : (
          <div className="files-list" onClick={() => setFilePicker(null)}>
            {modifiedFiles.map((file, i) => (
              <div
                key={`${file.path}-${i}`}
                className="file-item file-clickable"
                onClick={(e) => handleFileClick(e, file.path)}
                title={`${file.path}\n(click to open in IDE)`}
              >
                <span className={`file-status-badge ${file.status}`}>
                  {STATUS_LABELS[file.status] || '?'}
                </span>
                <span className="file-name">
                  {file.path.split('/').pop() || file.path}
                </span>
                <span className="file-dir" title={file.path}>
                  {file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : ''}
                </span>
                {file.staged && <span className="file-staged">{t(locale, 'files.staged')}</span>}
              </div>
            ))}
          </div>
        )}
      </div>}

      {settings.showActionsPanel && (
        <div className="actions-panel">
          <div className="sidebar-header">{t(locale, 'actions.title')}</div>
          <div className="actions-list">
            {visibleActions.map((action) => (
              <button key={action.id} className="action-btn" onClick={action.action}>
                <span className={`action-icon ${action.iconClass}`}>{action.icon}</span>
                <span className="action-label">
                  <span className="action-name">{action.name}</span>
                  <span className="action-desc">{action.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* IDE picker popup */}
      {filePicker && (
        <div className="ide-picker" style={{ top: filePicker.y, left: filePicker.x }}>
          <div className="ide-picker-header">Open in...</div>
          {enabledIDEs.map(ide => (
            <button
              key={ide.id}
              className="ide-picker-item"
              onClick={() => openFileInIDE(ide.id)}
            >
              {getIDEIcon(ide.id, 14)}
              <span>{ide.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
