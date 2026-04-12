import React, { useState } from 'react';
import { ClaudeSession, TokenUsage } from '../types';
import { Locale, t } from '../i18n';
import { ClaudeIcon } from './Icons';

/** Convert "5am" → "5h" (fr) or keep "5am" (en). Handles "2pm", "Apr 14 at 6pm", etc. */
function formatReset(raw: string, locale: Locale): string {
  if (!raw) return '';
  if (locale === 'fr') {
    // "5am" → "5h00", "2pm" → "14h00", "Apr 14 at 6pm" → "14 avr. a 18h00"
    return raw
      .replace(/(\d{1,2})am/gi, (_m, h) => `${parseInt(h)}h00`)
      .replace(/(\d{1,2})pm/gi, (_m, h) => `${parseInt(h) + 12}h00`)
      .replace(/\bat\b/g, 'a')
      .replace(/\bJan\b/g, 'jan.').replace(/\bFeb\b/g, 'fev.')
      .replace(/\bMar\b/g, 'mars').replace(/\bApr\b/g, 'avr.')
      .replace(/\bMay\b/g, 'mai').replace(/\bJun\b/g, 'juin')
      .replace(/\bJul\b/g, 'juil.').replace(/\bAug\b/g, 'aout')
      .replace(/\bSep\b/g, 'sept.').replace(/\bOct\b/g, 'oct.')
      .replace(/\bNov\b/g, 'nov.').replace(/\bDec\b/g, 'dec.');
  }
  return raw;
}

interface Props {
  session: ClaudeSession | null;
  tokenUsage: TokenUsage | null;
  sessionCount: number;
  locale: Locale;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  onToggleLeftPanel: () => void;
  onToggleRightPanel: () => void;
  onRefreshUsage: () => void;
}

export function StatusBar({
  session, tokenUsage, sessionCount, locale,
  showLeftPanel, showRightPanel, onToggleLeftPanel, onToggleRightPanel, onRefreshUsage
}: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const getBarClass = (percent: number) => percent < 50 ? 'low' : percent < 80 ? 'medium' : 'high';
  const getColor = (percent: number) => percent < 50 ? 'var(--green)' : percent < 80 ? 'var(--yellow)' : 'var(--red)';

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefreshUsage();
    setRefreshing(false);
  };

  return (
    <div className="statusbar">
      {/* Toggle left panel */}
      <button
        className={`panel-toggle ${showLeftPanel ? 'active' : ''}`}
        onClick={onToggleLeftPanel}
        title={t(locale, 'status.panelSessions')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
      </button>

      <div className="status-item">
        <ClaudeIcon size={14} />
        <span className="status-value">
          {sessionCount} {sessionCount !== 1 ? t(locale, 'status.sessions') : t(locale, 'status.session')}
        </span>
      </div>

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

      {/* Credits bar */}
      <div className="credits-bar">
        {tokenUsage ? (
          <>
            <span className="credits-plan">{tokenUsage.plan}</span>

            {tokenUsage.rateLimited ? (
              /* Rate limited: just show the badge, no stats */
              <span className="credits-rate-limit" title="Claude API rate limited — using cached data">
                RATE LIMITED
              </span>
            ) : (
              /* Normal: show session + week stats */
              <>
                <div className="credits-stat-group">
                  <span className="credits-stat-label">{t(locale, 'status.sessionLabel')}</span>
                  <div className="credits-progress-mini">
                    <div className="credits-progress-track">
                      <div
                        className={`credits-progress-fill ${getBarClass(tokenUsage.sessionPercent)}`}
                        style={{ width: `${Math.min(tokenUsage.sessionPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="credits-usage" style={{ color: getColor(tokenUsage.sessionPercent) }}>
                    {tokenUsage.sessionPercent}%
                  </span>
                </div>

                <div className="credits-stat-group">
                  <span className="credits-stat-label">{t(locale, 'status.weekLabel')}</span>
                  <div className="credits-progress-mini">
                    <div className="credits-progress-track">
                      <div
                        className={`credits-progress-fill ${getBarClass(tokenUsage.weekPercent)}`}
                        style={{ width: `${Math.min(tokenUsage.weekPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="credits-usage" style={{ color: getColor(tokenUsage.weekPercent) }}>
                    {tokenUsage.weekPercent}%
                  </span>
                </div>
              </>
            )}

            {/* Extra usage (if present) */}
            {(tokenUsage.extraSpent || tokenUsage.extraPercent > 0) && (
              <div className="credits-stat-group">
                <span className="credits-stat-label">{t(locale, 'status.extraLabel')}</span>
                <span className="credits-usage" style={{ color: getColor(tokenUsage.extraPercent) }}>
                  {tokenUsage.extraSpent && tokenUsage.extraBudget
                    ? `${tokenUsage.extraSpent}/${tokenUsage.extraBudget}`
                    : `${tokenUsage.extraPercent}%`}
                </span>
              </div>
            )}

            {/* Reset countdown */}
            {tokenUsage.resetDate && (
              <div className="credits-reset">
                {t(locale, 'status.reset')} {formatReset(tokenUsage.resetDate, locale)}
              </div>
            )}

            {/* Refresh + last updated */}
            <button className={`credits-refresh ${refreshing ? 'spinning' : ''}`} onClick={handleRefresh} disabled={refreshing} title={t(locale, 'sidebar.refresh')}>
              &#x21bb;
            </button>
            {tokenUsage.lastUpdated && (
              <span className="credits-last-updated" title={t(locale, 'status.lastCheck')}>
                {tokenUsage.lastUpdated}
              </span>
            )}
          </>
        ) : (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{t(locale, 'status.loading')}</span>
        )}
      </div>

      {/* Toggle right panel */}
      <button
        className={`panel-toggle ${showRightPanel ? 'active' : ''}`}
        onClick={onToggleRightPanel}
        title={t(locale, 'status.panelFiles')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>
      </button>
    </div>
  );
}
