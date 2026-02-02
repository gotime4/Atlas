/**
 * Skills Panel
 * Displays and edits Claude skills/commands from .claude/commands folders
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let panelElement = null;
let contentElement = null;
let skills = [];
let expandedSkillId = null;
let currentContent = null;
let currentFilePath = null;
let hasUnsavedChanges = false;
let currentProjectPath = null;
let showCreateForm = false;

/**
 * Initialize skills panel
 */
function init() {
  panelElement = document.getElementById('skills-panel');
  contentElement = document.getElementById('skills-content');
  setupIPC();
  setupPanelEvents();
}

/**
 * Setup panel event handlers
 */
function setupPanelEvents() {
  // Close button
  const closeBtn = document.getElementById('skills-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => toggle());
  }

  // Collapse button
  const collapseBtn = document.getElementById('skills-collapse-btn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => toggle());
  }

  // Refresh button
  const refreshBtn = document.getElementById('skills-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadSkills());
  }

  // Create button
  const createBtn = document.getElementById('skills-create');
  if (createBtn) {
    createBtn.addEventListener('click', () => toggleCreateForm());
  }
}

/**
 * Toggle create form visibility
 */
function toggleCreateForm() {
  showCreateForm = !showCreateForm;
  if (showCreateForm) {
    expandedSkillId = null;
  }
  renderSkills();
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
    loadSkills();
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
    loadSkills();
  }
}

/**
 * Load skills from main process
 */
function loadSkills() {
  // Save current changes before loading
  saveCurrentIfChanged();
  ipcRenderer.send(IPC.LOAD_SKILLS, currentProjectPath);
}

/**
 * Render skills list
 */
function renderSkills() {
  if (!contentElement) return;

  contentElement.innerHTML = '';

  // Show create form if active
  if (showCreateForm) {
    const form = createSkillForm();
    contentElement.appendChild(form);
    return;
  }

  if (skills.length === 0) {
    contentElement.innerHTML = `
      <div class="skills-empty">
        <p>No skills found</p>
        <p class="skills-empty-hint">Skills are stored in .claude/commands/*.md</p>
        <button class="btn skill-create-first" id="skill-create-first-btn">+ Create Skill</button>
      </div>
    `;
    const createFirstBtn = document.getElementById('skill-create-first-btn');
    if (createFirstBtn) {
      createFirstBtn.addEventListener('click', () => toggleCreateForm());
    }
    return;
  }

  skills.forEach(skill => {
    const item = createSkillItem(skill);
    contentElement.appendChild(item);
  });
}

/**
 * Create the skill creation form
 */
function createSkillForm() {
  const form = document.createElement('div');
  form.className = 'skill-create-form';
  form.innerHTML = `
    <div class="skill-form-header">
      <h4>Create New Skill</h4>
      <button class="skill-form-close" id="skill-form-close">✕</button>
    </div>
    <div class="skill-form-body">
      <div class="skill-form-group">
        <label>Command Name</label>
        <div class="skill-form-input-prefix">
          <span>/</span>
          <input type="text" id="skill-name-input" placeholder="my-skill" pattern="[a-z0-9-]+" />
        </div>
        <span class="skill-form-hint">Lowercase letters, numbers, and hyphens only</span>
      </div>
      <div class="skill-form-group">
        <label>Description</label>
        <input type="text" id="skill-desc-input" placeholder="What does this skill do?" />
      </div>
      <div class="skill-form-group">
        <label>Scope</label>
        <select id="skill-scope-input">
          <option value="project">Project (current project only)</option>
          <option value="user">User (~/.claude/commands/)</option>
        </select>
      </div>
      <div class="skill-form-group">
        <label>Instructions / Prompt</label>
        <textarea id="skill-content-input" placeholder="Enter the skill instructions...

You can include:
- Step-by-step instructions
- Code examples
- References to tools
- Variable placeholders like $ARGUMENTS" rows="12"></textarea>
      </div>
      <div class="skill-form-group">
        <label>Resources (optional)</label>
        <textarea id="skill-resources-input" placeholder="List any files or resources this skill needs access to, one per line:

src/components/
docs/api.md
package.json" rows="4"></textarea>
      </div>
    </div>
    <div class="skill-form-actions">
      <button class="btn btn-secondary" id="skill-form-cancel">Cancel</button>
      <button class="btn btn-success" id="skill-form-save">Create Skill</button>
    </div>
  `;

  // Add event listeners after adding to DOM
  setTimeout(() => {
    document.getElementById('skill-form-close')?.addEventListener('click', () => {
      showCreateForm = false;
      renderSkills();
    });
    document.getElementById('skill-form-cancel')?.addEventListener('click', () => {
      showCreateForm = false;
      renderSkills();
    });
    document.getElementById('skill-form-save')?.addEventListener('click', saveNewSkill);
    document.getElementById('skill-name-input')?.focus();
  }, 0);

  return form;
}

/**
 * Save new skill
 */
