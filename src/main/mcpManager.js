/**
 * MCP Manager
 * Manages MCP (Model Context Protocol) servers from ~/.claude.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { IPC } = require('../shared/ipcChannels');

let mainWindow = null;

/**
 * Initialize module
 */
function init(window) {
  mainWindow = window;
}

/**
 * Get the path to ~/.claude.json
 */
function getClaudeConfigPath() {
  return path.join(os.homedir(), '.claude.json');
}

/**
 * Read ~/.claude.json
 */
function readClaudeConfig() {
  const configPath = getClaudeConfigPath();
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading ~/.claude.json:', err);
  }
  return {};
}

/**
 * Write ~/.claude.json
 */
function writeClaudeConfig(config) {
  const configPath = getClaudeConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Error writing ~/.claude.json:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get MCP type from config
 */
function getMcpType(mcpConfig) {
  if (mcpConfig.type) return mcpConfig.type;
  if (mcpConfig.command) return 'stdio';
  if (mcpConfig.url && mcpConfig.url.includes('/sse')) return 'sse';
  if (mcpConfig.url) return 'http';
  return 'unknown';
}

/**
 * Get MCP icon based on type
 */
function getMcpIcon(type) {
  switch (type) {
    case 'stdio': return '⚡';
    case 'http': return '🌐';
    case 'sse': return '📡';
    default: return '🔌';
  }
}

/**
 * Load MCPs for a project path
 * Loads both enabled (in mcpServers) and disabled (in _disabledMcpServers) MCPs
 */
function loadMcps(projectPath) {
  const config = readClaudeConfig();
  const mcps = [];

  // Helper to load MCPs from a location
  const loadFromLocation = (mcpServers, disabledMcpServers, scope, scopeLabel, projPath) => {
    // Load enabled MCPs
    if (mcpServers) {
      for (const [name, mcpConfig] of Object.entries(mcpServers)) {
        const type = getMcpType(mcpConfig);
        mcps.push({
          id: scope === 'parent' ? `${scope}:${name}:${projPath}` : `${scope}:${name}`,
          name,
          scope,
          scopeLabel,
          type,
          icon: getMcpIcon(type),
          config: mcpConfig,
          projectPath: projPath,
          enabled: true
        });
      }
    }

    // Load disabled MCPs (stored in _disabledMcpServers)
    if (disabledMcpServers) {
      for (const [name, mcpConfig] of Object.entries(disabledMcpServers)) {
        // Skip if already have an enabled version
        if (mcps.some(m => m.name === name && m.scope === scope)) continue;

        const type = getMcpType(mcpConfig);
        mcps.push({
          id: scope === 'parent' ? `${scope}:${name}:${projPath}` : `${scope}:${name}`,
          name,
          scope,
          scopeLabel,
          type,
          icon: getMcpIcon(type),
          config: mcpConfig,
          projectPath: projPath,
          enabled: false
        });
      }
    }
  };

  // Global MCPs
  loadFromLocation(config.mcpServers, config._disabledMcpServers, 'global', 'Global', null);

  // Project-specific MCPs
  if (projectPath && config.projects) {
    // Check exact project path
    const projectConfig = config.projects[projectPath];
    if (projectConfig) {
      loadFromLocation(projectConfig.mcpServers, projectConfig._disabledMcpServers, 'project', '.claude', projectPath);
    }

    // Check parent directories
    let currentDir = path.dirname(projectPath);
    const homeDir = os.homedir();

    while (currentDir && currentDir.startsWith(homeDir) && currentDir !== homeDir) {
      const parentConfig = config.projects[currentDir];
      if (parentConfig) {
        const relativePath = path.relative(projectPath, currentDir);
        // Only add if not already added from more specific path
        const existingNames = new Set(mcps.filter(m => m.scope !== 'global').map(m => m.name));

        if (parentConfig.mcpServers) {
          for (const [name, mcpConfig] of Object.entries(parentConfig.mcpServers)) {
            if (existingNames.has(name)) continue;
            const type = getMcpType(mcpConfig);
            mcps.push({
              id: `parent:${name}:${currentDir}`,
              name,
              scope: 'parent',
              scopeLabel: relativePath || path.basename(currentDir),
              type,
              icon: getMcpIcon(type),
              config: mcpConfig,
              projectPath: currentDir,
              enabled: true
            });
            existingNames.add(name);
          }
        }

        if (parentConfig._disabledMcpServers) {
          for (const [name, mcpConfig] of Object.entries(parentConfig._disabledMcpServers)) {
            if (existingNames.has(name)) continue;
            const type = getMcpType(mcpConfig);
            mcps.push({
              id: `parent:${name}:${currentDir}`,
              name,
              scope: 'parent',
              scopeLabel: relativePath || path.basename(currentDir),
              type,
              icon: getMcpIcon(type),
              config: mcpConfig,
              projectPath: currentDir,
              enabled: false
            });
          }
        }
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }
  }

  // Sort: project first, then parent, then global
  const scopeOrder = { project: 0, parent: 1, global: 2 };
  mcps.sort((a, b) => {
    const scopeDiff = scopeOrder[a.scope] - scopeOrder[b.scope];
    if (scopeDiff !== 0) return scopeDiff;
    return a.name.localeCompare(b.name);
  });

  return mcps;
}

/**
 * Toggle MCP enabled/disabled state
 * Moves MCP between mcpServers (enabled) and _disabledMcpServers (disabled)
 */
function toggleMcp(mcpId, projectPath, enabled) {
  const config = readClaudeConfig();

  const [scope, name, parentPath] = mcpId.split(':');

  if (scope === 'global') {
    if (enabled) {
      // Move from _disabledMcpServers to mcpServers
      if (!config._disabledMcpServers?.[name]) {
        return { success: false, error: 'MCP not found in disabled list' };
      }
      if (!config.mcpServers) config.mcpServers = {};
      config.mcpServers[name] = config._disabledMcpServers[name];
      delete config._disabledMcpServers[name];
      if (Object.keys(config._disabledMcpServers).length === 0) {
        delete config._disabledMcpServers;
      }
    } else {
      // Move from mcpServers to _disabledMcpServers
      if (!config.mcpServers?.[name]) {
        return { success: false, error: 'MCP not found' };
      }
      if (!config._disabledMcpServers) config._disabledMcpServers = {};
      config._disabledMcpServers[name] = config.mcpServers[name];
      delete config.mcpServers[name];
      if (Object.keys(config.mcpServers).length === 0) {
        delete config.mcpServers;
      }
    }
  } else {
    const targetPath = scope === 'parent' ? parentPath : projectPath;

    if (!config.projects?.[targetPath]) {
      return { success: false, error: 'Project not found' };
    }

    const proj = config.projects[targetPath];

    if (enabled) {
      // Move from _disabledMcpServers to mcpServers
      if (!proj._disabledMcpServers?.[name]) {
        return { success: false, error: 'MCP not found in disabled list' };
      }
      if (!proj.mcpServers) proj.mcpServers = {};
      proj.mcpServers[name] = proj._disabledMcpServers[name];
      delete proj._disabledMcpServers[name];
      if (Object.keys(proj._disabledMcpServers).length === 0) {
        delete proj._disabledMcpServers;
      }
    } else {
      // Move from mcpServers to _disabledMcpServers
      if (!proj.mcpServers?.[name]) {
        return { success: false, error: 'MCP not found' };
      }
      if (!proj._disabledMcpServers) proj._disabledMcpServers = {};
      proj._disabledMcpServers[name] = proj.mcpServers[name];
      delete proj.mcpServers[name];
      if (Object.keys(proj.mcpServers).length === 0) {
        delete proj.mcpServers;
      }
    }
  }

  return writeClaudeConfig(config);
}

/**
 * Add a new MCP
 */
function addMcp(projectPath, name, mcpConfig, scope = 'project') {
  const config = readClaudeConfig();

  if (scope === 'global') {
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
    config.mcpServers[name] = mcpConfig;
  } else {
    if (!config.projects) {
      config.projects = {};
    }
    if (!config.projects[projectPath]) {
      config.projects[projectPath] = {};
    }
    if (!config.projects[projectPath].mcpServers) {
      config.projects[projectPath].mcpServers = {};
    }
    config.projects[projectPath].mcpServers[name] = mcpConfig;
  }

  return writeClaudeConfig(config);
}

/**
 * Remove an MCP
 */
function removeMcp(mcpId, projectPath) {
  const config = readClaudeConfig();

  const [scope, name, parentPath] = mcpId.split(':');

  if (scope === 'global') {
    if (config.mcpServers?.[name]) {
      delete config.mcpServers[name];
    }
  } else {
    const targetPath = scope === 'parent' ? parentPath : projectPath;
    if (config.projects?.[targetPath]?.mcpServers?.[name]) {
      delete config.projects[targetPath].mcpServers[name];
    }
  }

  return writeClaudeConfig(config);
}

/**
 * Get MCP templates for common services
 */
function getMcpTemplates() {
  return [
    {
      id: 'github',
      name: 'GitHub',
      description: 'GitHub API integration',
      icon: '🐙',
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@anthropics/mcp-github'],
        env: {
          GITHUB_TOKEN: '${GITHUB_TOKEN}'
        }
      }
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Slack workspace integration',
      icon: '💬',
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@anthropics/mcp-slack'],
        env: {
          SLACK_BOT_TOKEN: '${SLACK_BOT_TOKEN}'
        }
      }
    },
    {
      id: 'jira',
      name: 'Jira',
      description: 'Atlassian Jira integration',
      icon: '📋',
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@anthropics/mcp-atlassian'],
        env: {
          ATLASSIAN_EMAIL: '${ATLASSIAN_EMAIL}',
          ATLASSIAN_API_TOKEN: '${ATLASSIAN_API_TOKEN}',
          ATLASSIAN_SITE_URL: '${ATLASSIAN_SITE_URL}'
        }
      }
    },
    {
      id: 'clickup',
      name: 'ClickUp',
      description: 'ClickUp project management',
      icon: '✅',
      config: {
        type: 'http',
        url: 'https://mcp.clickup.com/mcp'
      }
    },
    {
      id: 'playwright',
      name: 'Playwright',
      description: 'Browser automation and testing',
      icon: '🎭',
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['@playwright/mcp@latest']
      }
    },
    {
      id: 'filesystem',
      name: 'Filesystem',
      description: 'Local filesystem access',
      icon: '📁',
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@anthropics/mcp-filesystem', '/path/to/directory']
      }
    },
    {
      id: 'postgres',
      name: 'PostgreSQL',
      description: 'PostgreSQL database access',
      icon: '🐘',
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@anthropics/mcp-postgres'],
        env: {
          DATABASE_URL: '${DATABASE_URL}'
        }
      }
    },
    {
      id: 'sqlite',
      name: 'SQLite',
      description: 'SQLite database access',
      icon: '💾',
      config: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@anthropics/mcp-sqlite', '/path/to/database.db']
      }
    },
    {
      id: 'custom-http',
      name: 'Custom HTTP',
      description: 'Custom HTTP/SSE MCP server',
      icon: '🌐',
      config: {
        type: 'http',
        url: 'http://localhost:8000/mcp'
      }
    },
    {
      id: 'custom-stdio',
      name: 'Custom StdIO',
      description: 'Custom command-line MCP server',
      icon: '⚡',
      config: {
        type: 'stdio',
        command: 'node',
        args: ['path/to/server.js']
      }
    }
  ];
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  ipcMain.on(IPC.LOAD_MCPS, (event, projectPath) => {
    const mcps = loadMcps(projectPath);
    event.sender.send(IPC.MCPS_DATA, mcps);
  });

  ipcMain.on(IPC.TOGGLE_MCP, (event, { mcpId, projectPath, enabled }) => {
    const result = toggleMcp(mcpId, projectPath, enabled);
    event.sender.send(IPC.MCP_TOGGLED, result);
    if (result.success) {
      const mcps = loadMcps(projectPath);
      event.sender.send(IPC.MCPS_DATA, mcps);
    }
  });

  ipcMain.on(IPC.ADD_MCP, (event, { projectPath, name, config, scope }) => {
    const result = addMcp(projectPath, name, config, scope);
    event.sender.send(IPC.MCP_ADDED, result);
    if (result.success) {
      const mcps = loadMcps(projectPath);
      event.sender.send(IPC.MCPS_DATA, mcps);
    }
  });

  ipcMain.on(IPC.REMOVE_MCP, (event, { mcpId, projectPath }) => {
    const result = removeMcp(mcpId, projectPath);
    event.sender.send(IPC.MCP_REMOVED, result);
    if (result.success) {
      const mcps = loadMcps(projectPath);
      event.sender.send(IPC.MCPS_DATA, mcps);
    }
  });

  ipcMain.on(IPC.GET_MCP_TEMPLATES, (event) => {
    const templates = getMcpTemplates();
    event.sender.send(IPC.MCP_TEMPLATES_DATA, templates);
  });
}

module.exports = {
  init,
  setupIPC,
  loadMcps,
  toggleMcp,
  addMcp,
  removeMcp,
  getMcpTemplates
};
