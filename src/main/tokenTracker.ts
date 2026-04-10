import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TokenUsage {
  plan: string;
  // Activity in the current billing window (last 24h)
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  activeSessions: number;
  // Totals
  totalMessages: number;
  // Legacy fields for UI compatibility
  tokensUsed: number;
  tokensLimit: number;
  tokensRemaining: number;
  percentUsed: number;
  resetDate: string;
  model: string;
}

export class TokenTracker {
  private claudeDir: string;
  private projectsDir: string;

  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude');
    this.projectsDir = path.join(this.claudeDir, 'projects');
  }

  async getUsage(): Promise<TokenUsage> {
    const plan = this.detectPlan();
    const activity = this.getRecentActivity();
    const totalMessages = activity.userMessages + activity.assistantMessages;

    // Estimate usage percentage based on known plan limits
    // Max 5x plan: ~45 Opus messages/5h or ~225 Sonnet messages/5h (approximate)
    // We use message count as proxy since exact token counts aren't locally available
    const estimatedLimit = plan.includes('Max') ? 1000 : plan.includes('Pro') ? 500 : 200;
    const percentUsed = Math.min((totalMessages / estimatedLimit) * 100, 100);
    const resetDate = this.getResetTime();

    return {
      plan,
      userMessages: activity.userMessages,
      assistantMessages: activity.assistantMessages,
      toolCalls: activity.toolCalls,
      activeSessions: activity.activeSessions,
      totalMessages,
      tokensUsed: totalMessages,
      tokensLimit: estimatedLimit,
      tokensRemaining: Math.max(estimatedLimit - totalMessages, 0),
      percentUsed,
      resetDate,
      model: activity.lastModel || 'Claude Opus 4',
    };
  }

  private detectPlan(): string {
    // Try to detect from statsig cache or settings
    try {
      const statsigDir = path.join(this.claudeDir, 'statsig');
      const files = fs.readdirSync(statsigDir).filter(f => f.startsWith('statsig.cached.evaluations'));
      if (files.length > 0) {
        const content = fs.readFileSync(path.join(statsigDir, files[0]), 'utf-8');
        // Look for plan indicators in the cached evaluations
        if (content.includes('"max"') || content.includes('max_plan')) return 'Max (5x)';
        if (content.includes('"pro"') || content.includes('pro_plan')) return 'Pro';
      }
    } catch {}

    // Default assumption for Claude Code CLI users
    return 'Max (5x)';
  }

  private getResetTime(): string {
    // Anthropic billing windows reset every 5 hours
    const now = new Date();
    const hours = now.getUTCHours();
    // Reset happens at 0, 5, 10, 15, 20 UTC
    const nextReset = Math.ceil((hours + 1) / 5) * 5;
    const resetDate = new Date(now);
    resetDate.setUTCHours(nextReset % 24, 0, 0, 0);
    if (nextReset <= hours) {
      resetDate.setUTCDate(resetDate.getUTCDate() + 1);
    }

    const diff = resetDate.getTime() - now.getTime();
    const diffH = Math.floor(diff / (1000 * 60 * 60));
    const diffM = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${diffH}h ${diffM}m`;
  }

  private getRecentActivity(): {
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    activeSessions: number;
    lastModel: string | null;
  } {
    let userMessages = 0;
    let assistantMessages = 0;
    let toolCalls = 0;
    const sessionIds = new Set<string>();
    let lastModel: string | null = null;

    // 5-hour window matching Anthropic's billing reset
    const now = new Date();
    const hours = now.getUTCHours();
    const windowStart = Math.floor(hours / 5) * 5;
    const windowDate = new Date(now);
    windowDate.setUTCHours(windowStart, 0, 0, 0);
    if (windowDate > now) {
      windowDate.setUTCDate(windowDate.getUTCDate() - 1);
    }
    const cutoffTs = windowDate.toISOString();

    if (!fs.existsSync(this.projectsDir)) {
      return { userMessages, assistantMessages, toolCalls, activeSessions: 0, lastModel };
    }

    try {
      const projects = fs.readdirSync(this.projectsDir);

      for (const proj of projects) {
        const projPath = path.join(this.projectsDir, proj);
        if (!fs.statSync(projPath).isDirectory()) continue;

        let jsonlFiles: string[];
        try {
          jsonlFiles = fs.readdirSync(projPath).filter(f => f.endsWith('.jsonl'));
        } catch { continue; }

        for (const jf of jsonlFiles) {
          const filePath = path.join(projPath, jf);
          try {
            const stat = fs.statSync(filePath);
            // Skip files not modified in current window
            if (stat.mtime < windowDate) continue;

            // Read file and count entries in the current window
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            for (const line of lines) {
              if (!line.trim()) continue;
              try {
                const entry = JSON.parse(line);
                const ts = entry.timestamp;
                if (!ts || ts < cutoffTs) continue;

                const type = entry.type;
                if (type === 'user') {
                  userMessages++;
                  if (entry.sessionId) sessionIds.add(entry.sessionId);
                } else if (type === 'assistant') {
                  assistantMessages++;
                  if (entry.model) {
                    lastModel = entry.model.includes('opus') ? 'Claude Opus 4'
                      : entry.model.includes('haiku') ? 'Claude Haiku 4'
                      : 'Claude Sonnet 4';
                  }
                  // Count tool_use blocks
                  const msg = entry.message;
                  if (msg?.content && Array.isArray(msg.content)) {
                    for (const block of msg.content) {
                      if (block?.type === 'tool_use') toolCalls++;
                    }
                  }
                }
              } catch {}
            }
          } catch {}
        }
      }
    } catch {}

    return {
      userMessages,
      assistantMessages,
      toolCalls,
      activeSessions: sessionIds.size,
      lastModel,
    };
  }
}
