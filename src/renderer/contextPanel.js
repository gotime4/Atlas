/**
 * Context Panel
 * Visual panel for managing Claude's context - pinned files, token usage
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let panelElement = null;
let contentElement = null;
let contextUsage = null;
let suggestedFiles = [];
let currentProjectPath = null;
let showSuggestions = false;

/**
 * Initialize context panel
 */
function init() {
  panelElement = document.getElementById('context-panel');
  contentElement = document.getElementById('context-content');
  setupIPC();
  setupPanelEvents();
}

/**
 * Setup panel event handlers
 */
function setupPanelEvents() {
  const closeBtn = document.getElementById('context-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => toggle());
  }

  const collapseBtn = document.getElementById('context-collapse-btn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => toggle());
  }

  const refreshBtn = document.getElementById('context-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadContext());
  }

  const addBtn = document.getElementById('context-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => toggleSuggestions());
  }
}

/**
 * Toggle panel visibility
 */
function toggle() {
  if (!panelElement) return;

  const panelIsVisible = panelElement.classList.contains('visible');

  if (panelIsVisible) {
    panelElement.classList.remove('visible');
  } else {
    // Close other right-side panels for mutual exclusivity
    if (window.closeOtherRightPanels) {
      window.closeOtherRightPanels('context');
    }
    panelElement.classList.add('visible');
    loadContext();
  }
}

/**
 * Hide the panel
 */
function hide() {
  if (panelElement) {
    panelElement.classList.remove('visible');
  }
}

/**
 * Check if panel is visible
 */
function isVisible() {
  return panelElement && panelElement.classList.contains('visible');
}

/**
 * Set project path
 */
function setProjectPath(projectPath) {
  currentProjectPath = projectPath;
  if (isVisible()) {
    loadContext();
  }
}

/**
 * Load context data
 */
async function loadContext() {
  try {
    contextUsage = await ipcRenderer.invoke(IPC.GET_CONTEXT_USAGE, currentProjectPath);
    suggestedFiles = await ipcRenderer.invoke(IPC.GET_SUGGESTED_FILES, currentProjectPath);
    render();
  } catch (err) {
    console.error('Error loading context:', err);
    contextUsage = null;
    render();
  }
}

/**
 * Toggle suggestions view
 */
function toggleSuggestions() {
  showSuggestions = !showSuggestions;
  render();
}

/**
 * Render the panel
 */
function render() {
  if (!contentElement) return;

  if (!contextUsage) {
    contentElement.innerHTML = `
      <div class="context-empty">
        <p>Select a project to manage context</p>
      </div>
    `;
    return;
  }

  let html = '';

  // Token usage meter
  html += renderTokenMeter();

  // Suggestions panel
  if (showSuggestions) {
    html += renderSuggestions();
  } else {
    // Pinned files list
    html += renderPinnedFiles();
  }

  contentElement.innerHTML = html;
  setupItemEvents();
}

/**
 * Render token usage meter with breakdown
 */
