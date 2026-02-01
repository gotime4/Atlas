/**
 * Session UI Module
 * Handles saving and restoring sessions
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let currentSession = null;
let onSessionLoadCallback = null;

/**
 * Initialize session management
 */
function init(onLoadCallback) {
  onSessionLoadCallback = onLoadCallback;
  setupIPC();
  loadSession();
}

/**
 * Load session from backend
 */
function loadSession() {
  ipcRenderer.send(IPC.LOAD_SESSION);
}

/**
 * Save current session
 */
function saveSession(sessionData) {
  currentSession = { ...currentSession, ...sessionData };
  ipcRenderer.send(IPC.SAVE_SESSION, currentSession);
}

/**
 * Update active project in session
 */
function setActiveProject(projectPath) {
  saveSession({
    activeProject: projectPath
  });
}

/**
 * Add project to open projects
 */
function addOpenProject(projectPath) {
  if (!currentSession) {
    currentSession = { openProjects: [], activeProject: null };
  }

  if (!currentSession.openProjects.includes(projectPath)) {
    currentSession.openProjects.push(projectPath);
  }

  saveSession({
    openProjects: currentSession.openProjects,
    activeProject: projectPath
  });
}

/**
 * Remove project from open projects
 */
function removeOpenProject(projectPath) {
  if (!currentSession || !currentSession.openProjects) return;

  currentSession.openProjects = currentSession.openProjects.filter(p => p !== projectPath);

  saveSession({
    openProjects: currentSession.openProjects
  });
}

/**
 * Get last active project
 */
function getLastActiveProject() {
  return currentSession?.activeProject || null;
}

/**
 * Get recent projects
 */
function getRecentProjects() {
  return currentSession?.recentProjects || [];
}

/**
 * Setup IPC listeners
 */
function setupIPC() {
  ipcRenderer.on(IPC.SESSION_DATA, (event, session) => {
    currentSession = session;

    if (onSessionLoadCallback && session) {
      onSessionLoadCallback(session);
    }
  });
}

/**
 * Get current session
 */
function getCurrentSession() {
  return currentSession;
}

module.exports = {
  init,
  loadSession,
  saveSession,
  setActiveProject,
  addOpenProject,
  removeOpenProject,
  getLastActiveProject,
  getRecentProjects,
  getCurrentSession
};
