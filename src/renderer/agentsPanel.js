/**
 * Agents Panel
 * Displays and edits Claude agents from .claude/agents folders
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let panelElement = null;
let contentElement = null;
let agents = [];
let expandedAgentId = null;
let currentContent = null;
let currentFilePath = null;
let hasUnsavedChanges = false;
let currentProjectPath = null;

/**
 * Initialize agents panel
 */
function init() {
  panelElement = document.getElementById('agents-panel');
  contentElement = document.getElementById('agents-content');
  setupIPC();
  setupPanelEvents();
}

/**
 * Setup panel event handlers
 */
function setupPanelEvents() {
  // Close button
  const closeBtn = document.getElementById('agents-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => toggle());
  }

  // Refresh button
  const refreshBtn = document.getElementById('agents-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadAgents());
  }
}

/**
 * Toggle panel visibility
 */
function toggle() {
  if (!panelElement) return;

  const isVisible = panelElement.classList.contains('visible');

  if (isVisible) {
    // Save before closing
    saveCurrentIfChanged();
    panelElement.classList.remove('visible');
  } else {
    panelElement.classList.add('visible');
    loadAgents();
  }
}

/**
 * Check if panel is visible
 */
function isVisible() {
  return panelElement && panelElement.classList.contains('visible');
}

/**
 * Set current project path
 */
function setProjectPath(projectPath) {
  currentProjectPath = projectPath;
  if (isVisible()) {
    loadAgents();
  }
}

/**
 * Load agents from main process
 */
function loadAgents() {
  // Save current changes before loading
  saveCurrentIfChanged();
  ipcRenderer.send(IPC.LOAD_AGENTS, currentProjectPath);
}

/**
 * Render agents list
 */
function renderAgents() {
  if (!contentElement) return;

  if (agents.length === 0) {
    contentElement.innerHTML = `
      <div class="agents-empty">
        <p>No agents found</p>
        <p class="agents-empty-hint">Agents are stored in .claude/agents/*.md</p>
      </div>
    `;
    return;
  }

  contentElement.innerHTML = '';

  agents.forEach(agent => {
    const item = createAgentItem(agent);
    contentElement.appendChild(item);
  });
}

/**
 * Create an agent item element
 */
function createAgentItem(agent) {
  const item = document.createElement('div');
  item.className = 'agent-item';
  item.dataset.id = agent.id;

  const isExpanded = expandedAgentId === agent.id;
  if (isExpanded) {
    item.classList.add('expanded');
  }

  // Header
  const header = document.createElement('div');
  header.className = 'agent-header';
  header.innerHTML = `
    <span class="agent-scope-icon">${getScopeIcon(agent.scope)}</span>
    <span class="agent-name">${agent.name}</span>
    <span class="agent-scope-label">${agent.scopeLabel}</span>
    <span class="agent-expand-icon">${isExpanded ? '▼' : '▶'}</span>
  `;

  header.addEventListener('click', () => {
    toggleAgent(agent);
  });

  item.appendChild(header);

  // Description (when collapsed)
  if (!isExpanded) {
    const desc = document.createElement('div');
    desc.className = 'agent-description';
    desc.textContent = agent.description;
    item.appendChild(desc);
  }

  // Content (when expanded)
  if (isExpanded) {
    const contentArea = document.createElement('div');
    contentArea.className = 'agent-content';

    const textarea = document.createElement('textarea');
    textarea.className = 'agent-editor';
    textarea.value = agent.content;
    textarea.spellcheck = false;

    // Track changes
    textarea.addEventListener('input', () => {
      currentContent = textarea.value;
      hasUnsavedChanges = textarea.value !== agent.content;
      updateSaveIndicator(item, hasUnsavedChanges);
    });

    // Auto-save on blur
    textarea.addEventListener('blur', () => {
      saveCurrentIfChanged();
    });

    contentArea.appendChild(textarea);

    // File path info
    const pathInfo = document.createElement('div');
    pathInfo.className = 'agent-path';
    pathInfo.textContent = agent.filePath;
    contentArea.appendChild(pathInfo);

    item.appendChild(contentArea);

    // Set current tracking
    currentFilePath = agent.filePath;
    currentContent = agent.content;
    hasUnsavedChanges = false;
  }

  return item;
}

/**
 * Toggle agent expansion
 */
function toggleAgent(agent) {
  // Save current before switching
  saveCurrentIfChanged();

  if (expandedAgentId === agent.id) {
    expandedAgentId = null;
  } else {
    expandedAgentId = agent.id;
  }

  renderAgents();

  // Focus textarea if expanded
  if (expandedAgentId) {
    setTimeout(() => {
      const textarea = contentElement.querySelector('.agent-editor');
      if (textarea) {
        textarea.focus();
      }
    }, 50);
  }
}

/**
 * Save current agent if changed
 */
function saveCurrentIfChanged() {
  if (hasUnsavedChanges && currentFilePath && currentContent !== null) {
    ipcRenderer.send(IPC.SAVE_AGENT, {
      filePath: currentFilePath,
      content: currentContent
    });
    hasUnsavedChanges = false;

    // Update the agent in our local array
    const agent = agents.find(a => a.filePath === currentFilePath);
    if (agent) {
      agent.content = currentContent;
      agent.description = extractDescription(currentContent);
    }
  }
}

/**
 * Extract description from content (handles YAML frontmatter)
 */
function extractDescription(content) {
  const lines = content.split('\n');

  // Check for YAML frontmatter
  if (lines[0] && lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        const frontmatter = lines.slice(1, i).join('\n');
        const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
        if (descMatch) {
          const desc = descMatch[1].trim();
          return desc.length > 100 ? desc.substring(0, 100) + '...' : desc;
        }
        break;
      }
    }
  }

  // Fallback
  let inFrontmatter = lines[0] && lines[0].trim() === '---';
  for (const line of lines) {
    const trimmed = line.trim();
    if (inFrontmatter) {
      if (trimmed === '---') inFrontmatter = false;
      continue;
    }
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---') continue;
    return trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed;
  }
  return 'No description';
}

/**
 * Update save indicator
 */
function updateSaveIndicator(item, unsaved) {
  const header = item.querySelector('.agent-header');
  if (unsaved) {
    header.classList.add('unsaved');
  } else {
    header.classList.remove('unsaved');
  }
}

/**
 * Get scope icon
 */
function getScopeIcon(scope) {
  switch (scope) {
    case 'user': return '🏠';
    case 'project': return '📁';
    case 'parent': return '📂';
    default: return '📄';
  }
}

/**
 * Setup IPC listeners
 */
let ipcSetup = false;
function setupIPC() {
  if (ipcSetup) return;
  ipcSetup = true;

  ipcRenderer.on(IPC.AGENTS_DATA, (event, data) => {
    agents = data;
    renderAgents();
  });

  ipcRenderer.on(IPC.AGENT_SAVED, (event, result) => {
    if (!result.success) {
      console.error('Failed to save agent:', result.error);
    }
  });

  ipcRenderer.on(IPC.TOGGLE_AGENTS_PANEL, () => {
    toggle();
  });
}

module.exports = {
  init,
  toggle,
  isVisible,
  setProjectPath,
  loadAgents
};
