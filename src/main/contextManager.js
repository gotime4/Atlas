/**
 * Context Manager
 * Manages Claude's context - pinned files, token counting, context limits
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { IPC } = require('../shared/ipcChannels');

let mainWindow = null;

// Context storage per project
const projectContexts = new Map();

// Approximate tokens per character (Claude uses ~4 chars per token on average)
const CHARS_PER_TOKEN = 4;

// Context limits (approximate)
const CONTEXT_LIMITS = {
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-3.5-sonnet': 200000,
  'claude-opus-4': 200000,
  'default': 200000
};

// Estimated fixed overhead tokens (system prompt + system tools)
const SYSTEM_OVERHEAD = {
  systemPrompt: 2800,  // ~2.8k tokens for system prompt
  systemTools: 16500   // ~16.5k tokens for built-in tools
};

// Claude Code projects directory
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

/**
 * Initialize module
 */
function init(window) {
  mainWindow = window;
}

/**
 * Convert project path to Claude's directory name format
 * e.g., /Users/ryan/vega/vega-web -> -Users-ryan-vega-vega-web
 */
function projectPathToClaudeDir(projectPath) {
  return projectPath.replace(/\//g, '-');
}

/**
 * Find the active Claude session file for a project
 * Returns the most recently modified .jsonl file
 */
function findActiveSessionFile(projectPath) {
  if (!projectPath) return null;

  const claudeDir = path.join(CLAUDE_PROJECTS_DIR, projectPathToClaudeDir(projectPath));

  if (!fs.existsSync(claudeDir)) return null;

  try {
    const files = fs.readdirSync(claudeDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: path.join(claudeDir, f),
        mtime: fs.statSync(path.join(claudeDir, f)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    return files.length > 0 ? files[0].path : null;
  } catch (err) {
    return null;
  }
}

/**
 * Count message tokens from Claude conversation file
 */
function countMessageTokens(sessionFile) {
  if (!sessionFile || !fs.existsSync(sessionFile)) return 0;

  let totalTokens = 0;

  try {
    const content = fs.readFileSync(sessionFile, 'utf8');
    const lines = content.trim().split('\n');

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Count user messages
        if (entry.type === 'user' && entry.message?.content) {
          const text = typeof entry.message.content === 'string'
            ? entry.message.content
            : JSON.stringify(entry.message.content);
          totalTokens += estimateTokens(text);
        }

        // Count assistant messages
        if (entry.type === 'assistant' && entry.message?.content) {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            for (const item of content) {
              if (item.type === 'text' && item.text) {
                totalTokens += estimateTokens(item.text);
              }
            }
          } else if (typeof content === 'string') {
            totalTokens += estimateTokens(content);
          }
        }
      } catch (parseErr) {
        // Skip malformed lines
      }
    }
  } catch (err) {
    console.error('Error reading session file:', err);
  }

  return totalTokens;
}

/**
 * Get context file path for a project
 */
function getContextFilePath(projectPath) {
  return path.join(projectPath, '.atlas', 'context.json');
}

/**
 * Load context for a project
 */
function loadContext(projectPath) {
  if (!projectPath) return getDefaultContext();

  // Check cache first
  if (projectContexts.has(projectPath)) {
    return projectContexts.get(projectPath);
  }

  const contextPath = getContextFilePath(projectPath);

  try {
    if (fs.existsSync(contextPath)) {
      const data = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
      projectContexts.set(projectPath, data);
      return data;
    }
  } catch (err) {
    console.error('Error loading context:', err);
  }

  const defaultContext = getDefaultContext();
  projectContexts.set(projectPath, defaultContext);
  return defaultContext;
}

/**
 * Get default context structure
 */
function getDefaultContext() {
  return {
    pinnedFiles: [],
    excludedPatterns: [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '*.lock',
      '*.log'
    ],
    maxTokens: CONTEXT_LIMITS.default,
    model: 'default'
  };
}

/**
 * Save context for a project
 */
