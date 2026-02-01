/**
 * Templates Panel UI
 * Provides quick access to prompt templates for Claude Code
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let panelElement = null;
let templatesListElement = null;
let templates = [];
let isVisible = false;
let onInsertCallback = null;

// Template icons mapping
const ICONS = {
  wrench: '🔧',
  bug: '🐛',
  check: '✅',
  info: 'ℹ️',
  eye: '👁️',
  book: '📖',
  bolt: '⚡',
  'arrow-right': '➡️',
  star: '⭐',
  plus: '➕'
};

/**
 * Initialize templates panel
 */
function init(insertCallback) {
  onInsertCallback = insertCallback;
  createPanel();
  setupIPC();
  loadTemplates();
}

/**
 * Create panel HTML
 */
function createPanel() {
  // Create panel element if not exists
  panelElement = document.getElementById('templates-panel');
  if (!panelElement) {
    panelElement = document.createElement('div');
    panelElement.id = 'templates-panel';
    panelElement.className = 'templates-panel panel-hidden';
    document.body.appendChild(panelElement);
  }

  panelElement.innerHTML = `
    <div class="templates-header">
      <h3>Prompt Templates</h3>
      <div class="templates-header-actions">
        <button class="btn-add-template" title="Create custom template">+</button>
        <button class="templates-close" title="Close panel">&times;</button>
      </div>
    </div>
    <div class="templates-search">
      <input type="text" placeholder="Search templates..." class="templates-search-input" />
    </div>
    <div class="templates-list"></div>
  `;

  templatesListElement = panelElement.querySelector('.templates-list');

  // Close button
  panelElement.querySelector('.templates-close').addEventListener('click', () => {
    hide();
  });

  // Add template button
  panelElement.querySelector('.btn-add-template').addEventListener('click', () => {
    showCreateTemplateDialog();
  });

  // Search
  const searchInput = panelElement.querySelector('.templates-search-input');
  searchInput.addEventListener('input', (e) => {
    filterTemplates(e.target.value);
  });
}

/**
 * Load templates from backend
 */
function loadTemplates() {
  ipcRenderer.send(IPC.LOAD_TEMPLATES);
}

/**
 * Render templates list
 */
function renderTemplates(templatesList) {
  templates = templatesList || [];

  if (!templatesListElement) return;

  templatesListElement.innerHTML = '';

  // Group by category
  const builtinTemplates = templates.filter(t => t.category === 'builtin');
  const customTemplates = templates.filter(t => t.category === 'custom');

  if (builtinTemplates.length > 0) {
    const builtinSection = createSection('Built-in Templates', builtinTemplates);
    templatesListElement.appendChild(builtinSection);
  }

  if (customTemplates.length > 0) {
    const customSection = createSection('Custom Templates', customTemplates, true);
    templatesListElement.appendChild(customSection);
  }

  if (templates.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'templates-empty';
    emptyMsg.textContent = 'No templates available';
    templatesListElement.appendChild(emptyMsg);
  }
}

/**
 * Create a section with templates
 */
function createSection(title, sectionTemplates, showDelete = false) {
  const section = document.createElement('div');
  section.className = 'templates-section';

  const header = document.createElement('div');
  header.className = 'templates-section-header';
  header.textContent = title;
  section.appendChild(header);

  sectionTemplates.forEach(template => {
    const item = createTemplateItem(template, showDelete);
    section.appendChild(item);
  });

  return section;
}

/**
 * Create a template item element
 */
function createTemplateItem(template, showDelete = false) {
  const item = document.createElement('div');
  item.className = 'template-item';
  item.dataset.id = template.id;

  // Icon
  const icon = document.createElement('span');
  icon.className = 'template-icon';
  icon.textContent = ICONS[template.icon] || '📝';
  item.appendChild(icon);

  // Content
  const content = document.createElement('div');
  content.className = 'template-content';

  const name = document.createElement('span');
  name.className = 'template-name';
  name.textContent = template.name;
  content.appendChild(name);

  const desc = document.createElement('span');
  desc.className = 'template-description';
  desc.textContent = template.description || '';
  content.appendChild(desc);

  item.appendChild(content);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'template-actions';

  // Insert button
  const insertBtn = document.createElement('button');
  insertBtn.className = 'template-insert-btn';
  insertBtn.textContent = 'Use';
  insertBtn.title = 'Insert into terminal';
  insertBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    insertTemplate(template);
  });
  actions.appendChild(insertBtn);

  // Delete button (for custom templates)
  if (showDelete) {
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'template-delete-btn';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Delete template';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTemplate(template.id);
    });
    actions.appendChild(deleteBtn);
  }

  item.appendChild(actions);

  // Click to preview
  item.addEventListener('click', () => {
    showTemplatePreview(template);
  });

  return item;
}

/**
 * Insert template into terminal
 */
function insertTemplate(template) {
  if (onInsertCallback) {
    onInsertCallback(template.prompt);
  }
  // Optionally hide panel after insert
  // hide();
}

/**
 * Show template preview
 */
