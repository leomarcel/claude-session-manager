import { ClaudeSession, ModifiedFile, TokenUsage } from './types';

export const DEMO_SESSIONS: ClaudeSession[] = [
  {
    pid: 12345,
    projectPath: '/Users/demo/projects/my-saas-app',
    projectName: 'my-saas-app',
    model: 'Claude Opus 4',
    status: 'active',
    liveStatus: 'running',
    liveDetail: 'Task(refactor auth middleware)',
    startTime: new Date().toISOString(),
    command: 'claude',
    conversationId: 'demo-1',
    firstPrompt: 'Refactor the authentication middleware to use JWT tokens instead of sessions',
    summary: 'JWT auth refactor',
    messageCount: 47,
    gitBranch: 'feature/jwt-auth',
  },
  {
    pid: 12346,
    projectPath: '/Users/demo/projects/mobile-app',
    projectName: 'mobile-app',
    model: 'Claude Sonnet 4',
    status: 'busy',
    liveStatus: 'tool_executing',
    liveDetail: 'Edit(ThemeProvider.tsx)',
    startTime: new Date(Date.now() - 3600000).toISOString(),
    command: 'claude',
    conversationId: 'demo-2',
    firstPrompt: 'Add dark mode support to all screens with system preference detection',
    summary: 'Dark mode implementation',
    messageCount: 123,
    gitBranch: 'feature/dark-mode',
  },
  {
    pid: 12347,
    projectPath: '/Users/demo/projects/api-gateway',
    projectName: 'api-gateway',
    model: 'Claude Opus 4',
    status: 'idle',
    liveStatus: 'waiting_input',
    liveDetail: 'Should I also update the rate limit for authenticated endpoints?',
    startTime: new Date(Date.now() - 7200000).toISOString(),
    command: 'claude',
    conversationId: 'demo-3',
    firstPrompt: 'Fix rate limiting bug that allows burst requests to bypass the throttle',
    summary: 'Rate limit fix',
    messageCount: 31,
    gitBranch: 'fix/rate-limit',
  },
  {
    pid: 12348,
    projectPath: '/Users/demo/projects/my-saas-app',
    projectName: 'my-saas-app',
    model: 'Claude Opus 4',
    status: 'idle',
    liveStatus: 'completed',
    startTime: new Date(Date.now() - 86400000).toISOString(),
    command: 'claude',
    conversationId: 'demo-4',
    firstPrompt: 'Write unit tests for the payment processing module',
    summary: 'Payment tests',
    messageCount: 89,
    gitBranch: 'test/payments',
  },
  {
    pid: 12349,
    projectPath: '/Users/demo/projects/landing-page',
    projectName: 'landing-page',
    model: 'Claude Sonnet 4',
    status: 'idle',
    liveStatus: 'idle',
    startTime: new Date(Date.now() - 172800000).toISOString(),
    command: 'claude',
    conversationId: 'demo-5',
    firstPrompt: 'Create an animated hero section with a gradient background and floating particles',
    summary: 'Hero section redesign',
    messageCount: 15,
    gitBranch: 'design/hero-v2',
  },
  {
    pid: 12350,
    projectPath: '/Users/demo/projects/api-gateway',
    projectName: 'api-gateway',
    model: 'Claude Opus 4',
    status: 'active',
    liveStatus: 'disconnected',
    startTime: new Date(Date.now() - 1800000).toISOString(),
    command: 'claude',
    conversationId: 'demo-6',
    firstPrompt: 'Add OpenTelemetry tracing to all HTTP handlers',
    summary: 'Observability setup',
    messageCount: 56,
    gitBranch: 'feat/otel-tracing',
  },
];

export const DEMO_FILES: ModifiedFile[] = [
  { path: 'src/auth/middleware.ts', status: 'modified', staged: true },
  { path: 'src/auth/jwt.ts', status: 'added', staged: true },
  { path: 'src/auth/session.ts', status: 'deleted', staged: false },
  { path: 'src/config/auth.config.ts', status: 'modified', staged: false },
  { path: 'tests/auth/jwt.test.ts', status: 'added', staged: false },
  { path: 'package.json', status: 'modified', staged: true },
  { path: '.env.example', status: 'modified', staged: false },
  { path: 'src/routes/login.ts', status: 'modified', staged: false },
  { path: 'README.md', status: 'modified', staged: false },
];

export const DEMO_TOKEN_USAGE: TokenUsage = {
  plan: 'Max (5x)',
  rateLimited: false,
  lastUpdated: new Date().toLocaleTimeString(),
  sessionPercent: 68,
  sessionReset: '5am',
  weekPercent: 35,
  weekReset: '2pm',
  weekSonnetPercent: 12,
  extraPercent: 27,
  extraSpent: '$5.40',
  extraBudget: '$20.00',
  extraReset: 'May 1',
  percentUsed: 68,
  resetDate: '5am',
  model: 'Claude Opus 4',
  raw: '',
};

export const DEMO_DIFF = `diff --git a/src/auth/middleware.ts b/src/auth/middleware.ts
index 3a4b5c6..7d8e9f0 100644
--- a/src/auth/middleware.ts
+++ b/src/auth/middleware.ts
@@ -1,12 +1,18 @@
-import { Session } from './session';
+import { verifyToken } from './jwt';
+import { JWTPayload } from '../types/auth';

 export function authMiddleware(req, res, next) {
-  const sessionId = req.cookies.session_id;
-  if (!sessionId) {
+  const authHeader = req.headers.authorization;
+  if (!authHeader?.startsWith('Bearer ')) {
     return res.status(401).json({ error: 'Unauthorized' });
   }

-  const session = Session.find(sessionId);
-  if (!session || session.isExpired()) {
-    return res.status(401).json({ error: 'Session expired' });
+  const token = authHeader.slice(7);
+  try {
+    const payload: JWTPayload = verifyToken(token);
+    req.user = payload;
+    next();
+  } catch (err) {
+    return res.status(401).json({ error: 'Invalid token' });
   }
-
-  req.user = session.user;
-  next();
 }`;
