import React, { useEffect, useState } from 'react';
import { Locale, t } from '../i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  locale: Locale;
}

const REPO_URL = 'https://github.com/leomarcel/claude-session-manager';
const ISSUES_URL = 'https://github.com/leomarcel/claude-session-manager/issues/new';

export function AboutDialog({ isOpen, onClose, locale }: Props) {
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    window.api.getAppVersion().then(setVersion).catch(() => setVersion('?'));
  }, [isOpen]);

  if (!isOpen) return null;

  const openExternal = (url: string) => {
    window.api.openExternal(url).catch(() => {});
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="about-dialog" onClick={e => e.stopPropagation()}>
        <button className="settings-close about-close" onClick={onClose}>&times;</button>
        <img
          src="assets/mascotte_claude.png"
          alt="Claude Session Manager"
          width={88}
          height={88}
          className="about-logo"
        />
        <h2 className="about-title">Claude Session Manager</h2>
        <div className="about-version">v{version || '…'}</div>
        <p className="about-tagline">{t(locale, 'about.tagline')}</p>

        <div className="about-divider" />

        <div className="about-meta">
          <div className="about-meta-row">
            <span className="about-meta-label">{t(locale, 'about.author')}</span>
            <span className="about-meta-value">Leo Marcel</span>
          </div>
          <div className="about-meta-row">
            <span className="about-meta-label">{t(locale, 'about.license')}</span>
            <span className="about-meta-value">MIT</span>
          </div>
          <div className="about-meta-row">
            <span className="about-meta-label">{t(locale, 'about.runtime')}</span>
            <span className="about-meta-value">Electron · React · TypeScript</span>
          </div>
        </div>

        <div className="about-actions">
          <button className="settings-btn secondary" onClick={() => openExternal(REPO_URL)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            {t(locale, 'about.repo')}
          </button>
          <button className="settings-btn primary" onClick={() => openExternal(ISSUES_URL)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {t(locale, 'about.feedback')}
          </button>
        </div>
      </div>
    </div>
  );
}
