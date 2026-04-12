# TODO

## UI / UX

- [x] Scrollbar custom partout (fichiers modifies, actions rapides, session list, logs, modals)
- [x] Ajouter un bouton '+' a cote de chaque projet pour creer un claude code dans ce projet
- [x] +Note et +History dans la tab bar, meme style que +Terminal
- [x] Filter panel redesign (status en haut, switch group-by-status, liste projets)
- [x] Refresh button avec animation spinning
- [ ] Keyboard shortcuts (Cmd+1/2/3 pour switcher de session, Cmd+T nouveau terminal, Cmd+W fermer tab)
- [ ] Drag-and-drop pour reordonner les actions rapides dans les settings
- [ ] Session tags/labels avec couleurs
- [ ] Split view (deux terminaux cote a cote)
- [ ] Animation de transition quand on switch de session

## Features

- [x] Auto-updater (electron-updater via GitHub Releases, toast "Redemarrer" + tab Updates dans settings)
- [x] Integrer un petit outil de notes (tab Notes persistee sur disque dans ~/.claude-session-manager/notes/)
- [x] Integrer le changement de branche depuis l'app, avec option de creer un worktree ou non
- [x] Worktrees : badge '(worktree)' dans la liste des sessions a gauche + branche + path dans les details
- [ ] Windows / Linux support
- [ ] Usage metrics graph par projet (historique d'utilisation)
- [ ] GitHub integration (PRs ouvertes, issues dans le panneau droit)
- [ ] Saved prompt snippets (prompts reutilisables)
- [ ] Session history timeline (historique des conversations)
- [ ] Export de session en Markdown

## Terminal

- [x] Appliquer le terminal preset (Standard/iTerm2/Minimal) au rendu xterm.js
- [x] Appliquer le fontSize configurable au terminal
- [x] Light theme pour le terminal integre (quand theme = light)
- [ ] Personnaliser le fond du terminal (couleur, opacite, image de fond)

## Claude Code integration

- [x] Detection en temps reel de l'etat de chaque session (running / tool_executing / waiting_input / idle / completed / crashed / disconnected) via parsing du JSONL + pairing tool_use/tool_result + detection process alive
- [x] liveDetail contextuel ("Read(App.tsx)", "Bash(npm)", "Edit(styles.css)") affiche sous le status
- [ ] Phase 2 live status : tapper le buffer PTY des tabs Claude in-app pour extraire les thinking words (Pondering, Cogitating...) et l'etat TUI exact
- [ ] Onglet "Claude Code" dans les settings pour gerer Claude directement depuis l'app (model, effort level, permissions, hooks, plugins, system prompt, MCP servers, allowed/disallowed tools, etc.)
- [ ] Lire et ecrire dans ~/.claude/settings.json et ~/.claude/settings.local.json
- [ ] Visualiser et editer les CLAUDE.md de chaque projet

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

## Technique

- [x] Notarization macOS (Apple Developer ID + notarytool via hook afterSign)
- [x] Release pipeline : `npm run release` signe + notarise + upload DMG/ZIP/latest-mac.yml en draft sur GitHub
- [ ] Shared types entre main et renderer (eviter la duplication)
- [ ] Tests unitaires (session detector, git manager, token tracker parser)
- [ ] CI/CD GitHub Actions (build + release automatique sur push tag)
