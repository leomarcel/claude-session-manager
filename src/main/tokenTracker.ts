import * as os from 'os';
import { logger } from './logger';

let pty: any;
try { pty = require('node-pty'); } catch {}

export interface TokenUsage {
  plan: string;
  rateLimited: boolean;
  lastUpdated: string;
  sessionPercent: number;
  sessionReset: string;
  weekPercent: number;
  weekReset: string;
  weekSonnetPercent: number;
  extraPercent: number;
  extraSpent: string;
  extraBudget: string;
  extraReset: string;
  percentUsed: number;
  resetDate: string;
  model: string;
  raw: string;
}

export class TokenTracker {
  private cachedUsage: TokenUsage | null = null;
  private lastFetch = 0;
  private fetching = false;

  async getUsage(cacheTtlMs: number = 120_000): Promise<TokenUsage> {
    const now = Date.now();

    if (this.cachedUsage && now - this.lastFetch < cacheTtlMs) {
      return this.cachedUsage;
    }

    if (this.fetching && this.cachedUsage) {
      return this.cachedUsage;
    }

    try {
      this.fetching = true;
      logger.add('debug', 'usage', 'Fetching usage via /usage command...');
      const rawOutput = await this.runUsageCommand();

      // Check for rate limit error in raw output
      if (rawOutput.includes('rate_limit') || rawOutput.includes('Rate limited')) {
        logger.add('warn', 'usage', 'Rate limited by Claude API');
        const rateLimitResult = this.cachedUsage
          ? { ...this.cachedUsage, rateLimited: true }
          : { ...this.getDefault(), rateLimited: true };
        // Don't update lastFetch — retry sooner next time
        return rateLimitResult;
      }

      const parsed = this.parseUsageOutput(rawOutput);
      parsed.lastUpdated = new Date().toLocaleTimeString();
      this.cachedUsage = parsed;
      this.lastFetch = now;
      logger.add('info', 'usage', `Usage: session=${parsed.sessionPercent}%, week=${parsed.weekPercent}%, extra=${parsed.extraSpent || 'n/a'}, reset=${parsed.sessionReset}`);
      return parsed;
    } catch (err) {
      logger.add('warn', 'usage', `Failed to fetch usage: ${err}`);
      return this.cachedUsage || this.getDefault();
    } finally {
      this.fetching = false;
    }
  }

  private runUsageCommand(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!pty) {
        reject(new Error('node-pty not available'));
        return;
      }

