/**
 * Skills Manager
 * Discovers and manages Claude skills/commands from .claude/commands folders
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
 * Load skills from all accessible .claude directories
 * Supports both patterns:
 * - .claude/commands/*.md (flat files)
 * - .claude/skills/skillname/SKILL.md (subdirectories)
 */
function loadSkills(projectPath) {
  const claudeDirs = findClaudeDirs(projectPath);
  const skills = [];

  for (const claudeDir of claudeDirs) {
    // Check both 'commands' and 'skills' directories
    const dirsToCheck = [
      { path: path.join(claudeDir.path, 'commands'), type: 'flat' },
      { path: path.join(claudeDir.path, 'skills'), type: 'subdirs' }
    ];

    for (const dirInfo of dirsToCheck) {
      if (!fs.existsSync(dirInfo.path)) {
        continue;
      }

      try {
        const entries = fs.readdirSync(dirInfo.path, { withFileTypes: true });

        for (const entry of entries) {
          let filePath, name, content;

          if (dirInfo.type === 'flat' && entry.isFile() && entry.name.endsWith('.md')) {
            // Flat structure: commands/skillname.md
            filePath = path.join(dirInfo.path, entry.name);
            name = path.basename(entry.name, '.md');
          } else if (dirInfo.type === 'subdirs' && entry.isDirectory()) {
            // Subdirectory structure: skills/skillname/SKILL.md
            const skillFile = path.join(dirInfo.path, entry.name, 'SKILL.md');
            if (!fs.existsSync(skillFile)) continue;
            filePath = skillFile;
            name = entry.name;
          } else {
            continue;
          }

          try {
            const stat = fs.statSync(filePath);
            content = fs.readFileSync(filePath, 'utf8');

            // Extract description from first paragraph or heading
            const description = extractDescription(content);

            skills.push({
              id: `${claudeDir.scope}:${name}`,
              name,
              command: `/${name}`,
              scope: claudeDir.scope,
              scopeLabel: claudeDir.label,
              filePath,
              content,
              description,
              modifiedAt: stat.mtime.toISOString()
            });
          } catch (err) {
            console.error(`Error reading skill file ${filePath}:`, err);
          }
        }
      } catch (err) {
        console.error(`Error reading skills directory ${dirInfo.path}:`, err);
      }
    }
  }

  // Sort: project first, then parent, then user
  const scopeOrder = { project: 0, parent: 1, user: 2 };
  skills.sort((a, b) => {
    const scopeDiff = scopeOrder[a.scope] - scopeOrder[b.scope];
    if (scopeDiff !== 0) return scopeDiff;
    return a.name.localeCompare(b.name);
  });

  return skills;
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
 * Save skill content
 */
function saveSkill(filePath, content) {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('Error saving skill:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  ipcMain.on(IPC.LOAD_SKILLS, (event, projectPath) => {
    const skills = loadSkills(projectPath);
    event.sender.send(IPC.SKILLS_DATA, skills);
  });

  ipcMain.on(IPC.SAVE_SKILL, (event, { filePath, content }) => {
    const result = saveSkill(filePath, content);
    event.sender.send(IPC.SKILL_SAVED, result);
  });
}

module.exports = {
  init,
  setupIPC,
  loadSkills,
  saveSkill
};
