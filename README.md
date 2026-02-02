# Atlas

A lightweight, IDE-style desktop application built specifically for working with [Claude Code](https://claude.ai/code). Think VS Code, but streamlined for Claude Code workflows.

![Atlas Screenshot](docs/readmeScreenshot.png)

## What is this?

Atlas is a project management IDE for Claude Code that aims to:

1. **Bring a standard to Claude Code projects** - Consistent project structure with CLAUDE.md, STRUCTURE.json, PROJECT_NOTES.md, and tasks.json
2. **Improve context and memory problems as projects grow** - Automatic context preservation, session notes, and decision tracking
3. **Make project management easier** - Visual task management, MCP servers, GitHub integration, and streamlined workflows

This is an Electron-based desktop application that combines:
- **Project Explorer** (left panel) - Browse projects and files with a collapsible tree view
- **Multi-Terminal** (center) - Multiple terminal instances with tabs or grid view
- **Side Panels** (right) - GitHub, Tasks, Context, MCP servers, Plugins, and more

The key innovation: **Claude Code launches directly in your selected project directory**, so you don't need to `cd` around. Just select a project, click "Start Claude Code", and you're ready to go.

## Features

### Core Features
- **IDE Layout** - Multi-panel design with resizable sections
- **Real Terminal** - Full PTY support via node-pty (not a fake terminal)
- **Multi-Terminal** - Up to 9 terminals with tab or grid view
- **File Tree** - Collapsible folders, filters node_modules automatically
- **File Editor** - Overlay editor for quick file viewing/editing
- **Project-Aware** - Terminal starts in your selected project directory
- **Cross-Platform** - Windows, macOS, Linux support

### Right Panel Features
Access these via the toolbar buttons: Tasks, Plugins, GitHub, Agents, Skills, MCPs

- **GitHub Panel** - View repository info, pull requests, issues, and recent commits
- **MCP Panel** - Manage Model Context Protocol servers (Playwright, Filesystem, etc.)
- **Tasks Panel** - Visual task management with filters and status tracking
- **Context Panel** - Track token usage and pin important files to context
- **Plugins Panel** - Browse and manage Claude Code plugins
- **Agents Panel** - View available Claude Code agents
- **Skills Panel** - Browse Claude Code skills and slash commands
- **Templates Panel** - Save and reuse prompt templates
- **History Panel** - View command history with timestamps

### Multi-Terminal Features
- **Tab View** - Default view with terminal tabs
- **Grid View** - 2x1, 2x2, 3x1, 3x2, 3x3 layouts
- **Resizable Grid** - Drag borders to resize grid cells
- **Terminal Naming** - Double-click tab to rename terminals
- **Maximum 9 Terminals** - Manage multiple sessions efficiently

### Atlas Project Management
When you initialize a project as an "Atlas project", it creates:
- `CLAUDE.md` - Instructions for Claude Code to read at session start
- `STRUCTURE.json` - Project architecture map
- `PROJECT_NOTES.md` - Session notes and decisions
- `tasks.json` - Task tracking

These files help Claude understand your project and maintain context across sessions.

### Keyboard Shortcuts
| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Start Claude Code | `Cmd+Enter` | `Ctrl+Enter` |
| New terminal | `Cmd+T` | `Ctrl+Shift+T` |
| Close terminal | `Cmd+W` | `Ctrl+Shift+W` |
| Toggle file explorer | `Cmd+B` | `Ctrl+B` |
| Toggle GitHub panel | `Cmd+G` | `Ctrl+Shift+G` |
| Clear terminal | `Cmd+K` | `Ctrl+K` |
| Next terminal | `Cmd+Tab` | `Ctrl+Tab` |
| Switch to terminal 1-9 | `Cmd+1-9` | `Ctrl+1-9` |

## Installation

### Download (Recommended)

#### macOS
1. Download `Atlas-x.x.x-arm64.dmg` from [Releases](https://github.com/gotime4/Atlas/releases)
2. Open the DMG and drag Atlas to Applications
3. Right-click Atlas and select "Open" (first time only, to bypass Gatekeeper)

#### Windows
1. Download `Atlas Setup x.x.x.exe` from [Releases](https://github.com/gotime4/Atlas/releases)
2. Run the installer

### Requirements

#### 1. Claude Code CLI (Required)
```bash
npm install -g @anthropic-ai/claude-code
```
You'll need a Claude Pro/Max subscription or API key. See [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code).

#### 2. Git (Required for Git features)
Most Macs have Git pre-installed. Check with:
```bash
git --version
```

If not installed:
```bash
# macOS
xcode-select --install

# Windows - download from https://git-scm.com/
```

Configure your identity (required for commits):
```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

#### 3. GitHub CLI (Optional, for GitHub panel features)
```bash
# macOS
brew install gh

# Windows
winget install GitHub.cli
```

Then authenticate:
```bash
gh auth login
```

### Build from Source

```bash
# Clone the repo
git clone https://github.com/gotime4/Atlas.git
cd Atlas

# Install dependencies
npm install

# Run the app
npm start

# Build distributables
npm run dist:mac    # macOS DMG
npm run dist:win    # Windows EXE
```

## Usage

### Basic Workflow

1. **Launch Atlas** - Run `npm start` or open the app
2. **Add a project** - Click "Select Project Folder" or drag a folder
3. **Start Claude Code** - Click the green "Start Claude Code" button
4. **Use side panels** - Click toolbar buttons (Tasks, GitHub, MCPs, etc.)

### Managing MCP Servers

1. Click the **MCPs** button in the toolbar
2. Click **+ Add** to add a new MCP server
3. Choose from templates (Playwright, Filesystem, etc.) or add custom
4. Toggle servers on/off as needed

Example - Add Playwright for browser automation:
```bash
claude mcp add playwright npx @playwright/mcp@latest
```

### GitHub Integration

1. Make sure `gh` CLI is installed and authenticated
2. Click the **GitHub** button in the toolbar
3. View repo info, PRs, issues, and recent commits
4. Click on PRs or issues to see details

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Desktop Framework | Electron 28 |
| Terminal Emulator | xterm.js 5.3 |
| PTY | node-pty 1.0 |
| Bundler | esbuild |
| UI | HTML/CSS/JS |

## Troubleshooting

### "claude: command not found"
Install Claude Code CLI:
```bash
npm install -g @anthropic-ai/claude-code
```

### "Cannot find module 'node-pty'"
Run:
```bash
npm install
```

### GitHub panel shows errors
Make sure GitHub CLI is installed and authenticated:
```bash
gh auth login
```

### MCP server won't connect
Check the command is correct and the package is available via npx.

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](./LICENSE) file

## Acknowledgments

- Built with [Claude Code](https://claude.ai/code) (meta!)
- Terminal powered by [xterm.js](https://xtermjs.org/)
- PTY via [node-pty](https://github.com/microsoft/node-pty)
- Inspired by VS Code's terminal

---

**Last Updated**: February 2, 2026
**Author**: Built in collaboration with Claude Code
