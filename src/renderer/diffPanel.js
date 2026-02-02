/**
 * Diff Panel
 * Shows file changes with visual diff viewer
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let panelElement = null;
let contentElement = null;
let pendingChanges = [];
let selectedFile = null;
let currentProjectPath = null;

/**
 * Initialize diff panel
 */
function init() {
  panelElement = document.getElementById('diff-panel');
  contentElement = document.getElementById('diff-content');
  setupIPC();
  setupPanelEvents();
}

/**
 * Setup panel event handlers
 */
function setupPanelEvents() {
  const closeBtn = document.getElementById('diff-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => toggle());
  }

  const collapseBtn = document.getElementById('diff-collapse-btn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => toggle());
  }

  const refreshBtn = document.getElementById('diff-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadChanges());
  }

  const acceptAllBtn = document.getElementById('diff-accept-all');
  if (acceptAllBtn) {
    acceptAllBtn.addEventListener('click', () => acceptAllChanges());
  }
}

/**
 * Toggle panel visibility
 */
function toggle() {
  if (!panelElement) return;

  const isVisible = panelElement.classList.contains('visible');

  if (isVisible) {
    panelElement.classList.remove('visible');
  } else {
    panelElement.classList.add('visible');
    loadChanges();
  }
}

/**
 * Check if panel is visible
 */
function isVisible() {
  return panelElement && panelElement.classList.contains('visible');
}

/**
 * Set project path and start watching
 */
function setProjectPath(projectPath) {
  currentProjectPath = projectPath;
  if (projectPath) {
    ipcRenderer.send(IPC.WATCH_PROJECT, projectPath);
  }
  if (isVisible()) {
    loadChanges();
  }
}

/**
 * Load pending changes
 */
async function loadChanges() {
  try {
    pendingChanges = await ipcRenderer.invoke(IPC.GET_PENDING_CHANGES);
    render();
  } catch (err) {
    console.error('Error loading changes:', err);
    pendingChanges = [];
    render();
  }
}

/**
 * Render the panel
 */
function render() {
  if (!contentElement) return;

  if (pendingChanges.length === 0) {
    contentElement.innerHTML = `
      <div class="diff-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <p>No pending changes</p>
        <span class="diff-empty-hint">File changes will appear here as you work</span>
      </div>
    `;
    return;
  }

  let html = '<div class="diff-file-list">';

  pendingChanges.forEach((change, index) => {
    const isSelected = selectedFile === change.path;
    const addCount = change.diff.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'add').length, 0);
    const removeCount = change.diff.reduce((sum, h) => sum + h.lines.filter(l => l.type === 'remove').length, 0);

    html += `
      <div class="diff-file-item ${isSelected ? 'selected' : ''}" data-path="${escapeHtml(change.path)}">
        <div class="diff-file-header">
          <span class="diff-file-icon">📄</span>
          <span class="diff-file-name">${escapeHtml(change.filename)}</span>
          <span class="diff-file-stats">
            <span class="diff-stat-add">+${addCount}</span>
            <span class="diff-stat-remove">-${removeCount}</span>
          </span>
        </div>
        <div class="diff-file-actions">
          <button class="diff-btn diff-accept-btn" data-path="${escapeHtml(change.path)}" title="Accept changes">✓</button>
          <button class="diff-btn diff-revert-btn" data-path="${escapeHtml(change.path)}" title="Revert changes">↺</button>
        </div>
      </div>
    `;

    if (isSelected) {
      html += renderDiffView(change);
    }
  });

  html += '</div>';
  contentElement.innerHTML = html;

  // Add event listeners
  setupItemEvents();
}

/**
 * Render diff view for a file
 */
