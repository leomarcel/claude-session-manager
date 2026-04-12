import React from 'react';
import { Locale, t } from '../i18n';

interface Props {
  version: string;
  onInstall: () => void;
  onDismiss: () => void;
  locale: Locale;
}

export function UpdateToast({ version, onInstall, onDismiss, locale }: Props) {
  return (
    <div className="update-toast">
      <div className="update-toast-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7,10 12,15 17,10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </div>
      <div className="update-toast-body">
        <div className="update-toast-title">{t(locale, 'updater.title')}</div>
        <div className="update-toast-version">v{version} {t(locale, 'updater.ready')}</div>
      </div>
      <div className="update-toast-actions">
        <button className="update-toast-btn secondary" onClick={onDismiss}>
          {t(locale, 'updater.later')}
        </button>
        <button className="update-toast-btn primary" onClick={onInstall}>
          {t(locale, 'updater.install')}
        </button>
      </div>
    </div>
  );
}
