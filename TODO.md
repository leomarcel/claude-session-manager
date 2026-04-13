# TODO

## UI / UX

- [x] Scrollbar custom partout (fichiers modifies, actions rapides, session list, logs, modals)
- [x] Ajouter un bouton '+' a cote de chaque projet pour creer un claude code dans ce projet
- [x] +Note et +History dans la tab bar, meme style que +Terminal
- [x] Filter panel redesign (status en haut, switch group-by-status, liste projets)
- [x] Refresh button avec animation spinning
- [x] Keyboard shortcuts (Cmd+1-5 pour switcher de session, Cmd+T nouveau terminal, Cmd+Shift+T nouveau claude, Cmd+W fermer tab, Cmd+\ split view, Cmd+, settings)
- [x] Drag-and-drop pour reordonner les actions rapides dans les settings
- [x] Session tags/labels avec couleurs (kanban flags v1.0.8, customisables depuis Settings > Flags)
- [x] Split view (deux terminaux cote a cote, Cmd+\)
- [x] Theme Auto (suit l'apparence systeme macOS, mise a jour live via matchMedia)
- [x] Theme UI separe du theme Terminal (Settings > General)
- [x] Splash screen et loading overlays adaptes au theme light/dark
- [x] Modal Settings agrandie (920x88vh)
- [x] Animation de transition quand on switch de session (slide-in 250ms sur le wrapper header+tabs)
- [x] Customiser les raccourcis clavier (Settings > Raccourcis clavier, click-to-record)
- [x] Settings modal en pleine ecran (sous la titlebar, garde acces aux boutons macOS)

## Features

- [x] Auto-updater (electron-updater via GitHub Releases, toast "Redemarrer" + tab Updates dans settings)
- [x] Integrer un petit outil de notes (tab Notes persistee sur disque dans ~/.claude-session-manager/notes/)
- [x] Integrer le changement de branche depuis l'app, avec option de creer un worktree ou non
- [x] Worktrees : badge '(worktree)' dans la liste des sessions a gauche + branche + path dans les details
- [x] Saved prompt snippets — bibliotheque de prompts reutilisables, bouton dans le header du tab Claude qui insere le contenu dans le pty (v1.0.9), edites depuis Settings > Snippets
- [x] Export de session en Markdown — clic droit > Exporter en Markdown, parse le JSONL complet et genere un .md formate avec save dialog natif (v1.0.9)
- [x] Action "Reconnecter la session" dans le clic droit (kill + respawn du pty Claude)
- [x] Action "Voir l'historique" dans le clic droit (ouvre le tab History sans spawner Claude)
- [x] Action "Supprimer definitivement" — kill process + rm JSONL + rm meta entry
- [x] Session history timeline — HistoryTabView affiche les messages user/Claude en chronologie via getSessionHistory
- [x] Usage metrics graph par projet — tab Usage avec SVG bar chart, periode 7/14/30/90j, metriques Tokens/Messages/Tools/Sessions, parsing JSONL pour agreger par jour
- [ ] Windows / Linux support
- [ ] GitHub integration (PRs ouvertes, issues dans le panneau droit)

## Terminal

- [x] Appliquer le terminal preset (Standard/iTerm2/Minimal) au rendu xterm.js
- [x] Appliquer le fontSize configurable au terminal
- [x] Light theme pour le terminal integre (quand theme = light)
- [x] Personnaliser le fond du terminal — couleur + opacite + image de fond (file picker dans Settings > Terminal)

## Claude Code integration

- [x] Detection en temps reel de l'etat de chaque session (running / tool_executing / waiting_input / idle / completed / crashed / disconnected) via parsing du JSONL + pairing tool_use/tool_result + detection process alive
- [x] liveDetail contextuel ("Read(App.tsx)", "Bash(npm)", "Edit(styles.css)") affiche sous le status
- [x] Onglet "Claude Code" dans les settings pour editer ~/.claude/settings.json et ~/.claude/settings.local.json (JSON editor avec validation + bouton format, v1.0.9)
- [x] Visualiser et editer les CLAUDE.md de chaque projet (tab dedie, autosave debounced, v1.0.9)
- [x] Support des settings.json par projet — 4 scopes (global, global-local, project, project-local) dans le tab Claude Code
- [x] Editeur structure pour Claude Code settings — toggle Structured/Raw, formulaires pour model, effortLevel, alwaysThinking, permissions (defaultMode + allowedTools + disallowedTools), MCP servers (add/edit/delete). Hooks et plugins restent en raw JSON
- [ ] Phase 2 live status : tapper le buffer PTY des tabs Claude in-app pour extraire les thinking words (Pondering, Cogitating...) et l'etat TUI exact

## Bugs connus

- [x] Git diff s'affiche en texte brut dans un shell tab — afficher un diff colore dans un tab custom
- [x] Le bouton refresh manuel des stats Claude dans la status bar ne declenche pas le fetch
- [x] En mode demo, le tray affiche les fake sessions au lieu de rien
- [x] En mode demo, cliquer sur une session selectionne toutes les sessions du meme projet au lieu d'une seule
- [x] Quand les panels sont inverses (sessions a droite), les boutons toggle de la status bar ne s'inversent pas et agissent sur le mauvais panel
- [x] L'app demande les permissions d'acces a tous les dossiers du Mac a l'ouverture (limite le scan aux dossiers du home)
- [x] Status actif/idle/busy des sessions pas fiable — detection live via JSONL (v1.0.3)
- [x] Notes perdues au redemarrage de l'app — migration de localStorage vers fichier sur disque (v1.0.4)
- [x] VS Code / Cursor / Sublime / Zed pas detectes si le CLI command n'est pas dans le PATH — fallback sur verification du bundle .app (v1.0.4)
- [x] PID plus affiche dans le header terminal — restaure a droite (v1.0.3)
- [x] PID figé sur "---" — selectedSession sync avec les refresh backend (v1.0.8)
- [x] Terminal Claude blanc apres restore d'app — lazy init du tab actif (v1.0.7)
- [x] Tab actif noir en light mode dans la tab bar (v1.0.7)
- [x] Context menu reste ouvert au clic exterieur — listener mousedown global + Escape + scroll (v1.0.5)
- [x] Rename input perdait le focus pendant un refresh — React key stable (v1.0.5)
- [x] Archive ne killait pas le process Claude — kill + cleanup tabs (v1.0.4)

## Technique

- [x] Notarization macOS (Apple Developer ID + notarytool via hook afterSign)
- [x] Release pipeline : `npm run release` signe + notarise + upload DMG/ZIP/latest-mac.yml en draft sur GitHub
- [ ] Tests unitaires (session detector, git manager, token tracker parser)
- [ ] CI/CD GitHub Actions (build + release automatique sur push tag)
