import React from 'react';
import { ClaudeSession, TokenUsage } from '../types';
import { Locale, t } from '../i18n';
import { ClaudeIcon } from './Icons';

interface Props {
  session: ClaudeSession | null;
  tokenUsage: TokenUsage | null;
  sessionCount: number;
  locale: Locale;
}

export function StatusBar({ session, tokenUsage, sessionCount, locale }: Props) {
  const getBarClass = (percent: number) => percent < 50 ? 'low' : percent < 80 ? 'medium' : 'high';
  const getColor = (percent: number) => percent < 50 ? 'var(--green)' : percent < 80 ? 'var(--yellow)' : 'var(--red)';

  return (
    <div className="statusbar">
      {/* Left: sessions count */}
      <div className="status-item">
        <ClaudeIcon size={14} />
        <span className="status-value">
          {sessionCount} {sessionCount !== 1 ? t(locale, 'status.sessions') : t(locale, 'status.session')}
        </span>
      </div>

      {/* Current session info */}
      {session && (
        <>
          <div className="status-item">
            <span className="status-label">{t(locale, 'status.model')}:</span>
            <span className="status-value accent">{session.model}</span>
          </div>
          <div className="status-item">
            <span className={`status-dot-inline ${session.status}`} />
            <span className="status-value" style={{
              color: session.status === 'active' ? 'var(--green)' :
                     session.status === 'busy' ? 'var(--orange)' : 'var(--yellow)'
            }}>
              {session.status === 'active' ? t(locale, 'sidebar.active') :
               session.status === 'busy' ? t(locale, 'sidebar.busy') : t(locale, 'sidebar.idle')}
            </span>
          </div>
        </>
      )}

      {/* Right: usage credits bar */}
      <div className="credits-bar">
        {tokenUsage ? (
          <>
            {/* Plan badge */}
            <span className="credits-plan">{tokenUsage.plan}</span>

            {/* Activity stats */}
            <div className="credits-stats">
              <span className="credits-stat">
                <span className="credits-stat-value">{tokenUsage.totalMessages}</span>
                <span className="credits-stat-label">{t(locale, 'status.messages')}</span>
              </span>
              <span className="credits-stat-separator" />
              <span className="credits-stat">
                <span className="credits-stat-value">{tokenUsage.toolCalls}</span>
                <span className="credits-stat-label">{t(locale, 'status.tools')}</span>
              </span>
            </div>

            {/* Progress bar */}
            <div className="credits-progress">
              <div className="credits-progress-track">
                <div
                  className={`credits-progress-fill ${getBarClass(tokenUsage.percentUsed)}`}
                  style={{ width: `${Math.min(tokenUsage.percentUsed, 100)}%` }}
                />
              </div>
              <span className="credits-usage" style={{ color: getColor(tokenUsage.percentUsed) }}>
                {tokenUsage.percentUsed.toFixed(0)}%
              </span>
            </div>

            {/* Reset countdown */}
            {tokenUsage.resetDate && (
              <div className="credits-reset">
                {t(locale, 'status.reset')} {tokenUsage.resetDate}
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t(locale, 'status.loading')}</span>
        )}
      </div>
    </div>
  );
}
