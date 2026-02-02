/**
 * Templates Manager
 * Handles prompt templates for common Claude Code tasks
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { IPC } = require('../shared/ipcChannels');

const SETTINGS_DIR = path.join(os.homedir(), '.atlas');
const TEMPLATES_FILE = path.join(SETTINGS_DIR, 'templates.json');

let mainWindow = null;

// Default built-in templates
const DEFAULT_TEMPLATES = [
  {
    id: 'refactor',
    name: 'Refactor Code',
    description: 'Refactor code for clarity and efficiency',
    prompt: 'Please refactor this code to improve readability, maintainability, and efficiency. Focus on:\n- Clear variable and function names\n- Proper separation of concerns\n- Removing code duplication\n- Adding helpful comments only where needed\n\n',
    icon: 'wrench',
    category: 'builtin'
  },
  {
    id: 'debug',
    name: 'Debug Issue',
    description: 'Help debug an error or issue',
    prompt: 'I\'m encountering this error/issue:\n\n[PASTE ERROR HERE]\n\nPlease help me:\n1. Understand what\'s causing this\n2. Find the root cause\n3. Fix the issue\n\n',
    icon: 'bug',
    category: 'builtin'
  },
  {
    id: 'test',
    name: 'Write Tests',
    description: 'Generate tests for code',
    prompt: 'Please write comprehensive tests for this code. Include:\n- Unit tests for individual functions\n- Edge cases and error handling\n- Clear test descriptions\n- Use the existing test framework in this project\n\n',
    icon: 'check',
    category: 'builtin'
  },
  {
    id: 'explain',
    name: 'Explain Code',
    description: 'Get an explanation of how code works',
    prompt: 'Please explain how this code works:\n- What is its purpose?\n- How does the logic flow?\n- What are the key parts?\n- Are there any potential issues?\n\n',
    icon: 'info',
    category: 'builtin'
  },
  {
    id: 'review',
    name: 'Code Review',
    description: 'Review code for issues and improvements',
    prompt: 'Please review this code for:\n- Bugs and potential issues\n- Performance problems\n- Security vulnerabilities\n- Code style and best practices\n- Suggestions for improvement\n\n',
    icon: 'eye',
    category: 'builtin'
  },
  {
    id: 'document',
    name: 'Add Documentation',
    description: 'Add documentation and comments',
    prompt: 'Please add appropriate documentation to this code:\n- JSDoc/docstrings for functions\n- Inline comments for complex logic\n- README sections if applicable\n- Keep it concise but informative\n\n',
    icon: 'book',
    category: 'builtin'
  },
  {
    id: 'optimize',
    name: 'Optimize Performance',
    description: 'Optimize code for better performance',
    prompt: 'Please optimize this code for better performance:\n- Identify bottlenecks\n- Reduce time/space complexity\n- Use more efficient algorithms/data structures\n- Profile and suggest improvements\n\n',
    icon: 'bolt',
    category: 'builtin'
  },
  {
    id: 'convert',
    name: 'Convert/Migrate',
    description: 'Convert code to different format or framework',
    prompt: 'Please help me convert/migrate this code:\n- From: [SOURCE FORMAT/FRAMEWORK]\n- To: [TARGET FORMAT/FRAMEWORK]\n- Maintain the same functionality\n- Follow best practices for the target\n\n',
    icon: 'arrow-right',
    category: 'builtin'
  }
];

/**
 * Ensure settings directory exists
 */
function ensureSettingsDir() {
  if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  }
}

/**
 * Load templates from disk (includes built-in + custom)
 */
function loadTemplates() {
  ensureSettingsDir();
  let customTemplates = [];
  try {
    if (fs.existsSync(TEMPLATES_FILE)) {
      const data = fs.readFileSync(TEMPLATES_FILE, 'utf8');
      customTemplates = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading custom templates:', err);
  }
  return [...DEFAULT_TEMPLATES, ...customTemplates];
}

/**
 * Save custom template
 */
function saveTemplate(template) {
  ensureSettingsDir();
  try {
    let customTemplates = [];
    if (fs.existsSync(TEMPLATES_FILE)) {
      customTemplates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
    }

    // Add unique ID if not present
    if (!template.id) {
      template.id = `custom-${Date.now()}`;
    }
    template.category = 'custom';
    template.createdAt = template.createdAt || new Date().toISOString();
    template.updatedAt = new Date().toISOString();

    // Check if updating existing template
    const existingIndex = customTemplates.findIndex(t => t.id === template.id);
    if (existingIndex >= 0) {
      customTemplates[existingIndex] = template;
    } else {
      customTemplates.push(template);
    }

    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(customTemplates, null, 2), 'utf8');
    return template;
  } catch (err) {
    console.error('Error saving template:', err);
    return null;
  }
}

/**
 * Delete custom template
 */
function deleteTemplate(templateId) {
  ensureSettingsDir();
  try {
    let customTemplates = [];
    if (fs.existsSync(TEMPLATES_FILE)) {
      customTemplates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
    }

    customTemplates = customTemplates.filter(t => t.id !== templateId);
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(customTemplates, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error deleting template:', err);
    return false;
  }
}

/**
 * Move template up or down in the list
 */
function moveTemplate(templateId, direction) {
  ensureSettingsDir();
  try {
    let customTemplates = [];
    if (fs.existsSync(TEMPLATES_FILE)) {
      customTemplates = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
    }

    const index = customTemplates.findIndex(t => t.id === templateId);
    if (index === -1) return false;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= customTemplates.length) return false;

    // Swap templates
    const temp = customTemplates[index];
    customTemplates[index] = customTemplates[newIndex];
    customTemplates[newIndex] = temp;

    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(customTemplates, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error moving template:', err);
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
  // Load all templates
  ipcMain.on(IPC.LOAD_TEMPLATES, (event) => {
    const templates = loadTemplates();
    event.sender.send(IPC.TEMPLATES_DATA, templates);
  });

  // Save template
  ipcMain.on(IPC.SAVE_TEMPLATE, (event, template) => {
    const saved = saveTemplate(template);
    if (saved) {
      const templates = loadTemplates();
      event.sender.send(IPC.TEMPLATE_SAVED, { success: true, template: saved, templates });
    } else {
      event.sender.send(IPC.TEMPLATE_SAVED, { success: false });
    }
  });

  // Delete template
  ipcMain.on(IPC.DELETE_TEMPLATE, (event, templateId) => {
    const success = deleteTemplate(templateId);
    if (success) {
      const templates = loadTemplates();
      event.sender.send(IPC.TEMPLATES_DATA, templates);
    }
  });

  // Update template
  ipcMain.on(IPC.UPDATE_TEMPLATE, (event, template) => {
    const saved = saveTemplate(template);
    if (saved) {
      const templates = loadTemplates();
      event.sender.send(IPC.TEMPLATE_SAVED, { success: true, template: saved, templates });
    } else {
      event.sender.send(IPC.TEMPLATE_SAVED, { success: false });
    }
  });

  // Move template up/down
  ipcMain.on(IPC.MOVE_TEMPLATE, (event, { templateId, direction }) => {
    const success = moveTemplate(templateId, direction);
    if (success) {
      const templates = loadTemplates();
      event.sender.send(IPC.TEMPLATES_DATA, templates);
    }
  });
}

module.exports = {
  init,
  setupIPC,
  loadTemplates,
  saveTemplate,
  deleteTemplate,
  moveTemplate
};
