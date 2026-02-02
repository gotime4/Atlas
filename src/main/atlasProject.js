/**
 * Atlas Project Module
 * Handles Atlas project initialization and detection
 */

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const { ATLAS_DIR, ATLAS_CONFIG_FILE, ATLAS_FILES } = require('../shared/atlasConstants');
const templates = require('../shared/atlasTemplates');
const workspace = require('./workspace');

let mainWindow = null;

/**
 * Initialize atlas project module
 */
function init(window) {
  mainWindow = window;
}

/**
 * Check if a project is an Atlas project
 */
function isAtlasProject(projectPath) {
  const configPath = path.join(projectPath, ATLAS_DIR, ATLAS_CONFIG_FILE);
  return fs.existsSync(configPath);
}

/**
 * Get Atlas config from project
 */
function getAtlasConfig(projectPath) {
  const configPath = path.join(projectPath, ATLAS_DIR, ATLAS_CONFIG_FILE);
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

/**
 * Create file if it doesn't exist
 */
function createFileIfNotExists(filePath, content) {
  if (!fs.existsSync(filePath)) {
    const contentStr = typeof content === 'string'
      ? content
      : JSON.stringify(content, null, 2);
    fs.writeFileSync(filePath, contentStr, 'utf8');
    return true;
  }
  return false;
}

/**
 * Check which Atlas files already exist in the project
 */
function checkExistingAtlasFiles(projectPath) {
  const existingFiles = [];
  const filesToCheck = [
    { name: 'CLAUDE.md', path: path.join(projectPath, ATLAS_FILES.CLAUDE) },
    { name: 'STRUCTURE.json', path: path.join(projectPath, ATLAS_FILES.STRUCTURE) },
    { name: 'PROJECT_NOTES.md', path: path.join(projectPath, ATLAS_FILES.NOTES) },
    { name: 'tasks.json', path: path.join(projectPath, ATLAS_FILES.TASKS) },
    { name: 'QUICKSTART.md', path: path.join(projectPath, ATLAS_FILES.QUICKSTART) },
    { name: '.atlas/', path: path.join(projectPath, ATLAS_DIR) }
  ];

  for (const file of filesToCheck) {
    if (fs.existsSync(file.path)) {
      existingFiles.push(file.name);
    }
  }

  return existingFiles;
}

/**
 * Check if .gitignore exists and if Atlas files are already in it
 */
function checkGitignore(projectPath) {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const exists = fs.existsSync(gitignorePath);
  let hasAtlasEntries = false;
  let hasClaudeMdEntry = false;

  if (exists) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    hasAtlasEntries = content.includes('.atlas') || content.includes(ATLAS_DIR);
    hasClaudeMdEntry = content.includes('CLAUDE.md');
  }

  return { exists, hasAtlasEntries, hasClaudeMdEntry, path: gitignorePath };
}

/**
 * Add Atlas entries to .gitignore
 */
function addToGitignore(projectPath, createNew = false, includeClaudeMd = false) {
  const gitignorePath = path.join(projectPath, '.gitignore');

  const baseEntries = [
    '.atlas/',
    'STRUCTURE.json',
    'PROJECT_NOTES.md',
    'tasks.json',
    'QUICKSTART.md'
  ];

  if (includeClaudeMd) {
    baseEntries.push('CLAUDE.md');
  }

  if (createNew) {
    const content = '# Atlas project files\n' + baseEntries.join('\n') + '\n';
    fs.writeFileSync(gitignorePath, content, 'utf8');
  } else {
    let existingContent = fs.readFileSync(gitignorePath, 'utf8');

    // Find entries that need to be added
    const entriesToAdd = baseEntries.filter(entry => !existingContent.includes(entry));

    if (entriesToAdd.length > 0) {
      // Add header if no Atlas entries exist yet
      if (!existingContent.includes('.atlas') && !existingContent.includes('# Atlas')) {
        existingContent = existingContent.trimEnd() + '\n\n# Atlas project files\n';
      } else {
        existingContent = existingContent.trimEnd() + '\n';
      }

      const newContent = existingContent + entriesToAdd.join('\n') + '\n';
      fs.writeFileSync(gitignorePath, newContent, 'utf8');
    }
  }
}

/**
 * Show confirmation dialog before initializing Atlas project
 */