function renderTokenMeter() {
  const percent = Math.min(contextUsage.percentUsed, 100);
  const colorClass = percent > 80 ? 'danger' : percent > 60 ? 'warning' : 'normal';
  const b = contextUsage.breakdown;

  return `
    <div class="context-meter">
      <div class="context-meter-header">
        <span class="context-meter-label">Context Usage</span>
        <span class="context-meter-value">${formatTokens(contextUsage.totalTokens)} / ${formatTokens(contextUsage.maxTokens)} (${percent}%)</span>
      </div>
      <div class="context-meter-bar">
        <div class="context-meter-fill ${colorClass}" style="width: ${percent}%"></div>
      </div>

      <div class="context-breakdown">
        <div class="context-breakdown-title">Estimated usage by category</div>
        <div class="context-breakdown-item">
          <span class="context-cat-icon" style="color: var(--info);">●</span>
          <span class="context-cat-name">System prompt:</span>
          <span class="context-cat-value">${formatTokens(b.systemPrompt.tokens)} (${b.systemPrompt.percent}%)</span>
        </div>
        <div class="context-breakdown-item">
          <span class="context-cat-icon" style="color: var(--warning);">●</span>
          <span class="context-cat-name">System tools:</span>
          <span class="context-cat-value">${formatTokens(b.systemTools.tokens)} (${b.systemTools.percent}%)</span>
        </div>
        ${b.mcpTools.tokens > 0 ? `
        <div class="context-breakdown-item">
          <span class="context-cat-icon" style="color: #9370db;">●</span>
          <span class="context-cat-name">MCP tools:</span>
          <span class="context-cat-value">${formatTokens(b.mcpTools.tokens)} (${b.mcpTools.percent}%)</span>
        </div>
        ` : ''}
        <div class="context-breakdown-item">
          <span class="context-cat-icon" style="color: var(--accent-primary);">●</span>
          <span class="context-cat-name">Memory files:</span>
          <span class="context-cat-value">${formatTokens(b.memory.tokens)} (${b.memory.percent}%)</span>
        </div>
        ${b.skills.tokens > 0 ? `
        <div class="context-breakdown-item">
          <span class="context-cat-icon" style="color: #ffc107;">●</span>
          <span class="context-cat-name">Skills:</span>
          <span class="context-cat-value">${formatTokens(b.skills.tokens)} (${b.skills.percent}%)</span>
        </div>
        ` : ''}
        ${b.agents.tokens > 0 ? `
        <div class="context-breakdown-item">
          <span class="context-cat-icon" style="color: #9370db;">●</span>
          <span class="context-cat-name">Agents:</span>
          <span class="context-cat-value">${formatTokens(b.agents.tokens)} (${b.agents.percent}%)</span>
        </div>
        ` : ''}
        ${b.pinned.tokens > 0 ? `
        <div class="context-breakdown-item">
          <span class="context-cat-icon" style="color: var(--success);">●</span>
          <span class="context-cat-name">Pinned files:</span>
          <span class="context-cat-value">${formatTokens(b.pinned.tokens)} (${b.pinned.percent}%)</span>
        </div>
        ` : ''}
        <div class="context-breakdown-item">
          <span class="context-cat-icon" style="color: var(--text-secondary);">◆</span>
          <span class="context-cat-name">Messages:</span>
          <span class="context-cat-value">${formatTokens(b.messages.tokens)} (${b.messages.percent}%)</span>
        </div>
        <div class="context-breakdown-item free">
          <span class="context-cat-icon" style="color: var(--text-tertiary);">○</span>
          <span class="context-cat-name">Free space:</span>
          <span class="context-cat-value">${formatTokens(b.freeSpace.tokens)} (${b.freeSpace.percent}%)</span>
        </div>
        <div class="context-breakdown-item buffer">
          <span class="context-cat-icon" style="color: var(--text-muted);">◌</span>
          <span class="context-cat-name">Autocompact buffer:</span>
          <span class="context-cat-value">${formatTokens(b.autocompactBuffer.tokens)} (${b.autocompactBuffer.percent}%)</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render pinned files list
 */
function renderPinnedFiles() {
  let html = '<div class="context-section">';
  html += '<div class="context-section-header">';
  html += '<h4>Pinned Files</h4>';
  html += `<button class="context-add-btn" id="context-show-suggestions">+ Add Files</button>`;
  html += '</div>';

  if (contextUsage.pinnedFiles.length === 0) {
    html += `
      <div class="context-empty-section">
        <p>No files pinned to context</p>
        <span>Pin important files to ensure Claude always has access to them</span>
      </div>
    `;
  } else {
    html += '<div class="context-file-list">';

    contextUsage.pinnedFiles.forEach(file => {
      const existsClass = file.exists ? '' : 'missing';
      html += `
        <div class="context-file-item ${existsClass}" data-path="${escapeHtml(file.path)}">
          <div class="context-file-info">
            <span class="context-file-icon">${file.exists ? '📄' : '⚠️'}</span>
            <span class="context-file-name">${escapeHtml(file.name)}</span>
            <span class="context-file-tokens">${formatTokens(file.tokens)} tokens</span>
          </div>
          <button class="context-unpin-btn" data-path="${escapeHtml(file.path)}" title="Unpin file">×</button>
        </div>
      `;
    });

    html += '</div>';
  }

  html += '</div>';
  return html;
}

/**
 * Render suggestions
 */
function renderSuggestions() {
  let html = '<div class="context-section">';
  html += '<div class="context-section-header">';
  html += '<h4>Suggested Files</h4>';
  html += `<button class="context-back-btn" id="context-hide-suggestions">← Back</button>`;
  html += '</div>';

  // Filter out already pinned files
  const pinnedPaths = new Set(contextUsage.pinnedFiles.map(f => f.path));
  const available = suggestedFiles.filter(f => !pinnedPaths.has(f.path));

  if (available.length === 0) {
    html += `
      <div class="context-empty-section">
        <p>All suggested files are already pinned</p>
      </div>
    `;
  } else {
    html += '<div class="context-file-list">';

    available.forEach(file => {
      html += `
        <div class="context-suggestion-item" data-path="${escapeHtml(file.path)}">
          <div class="context-file-info">
            <span class="context-file-icon">📄</span>
            <div class="context-suggestion-details">
              <span class="context-file-name">${escapeHtml(file.name)}</span>
              <span class="context-suggestion-reason">${escapeHtml(file.reason)}</span>
            </div>
            <span class="context-file-tokens">${formatTokens(file.tokens)}</span>
          </div>
          <button class="context-pin-btn" data-path="${escapeHtml(file.path)}" title="Pin file">+</button>
        </div>
      `;
    });

    html += '</div>';
  }

  // Custom file input
  html += `
    <div class="context-custom-pin">
      <p>Or enter a file path:</p>
      <div class="context-custom-input">
        <input type="text" id="context-custom-path" placeholder="/path/to/file.js" />
        <button class="btn btn-secondary" id="context-pin-custom">Pin</button>
      </div>
    </div>
  `;

  html += '</div>';
  return html;
}

/**
 * Setup item event handlers
 */
function setupItemEvents() {
  // Show suggestions
  const showSuggestionsBtn = document.getElementById('context-show-suggestions');
  if (showSuggestionsBtn) {
    showSuggestionsBtn.addEventListener('click', () => {
      showSuggestions = true;
      render();
    });
  }

  // Hide suggestions
  const hideSuggestionsBtn = document.getElementById('context-hide-suggestions');
  if (hideSuggestionsBtn) {
    hideSuggestionsBtn.addEventListener('click', () => {
      showSuggestions = false;
      render();
    });
  }

  // Unpin buttons
  contentElement.querySelectorAll('.context-unpin-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const filePath = btn.dataset.path;
      await unpinFile(filePath);
    });
  });

  // Pin buttons (suggestions)
  contentElement.querySelectorAll('.context-pin-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const filePath = btn.dataset.path;
      await pinFile(filePath);
    });
  });

  // Custom pin
  const pinCustomBtn = document.getElementById('context-pin-custom');
  if (pinCustomBtn) {
    pinCustomBtn.addEventListener('click', async () => {
      const input = document.getElementById('context-custom-path');
      if (input && input.value.trim()) {
        await pinFile(input.value.trim());
        input.value = '';
      }
    });
  }

  // Enter key on custom input
  const customInput = document.getElementById('context-custom-path');
  if (customInput) {
    customInput.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter' && customInput.value.trim()) {
        await pinFile(customInput.value.trim());
        customInput.value = '';
      }
    });
  }
}

/**
 * Pin a file
 */
async function pinFile(filePath) {
  try {
    const result = await ipcRenderer.invoke(IPC.PIN_FILE, {
      projectPath: currentProjectPath,
      filePath
    });

    if (result.success) {
      await loadContext();
    } else {
      alert('Failed to pin file: ' + result.error);
    }
  } catch (err) {
    console.error('Error pinning file:', err);
  }
}

/**
 * Unpin a file
 */
async function unpinFile(filePath) {
  try {
    const result = await ipcRenderer.invoke(IPC.UNPIN_FILE, {
      projectPath: currentProjectPath,
      filePath
    });

    if (result.success) {
      await loadContext();
    }
  } catch (err) {
    console.error('Error unpinning file:', err);
  }
}

/**
 * Format token count
 */
function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + 'M';
  }
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toString();
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Setup IPC listeners
 */
let ipcSetup = false;
function setupIPC() {
  if (ipcSetup) return;
  ipcSetup = true;

  ipcRenderer.on(IPC.TOGGLE_CONTEXT_PANEL, () => {
    toggle();
  });
}

module.exports = {
  init,
  toggle,
  hide,
  isVisible,
  setProjectPath,
  loadContext
};