function saveContext(projectPath, context) {
  if (!projectPath) return { success: false, error: 'No project path' };

  const contextPath = getContextFilePath(projectPath);
  const contextDir = path.dirname(contextPath);

  try {
    if (!fs.existsSync(contextDir)) {
      fs.mkdirSync(contextDir, { recursive: true });
    }

    fs.writeFileSync(contextPath, JSON.stringify(context, null, 2), 'utf8');
    projectContexts.set(projectPath, context);
    return { success: true };
  } catch (err) {
    console.error('Error saving context:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Pin a file to context
 */
function pinFile(projectPath, filePath) {
  const context = loadContext(projectPath);

  // Check if already pinned
  if (context.pinnedFiles.some(f => f.path === filePath)) {
    return { success: false, error: 'File already pinned' };
  }

  // Get file info
  const fileInfo = getFileInfo(filePath);
  if (!fileInfo) {
    return { success: false, error: 'Could not read file' };
  }

  context.pinnedFiles.push({
    path: filePath,
    relativePath: projectPath ? path.relative(projectPath, filePath) : filePath,
    name: path.basename(filePath),
    tokens: fileInfo.tokens,
    size: fileInfo.size,
    pinnedAt: Date.now()
  });

  return saveContext(projectPath, context);
}

/**
 * Unpin a file from context
 */
function unpinFile(projectPath, filePath) {
  const context = loadContext(projectPath);

  const index = context.pinnedFiles.findIndex(f => f.path === filePath);
  if (index === -1) {
    return { success: false, error: 'File not pinned' };
  }

  context.pinnedFiles.splice(index, 1);
  return saveContext(projectPath, context);
}

/**
 * Get file info including token estimate
 */
function getFileInfo(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;

    const content = fs.readFileSync(filePath, 'utf8');
    const tokens = estimateTokens(content);

    return {
      path: filePath,
      name: path.basename(filePath),
      size: stat.size,
      tokens,
      content
    };
  } catch (err) {
    return null;
  }
}

/**
 * Estimate token count for content
 */
function estimateTokens(content) {
  if (!content) return 0;

  // Simple estimation: ~4 characters per token
  // This is approximate - real tokenization is more complex
  return Math.ceil(content.length / CHARS_PER_TOKEN);
}

/**
 * Get total context usage - matches Claude Code's /context breakdown
 */
function getContextUsage(projectPath) {
  const context = loadContext(projectPath);

  // Calculate pinned files tokens
  let pinnedTokens = 0;
  const fileDetails = [];

  for (const pinnedFile of context.pinnedFiles) {
    const info = getFileInfo(pinnedFile.path);
    const tokens = info ? info.tokens : pinnedFile.tokens;

    pinnedTokens += tokens;
    fileDetails.push({
      ...pinnedFile,
      tokens,
      exists: !!info
    });
  }

  // Memory files (CLAUDE.md from multiple locations)
  let memoryTokens = 0;
  const memoryFiles = getMemoryFiles(projectPath);
  for (const filePath of memoryFiles) {
    const info = getFileInfo(filePath);
    if (info) {
      memoryTokens += info.tokens;
    }
  }

  // Skills tokens - only count actual user-invocable skills (small metadata)
  // Claude Code skills are lightweight - just the command definition
  let skillsTokens = 0;
  skillsTokens += getSkillsTokens(projectPath ? path.join(projectPath, '.claude', 'commands') : null);
  skillsTokens += getSkillsTokens(path.join(os.homedir(), '.claude', 'commands'));

  // Agents tokens (if used)
  let agentsTokens = 0;
  const agentsDir = projectPath ? path.join(projectPath, '.claude', 'agents') : null;
  const userAgentsDir = path.join(os.homedir(), '.claude', 'agents');
  agentsTokens += getDirectoryTokens(agentsDir);
  agentsTokens += getDirectoryTokens(userAgentsDir);

  // MCP tools - estimate based on configured MCPs and tool counts
  let mcpTokens = 0;
  try {
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    if (fs.existsSync(claudeConfigPath)) {
      const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));
      mcpTokens = estimateMcpTokens(claudeConfig, projectPath);
    }
  } catch (err) {
    // Ignore errors reading claude config
  }

  // Messages - count from active Claude session
  let messagesTokens = 0;
  const sessionFile = findActiveSessionFile(projectPath);
  if (sessionFile) {
    messagesTokens = countMessageTokens(sessionFile);
  }

  // Calculate totals
  const systemPromptTokens = SYSTEM_OVERHEAD.systemPrompt;
  const systemToolsTokens = SYSTEM_OVERHEAD.systemTools;

  const totalUsed = systemPromptTokens + systemToolsTokens + mcpTokens +
                    memoryTokens + skillsTokens + agentsTokens + pinnedTokens + messagesTokens;

  const maxTokens = context.maxTokens;
  const freeSpace = Math.max(0, maxTokens - totalUsed);
  const autocompactBuffer = Math.round(maxTokens * 0.165); // ~16.5% buffer

  return {
    // Breakdown by category
    breakdown: {
      systemPrompt: { tokens: systemPromptTokens, percent: ((systemPromptTokens / maxTokens) * 100).toFixed(1) },
      systemTools: { tokens: systemToolsTokens, percent: ((systemToolsTokens / maxTokens) * 100).toFixed(1) },
      mcpTools: { tokens: mcpTokens, percent: ((mcpTokens / maxTokens) * 100).toFixed(1) },
      memory: { tokens: memoryTokens, percent: ((memoryTokens / maxTokens) * 100).toFixed(1) },
      skills: { tokens: skillsTokens, percent: ((skillsTokens / maxTokens) * 100).toFixed(1) },
      agents: { tokens: agentsTokens, percent: ((agentsTokens / maxTokens) * 100).toFixed(1) },
      pinned: { tokens: pinnedTokens, percent: ((pinnedTokens / maxTokens) * 100).toFixed(1) },
      messages: { tokens: messagesTokens, percent: ((messagesTokens / maxTokens) * 100).toFixed(1) },
      freeSpace: { tokens: freeSpace, percent: ((freeSpace / maxTokens) * 100).toFixed(1) },
      autocompactBuffer: { tokens: autocompactBuffer, percent: '16.5' }
    },

    // Legacy fields for backward compatibility
    pinnedFiles: fileDetails,
    totalPinnedTokens: pinnedTokens,
    claudeMdTokens: memoryTokens,
    skillsTokens,
    agentsTokens,
    mcpTokens,
    messagesTokens,

    // Totals
    totalTokens: totalUsed,
    maxTokens,
    percentUsed: Math.round((totalUsed / maxTokens) * 100),
    model: context.model
  };
}

