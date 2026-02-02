/**
 * MCP Panel
 * Displays and manages MCP servers from ~/.claude.json
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let panelElement = null;
let contentElement = null;
let mcps = [];
let templates = [];
let expandedMcpId = null;
let currentProjectPath = null;
let showAddForm = false;

/**
 * Initialize MCP panel
 */
function init() {
  panelElement = document.getElementById('mcp-panel');
  contentElement = document.getElementById('mcp-content');
  setupIPC();
  setupPanelEvents();
}

/**
 * Setup panel event handlers
 */
function setupPanelEvents() {
  // Close button
  const closeBtn = document.getElementById('mcp-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => toggle());
  }

  // Collapse button
  const collapseBtn = document.getElementById('mcp-collapse-btn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => toggle());
  }

  // Refresh button
  const refreshBtn = document.getElementById('mcp-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadMcps());
  }

  // Add button
  const addBtn = document.getElementById('mcp-add');
  if (addBtn) {
    addBtn.addEventListener('click', () => toggleAddForm());
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
    showAddForm = false;
  } else {
    panelElement.classList.add('visible');
    loadMcps();
    loadTemplates();
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
    loadMcps();
  }
}

/**
 * Load MCPs from main process
 */
function loadMcps() {
  ipcRenderer.send(IPC.LOAD_MCPS, currentProjectPath);
}

/**
 * Load MCP templates
 */
function loadTemplates() {
  ipcRenderer.send(IPC.GET_MCP_TEMPLATES);
}

/**
 * Toggle add form visibility
 */
function toggleAddForm() {
  showAddForm = !showAddForm;
  renderMcps();
}

/**
 * Render MCPs list
 */
function renderMcps() {
  if (!contentElement) return;

  let html = '';

  // Add form
  if (showAddForm) {
    html += renderAddForm();
  }

  if (mcps.length === 0 && !showAddForm) {
    html = `
      <div class="mcp-empty">
        <p>No MCPs configured</p>
        <p class="mcp-empty-hint">MCPs are configured in ~/.claude.json</p>
        <button class="btn mcp-add-first" onclick="document.getElementById('mcp-add').click()">
          + Add MCP
        </button>
      </div>
    `;
  } else if (!showAddForm) {
    mcps.forEach(mcp => {
      html += createMcpItemHtml(mcp);
    });
  }

  contentElement.innerHTML = html;
  setupItemEvents();
}

/**
 * Render add form
 */
