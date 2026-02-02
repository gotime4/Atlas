/**
 * Atlas Constants
 * Configuration constants for Atlas project management
 */

// Atlas project folder name (inside each project)
const ATLAS_DIR = '.atlas';

// Atlas config file name
const ATLAS_CONFIG_FILE = 'config.json';

// Workspace directory name (in user home: ~/.atlas/)
const WORKSPACE_DIR = '.atlas';

// Workspace file name
const WORKSPACE_FILE = 'workspaces.json';

// Atlas auto-generated files
const ATLAS_FILES = {
  CLAUDE: 'CLAUDE.md',
  STRUCTURE: 'STRUCTURE.json',
  NOTES: 'PROJECT_NOTES.md',
  TASKS: 'tasks.json',
  QUICKSTART: 'QUICKSTART.md'
};

// Atlas version
const ATLAS_VERSION = '1.0';

module.exports = {
  ATLAS_DIR,
  ATLAS_CONFIG_FILE,
  WORKSPACE_DIR,
  WORKSPACE_FILE,
  ATLAS_FILES,
  ATLAS_VERSION
};