/**
 * Get total tokens for all .md files in a directory
 */
function getDirectoryTokens(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return 0;

  let tokens = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(dirPath, file);
        const info = getFileInfo(filePath);
        if (info) {
          tokens += info.tokens;
        }
      }
    }
  } catch (err) {
    // Ignore errors
  }
  return tokens;
}

/**
 * Get all memory files (CLAUDE.md from multiple locations)
 * Claude Code loads CLAUDE.md from: user home, parent dirs, and project
 */
function getMemoryFiles(projectPath) {
  const files = [];

  // User-level CLAUDE.md
  const userClaudeMd = path.join(os.homedir(), '.claude', 'CLAUDE.md');
  if (fs.existsSync(userClaudeMd)) {
    files.push(userClaudeMd);
  }

  // Also check home directory root
  const homeClaudeMd = path.join(os.homedir(), 'CLAUDE.md');
  if (fs.existsSync(homeClaudeMd)) {
    files.push(homeClaudeMd);
  }

  if (projectPath) {
    // Walk up parent directories looking for CLAUDE.md
    let currentDir = path.dirname(projectPath);
    const homeDir = os.homedir();

    while (currentDir && currentDir !== homeDir && currentDir !== path.dirname(currentDir)) {
      const parentClaudeMd = path.join(currentDir, 'CLAUDE.md');
      if (fs.existsSync(parentClaudeMd)) {
        files.push(parentClaudeMd);
      }
      currentDir = path.dirname(currentDir);
    }

    // Project-level CLAUDE.md
    const projectClaudeMd = path.join(projectPath, 'CLAUDE.md');
    if (fs.existsSync(projectClaudeMd)) {
      files.push(projectClaudeMd);
    }

    // Also check .claude/CLAUDE.md in project
    const projectDotClaudeMd = path.join(projectPath, '.claude', 'CLAUDE.md');
    if (fs.existsSync(projectDotClaudeMd)) {
      files.push(projectDotClaudeMd);
    }
  }

  return files;
}

/**
 * Get tokens for skills - only count actual skill definitions
 * Skills are lightweight command definitions, not full content
 */
function getSkillsTokens(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return 0;

  let tokens = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(dirPath, file);
        const info = getFileInfo(filePath);
        if (info) {
          tokens += info.tokens;
        }
      }
    }
  } catch (err) {
    // Ignore errors
  }
  return tokens;
}

/**
 * Estimate MCP tokens based on known MCP tool counts
 * Different MCPs have different numbers of tools
 */
function estimateMcpTokens(claudeConfig, projectPath) {
  let totalTokens = 0;

  // Known MCP tool counts (approximate)
  const knownMcpToolCounts = {
    'clickup': 30,      // ClickUp has ~30 tools
    'github': 15,       // GitHub MCP ~15 tools
    'slack': 10,        // Slack MCP ~10 tools
    'notion': 12,       // Notion MCP ~12 tools
    'linear': 15,       // Linear MCP ~15 tools
    'filesystem': 8,    // Filesystem MCP ~8 tools
    'postgres': 5,      // Postgres MCP ~5 tools
    'sqlite': 5,        // SQLite MCP ~5 tools
    'brave-search': 2,  // Brave search ~2 tools
    'fetch': 2,         // Fetch MCP ~2 tools
    'memory': 3,        // Memory MCP ~3 tools
    'puppeteer': 10,    // Puppeteer MCP ~10 tools
    'mermaid': 2,       // Mermaid MCP ~2 tools
  };

  // Average tokens per tool definition (~400-500 based on Claude's breakdown)
  const tokensPerTool = 450;

  // Default tool count for unknown MCPs
  const defaultToolCount = 8;

  // Count global MCPs
  if (claudeConfig.mcpServers) {
    for (const mcpName of Object.keys(claudeConfig.mcpServers)) {
      const normalizedName = mcpName.toLowerCase();
      let toolCount = defaultToolCount;

      // Check if we know this MCP's tool count
      for (const [known, count] of Object.entries(knownMcpToolCounts)) {
        if (normalizedName.includes(known)) {
          toolCount = count;
          break;
        }
      }

      totalTokens += toolCount * tokensPerTool;
    }
  }

  // Count project-specific MCPs
  if (projectPath && claudeConfig.projects?.[projectPath]?.mcpServers) {
    for (const mcpName of Object.keys(claudeConfig.projects[projectPath].mcpServers)) {
      const normalizedName = mcpName.toLowerCase();
      let toolCount = defaultToolCount;

      for (const [known, count] of Object.entries(knownMcpToolCounts)) {
        if (normalizedName.includes(known)) {
          toolCount = count;
          break;
        }
      }

      totalTokens += toolCount * tokensPerTool;
    }
  }

  return totalTokens;
}

