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

  // Refresh button
  const refreshBtn = document.getElementById('skills-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => loadSkills());
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

  if (skills.length === 0) {
    contentElement.innerHTML = `
      <div class="skills-empty">
        <p>No skills found</p>
        <p class="skills-empty-hint">Skills are stored in .claude/commands/*.md</p>
      </div>
    `;
    return;
  }

  contentElement.innerHTML = '';

  skills.forEach(skill => {
    const item = createSkillItem(skill);
    contentElement.appendChild(item);
  });
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
}

module.exports = {
  init,
  toggle,
  isVisible,
  setProjectPath,
  loadSkills
};