async function showInitializeConfirmation(projectPath) {
  const existingFiles = checkExistingAtlasFiles(projectPath);
  const gitignoreInfo = checkGitignore(projectPath);

  let message = 'This will create the following files in your project:\n\n';
  message += '  • .atlas/ (config directory)\n';
  message += '  • CLAUDE.md (AI instructions)\n';
  message += '  • STRUCTURE.json (module map)\n';
  message += '  • PROJECT_NOTES.md (session notes)\n';
  message += '  • tasks.json (task tracking)\n';
  message += '  • QUICKSTART.md (getting started)\n';

  if (existingFiles.length > 0) {
    message += '\n⚠️ These files already exist and will NOT be overwritten:\n';
    message += existingFiles.map(f => `  • ${f}`).join('\n');
  }

  if (gitignoreInfo.exists && !gitignoreInfo.hasAtlasEntries) {
    message += '\n\n✓ Will add .atlas/ to your existing .gitignore';
  }

  message += '\n\nDo you want to continue?';

  const result = await dialog.showMessageBox(mainWindow, {
    type: existingFiles.length > 0 ? 'warning' : 'question',
    buttons: ['Cancel', 'Initialize'],
    defaultId: 0,
    cancelId: 0,
    title: 'Initialize as Atlas Project',
    message: 'Initialize as Atlas Project?',
    detail: message
  });

  if (result.response !== 1) {
    return { confirmed: false };
  }

  // If no .gitignore exists, ask if user wants to create one
  let createGitignore = false;
  if (!gitignoreInfo.exists) {
    const gitignoreResult = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['No', 'Yes'],
      defaultId: 1,
      title: 'Create .gitignore?',
      message: 'Create .gitignore?',
      detail: 'No .gitignore file found. Would you like to create one with Atlas files excluded?\n\nThis prevents accidentally committing Atlas config files.'
    });
    createGitignore = gitignoreResult.response === 1;
  }

  // Ask if user wants to ignore CLAUDE.md (if not already in gitignore)
  let ignoreClaudeMd = false;
  const willAddGitignore = createGitignore || (gitignoreInfo.exists && !gitignoreInfo.hasAtlasEntries);
  const shouldAskAboutClaudeMd = (createGitignore || gitignoreInfo.exists) && !gitignoreInfo.hasClaudeMdEntry;

  if (shouldAskAboutClaudeMd) {
    const claudeMdResult = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['No, keep it tracked', 'Yes, ignore it'],
      defaultId: 0,
      title: 'Ignore CLAUDE.md?',
      message: 'Also ignore CLAUDE.md?',
      detail: 'CLAUDE.md contains AI instructions for your project.\n\n• Keep tracked: Share instructions with your team\n• Ignore: Keep instructions private to you'
    });
    ignoreClaudeMd = claudeMdResult.response === 1;
  }

  return {
    confirmed: true,
    gitignoreInfo,
    createGitignore,
    ignoreClaudeMd
  };
}

/**
 * Initialize a project as Atlas project
 */
function initializeAtlasProject(projectPath, projectName) {
  const name = projectName || path.basename(projectPath);
  const atlasDirPath = path.join(projectPath, ATLAS_DIR);

  // Create .atlas directory
  if (!fs.existsSync(atlasDirPath)) {
    fs.mkdirSync(atlasDirPath, { recursive: true });
  }

  // Create .atlas/config.json
  const config = templates.getAtlasConfigTemplate(name);
  fs.writeFileSync(
    path.join(atlasDirPath, ATLAS_CONFIG_FILE),
    JSON.stringify(config, null, 2),
    'utf8'
  );

  // Create root-level Atlas files (only if they don't exist)

  // CLAUDE.md - Main instructions file for Claude Code
  createFileIfNotExists(
    path.join(projectPath, ATLAS_FILES.CLAUDE),
    templates.getClaudeTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, ATLAS_FILES.STRUCTURE),
    templates.getStructureTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, ATLAS_FILES.NOTES),
    templates.getNotesTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, ATLAS_FILES.TASKS),
    templates.getTasksTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, ATLAS_FILES.QUICKSTART),
    templates.getQuickstartTemplate(name)
  );

  // Update workspace to mark as Atlas project
  workspace.updateProjectAtlasStatus(projectPath, true);

  return config;
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  ipcMain.on(IPC.CHECK_IS_ATLAS_PROJECT, (event, projectPath) => {
    const isAtlas = isAtlasProject(projectPath);
    event.sender.send(IPC.IS_ATLAS_PROJECT_RESULT, { projectPath, isAtlas });
  });

  ipcMain.on(IPC.INITIALIZE_ATLAS_PROJECT, async (event, { projectPath, projectName }) => {
    try {
      // Show confirmation dialog first
      const result = await showInitializeConfirmation(projectPath);

      if (!result.confirmed) {
        // User cancelled
        event.sender.send(IPC.ATLAS_PROJECT_INITIALIZED, {
          projectPath,
          success: false,
          cancelled: true
        });
        return;
      }

      const config = initializeAtlasProject(projectPath, projectName);

      // Handle .gitignore
      if (result.createGitignore) {
        // User chose to create a new .gitignore
        addToGitignore(projectPath, true, result.ignoreClaudeMd);
      } else if (result.gitignoreInfo.exists) {
        // Add missing entries to existing .gitignore (including CLAUDE.md if requested)
        addToGitignore(projectPath, false, result.ignoreClaudeMd);
      }

      event.sender.send(IPC.ATLAS_PROJECT_INITIALIZED, {
        projectPath,
        config,
        success: true
      });

      // Also send updated workspace
      const projects = workspace.getProjects();
      event.sender.send(IPC.WORKSPACE_UPDATED, projects);
    } catch (err) {
      console.error('Error initializing Atlas project:', err);
      event.sender.send(IPC.ATLAS_PROJECT_INITIALIZED, {
        projectPath,
        success: false,
        error: err.message
      });
    }
  });

  ipcMain.on(IPC.GET_ATLAS_CONFIG, (event, projectPath) => {
    const config = getAtlasConfig(projectPath);
    event.sender.send(IPC.ATLAS_CONFIG_DATA, { projectPath, config });
  });
}

module.exports = {
  init,
  isAtlasProject,
  getAtlasConfig,
  initializeAtlasProject,
  setupIPC
};
