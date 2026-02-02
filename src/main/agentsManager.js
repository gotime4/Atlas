/**
 * Agents Manager
 * Discovers and manages Claude agents from .claude/agents folders
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
 * Find all .claude directories accessible from a project path
 * Searches: project dir, parent dirs up to home, and ~/.claude
 */
function findClaudeDirs(projectPath) {
  const claudeDirs = [];
  const homeDir = os.homedir();

  // User-wide ~/.claude
  const userClaudeDir = path.join(homeDir, '.claude');
  if (fs.existsSync(userClaudeDir)) {
    claudeDirs.push({ path: userClaudeDir, scope: 'user', label: '~/.claude' });
  }

  if (!projectPath) {
    return claudeDirs;
  }

  // Walk up from project to home, collecting .claude dirs
  let currentDir = projectPath;
  const visitedDirs = new Set();

  while (currentDir && currentDir.startsWith(homeDir) && !visitedDirs.has(currentDir)) {
    visitedDirs.add(currentDir);
    const claudeDir = path.join(currentDir, '.claude');

    if (fs.existsSync(claudeDir) && claudeDir !== userClaudeDir) {
      const isProject = currentDir === projectPath;
      claudeDirs.push({
        path: claudeDir,
        scope: isProject ? 'project' : 'parent',
        label: isProject ? '.claude' : path.relative(projectPath, claudeDir)
      });
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return claudeDirs;
}

/**
 * Load agents from all accessible .claude directories
 */
function loadAgents(projectPath) {
  const claudeDirs = findClaudeDirs(projectPath);
  const agents = [];

  for (const claudeDir of claudeDirs) {
    const agentsDir = path.join(claudeDir.path, 'agents');

    if (!fs.existsSync(agentsDir)) {
      continue;
    }

    try {
      const files = fs.readdirSync(agentsDir);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;

        const filePath = path.join(agentsDir, file);
        const stat = fs.statSync(filePath);

        if (!stat.isFile()) continue;

        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const name = path.basename(file, '.md');

          // Extract description from first paragraph or heading
          const description = extractDescription(content);

          agents.push({
            id: `${claudeDir.scope}:${name}`,
            name,
            scope: claudeDir.scope,
            scopeLabel: claudeDir.label,
            filePath,
            content,
            description,
            modifiedAt: stat.mtime.toISOString()
          });
        } catch (err) {
          console.error(`Error reading agent file ${filePath}:`, err);
        }
      }
    } catch (err) {
      console.error(`Error reading agents directory ${agentsDir}:`, err);
    }
  }

  // Sort: project first, then parent, then user
  const scopeOrder = { project: 0, parent: 1, user: 2 };
  agents.sort((a, b) => {
    const scopeDiff = scopeOrder[a.scope] - scopeOrder[b.scope];
    if (scopeDiff !== 0) return scopeDiff;
    return a.name.localeCompare(b.name);
  });

  return agents;
}

/**
 * Extract description from markdown content
 * Handles YAML frontmatter if present
 */
function extractDescription(content) {
  const lines = content.split('\n');

  // Check for YAML frontmatter
  if (lines[0] && lines[0].trim() === '---') {
    // Find the closing ---
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        // Parse frontmatter for description
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

  // Fallback: find first non-empty, non-heading, non-frontmatter line
  let inFrontmatter = lines[0] && lines[0].trim() === '---';
  for (const line of lines) {
    const trimmed = line.trim();

    if (inFrontmatter) {
      if (trimmed === '---') inFrontmatter = false;
      continue;
    }

    // Skip empty lines, headings, and frontmatter delimiters
    if (!trimmed || trimmed.startsWith('#') || trimmed === '---') continue;

    // Return first content line (truncated)
    return trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed;
  }

  return 'No description';
}

/**
 * Save agent content
 */
function saveAgent(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('Error saving agent:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Create a new agent
 */
function createAgent(name, content, scope, projectPath) {
  try {
    let targetDir;

    if (scope === 'user') {
      // Create in ~/.claude/agents/
      targetDir = path.join(os.homedir(), '.claude', 'agents');
    } else {
      // Create in project's .claude/agents/
      if (!projectPath) {
        return { success: false, error: 'No project path specified' };
      }
      targetDir = path.join(projectPath, '.claude', 'agents');
    }

    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, `${name}.md`);

    // Check if file already exists
    if (fs.existsSync(filePath)) {
      return { success: false, error: `Agent "${name}" already exists` };
    }

    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('Error creating agent:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  ipcMain.on(IPC.LOAD_AGENTS, (event, projectPath) => {
    const agents = loadAgents(projectPath);
    event.sender.send(IPC.AGENTS_DATA, agents);
  });

  ipcMain.on(IPC.SAVE_AGENT, (event, { filePath, content }) => {
    const result = saveAgent(filePath, content);
    event.sender.send(IPC.AGENT_SAVED, result);
  });

  ipcMain.on(IPC.CREATE_AGENT, (event, { name, content, scope, projectPath }) => {
    const result = createAgent(name, content, scope, projectPath);
    event.sender.send(IPC.AGENT_CREATED, result);
  });
}

module.exports = {
  init,
  setupIPC,
  loadAgents,
  saveAgent,
  createAgent
};
