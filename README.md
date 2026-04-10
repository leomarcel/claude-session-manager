<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-333?style=flat-square&logo=apple&logoColor=white" />
  <img src="https://img.shields.io/badge/electron-28-47848F?style=flat-square&logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/react-18-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/typescript-5-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
</p>

<h1 align="center">Claude Session Manager</h1>

<p align="center">
  <strong>A native macOS desktop app to manage all your Claude Code sessions across projects.</strong><br/>
  <em>Detect, resume, and control your AI-powered coding sessions from a single window.</em>
</p>

---

## Overview

Claude Session Manager is a graphical desktop application built for developers who use [Claude Code](https://claude.ai/code) across multiple projects simultaneously. Instead of juggling terminal windows, it gives you a unified dashboard to see all running sessions, resume previous conversations, manage git state, and launch quick actions — all in one place.

## Features

### Session Management
- **Auto-detection** of all active Claude Code sessions (running processes + stored sessions)
- **Session resume** — click a project and it launches `claude --resume <session-id>` automatically
- **Real-time status** — see which sessions are active, idle, or busy
- **Session metadata** — model used, message count, summary, git branch

### Integrated Terminal
- **Embedded terminal** (xterm.js + node-pty) runs Claude Code directly inside the app
- **Full color support** — 256-color and truecolor themes
- **Automatic resume** — reconnects to the most recent conversation for each project

### Git Integration
- **Modified files panel** — live `git status` showing staged/unstaged changes
- **Status badges** — M (modified), A (added), D (deleted), R (renamed), ? (untracked)
- **Branch display** in the terminal header

### Quick Actions
- **Commit** — opens interactive `git add -p && git commit`
- **Create PR** — launches `gh pr create --web`
- **Worktree** — manage git worktrees
- **Open in IDE** — PhpStorm, VS Code, Cursor, WebStorm, IntelliJ, Sublime Text, Zed, Xcode
- **Open in Finder / Terminal**
- **Fully customizable** — reorder, show/hide, per-IDE toggle

### Settings
- **Language** — French / English (i18n)
- **IDE detection** — automatically scans for installed editors
- **Custom actions** — toggle visibility and reorder all quick actions
- **Refresh interval** — configurable polling frequency

### Token Usage
- **Credits bar** in the status bar showing plan, usage %, remaining tokens, and reset date
- **Color-coded** — green/yellow/red based on consumption

### Native macOS Experience
- **Hidden inset title bar** with vibrancy
- **Dark translucent theme** designed for macOS
- **SF Mono** font for the terminal
- **Lightweight** — reads session files directly, minimal subprocess usage

---

## Installation

### Prerequisites

- **macOS** 12+ (Monterey or later)
- **Node.js** 18+ and npm
- **Claude Code CLI** installed and authenticated (`claude` command available)

### From source

```bash
# Clone the repository
git clone https://github.com/your-username/claude-session-manager.git
cd claude-session-manager

# Install dependencies
npm install

# Rebuild native modules for Electron
npx electron-rebuild

# Build and launch
npm start
```

### Development

```bash
# Watch mode (auto-rebuild renderer on changes)
npm run dev

# Build only
npm run build

# Run with DevTools open
npm run dev:main -- --dev
```

---

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── main.ts              # App entry, IPC handlers, window creation
│   ├── preload.ts           # Secure context bridge (contextIsolation)
│   ├── sessionDetector.ts   # Reads ~/.claude/ to find sessions
│   ├── gitManager.ts        # Git status, branch, PR/commit actions
│   ├── ptyManager.ts        # node-pty terminal management
│   ├── tokenTracker.ts      # Claude API usage tracking
│   └── settingsStore.ts     # Persistent settings (~/.claude-session-manager/)
└── renderer/                # React frontend
    ├── App.tsx              # Root component with state management
    ├── types.ts             # Shared TypeScript interfaces
    ├── styles.css           # Full CSS with CSS variables
    ├── i18n/                # Internationalization (fr/en)
    └── components/
        ├── SessionSidebar   # Left panel — session list
        ├── TerminalPanel    # Center — embedded xterm.js
        ├── RightSidebar     # Right — files + quick actions
        ├── StatusBar        # Bottom — model, status, credits
        ├── SettingsPanel    # Modal — language, IDEs, actions
        └── Icons            # SVG icons (Claude, VS Code, etc.)
```

### How session detection works

1. **Active processes**: reads `~/.claude/sessions/*.json` files (PID-indexed), checks if the process is alive via `process.kill(pid, 0)` (zero overhead)
2. **Stored sessions**: scans `~/.claude/projects/<encoded-path>/` directories, reads `sessions-index.json` for metadata, or falls back to the latest `.jsonl` file
3. **Merging**: active process info enriches stored session data (status, PID)

No heavy subprocess calls (`pgrep`, `lsof`, `ps`) — everything is read from the filesystem.

---

## Configuration

Settings are stored in `~/.claude-session-manager/settings.json`.

| Setting | Default | Description |
|---------|---------|-------------|
| `locale` | `"fr"` | Interface language (`"fr"` or `"en"`) |
| `refreshInterval` | `15` | Session list refresh interval in seconds |
| `ides` | auto-detected | List of IDEs with `enabled` toggle |
| `quickActions` | all visible | Action visibility and ordering |

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create a branch**: `git checkout -b feature/my-feature`
3. **Make your changes** and test locally with `npm start`
4. **Commit**: `git commit -m "Add my feature"`
5. **Push**: `git push origin feature/my-feature`
6. **Open a Pull Request**

### Ideas for contributions

- [ ] Windows / Linux support
- [ ] Light theme
- [ ] Drag-and-drop action reordering
- [ ] Custom terminal themes
- [ ] Session search/filter
- [ ] Keyboard shortcuts
- [ ] Tray icon with quick session switching
- [ ] Auto-updater
- [ ] Session history timeline
- [ ] Multi-language support (beyond fr/en)

### Code style

- TypeScript strict mode
- React functional components with hooks
- CSS variables for theming (no CSS-in-JS)
- `execFileSync` / `execFile` only (no `exec` for security)
- Context isolation enabled (no `nodeIntegration`)

---

## Security

- **Context isolation** is enabled — the renderer process cannot access Node.js APIs directly
- All system commands use `execFile` (not `exec`) to prevent shell injection
- The preload script exposes a minimal, typed API via `contextBridge`
- No telemetry, no network requests — everything runs locally

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with Claude Code by the community, for the community.</sub>
</p>
