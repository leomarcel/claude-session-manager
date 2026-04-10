import React, { useState, useEffect } from 'react';
import { Locale, t } from '../i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string;
  filePath: string;
  locale: Locale;
}

export function DiffModal({ isOpen, onClose, projectPath, filePath, locale }: Props) {
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    window.api.getFileDiff(projectPath, filePath).then(d => {
      setDiff(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen, projectPath, filePath]);

  if (!isOpen) return null;

  const renderDiff = () => {
    if (!diff) return <div className="logs-empty">No diff</div>;
    return (
      <div className="diff-content">
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
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="diff-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{filePath}</h2>
          <button className="settings-close" onClick={onClose}>&times;</button>
        </div>
        <div className="diff-body">
          {loading ? (
            <div className="logs-empty">{t(locale, 'status.loading')}</div>
          ) : renderDiff()}
        </div>
        <div className="settings-footer">
          <div />
          <button className="settings-btn secondary" onClick={onClose}>
            {t(locale, 'settings.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
