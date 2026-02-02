/**
 * IPC Channel Constants
 * Single source of truth for all IPC channel names
 */

const IPC = {
  // Terminal
  START_TERMINAL: 'start-terminal',
  RESTART_TERMINAL: 'restart-terminal',
  TERMINAL_INPUT: 'terminal-input',
  TERMINAL_OUTPUT: 'terminal-output',
  TERMINAL_RESIZE: 'terminal-resize',

  // Project
  SELECT_PROJECT_FOLDER: 'select-project-folder',
  CREATE_NEW_PROJECT: 'create-new-project',
  PROJECT_SELECTED: 'project-selected',

  // File Tree
  LOAD_FILE_TREE: 'load-file-tree',
  FILE_TREE_DATA: 'file-tree-data',

  // History
  LOAD_PROMPT_HISTORY: 'load-prompt-history',
  PROMPT_HISTORY_DATA: 'prompt-history-data',
  TOGGLE_HISTORY_PANEL: 'toggle-history-panel',

  // Commands
  RUN_COMMAND: 'run-command',

  // Workspace
  LOAD_WORKSPACE: 'load-workspace',
  WORKSPACE_DATA: 'workspace-data',
  WORKSPACE_UPDATED: 'workspace-updated',
  ADD_PROJECT_TO_WORKSPACE: 'add-project-to-workspace',
  REMOVE_PROJECT_FROM_WORKSPACE: 'remove-project-from-workspace',

  // Atlas Project
  INITIALIZE_ATLAS_PROJECT: 'initialize-atlas-project',
  ATLAS_PROJECT_INITIALIZED: 'atlas-project-initialized',
  CHECK_IS_ATLAS_PROJECT: 'check-is-atlas-project',
  IS_ATLAS_PROJECT_RESULT: 'is-atlas-project-result',
  GET_ATLAS_CONFIG: 'get-atlas-config',
  ATLAS_CONFIG_DATA: 'atlas-config-data',

  // File Editor
  READ_FILE: 'read-file',
  FILE_CONTENT: 'file-content',
  WRITE_FILE: 'write-file',
  FILE_SAVED: 'file-saved',

  // Multi-Terminal
  TERMINAL_CREATE: 'terminal-create',
  TERMINAL_CREATED: 'terminal-created',
  TERMINAL_DESTROY: 'terminal-destroy',
  TERMINAL_DESTROYED: 'terminal-destroyed',
  TERMINAL_INPUT_ID: 'terminal-input-id',
  TERMINAL_OUTPUT_ID: 'terminal-output-id',
  TERMINAL_RESIZE_ID: 'terminal-resize-id',
  TERMINAL_FOCUS: 'terminal-focus',
  GET_AVAILABLE_SHELLS: 'get-available-shells',
  AVAILABLE_SHELLS_DATA: 'available-shells-data',

  // Tasks Panel
  LOAD_TASKS: 'load-tasks',
  TASKS_DATA: 'tasks-data',
  ADD_TASK: 'add-task',
  UPDATE_TASK: 'update-task',
  DELETE_TASK: 'delete-task',
  TASK_UPDATED: 'task-updated',
  TOGGLE_TASKS_PANEL: 'toggle-tasks-panel',

  // Plugins Panel
  LOAD_PLUGINS: 'load-plugins',
  PLUGINS_DATA: 'plugins-data',
  TOGGLE_PLUGIN: 'toggle-plugin',
  PLUGIN_TOGGLED: 'plugin-toggled',
  TOGGLE_PLUGINS_PANEL: 'toggle-plugins-panel',
  REFRESH_PLUGINS: 'refresh-plugins',

  // GitHub Panel
  LOAD_GITHUB_ISSUES: 'load-github-issues',
  GITHUB_ISSUES_DATA: 'github-issues-data',
  TOGGLE_GITHUB_PANEL: 'toggle-github-panel',
  OPEN_GITHUB_ISSUE: 'open-github-issue',
  LOAD_GITHUB_PRS: 'load-github-prs',
  GITHUB_PRS_DATA: 'github-prs-data',
  LOAD_GITHUB_ACTIONS: 'load-github-actions',
  GITHUB_ACTIONS_DATA: 'github-actions-data',

  // Settings & Themes
  LOAD_SETTINGS: 'load-settings',
  SETTINGS_DATA: 'settings-data',
  UPDATE_SETTING: 'update-setting',
  SETTING_UPDATED: 'setting-updated',
  LOAD_THEMES: 'load-themes',
  THEMES_DATA: 'themes-data',
  SET_THEME: 'set-theme',
  THEME_UPDATED: 'theme-updated',

  // Sessions
  SAVE_SESSION: 'save-session',
  LOAD_SESSION: 'load-session',
  SESSION_DATA: 'session-data',

  // Prompt Templates
  LOAD_TEMPLATES: 'load-templates',
  TEMPLATES_DATA: 'templates-data',
  SAVE_TEMPLATE: 'save-template',
  UPDATE_TEMPLATE: 'update-template',
  DELETE_TEMPLATE: 'delete-template',
  MOVE_TEMPLATE: 'move-template',
  TEMPLATE_SAVED: 'template-saved',
  TOGGLE_TEMPLATES_PANEL: 'toggle-templates-panel',

  // Git Status
  GET_GIT_STATUS: 'get-git-status',
  GIT_STATUS_DATA: 'git-status-data',
  REFRESH_GIT_STATUS: 'refresh-git-status',

  // Agents Panel
  LOAD_AGENTS: 'load-agents',
  AGENTS_DATA: 'agents-data',
  SAVE_AGENT: 'save-agent',
  AGENT_SAVED: 'agent-saved',
  CREATE_AGENT: 'create-agent',
  AGENT_CREATED: 'agent-created',
  TOGGLE_AGENTS_PANEL: 'toggle-agents-panel',

  // Skills Panel
  LOAD_SKILLS: 'load-skills',
  SKILLS_DATA: 'skills-data',
  SAVE_SKILL: 'save-skill',
  SKILL_SAVED: 'skill-saved',
  CREATE_SKILL: 'create-skill',
  SKILL_CREATED: 'skill-created',
  TOGGLE_SKILLS_PANEL: 'toggle-skills-panel',

  // Diff Panel
  GET_PENDING_CHANGES: 'get-pending-changes',
  GET_FILE_DIFF: 'get-file-diff',
  ACCEPT_CHANGES: 'accept-changes',
  REVERT_CHANGES: 'revert-changes',
  REVERT_HUNK: 'revert-hunk',
  CLEAR_ALL_CHANGES: 'clear-all-changes',
  WATCH_PROJECT: 'watch-project',
  SNAPSHOT_FILE: 'snapshot-file',
  FILE_CHANGED: 'file-changed',
  TOGGLE_DIFF_PANEL: 'toggle-diff-panel',

  // Context Panel
  LOAD_CONTEXT: 'load-context',
  GET_CONTEXT_USAGE: 'get-context-usage',
  PIN_FILE: 'pin-file',
  UNPIN_FILE: 'unpin-file',
  GET_FILE_TOKENS: 'get-file-tokens',
  GET_SUGGESTED_FILES: 'get-suggested-files',
  UPDATE_CONTEXT_SETTINGS: 'update-context-settings',
  GENERATE_CONTEXT_SUMMARY: 'generate-context-summary',
  TOGGLE_CONTEXT_PANEL: 'toggle-context-panel',

  // MCP Panel
  LOAD_MCPS: 'load-mcps',
  MCPS_DATA: 'mcps-data',
  TOGGLE_MCP: 'toggle-mcp',
  MCP_TOGGLED: 'mcp-toggled',
  ADD_MCP: 'add-mcp',
  MCP_ADDED: 'mcp-added',
  REMOVE_MCP: 'remove-mcp',
  MCP_REMOVED: 'mcp-removed',
  GET_MCP_TEMPLATES: 'get-mcp-templates',
  MCP_TEMPLATES_DATA: 'mcp-templates-data',
  TOGGLE_MCP_PANEL: 'toggle-mcp-panel'
};

module.exports = { IPC };
