/**
 * Application State Module
 * Manages project path, Atlas status, and UI state
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let currentProjectPath = null;
let isCurrentProjectAtlas = false;
let onProjectChangeCallbacks = [];
let onAtlasStatusChangeCallbacks = [];
let onAtlasInitializedCallbacks = [];
let multiTerminalUI = null; // Reference to MultiTerminalUI instance

// UI Elements
let pathElement = null;
let startClaudeBtn = null;
let fileExplorerHeader = null;
let initializeAtlasBtn = null;

/**
 * Initialize state module
 */
function init(elements) {
  pathElement = elements.pathElement || document.getElementById('project-path');
  startClaudeBtn = elements.startClaudeBtn || document.getElementById('btn-start-claude');
  fileExplorerHeader = elements.fileExplorerHeader || document.getElementById('file-explorer-header');
  initializeAtlasBtn = elements.initializeAtlasBtn || document.getElementById('btn-initialize-atlas');

  setupIPC();

  // Periodic check for Atlas project status (every 5 seconds)
  setInterval(() => {
    if (currentProjectPath) {
      ipcRenderer.send(IPC.CHECK_IS_ATLAS_PROJECT, currentProjectPath);
    }
  }, 5000);
}

/**
 * Get current project path
 */
function getProjectPath() {
  return currentProjectPath;
}

/**
 * Set MultiTerminalUI reference for terminal session management
 */
function setMultiTerminalUI(ui) {
  multiTerminalUI = ui;
}

/**
 * Set project path and switch terminal session
 */
function setProjectPath(path) {
  // Prevent setting the same path repeatedly
  if (path === currentProjectPath) {
    return;
  }

  const previousPath = currentProjectPath;
  currentProjectPath = path;
  updateProjectUI();

  // Switch terminal session if MultiTerminalUI is available
  if (multiTerminalUI) {
    // Switch to the new project's terminals
    multiTerminalUI.setCurrentProject(path);
  }

  // Check if it's an Atlas project
  if (path) {
    ipcRenderer.send(IPC.CHECK_IS_ATLAS_PROJECT, path);
  } else {
    setIsAtlasProject(false);
  }

  // Notify listeners
  onProjectChangeCallbacks.forEach(cb => cb(path, previousPath));
}

/**
 * Register callback for project change
 */
function onProjectChange(callback) {
  onProjectChangeCallbacks.push(callback);
}

/**
 * Get Atlas project status
 */
function getIsAtlasProject() {
  return isCurrentProjectAtlas;
}

/**
 * Set Atlas project status
 */
function setIsAtlasProject(isAtlas) {
  isCurrentProjectAtlas = isAtlas;
  updateAtlasUI();

  // Notify listeners
  onAtlasStatusChangeCallbacks.forEach(cb => cb(isAtlas));
}

/**
 * Register callback for Atlas status change
 */
function onAtlasStatusChange(callback) {
  onAtlasStatusChangeCallbacks.push(callback);
}

/**
 * Register callback for Atlas project initialized
 */
function onAtlasInitialized(callback) {
  onAtlasInitializedCallbacks.push(callback);
}

/**
 * Update Atlas-related UI
 */
function updateAtlasUI() {
  if (initializeAtlasBtn) {
    // Show "Initialize as Atlas" button only for non-Atlas projects
    if (currentProjectPath && !isCurrentProjectAtlas) {
      initializeAtlasBtn.style.display = 'block';
    } else {
      initializeAtlasBtn.style.display = 'none';
    }
  }
}

/**
 * Initialize current project as Atlas project
 */
function initializeAsAtlasProject() {
  if (currentProjectPath) {
    const projectName = currentProjectPath.split('/').pop() || currentProjectPath.split('\\').pop();
    ipcRenderer.send(IPC.INITIALIZE_ATLAS_PROJECT, {
      projectPath: currentProjectPath,
      projectName: projectName
    });
  }
}

/**
 * Update project UI elements
 */
function updateProjectUI() {
  if (currentProjectPath) {
    if (pathElement) {
      pathElement.textContent = currentProjectPath;
      pathElement.style.color = '#569cd6';
    }
    if (startClaudeBtn) {
      startClaudeBtn.disabled = false;
    }
    if (fileExplorerHeader) {
      fileExplorerHeader.style.display = 'block';
    }
  } else {
    if (pathElement) {
      pathElement.textContent = 'No project selected';
      pathElement.style.color = '#666';
    }
    if (startClaudeBtn) {
      startClaudeBtn.disabled = true;
    }
    if (fileExplorerHeader) {
      fileExplorerHeader.style.display = 'none';
    }
  }
}

/**
 * Request folder selection
 */
function selectProjectFolder() {
  ipcRenderer.send(IPC.SELECT_PROJECT_FOLDER);
}

/**
 * Request new project creation
 */
function createNewProject() {
  ipcRenderer.send(IPC.CREATE_NEW_PROJECT);
}

/**
 * Setup IPC listeners
 */
let ipcSetup = false;
function setupIPC() {
  // Prevent duplicate listeners
  if (ipcSetup) return;
  ipcSetup = true;

  ipcRenderer.on(IPC.PROJECT_SELECTED, (event, projectPath) => {
    setProjectPath(projectPath);
    // Terminal session switching is now handled by setProjectPath via multiTerminalUI
  });

  ipcRenderer.on(IPC.IS_ATLAS_PROJECT_RESULT, (event, { projectPath, isAtlas }) => {
    if (projectPath === currentProjectPath) {
      setIsAtlasProject(isAtlas);
    }
  });

  ipcRenderer.on(IPC.ATLAS_PROJECT_INITIALIZED, (event, { projectPath, success }) => {
    if (success && projectPath === currentProjectPath) {
      setIsAtlasProject(true);
      // Notify listeners
      onAtlasInitializedCallbacks.forEach(cb => cb(projectPath));
    }
  });
}

module.exports = {
  init,
  getProjectPath,
  setProjectPath,
  setMultiTerminalUI,
  onProjectChange,
  updateProjectUI,
  selectProjectFolder,
  createNewProject,
  getIsAtlasProject,
  setIsAtlasProject,
  onAtlasStatusChange,
  onAtlasInitialized,
  initializeAsAtlasProject
};
