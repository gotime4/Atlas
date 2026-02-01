/**
 * Settings & Themes Manager
 * Handles application settings and custom themes
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { IPC } = require('../shared/ipcChannels');

const SETTINGS_DIR = path.join(os.homedir(), '.atlas');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');
const THEMES_FILE = path.join(SETTINGS_DIR, 'themes.json');

let mainWindow = null;

// Default settings
const DEFAULT_SETTINGS = {
  theme: 'dark',
  recentProjectsLimit: 10,
  autoRestoreSession: true,
  showGitStatus: true,
  sidebarWidth: 250
};

// Built-in themes
const DEFAULT_THEMES = {
  dark: {
    name: 'Dark',
    colors: {
      'bg-deep': '#0f0f10',
      'bg-primary': '#151516',
      'bg-secondary': '#1a1a1c',
      'bg-tertiary': '#222225',
      'bg-elevated': '#28282c',
      'bg-hover': '#2e2e33',
      'text-primary': '#e8e6e3',
      'text-secondary': '#a09b94',
      'text-tertiary': '#6b6660',
      'text-muted': '#4a4642',
      'accent-primary': '#d4a574',
      'accent-secondary': '#c9956a',
      'success': '#7cb382',
      'warning': '#e0a458',
      'error': '#d47878',
      'info': '#78a5d4'
    }
  },
  light: {
    name: 'Light',
    colors: {
      'bg-deep': '#ffffff',
      'bg-primary': '#f8f8f8',
      'bg-secondary': '#f0f0f0',
      'bg-tertiary': '#e8e8e8',
      'bg-elevated': '#ffffff',
      'bg-hover': '#e0e0e0',
      'text-primary': '#1a1a1a',
      'text-secondary': '#4a4a4a',
      'text-tertiary': '#7a7a7a',
      'text-muted': '#9a9a9a',
      'accent-primary': '#b8860b',
      'accent-secondary': '#a0760a',
      'success': '#2e7d32',
      'warning': '#ed6c02',
      'error': '#d32f2f',
      'info': '#0288d1'
    }
  },
  midnight: {
    name: 'Midnight Blue',
    colors: {
      'bg-deep': '#0a0e14',
      'bg-primary': '#0d1117',
      'bg-secondary': '#161b22',
      'bg-tertiary': '#21262d',
      'bg-elevated': '#30363d',
      'bg-hover': '#3d444d',
      'text-primary': '#e6edf3',
      'text-secondary': '#8b949e',
      'text-tertiary': '#6e7681',
      'text-muted': '#484f58',
      'accent-primary': '#58a6ff',
      'accent-secondary': '#388bfd',
      'success': '#3fb950',
      'warning': '#d29922',
      'error': '#f85149',
      'info': '#58a6ff'
    }
  },
  forest: {
    name: 'Forest',
    colors: {
      'bg-deep': '#0b1210',
      'bg-primary': '#0f1a16',
      'bg-secondary': '#152420',
      'bg-tertiary': '#1c2f29',
      'bg-elevated': '#243b34',
      'bg-hover': '#2d4840',
      'text-primary': '#d8e8e0',
      'text-secondary': '#9ab8a8',
      'text-tertiary': '#6a8878',
      'text-muted': '#4a6858',
      'accent-primary': '#4ade80',
      'accent-secondary': '#22c55e',
      'success': '#4ade80',
      'warning': '#fbbf24',
      'error': '#f87171',
      'info': '#38bdf8'
    }
  }
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
 * Load settings from disk
 */
function loadSettings() {
  ensureSettingsDir();
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to disk
 */
function saveSettings(settings) {
  ensureSettingsDir();
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

/**
 * Load themes from disk (includes built-in + custom)
 */
function loadThemes() {
  ensureSettingsDir();
  let customThemes = {};
  try {
    if (fs.existsSync(THEMES_FILE)) {
      const data = fs.readFileSync(THEMES_FILE, 'utf8');
      customThemes = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading custom themes:', err);
  }
  return { ...DEFAULT_THEMES, ...customThemes };
}

/**
 * Save custom themes to disk
 */
function saveCustomTheme(themeId, theme) {
  ensureSettingsDir();
  try {
    let customThemes = {};
    if (fs.existsSync(THEMES_FILE)) {
      customThemes = JSON.parse(fs.readFileSync(THEMES_FILE, 'utf8'));
    }
    customThemes[themeId] = theme;
    fs.writeFileSync(THEMES_FILE, JSON.stringify(customThemes, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving custom theme:', err);
    return false;
  }
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
  // Load settings
  ipcMain.on(IPC.LOAD_SETTINGS, (event) => {
    const settings = loadSettings();
    event.sender.send(IPC.SETTINGS_DATA, settings);
  });

  // Update setting
  ipcMain.on(IPC.UPDATE_SETTING, (event, { key, value }) => {
    const settings = loadSettings();
    settings[key] = value;
    saveSettings(settings);
    event.sender.send(IPC.SETTING_UPDATED, { key, value });
  });

  // Load themes
  ipcMain.on(IPC.LOAD_THEMES, (event) => {
    const themes = loadThemes();
    const settings = loadSettings();
    event.sender.send(IPC.THEMES_DATA, { themes, activeTheme: settings.theme });
  });

  // Set theme
  ipcMain.on(IPC.SET_THEME, (event, themeId) => {
    const settings = loadSettings();
    settings.theme = themeId;
    saveSettings(settings);
    const themes = loadThemes();
    event.sender.send(IPC.THEME_UPDATED, { themeId, theme: themes[themeId] });
  });
}

module.exports = {
  init,
  setupIPC,
  loadSettings,
  saveSettings,
  loadThemes,
  saveCustomTheme
};
