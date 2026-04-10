import React from 'react';

const imgStyle = (size: number): React.CSSProperties => ({
  width: size,
  height: size,
  objectFit: 'contain',
  borderRadius: 3,
});

// Claude Code mascot (PNG)
export function ClaudeIcon({ size = 20 }: { size?: number }) {
  return <img src="assets/mascotte_claude.png" alt="Claude" style={imgStyle(size)} draggable={false} />;
}

// VS Code (PNG)
export function VSCodeIcon({ size = 20 }: { size?: number }) {
  return <img src="assets/vscode_logo.png" alt="VS Code" style={imgStyle(size)} draggable={false} />;
}

// PhpStorm (PNG)
export function PhpStormIcon({ size = 20 }: { size?: number }) {
  return <img src="assets/PhpStorm_logo.png" alt="PhpStorm" style={imgStyle(size)} draggable={false} />;
}

// IntelliJ IDEA (PNG)
export function IntelliJIcon({ size = 20 }: { size?: number }) {
  return <img src="assets/IntelliJ_IDEA_logo.png" alt="IntelliJ" style={imgStyle(size)} draggable={false} />;
}

// Finder (PNG)
export function FinderIcon({ size = 20 }: { size?: number }) {
  return <img src="assets/finder_logo.png" alt="Finder" style={imgStyle(size)} draggable={false} />;
}

// Git icon (SVG — no PNG asset)
export function GitIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M21.62 11.11l-8.73-8.73a1.3 1.3 0 00-1.84 0L9.22 4.21l2.32 2.32a1.55 1.55 0 011.96 1.97l2.24 2.24a1.55 1.55 0 011.1 2.66 1.55 1.55 0 01-2.63-1.4l-2.09-2.09v5.49a1.55 1.55 0 01.83 2.04 1.55 1.55 0 01-2.86-1.17 1.55 1.55 0 01.83-1.04V9.73a1.55 1.55 0 01-.84-2.03l-2.29-2.29-6.04 6.04a1.3 1.3 0 000 1.84l8.73 8.73a1.3 1.3 0 001.84 0l8.69-8.69a1.3 1.3 0 000-1.84z" fill="#F05032"/>
    </svg>
  );
}

// PR icon (SVG)
export function PRIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9580ff" strokeWidth="2" strokeLinecap="round">
      <circle cx="18" cy="18" r="3"/>
      <circle cx="6" cy="6" r="3"/>
      <path d="M13 6h3a2 2 0 012 2v7"/>
      <line x1="6" y1="9" x2="6" y2="21"/>
    </svg>
  );
}

// Worktree/branch icon (SVG)
export function WorktreeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#50e3a0" strokeWidth="2" strokeLinecap="round">
      <line x1="6" y1="3" x2="6" y2="15"/>
      <circle cx="18" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/>
      <path d="M18 9a9 9 0 01-9 9"/>
    </svg>
  );
}

// Terminal icon (SVG)
export function TerminalIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#a0a0b0" strokeWidth="2" strokeLinecap="round">
      <polyline points="4,17 10,11 4,5"/>
      <line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  );
}

// Session status indicator (SVG)
export function SessionIcon({ status, size = 16 }: { status: string; size?: number }) {
  const colors: Record<string, string> = {
    active: '#50e3a0',
    busy: '#ffab70',
    idle: '#ffd76a'
  };
  const color = colors[status] || '#666';

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="4" fill={color}/>
    </svg>
  );
}
