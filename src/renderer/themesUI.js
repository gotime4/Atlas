/**
 * Themes UI Module
 * Handles theme selection and application
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let themes = {};
let activeTheme = 'dark';
let themeSelectorElement = null;

/**
 * Initialize themes system
 */
function init() {
  createThemeSelector();
  setupIPC();
  loadThemes();
}

/**
 * Create theme selector dropdown in the sidebar header
 */
function createThemeSelector() {
  // Find or create the settings area
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Check if theme selector already exists
  themeSelectorElement = document.getElementById('theme-selector-container');
  if (themeSelectorElement) return;

  // Create theme selector container
  themeSelectorElement = document.createElement('div');
  themeSelectorElement.id = 'theme-selector-container';
  themeSelectorElement.className = 'theme-selector-container';
  themeSelectorElement.innerHTML = `
    <button class="theme-selector-btn" title="Change theme">
      <span class="theme-icon">🎨</span>
      <span class="theme-label">Theme</span>
    </button>
    <div class="theme-dropdown hidden">
      <div class="theme-dropdown-header">Select Theme</div>
      <div class="theme-options"></div>
    </div>
  `;

  // Insert at the bottom of sidebar before the resize handle
  const resizeHandle = sidebar.querySelector('.sidebar-resize-handle');
  if (resizeHandle) {
    sidebar.insertBefore(themeSelectorElement, resizeHandle);
  } else {
    sidebar.appendChild(themeSelectorElement);
  }

  // Toggle dropdown
  const btn = themeSelectorElement.querySelector('.theme-selector-btn');
  const dropdown = themeSelectorElement.querySelector('.theme-dropdown');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!themeSelectorElement.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

/**
 * Load themes from backend
 */
function loadThemes() {
  ipcRenderer.send(IPC.LOAD_THEMES);
}

/**
 * Render theme options
 */
function renderThemeOptions() {
  const optionsContainer = document.querySelector('.theme-options');
  if (!optionsContainer) return;

  optionsContainer.innerHTML = '';

  Object.entries(themes).forEach(([themeId, theme]) => {
    const option = document.createElement('div');
    option.className = `theme-option ${themeId === activeTheme ? 'active' : ''}`;
    option.dataset.themeId = themeId;

    // Color preview
    const preview = document.createElement('div');
    preview.className = 'theme-preview';
    preview.style.background = `linear-gradient(135deg,
      ${theme.colors['bg-primary']} 0%,
      ${theme.colors['bg-secondary']} 50%,
      ${theme.colors['accent-primary']} 100%)`;
    option.appendChild(preview);

    // Theme name
    const name = document.createElement('span');
    name.className = 'theme-option-name';
    name.textContent = theme.name;
    option.appendChild(name);

    // Active indicator
    if (themeId === activeTheme) {
      const check = document.createElement('span');
      check.className = 'theme-active-check';
      check.textContent = '✓';
      option.appendChild(check);
    }

    option.addEventListener('click', () => {
      setTheme(themeId);
    });

    optionsContainer.appendChild(option);
  });
}

/**
 * Set active theme
 */
function setTheme(themeId) {
  ipcRenderer.send(IPC.SET_THEME, themeId);
}

/**
 * Apply theme to document
 */
function applyTheme(themeId, theme) {
  if (!theme || !theme.colors) return;

  activeTheme = themeId;
  const root = document.documentElement;

  // Apply CSS variables
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });

  // Set data attribute for theme-specific CSS
  root.setAttribute('data-theme', themeId);

  // Handle special cases for accent colors with alpha
  if (theme.colors['accent-primary']) {
    const accentRgb = hexToRgb(theme.colors['accent-primary']);
    if (accentRgb) {
      root.style.setProperty('--accent-subtle', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.15)`);
      root.style.setProperty('--accent-glow', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.08)`);
    }
  }

  // Update theme options to show new active state
  renderThemeOptions();
}

/**
 * Setup IPC listeners
 */
function setupIPC() {
  ipcRenderer.on(IPC.THEMES_DATA, (event, { themes: loadedThemes, activeTheme: savedTheme }) => {
    themes = loadedThemes;
    activeTheme = savedTheme || 'dark';
    renderThemeOptions();
    // Apply saved theme
    if (themes[activeTheme]) {
      applyTheme(activeTheme, themes[activeTheme]);
    }
  });

  ipcRenderer.on(IPC.THEME_UPDATED, (event, { themeId, theme }) => {
    applyTheme(themeId, theme);
    // Close dropdown after selection
    const dropdown = document.querySelector('.theme-dropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
  });
}

/**
 * Get current theme ID
 */
function getCurrentTheme() {
  return activeTheme;
}

/**
 * Get all available themes
 */
function getThemes() {
  return themes;
}

/**
 * Helper: Convert hex to RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

module.exports = {
  init,
  loadThemes,
  setTheme,
  getCurrentTheme,
  getThemes
};
