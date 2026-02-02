/**
 * Atlas Project Module
 * Handles Atlas project initialization and detection
 */

const fs = require('fs');
const path = require('path');
const { dialog } = require('electron');
const { IPC } = require('../shared/ipcChannels');
const { FRAME_DIR, FRAME_CONFIG_FILE, FRAME_FILES } = require('../shared/frameConstants');
const templates = require('../shared/frameTemplates');
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
function isFrameProject(projectPath) {
  const configPath = path.join(projectPath, FRAME_DIR, FRAME_CONFIG_FILE);
  return fs.existsSync(configPath);
}

/**
 * Get Frame config from project
 */
function getFrameConfig(projectPath) {
  const configPath = path.join(projectPath, FRAME_DIR, FRAME_CONFIG_FILE);
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
function checkExistingFrameFiles(projectPath) {
  const existingFiles = [];
  const filesToCheck = [
    { name: 'CLAUDE.md', path: path.join(projectPath, FRAME_FILES.CLAUDE) },
    { name: 'STRUCTURE.json', path: path.join(projectPath, FRAME_FILES.STRUCTURE) },
    { name: 'PROJECT_NOTES.md', path: path.join(projectPath, FRAME_FILES.NOTES) },
    { name: 'tasks.json', path: path.join(projectPath, FRAME_FILES.TASKS) },
    { name: 'QUICKSTART.md', path: path.join(projectPath, FRAME_FILES.QUICKSTART) },
    { name: '.atlas/', path: path.join(projectPath, FRAME_DIR) }
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

  if (exists) {
    const content = fs.readFileSync(gitignorePath, 'utf8');
    hasAtlasEntries = content.includes('.atlas') || content.includes(FRAME_DIR);
  }

  return { exists, hasAtlasEntries, path: gitignorePath };
}

/**
 * Add Atlas entries to .gitignore
 */
function addToGitignore(projectPath, createNew = false) {
  const gitignorePath = path.join(projectPath, '.gitignore');
  const atlasEntries = `
# Atlas project files
.atlas/
`;

  if (createNew) {
    fs.writeFileSync(gitignorePath, atlasEntries.trim() + '\n', 'utf8');
  } else {
    const existingContent = fs.readFileSync(gitignorePath, 'utf8');
    // Check if already has the entries
    if (!existingContent.includes('.atlas')) {
      const newContent = existingContent.trimEnd() + '\n' + atlasEntries;
      fs.writeFileSync(gitignorePath, newContent, 'utf8');
    }
  }
}

/**
 * Show confirmation dialog before initializing Atlas project
 */
async function showInitializeConfirmation(projectPath) {
  const existingFiles = checkExistingFrameFiles(projectPath);
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
      detail: 'No .gitignore file found. Would you like to create one with Atlas files excluded?\n\nThis prevents accidentally committing the .atlas/ config directory.'
    });
    createGitignore = gitignoreResult.response === 1;
  }

  return {
    confirmed: true,
    gitignoreInfo,
    createGitignore
  };
}

/**
 * Initialize a project as Atlas project
 */
function initializeFrameProject(projectPath, projectName) {
  const name = projectName || path.basename(projectPath);
  const frameDirPath = path.join(projectPath, FRAME_DIR);

  // Create .atlas directory
  if (!fs.existsSync(frameDirPath)) {
    fs.mkdirSync(frameDirPath, { recursive: true });
  }

  // Create .atlas/config.json
  const config = templates.getFrameConfigTemplate(name);
  fs.writeFileSync(
    path.join(frameDirPath, FRAME_CONFIG_FILE),
    JSON.stringify(config, null, 2),
    'utf8'
  );

  // Create root-level Frame files (only if they don't exist)

  // CLAUDE.md - Main instructions file for Claude Code
  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.CLAUDE),
    templates.getClaudeTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.STRUCTURE),
    templates.getStructureTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.NOTES),
    templates.getNotesTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.TASKS),
    templates.getTasksTemplate(name)
  );

  createFileIfNotExists(
    path.join(projectPath, FRAME_FILES.QUICKSTART),
    templates.getQuickstartTemplate(name)
  );

  // Update workspace to mark as Atlas project
  workspace.updateProjectFrameStatus(projectPath, true);

  return config;
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  ipcMain.on(IPC.CHECK_IS_FRAME_PROJECT, (event, projectPath) => {
    const isFrame = isFrameProject(projectPath);
    event.sender.send(IPC.IS_FRAME_PROJECT_RESULT, { projectPath, isFrame });
  });

  ipcMain.on(IPC.INITIALIZE_FRAME_PROJECT, async (event, { projectPath, projectName }) => {
    try {
      // Show confirmation dialog first
      const result = await showInitializeConfirmation(projectPath);

      if (!result.confirmed) {
        // User cancelled
        event.sender.send(IPC.FRAME_PROJECT_INITIALIZED, {
          projectPath,
          success: false,
          cancelled: true
        });
        return;
      }

      const config = initializeFrameProject(projectPath, projectName);

      // Handle .gitignore
      if (result.createGitignore) {
        // User chose to create a new .gitignore
        addToGitignore(projectPath, true);
      } else if (result.gitignoreInfo.exists && !result.gitignoreInfo.hasAtlasEntries) {
        // Add to existing .gitignore
        addToGitignore(projectPath, false);
      }

      event.sender.send(IPC.FRAME_PROJECT_INITIALIZED, {
        projectPath,
        config,
        success: true
      });

      // Also send updated workspace
      const projects = workspace.getProjects();
      event.sender.send(IPC.WORKSPACE_UPDATED, projects);
    } catch (err) {
      console.error('Error initializing Atlas project:', err);
      event.sender.send(IPC.FRAME_PROJECT_INITIALIZED, {
        projectPath,
        success: false,
        error: err.message
      });
    }
  });

  ipcMain.on(IPC.GET_FRAME_CONFIG, (event, projectPath) => {
    const config = getFrameConfig(projectPath);
    event.sender.send(IPC.FRAME_CONFIG_DATA, { projectPath, config });
  });
}

module.exports = {
  init,
  isFrameProject,
  getFrameConfig,
  initializeFrameProject,
  setupIPC
};