function renderDiffView(change) {
  let html = '<div class="diff-viewer">';

  change.diff.forEach((hunk, hunkIndex) => {
    html += `
      <div class="diff-hunk" data-hunk="${hunkIndex}">
        <div class="diff-hunk-header">
          <span>@@ -${hunk.startOld} +${hunk.startNew} @@</span>
          <button class="diff-hunk-revert" data-path="${escapeHtml(change.path)}" data-hunk="${hunkIndex}" title="Revert this change">
            Revert
          </button>
        </div>
        <div class="diff-hunk-content">
    `;

    hunk.lines.forEach(line => {
      const lineClass = line.type === 'add' ? 'diff-line-add' : 'diff-line-remove';
      const prefix = line.type === 'add' ? '+' : '-';
      html += `
        <div class="diff-line ${lineClass}">
          <span class="diff-line-num">${line.lineNum}</span>
          <span class="diff-line-prefix">${prefix}</span>
          <span class="diff-line-content">${escapeHtml(line.content)}</span>
        </div>
      `;
    });

    html += '</div></div>';
  });

  html += '</div>';
  return html;
}

/**
 * Setup item event handlers
 */
function setupItemEvents() {
  // File item click to expand/collapse
  contentElement.querySelectorAll('.diff-file-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.diff-file-actions')) return;

      const path = item.dataset.path;
      selectedFile = selectedFile === path ? null : path;
      render();
    });
  });

  // Accept button
  contentElement.querySelectorAll('.diff-accept-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const path = btn.dataset.path;
      await acceptChanges(path);
    });
  });

  // Revert button
  contentElement.querySelectorAll('.diff-revert-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const path = btn.dataset.path;
      if (confirm('Revert all changes to this file?')) {
        await revertChanges(path);
      }
    });
  });

  // Hunk revert button
  contentElement.querySelectorAll('.diff-hunk-revert').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const path = btn.dataset.path;
      const hunkIndex = parseInt(btn.dataset.hunk);
      await revertHunk(path, hunkIndex);
    });
  });
}

/**
 * Accept changes for a file
 */
async function acceptChanges(filePath) {
  try {
    const result = await ipcRenderer.invoke(IPC.ACCEPT_CHANGES, filePath);
    if (result.success) {
      if (selectedFile === filePath) {
        selectedFile = null;
      }
      await loadChanges();
    }
  } catch (err) {
    console.error('Error accepting changes:', err);
  }
}

/**
 * Revert changes for a file
 */
async function revertChanges(filePath) {
  try {
    const result = await ipcRenderer.invoke(IPC.REVERT_CHANGES, filePath);
    if (result.success) {
      if (selectedFile === filePath) {
        selectedFile = null;
      }
      await loadChanges();
    }
  } catch (err) {
    console.error('Error reverting changes:', err);
  }
}

/**
 * Revert a specific hunk
 */
async function revertHunk(filePath, hunkIndex) {
  try {
    const result = await ipcRenderer.invoke(IPC.REVERT_HUNK, { filePath, hunkIndex });
    if (result.success) {
      await loadChanges();
    }
  } catch (err) {
    console.error('Error reverting hunk:', err);
  }
}

/**
 * Accept all changes
 */
async function acceptAllChanges() {
  try {
    const result = await ipcRenderer.invoke(IPC.CLEAR_ALL_CHANGES);
    if (result.success) {
      selectedFile = null;
      await loadChanges();
    }
  } catch (err) {
    console.error('Error accepting all changes:', err);
  }
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

  ipcRenderer.on(IPC.FILE_CHANGED, (event, data) => {
    if (isVisible()) {
      loadChanges();
    }
    // Update badge/indicator
    updateChangeBadge();
  });

  ipcRenderer.on(IPC.TOGGLE_DIFF_PANEL, () => {
    toggle();
  });
}

/**
 * Update the change badge on the toolbar button
 */
function updateChangeBadge() {
  const btn = document.querySelector('.btn-diff-toggle');
  if (btn) {
    const badge = btn.querySelector('.diff-badge') || document.createElement('span');
    badge.className = 'diff-badge';

    if (pendingChanges.length > 0) {
      badge.textContent = pendingChanges.length;
      badge.style.display = 'inline-flex';
      if (!btn.contains(badge)) {
        btn.appendChild(badge);
      }
    } else {
      badge.style.display = 'none';
    }
  }
}

module.exports = {
  init,
  toggle,
  isVisible,
  setProjectPath,
  loadChanges
};
