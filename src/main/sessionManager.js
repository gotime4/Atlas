/**
 * Session Manager
 * Handles saving and restoring project sessions
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { IPC } = require('../shared/ipcChannels');

const SETTINGS_DIR = path.join(os.homedir(), '.atlas');
const SESSION_FILE = path.join(SETTINGS_DIR, 'session.json');

let mainWindow = null;

// Default session structure
const DEFAULT_SESSION = {
  savedAt: null,
  openProjects: [],
  activeProject: null,
  recentProjects: []
};

/**
 * Ensure settings directory exists
 */
function ensureSettingsDir() {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

/**
 * Load session from disk
 */
function loadSession() {
  ensureSettingsDir();
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = fs.readFileSync(SESSION_FILE, 'utf8');
      const session = JSON.parse(data);
      // Validate that projects still exist
      if (session.openProjects) {
        session.openProjects = session.openProjects.filter(p => fs.existsSync(p));
      }
      if (session.recentProjects) {
        session.recentProjects = session.recentProjects.filter(p => fs.existsSync(p.path));
      }
      if (session.activeProject && !fs.existsSync(session.activeProject)) {
        session.activeProject = session.openProjects[0] || null;
      }
      return session;
    }
  } catch (err) {
    console.error('Error loading session:', err);
  }
  return { ...DEFAULT_SESSION };
}

/**
 * Save session to disk
 */
function saveSession(session) {
  ensureSettingsDir();
  try {
    session.savedAt = new Date().toISOString();
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving session:', err);
    return false;
  }
}

/**
 * Add a project to recent projects
 */
function addToRecentProjects(projectPath) {
  const session = loadSession();
  const projectName = path.basename(projectPath);

  // Remove if already exists
  session.recentProjects = session.recentProjects.filter(p => p.path !== projectPath);

  // Add to front
  session.recentProjects.unshift({
    path: projectPath,
    name: projectName,
    lastOpened: new Date().toISOString()
  });

  // Keep only last 10
  session.recentProjects = session.recentProjects.slice(0, 10);

  saveSession(session);
  return session.recentProjects;
}

/**
 * Update active project in session
 */
function setActiveProject(projectPath) {
  const session = loadSession();
  session.activeProject = projectPath;

  // Also add to open projects if not already there
  if (!session.openProjects.includes(projectPath)) {
    session.openProjects.push(projectPath);
  }

  // Add to recent
  addToRecentProjects(projectPath);

  saveSession(session);
  return session;
}

/**
 * Get recent projects
 */
function getRecentProjects(limit = 10) {
  const session = loadSession();
  return session.recentProjects.slice(0, limit);
}

/**
 * Initialize module with window reference
 */
function init(window) {
  mainWindow = window;
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  // Load session
  ipcMain.on(IPC.LOAD_SESSION, (event) => {
    const session = loadSession();
    event.sender.send(IPC.SESSION_DATA, session);
  });

  // Save session
  ipcMain.on(IPC.SAVE_SESSION, (event, sessionData) => {
    const currentSession = loadSession();
    const mergedSession = { ...currentSession, ...sessionData };

    // Update recent projects if active project changed
    if (sessionData.activeProject) {
      addToRecentProjects(sessionData.activeProject);
    }

    saveSession(mergedSession);
    event.sender.send(IPC.SESSION_DATA, mergedSession);
  });
}

module.exports = {
  init,
  setupIPC,
  loadSession,
  saveSession,
  addToRecentProjects,
  setActiveProject,
  getRecentProjects
};
