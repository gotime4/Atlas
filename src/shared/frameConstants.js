/**
 * Frame Constants
 * Configuration constants for Frame project management
 */

// Atlas project folder name (inside each project)
const FRAME_DIR = '.atlas';

// Frame config file name
const FRAME_CONFIG_FILE = 'config.json';

// Workspace directory name (in user home: ~/.atlas/)
const WORKSPACE_DIR = '.atlas';

// Workspace file name
const WORKSPACE_FILE = 'workspaces.json';

// Frame auto-generated files
const FRAME_FILES = {
  CLAUDE: 'CLAUDE.md',
  STRUCTURE: 'STRUCTURE.json',
  NOTES: 'PROJECT_NOTES.md',
  TASKS: 'tasks.json',
  QUICKSTART: 'QUICKSTART.md'
};

// Frame version
const FRAME_VERSION = '1.0';

module.exports = {
  FRAME_DIR,
  FRAME_CONFIG_FILE,
  WORKSPACE_DIR,
  WORKSPACE_FILE,
  FRAME_FILES,
  FRAME_VERSION
};
