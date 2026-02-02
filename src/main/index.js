/**
 * Main Process Entry Point
 * Initializes Electron app, creates window, loads modules
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { IPC } = require('../shared/ipcChannels');

// Import modules
const pty = require('./pty');
const ptyManager = require('./ptyManager');
const menu = require('./menu');
const dialogs = require('./dialogs');
const fileTree = require('./fileTree');
const promptLogger = require('./promptLogger');
const workspace = require('./workspace');
const frameProject = require('./frameProject');
const fileEditor = require('./fileEditor');
const tasksManager = require('./tasksManager');
const pluginsManager = require('./pluginsManager');
const githubManager = require('./githubManager');
const settingsManager = require('./settingsManager');
const sessionManager = require('./sessionManager');
const templatesManager = require('./templatesManager');
const gitManager = require('./gitManager');
const agentsManager = require('./agentsManager');
const skillsManager = require('./skillsManager');
const mcpManager = require('./mcpManager');
const diffManager = require('./diffManager');
const contextManager = require('./contextManager');

let mainWindow = null;

/**
 * Create main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    backgroundColor: '#1e1e1e',
    title: 'Atlas'
  });

  mainWindow.loadFile('index.html');

  // Open DevTools only in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    pty.killPTY();
    ptyManager.destroyAll();
    mainWindow = null;
  });

  // Initialize modules with window reference
  pty.init(mainWindow);
  ptyManager.init(mainWindow);
  menu.init(mainWindow, app);
  dialogs.init(mainWindow, (projectPath) => {
    pty.setProjectPath(projectPath);
  });
  initModulesWithWindow(mainWindow);

  // Create application menu
  menu.createMenu();

  return mainWindow;
}

/**
 * Setup all IPC handlers
 */
function setupAllIPC() {
  // Setup module IPC handlers
  pty.setupIPC(ipcMain);
  ptyManager.setupIPC(ipcMain);
  dialogs.setupIPC(ipcMain);
  fileTree.setupIPC(ipcMain);
  promptLogger.setupIPC(ipcMain);
  workspace.setupIPC(ipcMain);
  frameProject.setupIPC(ipcMain);
  fileEditor.setupIPC(ipcMain);
  tasksManager.setupIPC(ipcMain);
  pluginsManager.setupIPC(ipcMain);
  githubManager.setupIPC(ipcMain);
  settingsManager.setupIPC(ipcMain);
  sessionManager.setupIPC(ipcMain);
  templatesManager.setupIPC(ipcMain);
  gitManager.setupIPC(ipcMain);
  agentsManager.setupIPC(ipcMain);
  skillsManager.setupIPC(ipcMain);
  mcpManager.setupIPC(ipcMain);
  diffManager.setupIPC(ipcMain);
  contextManager.setupIPC(ipcMain);

  // Terminal input handler (needs prompt logger integration)
  ipcMain.on(IPC.TERMINAL_INPUT, (event, data) => {
    pty.writeToPTY(data);
    promptLogger.logInput(data);
  });
}

/**
 * Initialize application
 */
function init() {
  // Initialize prompt logger with app paths
  promptLogger.init(app);

  // Setup IPC handlers
  setupAllIPC();
}

/**
 * Initialize modules that need window reference
 */
function initModulesWithWindow(window) {
  workspace.init(app, window);
  frameProject.init(window);
  fileEditor.init(window);
  tasksManager.init(window);
  pluginsManager.init(window);
  githubManager.init(window);
  settingsManager.init(window);
  sessionManager.init(window);
  templatesManager.init(window);
  gitManager.init(window);
  agentsManager.init(window);
  skillsManager.init(window);
  mcpManager.init(window);
  diffManager.init(window);
  contextManager.init(window);
}

// App lifecycle
app.whenReady().then(() => {
  // macOS menu bar displays "Atlas"
  app.setName('Atlas');

  init();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

module.exports = { createWindow };
