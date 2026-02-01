/**
 * Git Manager
 * Handles git status and repository information
 */

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { IPC } = require('../shared/ipcChannels');

let mainWindow = null;

/**
 * Check if path is a git repository
 */
function isGitRepo(projectPath) {
  try {
    const gitDir = path.join(projectPath, '.git');
    return fs.existsSync(gitDir);
  } catch (err) {
    return false;
  }
}

/**
 * Get current branch name
 */
function getBranchName(projectPath) {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch (err) {
    return null;
  }
}

/**
 * Get uncommitted changes count
 */
function getUncommittedCount(projectPath) {
  try {
    const result = execSync('git status --porcelain', {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const lines = result.trim().split('\n').filter(line => line.length > 0);
    return lines.length;
  } catch (err) {
    return 0;
  }
}

/**
 * Get detailed uncommitted changes
 */
function getUncommittedChanges(projectPath) {
  try {
    const result = execSync('git status --porcelain', {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const lines = result.trim().split('\n').filter(line => line.length > 0);
    const changes = {
      staged: [],
      unstaged: [],
      untracked: []
    };

    lines.forEach(line => {
      const status = line.substring(0, 2);
      const file = line.substring(3);

      if (status === '??') {
        changes.untracked.push(file);
      } else if (status[0] !== ' ' && status[0] !== '?') {
        changes.staged.push({ status: status[0], file });
      }
      if (status[1] !== ' ' && status[1] !== '?') {
        changes.unstaged.push({ status: status[1], file });
      }
    });

    return changes;
  } catch (err) {
    return { staged: [], unstaged: [], untracked: [] };
  }
}

/**
 * Check if there are unpushed commits
 */
function hasUnpushedCommits(projectPath) {
  try {
    const result = execSync('git log @{u}..HEAD --oneline 2>/dev/null || echo ""', {
      cwd: projectPath,
      encoding: 'utf8',
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim().length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Get last commit info
 */
function getLastCommit(projectPath) {
  try {
    const hash = execSync('git rev-parse --short HEAD', {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    const message = execSync('git log -1 --pretty=%s', {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    const time = execSync('git log -1 --pretty=%cr', {
      cwd: projectPath,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    return { hash, message, time };
  } catch (err) {
    return null;
  }
}

/**
 * Get full git status for a project
 */
function getGitStatus(projectPath) {
  if (!isGitRepo(projectPath)) {
    return {
      isGitRepo: false,
      branch: null,
      uncommittedCount: 0,
      changes: null,
      hasUnpushed: false,
      lastCommit: null
    };
  }

  const branch = getBranchName(projectPath);
  const uncommittedCount = getUncommittedCount(projectPath);
  const hasUnpushed = hasUnpushedCommits(projectPath);
  const lastCommit = getLastCommit(projectPath);

  return {
    isGitRepo: true,
    branch,
    uncommittedCount,
    hasUnpushed,
    lastCommit
  };
}

/**
 * Get detailed git status (includes file changes)
 */
function getDetailedGitStatus(projectPath) {
  const status = getGitStatus(projectPath);
  if (status.isGitRepo) {
    status.changes = getUncommittedChanges(projectPath);
  }
  return status;
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
  // Get git status
  ipcMain.on(IPC.GET_GIT_STATUS, (event, projectPath) => {
    const status = getGitStatus(projectPath);
    event.sender.send(IPC.GIT_STATUS_DATA, { projectPath, status });
  });

  // Refresh git status (with detailed changes)
  ipcMain.on(IPC.REFRESH_GIT_STATUS, (event, projectPath) => {
    const status = getDetailedGitStatus(projectPath);
    event.sender.send(IPC.GIT_STATUS_DATA, { projectPath, status });
  });
}

module.exports = {
  init,
  setupIPC,
  isGitRepo,
  getGitStatus,
  getDetailedGitStatus,
  getBranchName,
  getUncommittedCount
};