/**
 * Update excluded patterns
 */
function updateExcludedPatterns(projectPath, patterns) {
  const context = loadContext(projectPath);
  context.excludedPatterns = patterns;
  return saveContext(projectPath, context);
}

/**
 * Update context limit/model
 */
function updateContextSettings(projectPath, settings) {
  const context = loadContext(projectPath);

  if (settings.maxTokens) {
    context.maxTokens = settings.maxTokens;
  }
  if (settings.model) {
    context.model = settings.model;
    context.maxTokens = CONTEXT_LIMITS[settings.model] || CONTEXT_LIMITS.default;
  }

  return saveContext(projectPath, context);
}

/**
 * Get suggested files to pin based on project structure
 */
function getSuggestedFiles(projectPath) {
  if (!projectPath) return [];

  const suggestions = [];
  const importantFiles = [
    'CLAUDE.md',
    'README.md',
    'package.json',
    'tsconfig.json',
    '.env.example',
    'STRUCTURE.json'
  ];

  for (const filename of importantFiles) {
    const filePath = path.join(projectPath, filename);
    if (fs.existsSync(filePath)) {
      const info = getFileInfo(filePath);
      if (info) {
        suggestions.push({
          path: filePath,
          name: filename,
          tokens: info.tokens,
          reason: getFileReason(filename)
        });
      }
    }
  }

  return suggestions;
}

/**
 * Get reason why a file is suggested
 */
function getFileReason(filename) {
  const reasons = {
    'CLAUDE.md': 'AI instructions',
    'README.md': 'Project overview',
    'package.json': 'Dependencies & scripts',
    'tsconfig.json': 'TypeScript config',
    '.env.example': 'Environment variables',
    'STRUCTURE.json': 'Project structure'
  };
  return reasons[filename] || 'Important file';
}

/**
 * Generate context summary for Claude
 */
function generateContextSummary(projectPath) {
  const usage = getContextUsage(projectPath);

  let summary = '## Pinned Context Files\n\n';
  summary += `Total tokens: ~${usage.totalTokens.toLocaleString()} / ${usage.maxTokens.toLocaleString()} (${usage.percentUsed}%)\n\n`;

  if (usage.pinnedFiles.length === 0) {
    summary += '_No files pinned to context_\n';
  } else {
    for (const file of usage.pinnedFiles) {
      summary += `- **${file.name}** (~${file.tokens.toLocaleString()} tokens)\n`;
    }
  }

  return summary;
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  ipcMain.handle(IPC.LOAD_CONTEXT, (event, projectPath) => {
    return loadContext(projectPath);
  });

  ipcMain.handle(IPC.GET_CONTEXT_USAGE, (event, projectPath) => {
    return getContextUsage(projectPath);
  });

  ipcMain.handle(IPC.PIN_FILE, (event, { projectPath, filePath }) => {
    return pinFile(projectPath, filePath);
  });

  ipcMain.handle(IPC.UNPIN_FILE, (event, { projectPath, filePath }) => {
    return unpinFile(projectPath, filePath);
  });

  ipcMain.handle(IPC.GET_FILE_TOKENS, (event, filePath) => {
    const info = getFileInfo(filePath);
    return info ? { tokens: info.tokens, size: info.size } : null;
  });

  ipcMain.handle(IPC.GET_SUGGESTED_FILES, (event, projectPath) => {
    return getSuggestedFiles(projectPath);
  });

  ipcMain.handle(IPC.UPDATE_CONTEXT_SETTINGS, (event, { projectPath, settings }) => {
    return updateContextSettings(projectPath, settings);
  });

  ipcMain.handle(IPC.GENERATE_CONTEXT_SUMMARY, (event, projectPath) => {
    return generateContextSummary(projectPath);
  });
}

module.exports = {
  init,
  setupIPC,
  loadContext,
  pinFile,
  unpinFile,
  getContextUsage,
  getSuggestedFiles,
  estimateTokens
};