function saveNewSkill() {
  const name = document.getElementById('skill-name-input').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const description = document.getElementById('skill-desc-input').value.trim();
  const scope = document.getElementById('skill-scope-input').value;
  const content = document.getElementById('skill-content-input').value;
  const resources = document.getElementById('skill-resources-input').value.trim();

  if (!name) {
    alert('Please enter a command name');
    return;
  }

  if (!content) {
    alert('Please enter skill instructions');
    return;
  }

  // Build the markdown content with YAML frontmatter
  let markdown = '---\n';
  markdown += `description: ${description || 'Custom skill'}\n`;
  if (resources) {
    markdown += 'resources:\n';
    resources.split('\n').filter(r => r.trim()).forEach(r => {
      markdown += `  - ${r.trim()}\n`;
    });
  }
  markdown += '---\n\n';
  markdown += content;

  ipcRenderer.send(IPC.CREATE_SKILL, {
    name,
    content: markdown,
    scope,
    projectPath: currentProjectPath
  });

  showCreateForm = false;
}

/**
 * Create a skill item element
 */
function createSkillItem(skill) {
  const item = document.createElement('div');
  item.className = 'skill-item';
  item.dataset.id = skill.id;

  const isExpanded = expandedSkillId === skill.id;
  if (isExpanded) {
    item.classList.add('expanded');
  }

  // Header
  const header = document.createElement('div');
  header.className = 'skill-header';
  header.innerHTML = `
    <span class="skill-scope-icon">${getScopeIcon(skill.scope)}</span>
    <span class="skill-command">${skill.command}</span>
    <span class="skill-scope-label">${skill.scopeLabel}</span>
    <span class="skill-expand-icon">${isExpanded ? '▼' : '▶'}</span>
  `;

  header.addEventListener('click', () => {
    toggleSkill(skill);
  });

  item.appendChild(header);

  // Description (when collapsed)
  if (!isExpanded) {
    const desc = document.createElement('div');
    desc.className = 'skill-description';
    desc.textContent = skill.description;
    item.appendChild(desc);
  }

  // Content (when expanded)
  if (isExpanded) {
    const contentArea = document.createElement('div');
    contentArea.className = 'skill-content';

    const textarea = document.createElement('textarea');
    textarea.className = 'skill-editor';
    textarea.value = skill.content;
    textarea.spellcheck = false;

    // Track changes
    textarea.addEventListener('input', () => {
      currentContent = textarea.value;
      hasUnsavedChanges = textarea.value !== skill.content;
      updateSaveIndicator(item, hasUnsavedChanges);
    });

    // Auto-save on blur
    textarea.addEventListener('blur', () => {
      saveCurrentIfChanged();
    });

    contentArea.appendChild(textarea);

    // File path info
    const pathInfo = document.createElement('div');
    pathInfo.className = 'skill-path';
    pathInfo.textContent = skill.filePath;
    contentArea.appendChild(pathInfo);

    item.appendChild(contentArea);

    // Set current tracking
    currentFilePath = skill.filePath;
    currentContent = skill.content;
    hasUnsavedChanges = false;
  }

  return item;
}

/**
 * Toggle skill expansion
 */
function toggleSkill(skill) {
  // Save current before switching
  saveCurrentIfChanged();

  if (expandedSkillId === skill.id) {
    expandedSkillId = null;
  } else {
    expandedSkillId = skill.id;
  }

  renderSkills();

  // Focus textarea if expanded
  if (expandedSkillId) {
    setTimeout(() => {
      const textarea = contentElement.querySelector('.skill-editor');
      if (textarea) {
        textarea.focus();
      }
    }, 50);
  }
}

/**
 * Save current skill if changed
 */
function saveCurrentIfChanged() {
  if (hasUnsavedChanges && currentFilePath && currentContent !== null) {
    ipcRenderer.send(IPC.SAVE_SKILL, {
      filePath: currentFilePath,
      content: currentContent
    });
    hasUnsavedChanges = false;

    // Update the skill in our local array
    const skill = skills.find(s => s.filePath === currentFilePath);
    if (skill) {
      skill.content = currentContent;
      skill.description = extractDescription(currentContent);
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
  const header = item.querySelector('.skill-header');
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

  ipcRenderer.on(IPC.SKILLS_DATA, (event, data) => {
    skills = data;
    renderSkills();
  });

  ipcRenderer.on(IPC.SKILL_SAVED, (event, result) => {
    if (!result.success) {
      console.error('Failed to save skill:', result.error);
    }
  });

  ipcRenderer.on(IPC.TOGGLE_SKILLS_PANEL, () => {
    toggle();
  });

  ipcRenderer.on(IPC.SKILL_CREATED, (event, result) => {
    if (result.success) {
      loadSkills();
    } else {
      console.error('Failed to create skill:', result.error);
      alert('Failed to create skill: ' + result.error);
    }
  });
}

module.exports = {
  init,
  toggle,
  isVisible,
  setProjectPath,
  loadSkills
};