function showTemplatePreview(template) {
  const existingPreview = panelElement.querySelector('.template-preview');
  if (existingPreview) {
    existingPreview.remove();
  }

  const preview = document.createElement('div');
  preview.className = 'template-preview';
  preview.innerHTML = `
    <div class="template-preview-header">
      <span class="template-preview-icon">${ICONS[template.icon] || '📝'}</span>
      <span class="template-preview-name">${template.name}</span>
      <button class="template-preview-close">&times;</button>
    </div>
    <div class="template-preview-description">${template.description || ''}</div>
    <pre class="template-preview-prompt">${escapeHtml(template.prompt)}</pre>
    <div class="template-preview-actions">
      <button class="btn-use-template">Use Template</button>
      <button class="btn-copy-template">Copy to Clipboard</button>
    </div>
  `;

  preview.querySelector('.template-preview-close').addEventListener('click', () => {
    preview.remove();
  });

  preview.querySelector('.btn-use-template').addEventListener('click', () => {
    insertTemplate(template);
    preview.remove();
  });

  preview.querySelector('.btn-copy-template').addEventListener('click', () => {
    navigator.clipboard.writeText(template.prompt);
    const btn = preview.querySelector('.btn-copy-template');
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy to Clipboard';
    }, 2000);
  });

  templatesListElement.prepend(preview);
}

/**
 * Filter templates by search query
 */
function filterTemplates(query) {
  const items = templatesListElement.querySelectorAll('.template-item');
  const lowerQuery = query.toLowerCase();

  items.forEach(item => {
    const template = templates.find(t => t.id === item.dataset.id);
    if (!template) return;

    const matches =
      template.name.toLowerCase().includes(lowerQuery) ||
      (template.description && template.description.toLowerCase().includes(lowerQuery));

    item.style.display = matches ? 'flex' : 'none';
  });
}

/**
 * Show create template dialog
 */
function showCreateTemplateDialog() {
  const dialog = document.createElement('div');
  dialog.className = 'template-dialog-overlay';
  dialog.innerHTML = `
    <div class="template-dialog">
      <div class="template-dialog-header">
        <h3>Create Custom Template</h3>
        <button class="template-dialog-close">&times;</button>
      </div>
      <div class="template-dialog-body">
        <div class="form-group">
          <label>Name</label>
          <input type="text" class="template-name-input" placeholder="Template name" />
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" class="template-desc-input" placeholder="Brief description" />
        </div>
        <div class="form-group">
          <label>Prompt</label>
          <textarea class="template-prompt-input" rows="8" placeholder="Enter your prompt template..."></textarea>
        </div>
      </div>
      <div class="template-dialog-footer">
        <button class="btn-cancel">Cancel</button>
        <button class="btn-save">Save Template</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog.querySelector('.template-dialog-close').addEventListener('click', () => {
    dialog.remove();
  });

  dialog.querySelector('.btn-cancel').addEventListener('click', () => {
    dialog.remove();
  });

  dialog.querySelector('.btn-save').addEventListener('click', () => {
    const name = dialog.querySelector('.template-name-input').value.trim();
    const description = dialog.querySelector('.template-desc-input').value.trim();
    const prompt = dialog.querySelector('.template-prompt-input').value;

    if (!name || !prompt) {
      alert('Please enter a name and prompt for the template.');
      return;
    }

    saveTemplate({ name, description, prompt, icon: 'star' });
    dialog.remove();
  });

  // Close on overlay click
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      dialog.remove();
    }
  });

  // Focus name input
  dialog.querySelector('.template-name-input').focus();
}

/**
 * Save a custom template
 */
function saveTemplate(template) {
  ipcRenderer.send(IPC.SAVE_TEMPLATE, template);
}

/**
 * Delete a template
 */
function deleteTemplate(templateId) {
  if (confirm('Delete this template?')) {
    ipcRenderer.send(IPC.DELETE_TEMPLATE, templateId);
  }
}

/**
 * Setup IPC listeners
 */
function setupIPC() {
  ipcRenderer.on(IPC.TEMPLATES_DATA, (event, templatesList) => {
    renderTemplates(templatesList);
  });

  ipcRenderer.on(IPC.TEMPLATE_SAVED, (event, { success, templates: templatesList }) => {
    if (success && templatesList) {
      renderTemplates(templatesList);
    }
  });

  ipcRenderer.on(IPC.TOGGLE_TEMPLATES_PANEL, () => {
    toggle();
  });
}

/**
 * Show panel
 */
function show() {
  if (panelElement) {
    panelElement.classList.remove('panel-hidden');
    isVisible = true;
    loadTemplates();
  }
}

/**
 * Hide panel
 */
function hide() {
  if (panelElement) {
    panelElement.classList.add('panel-hidden');
    isVisible = false;
  }
}

/**
 * Toggle panel visibility
 */
function toggle() {
  if (isVisible) {
    hide();
  } else {
    show();
  }
}

/**
 * Check if panel is visible
 */
function isVisibleState() {
  return isVisible;
}

/**
 * Helper: escape HTML
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

module.exports = {
  init,
  show,
  hide,
  toggle,
  isVisible: isVisibleState,
  loadTemplates
};