      const shell = '/bin/zsh';
      const homedir = os.homedir();
      const existingPath = process.env.PATH || '';
      const extraPaths = [`${homedir}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
      const fullPath = [...new Set([...existingPath.split(':'), ...extraPaths])].join(':');

      const proc = pty.spawn(shell, ['-l', '-c', 'exec claude'], {
        name: 'dumb',
        cols: 200,
        rows: 30,
        cwd: homedir,
        env: {
          ...process.env,
          PATH: fullPath,
          TERM: 'dumb',
          NO_COLOR: '1',
          HOME: homedir,
          SHELL: shell,
          LANG: process.env.LANG || 'en_US.UTF-8'
        }
      });

      let output = '';
      let usageSent = false;
      let usageOutput = '';
      let collectingUsage = false;
      let resolvedOrRejected = false;
      let collectingTimer: ReturnType<typeof setTimeout> | null = null;

      const done = (result: string | null, error?: string) => {
        if (resolvedOrRejected) return;
        resolvedOrRejected = true;
        clearTimeout(timeout);
        try { proc.kill(); } catch {}
        if (result) resolve(result);
        else reject(new Error(error || 'Unknown error'));
      };

      const timeout = setTimeout(() => {
        done(usageOutput || null, 'Timeout waiting for /usage');
      }, 20000);

      proc.onData((data: string) => {
        output += data;

        if (!usageSent && output.includes('\u276F')) {
          usageSent = true;
          setTimeout(() => {
            proc.write('/usage\r');
            collectingUsage = true;
          }, 500);
        }

        if (collectingUsage) {
          usageOutput += data;

          // We need at least 3 percentage values to have a complete output
          const percentCount = (usageOutput.match(/\d+%/g) || []).length;
          if (percentCount >= 3) {
            if (collectingTimer) clearTimeout(collectingTimer);
            collectingTimer = setTimeout(() => done(usageOutput), 1500);
          }
        }
      });

      proc.onExit(() => {
        done(usageOutput || null, 'Claude exited before /usage completed');
      });
    });
  }

  private parseUsageOutput(raw: string): TokenUsage {
    // Step 1: Strip ANSI escape sequences
    let clean = raw
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b[><=\(][^\r\n]*/g, '')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

    // Step 2: Strip block/bar Unicode characters
    clean = clean.replace(/[█▌▐▛▜▝▘░▒▓▏▎▍▋▊▉]+/g, ' ');

    // Step 3: Split on \r to get individual "lines" from the TUI
    const segments = clean.split('\r')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const result = this.getDefault();
    result.raw = segments.join('\n');

    // Step 4: Walk through segments and extract data by context
    // The output structure is:
    //   "Curretsession" or "Current session"
    //   "68%used"
    //   "Reses5m (Europe/Paris)" or "Resets in 5m ..."
    //   "Currentweek(allmodels)" or "Current week (all models)"
    //   "36%used"
    //   "Resets2pm(Europe/Paris)" or similar
    //   "Currentweek(Sonnetonly)" or similar
    //   "0%used"
    //   ...
    //   "Extrausage" or "Extra usage"
    //   "27%used"
    //   "$5.40/$20.00spent..."

    type Section = 'none' | 'session' | 'week' | 'sonnet' | 'extra';
    let currentSection: Section = 'none';

    for (const seg of segments) {
      const lower = seg.toLowerCase().replace(/\s+/g, '');

      // Detect section transitions
      if (lower.includes('currentsession') || lower.includes('curretsession')) {
        currentSection = 'session';
        continue;
      }
      if ((lower.includes('currentweek') || lower.includes('curentweek')) && lower.includes('allmodel')) {
        currentSection = 'week';
        continue;
      }
      if ((lower.includes('currentweek') || lower.includes('curentweek')) && lower.includes('sonnet')) {
        currentSection = 'sonnet';
        continue;
      }
      if (lower.includes('extrausage') || lower.includes('extra usage')) {
        currentSection = 'extra';
        continue;
      }

      // Extract percentage
      const pctMatch = seg.match(/(\d+)%\s*used/i) || seg.match(/(\d+)%/);
      if (pctMatch) {
        const pct = parseInt(pctMatch[1], 10);
        switch (currentSection) {
          case 'session': result.sessionPercent = pct; break;
          case 'week': result.weekPercent = pct; break;
          case 'sonnet': result.weekSonnetPercent = pct; break;
          case 'extra': result.extraPercent = pct; break;
        }
      }

      // Extract reset info
      // Patterns: "Reses5am", "Resets5am", "Resets 2pm", "Resets Apr 14 at 6pm", "Resets in 5h 23m"
      const resetMatch = seg.match(/[Rr]es[ets]*\s*(?:in\s*)?(.+?)(?:\(|$)/);
      if (resetMatch) {
        let resetVal = resetMatch[1].trim();
        // Fix garbled "5m" that should be "5am" — if single digit + m and no h before, it's likely Xam
        resetVal = resetVal.replace(/^(\d{1,2})m$/, '$1am');
        // Fix garbled "2p" → "2pm"
        resetVal = resetVal.replace(/^(\d{1,2})p$/, '$1pm');
        if (resetVal && !resetVal.toLowerCase().startsWith('esc')) {
          switch (currentSection) {
            case 'session': result.sessionReset = resetVal; break;
            case 'week': result.weekReset = resetVal; break;
            case 'extra': result.extraReset = resetVal; break;
          }
        }
      }

      // Extract money
      const moneyMatch = seg.match(/\$([\d.]+)\s*\/\s*\$([\d.]+)/);
      if (moneyMatch) {
        result.extraSpent = `$${moneyMatch[1]}`;
        result.extraBudget = `$${moneyMatch[2]}`;
      }
    }

    // Set main display values
    result.percentUsed = result.sessionPercent;
    result.resetDate = result.sessionReset || '';

    return result;
  }

  private getDefault(): TokenUsage {
    return {
      plan: 'Max (5x)',
      rateLimited: false,
      lastUpdated: '',
      sessionPercent: 0, sessionReset: '',
      weekPercent: 0, weekReset: '',
      weekSonnetPercent: 0,
      extraPercent: 0, extraSpent: '', extraBudget: '', extraReset: '',
      percentUsed: 0, resetDate: '',
      model: 'Claude Opus 4', raw: '',
    };
  }
}