function renderAddForm() {
  let templatesHtml = templates.map(t => `
    <div class="mcp-template" data-template-id="${t.id}">
      <span class="mcp-template-icon">${t.icon}</span>
      <div class="mcp-template-info">
        <span class="mcp-template-name">${t.name}</span>
        <span class="mcp-template-desc">${t.description}</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="mcp-add-form">
      <div class="mcp-add-header">
        <h4>Add MCP Server</h4>
        <button class="mcp-add-close" id="mcp-add-close">✕</button>
      </div>
      <div class="mcp-templates-list">
        <p class="mcp-templates-title">Choose a template:</p>
        ${templatesHtml}
      </div>
      <div class="mcp-custom-form" id="mcp-custom-form" style="display: none;">
        <div class="mcp-form-group">
          <label>Name</label>
          <input type="text" id="mcp-name-input" placeholder="my-mcp-server">
        </div>
        <div class="mcp-form-group">
          <label>Type</label>
          <select id="mcp-type-input">
            <option value="stdio">StdIO (Command)</option>
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
          </select>
        </div>
        <div class="mcp-form-group mcp-stdio-fields">
          <label>Command</label>
          <input type="text" id="mcp-command-input" placeholder="npx">
        </div>
        <div class="mcp-form-group mcp-stdio-fields">
          <label>Arguments (comma separated)</label>
          <input type="text" id="mcp-args-input" placeholder="-y, @anthropics/mcp-server">
        </div>
        <div class="mcp-form-group mcp-http-fields" style="display: none;">
          <label>URL</label>
          <input type="text" id="mcp-url-input" placeholder="http://localhost:8000/mcp">
        </div>
        <div class="mcp-form-group">
          <label>Scope</label>
          <select id="mcp-scope-input">
            <option value="project">Project (current project only)</option>
            <option value="global">Global (all projects)</option>
          </select>
        </div>
        <div class="mcp-form-actions">
          <button class="btn btn-secondary" id="mcp-form-cancel">Cancel</button>
          <button class="btn btn-success" id="mcp-form-save">Add MCP</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Create MCP item HTML
 */
function createMcpItemHtml(mcp) {
  const isExpanded = expandedMcpId === mcp.id;
  const expandedClass = isExpanded ? 'expanded' : '';
  const enabledClass = mcp.enabled ? '' : 'disabled';

  let configHtml = '';
  if (isExpanded) {
    configHtml = `
      <div class="mcp-config">
        <div class="mcp-config-row">
          <span class="mcp-config-label">Type:</span>
          <span class="mcp-config-value">${mcp.type}</span>
        </div>
        ${mcp.config.command ? `
          <div class="mcp-config-row">
            <span class="mcp-config-label">Command:</span>
            <span class="mcp-config-value">${mcp.config.command} ${(mcp.config.args || []).join(' ')}</span>
          </div>
        ` : ''}
        ${mcp.config.url ? `
          <div class="mcp-config-row">
            <span class="mcp-config-label">URL:</span>
            <span class="mcp-config-value">${mcp.config.url}</span>
          </div>
        ` : ''}
        ${mcp.config.env ? `
          <div class="mcp-config-row">
            <span class="mcp-config-label">Environment:</span>
            <span class="mcp-config-value">${Object.keys(mcp.config.env).join(', ')}</span>
          </div>
        ` : ''}
        <div class="mcp-config-actions">
          <button class="btn btn-danger mcp-remove-btn" data-mcp-id="${mcp.id}">Remove MCP</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="mcp-item ${expandedClass} ${enabledClass}" data-mcp-id="${mcp.id}">
      <div class="mcp-header">
        <span class="mcp-icon">${mcp.icon}</span>
        <span class="mcp-name">${mcp.name}</span>
        <span class="mcp-type-badge">${mcp.type}</span>
        <span class="mcp-scope-label">${mcp.scopeLabel}</span>
        <label class="mcp-toggle">
          <input type="checkbox" class="mcp-toggle-input" data-mcp-id="${mcp.id}" ${mcp.enabled ? 'checked' : ''}>
          <span class="mcp-toggle-slider"></span>
        </label>
        <span class="mcp-expand-icon">${isExpanded ? '▼' : '▶'}</span>
      </div>
      ${configHtml}
    </div>
  `;
}

/**
 * Setup item event handlers
 */
function setupItemEvents() {
  // MCP header click (expand/collapse)
  contentElement.querySelectorAll('.mcp-header').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't toggle if clicking on the toggle switch
      if (e.target.classList.contains('mcp-toggle-input') ||
          e.target.classList.contains('mcp-toggle-slider') ||
          e.target.closest('.mcp-toggle')) {
        return;
      }
      const mcpId = header.closest('.mcp-item').dataset.mcpId;
      toggleMcp(mcpId);
    });
  });

  // Toggle switches
  contentElement.querySelectorAll('.mcp-toggle-input').forEach(toggle => {
    toggle.addEventListener('change', (e) => {
      e.stopPropagation();
      const mcpId = e.target.dataset.mcpId;
      const enabled = e.target.checked;
      ipcRenderer.send(IPC.TOGGLE_MCP, {
        mcpId,
        projectPath: currentProjectPath,
        enabled
      });
    });
  });

  // Remove buttons
  contentElement.querySelectorAll('.mcp-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mcpId = e.target.dataset.mcpId;
      if (confirm('Are you sure you want to remove this MCP?')) {
        ipcRenderer.send(IPC.REMOVE_MCP, {
          mcpId,
          projectPath: currentProjectPath
        });
      }
    });
  });

  // Add form close
  const addCloseBtn = document.getElementById('mcp-add-close');
  if (addCloseBtn) {
    addCloseBtn.addEventListener('click', () => {
      showAddForm = false;
      renderMcps();
    });
  }

  // Template clicks
  contentElement.querySelectorAll('.mcp-template').forEach(template => {
    template.addEventListener('click', () => {
      const templateId = template.dataset.templateId;
      selectTemplate(templateId);
    });
  });

  // Type selector change
  const typeInput = document.getElementById('mcp-type-input');
  if (typeInput) {
    typeInput.addEventListener('change', updateFormFields);
  }

  // Form cancel
  const cancelBtn = document.getElementById('mcp-form-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      showAddForm = false;
      renderMcps();
    });
  }

  // Form save
  const saveBtn = document.getElementById('mcp-form-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveMcp);
  }
}

/**
 * Toggle MCP expansion
 */
function toggleMcp(mcpId) {
  if (expandedMcpId === mcpId) {
    expandedMcpId = null;
  } else {
    expandedMcpId = mcpId;
  }
  renderMcps();
}

/**
 * Select a template and show custom form
 */
function selectTemplate(templateId) {
  const template = templates.find(t => t.id === templateId);
  if (!template) return;

  const customForm = document.getElementById('mcp-custom-form');
  const templatesList = contentElement.querySelector('.mcp-templates-list');

  if (customForm && templatesList) {
    templatesList.style.display = 'none';
    customForm.style.display = 'block';

    // Pre-fill form with template values
    document.getElementById('mcp-name-input').value = template.id;

    const type = template.config.type || 'stdio';
    document.getElementById('mcp-type-input').value = type;
    updateFormFields();

    if (template.config.command) {
      document.getElementById('mcp-command-input').value = template.config.command;
      document.getElementById('mcp-args-input').value = (template.config.args || []).join(', ');
    }

    if (template.config.url) {
      document.getElementById('mcp-url-input').value = template.config.url;
    }
  }
}

/**
 * Update form fields based on type selection
 */
function updateFormFields() {
  const type = document.getElementById('mcp-type-input').value;
  const stdioFields = contentElement.querySelectorAll('.mcp-stdio-fields');
  const httpFields = contentElement.querySelectorAll('.mcp-http-fields');

  stdioFields.forEach(f => f.style.display = type === 'stdio' ? 'block' : 'none');
  httpFields.forEach(f => f.style.display = ['http', 'sse'].includes(type) ? 'block' : 'none');
}

/**
 * Save new MCP
 */
function saveMcp() {
  const name = document.getElementById('mcp-name-input').value.trim();
  const type = document.getElementById('mcp-type-input').value;
  const scope = document.getElementById('mcp-scope-input').value;

  if (!name) {
    alert('Please enter a name for the MCP');
    return;
  }

  let config = { type };

  if (type === 'stdio') {
    const command = document.getElementById('mcp-command-input').value.trim();
    const argsStr = document.getElementById('mcp-args-input').value.trim();

    if (!command) {
      alert('Please enter a command');
      return;
    }

    config.command = command;
    if (argsStr) {
      config.args = argsStr.split(',').map(a => a.trim()).filter(a => a);
    }
  } else {
    const url = document.getElementById('mcp-url-input').value.trim();
    if (!url) {
      alert('Please enter a URL');
      return;
    }
    config.url = url;
  }

  ipcRenderer.send(IPC.ADD_MCP, {
    projectPath: currentProjectPath,
    name,
    config,
    scope
  });

  showAddForm = false;
}

/**
 * Setup IPC listeners
 */
let ipcSetup = false;
function setupIPC() {
  if (ipcSetup) return;
  ipcSetup = true;

  ipcRenderer.on(IPC.MCPS_DATA, (event, data) => {
    mcps = data;
    renderMcps();
  });

  ipcRenderer.on(IPC.MCP_TEMPLATES_DATA, (event, data) => {
    templates = data;
    if (showAddForm) {
      renderMcps();
    }
  });

  ipcRenderer.on(IPC.MCP_TOGGLED, (event, result) => {
    if (!result.success) {
      console.error('Failed to toggle MCP:', result.error);
    }
  });

  ipcRenderer.on(IPC.MCP_ADDED, (event, result) => {
    if (!result.success) {
      console.error('Failed to add MCP:', result.error);
      alert('Failed to add MCP: ' + result.error);
    }
  });

  ipcRenderer.on(IPC.MCP_REMOVED, (event, result) => {
    if (!result.success) {
      console.error('Failed to remove MCP:', result.error);
    }
  });

  ipcRenderer.on(IPC.TOGGLE_MCP_PANEL, () => {
    toggle();
  });
}

module.exports = {
  init,
  toggle,
  isVisible,
  setProjectPath,
  loadMcps
};
