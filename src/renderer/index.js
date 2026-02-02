/**
 * Renderer Entry Point
 * Initializes all UI modules and sets up event handlers
 */

const terminal = require('./terminal');
const fileTreeUI = require('./fileTreeUI');
const historyPanel = require('./historyPanel');
const tasksPanel = require('./tasksPanel');
const pluginsPanel = require('./pluginsPanel');
const githubPanel = require('./githubPanel');
const state = require('./state');
const projectListUI = require('./projectListUI');
const editor = require('./editor');
const sidebarResize = require('./sidebarResize');
const themesUI = require('./themesUI');
const templatesPanel = require('./templatesPanel');
const sessionUI = require('./sessionUI');
const agentsPanel = require('./agentsPanel');
const skillsPanel = require('./skillsPanel');
const mcpPanel = require('./mcpPanel');
const diffPanel = require('./diffPanel');
const contextPanel = require('./contextPanel');

/**
 * Initialize all modules
 */
function init() {
  // Initialize terminal
  const multiTerminalUI = terminal.initTerminal('terminal');

  // Initialize state management
  state.init({
    pathElement: document.getElementById('project-path'),
    startClaudeBtn: document.getElementById('btn-start-claude'),
    fileExplorerHeader: document.getElementById('file-explorer-header'),
    initializeAtlasBtn: document.getElementById('btn-initialize-atlas')
  });

  // Connect state with multiTerminalUI for project-terminal session management
  state.setMultiTerminalUI(multiTerminalUI);

  // Initialize project list UI
  projectListUI.init('projects-list', (projectPath) => {
    state.setProjectPath(projectPath);
  });

  // Load projects from workspace
  projectListUI.loadProjects();

  // Initialize file tree UI
  fileTreeUI.init('file-tree', state.getProjectPath);
  fileTreeUI.setProjectPathGetter(state.getProjectPath);

  // Initialize editor with file tree refresh callback
  editor.init(() => {
    fileTreeUI.refreshFileTree();
  });

  // Connect file tree clicks to editor
  fileTreeUI.setOnFileClick((filePath, source) => {
    editor.openFile(filePath, source);
  });

  // Initialize history panel with terminal resize callback
  historyPanel.init('history-panel', 'history-content', () => {
    setTimeout(() => terminal.fitTerminal(), 50);
  });

  // Initialize tasks panel
  tasksPanel.init();

  // Initialize plugins panel
  pluginsPanel.init();

  // Initialize GitHub panel
  githubPanel.init();

  // Initialize agents panel
  agentsPanel.init();

  // Initialize skills panel
  skillsPanel.init();

  // Initialize MCP panel
  mcpPanel.init();

  // Initialize diff panel
  diffPanel.init();

  // Initialize context panel
  contextPanel.init();

  // Initialize sidebar resize
  sidebarResize.init(() => {
    terminal.fitTerminal();
  });

  // Initialize themes
  themesUI.init();

  // Initialize templates panel with callback to insert into terminal input
  templatesPanel.init((promptText) => {
    terminal.sendInput(promptText);
  });

  // Initialize session management
  sessionUI.init((session) => {
    // Restore last active project if available
    if (session.activeProject) {
      // Give UI a moment to render before selecting project
      setTimeout(() => {
        state.setProjectPath(session.activeProject);
      }, 200);
    }
  });

  // Setup state change listeners
  state.onProjectChange((projectPath, previousPath) => {
    if (projectPath) {
      fileTreeUI.loadFileTree(projectPath);

      // Add to workspace and update project list
      const projectName = projectPath.split('/').pop() || projectPath.split('\\').pop();
      projectListUI.addProject(projectPath, projectName, state.getIsAtlasProject());
      projectListUI.setActiveProject(projectPath);

      // Load tasks if tasks panel is visible
      if (tasksPanel.isVisible()) {
        tasksPanel.loadTasks();
      }

      // Save session with active project
      sessionUI.setActiveProject(projectPath);

      // Refresh git status for the project
      projectListUI.requestGitStatus(projectPath);

      // Update agents, skills, and MCP panels with new project path
      agentsPanel.setProjectPath(projectPath);
      skillsPanel.setProjectPath(projectPath);
      mcpPanel.setProjectPath(projectPath);
      diffPanel.setProjectPath(projectPath);
      contextPanel.setProjectPath(projectPath);
    } else {
      fileTreeUI.clearFileTree();
    }
  });

  // Setup Atlas status change listener
  state.onAtlasStatusChange((isAtlas) => {
    // Don't reload entire project list - just update the active project's badge if needed
    // The badge will be updated when the project list is next rendered
  });

  // Setup Atlas initialized listener
  state.onAtlasInitialized((projectPath) => {
    terminal.writelnToTerminal(`\x1b[1;32m✓ Atlas project initialized!\x1b[0m`);
    terminal.writelnToTerminal(`  Created: .atlas/, CLAUDE.md, STRUCTURE.json, PROJECT_NOTES.md, tasks.json, QUICKSTART.md`);
    // Refresh file tree to show new files
    fileTreeUI.refreshFileTree();
    // Load tasks for the new project
    tasksPanel.loadTasks();
  });

  // Setup button handlers
  setupButtonHandlers();

  // Setup keyboard shortcuts
  setupKeyboardShortcuts();

  // Setup window resize handler
  window.addEventListener('resize', () => {
    terminal.fitTerminal();
  });

  // Expose panel management globally for mutual exclusivity
  window.closeOtherRightPanels = closeOtherRightPanels;
}

/**
 * Close all right-side panels except the specified one
 * Used for mutual exclusivity between panels
 */
function closeOtherRightPanels(exceptPanel) {
  const rightPanels = {
    templates: templatesPanel,
    context: contextPanel,
    plugins: pluginsPanel,
    history: historyPanel
  };

  for (const [name, panel] of Object.entries(rightPanels)) {
    if (name !== exceptPanel && panel.isVisible && panel.isVisible()) {
      panel.hide();
    }
  }
}

/**
 * Setup button click handlers
 */
function setupButtonHandlers() {
  // Select project folder
  document.getElementById('btn-select-project').addEventListener('click', () => {
    state.selectProjectFolder();
  });

  // Create new project
  document.getElementById('btn-create-project').addEventListener('click', () => {
    state.createNewProject();
  });

  // Start Claude Code
  document.getElementById('btn-start-claude').addEventListener('click', async () => {
    const projectPath = state.getProjectPath();
    if (projectPath) {
      const newTerminalId = await terminal.restartTerminal(projectPath);
      
      if (newTerminalId) {
        // Ensure the new terminal is focused
        terminal.setActiveTerminal(newTerminalId);
        
        // Send command specifically to the new terminal
        setTimeout(() => {
          terminal.sendCommand('claude', newTerminalId);
        }, 1000);
      }
    }
  });

  // Refresh file tree
  document.getElementById('btn-refresh-tree').addEventListener('click', () => {
    fileTreeUI.refreshFileTree();
  });

  // Close history panel
  document.getElementById('history-close').addEventListener('click', () => {
    historyPanel.toggleHistoryPanel();
  });

  // Add project to workspace
  document.getElementById('btn-add-project').addEventListener('click', () => {
    state.selectProjectFolder();
  });

  // Initialize as Atlas project
  document.getElementById('btn-initialize-atlas').addEventListener('click', () => {
    state.initializeAsAtlasProject();
  });
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const modKey = e.ctrlKey || e.metaKey; // Support both Ctrl (Windows/Linux) and Cmd (macOS)
    const key = e.key.toLowerCase(); // Normalize key to lowercase

    // Ctrl/Cmd+Shift+H - Toggle history panel
    if (modKey && e.shiftKey && key === 'h') {
      e.preventDefault();
      historyPanel.toggleHistoryPanel();
    }
    // Ctrl/Cmd+Shift+P - Toggle plugins panel
    if (modKey && e.shiftKey && key === 'p') {
      e.preventDefault();
      pluginsPanel.toggle();
    }
    // Ctrl/Cmd+Shift+G - Toggle GitHub panel
    if (modKey && e.shiftKey && key === 'g') {
      e.preventDefault();
      githubPanel.toggle();
    }
    // Ctrl/Cmd+B - Toggle sidebar
    if (modKey && !e.shiftKey && key === 'b') {
      e.preventDefault();
      sidebarResize.toggle();
      terminal.fitTerminal();
    }
    // Ctrl/Cmd+Shift+[ - Previous project
    if (modKey && e.shiftKey && e.key === '[') {
      e.preventDefault();
      projectListUI.selectPrevProject();
    }
    // Ctrl/Cmd+Shift+] - Next project
    if (modKey && e.shiftKey && e.key === ']') {
      e.preventDefault();
      projectListUI.selectNextProject();
    }
    // Ctrl/Cmd+E - Focus project list
    if (modKey && !e.shiftKey && key === 'e') {
      e.preventDefault();
      fileTreeUI.blur();
      projectListUI.focus();
    }
    // Ctrl/Cmd+Shift+E - Focus file tree
    if (modKey && e.shiftKey && key === 'e') {
      e.preventDefault();
      projectListUI.blur();
      fileTreeUI.focus();
    }
    // Ctrl/Cmd+T - Toggle tasks panel
    if (modKey && !e.shiftKey && key === 't') {
      e.preventDefault();
      tasksPanel.toggle();
    }
    // Ctrl/Cmd+Shift+T - Toggle templates panel
    if (modKey && e.shiftKey && key === 't') {
      e.preventDefault();
      templatesPanel.toggle();
    }
    // Ctrl/Cmd+Shift+A - Toggle agents panel
    if (modKey && e.shiftKey && key === 'a') {
      e.preventDefault();
      agentsPanel.toggle();
    }
    // Ctrl/Cmd+Shift+S - Toggle skills panel
    if (modKey && e.shiftKey && key === 's') {
      e.preventDefault();
      skillsPanel.toggle();
    }
    // Ctrl/Cmd+Shift+M - Toggle MCP panel
    if (modKey && e.shiftKey && key === 'm') {
      e.preventDefault();
      mcpPanel.toggle();
    }
    // Ctrl/Cmd+Shift+D - Toggle Diff panel
    if (modKey && e.shiftKey && key === 'd') {
      e.preventDefault();
      diffPanel.toggle();
    }
    // Ctrl/Cmd+Shift+X - Toggle Context panel
    if (modKey && e.shiftKey && key === 'x') {
      e.preventDefault();
      contextPanel.toggle();
    }
  });
}

/**
 * Start application when DOM is ready
 */
window.addEventListener('load', () => {
  init();

  // Give a moment for terminal to fully render, then start PTY
  setTimeout(() => {
    terminal.startTerminal();
  }, 100);
});
