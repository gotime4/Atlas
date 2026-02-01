/**
 * GitHub Manager Module
 * Handles GitHub integration using gh CLI
 */

const { exec } = require('child_process');
const { shell } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let mainWindow = null;
let currentProjectPath = null;

/**
 * Initialize GitHub manager
 */
function init(window) {
  mainWindow = window;
}

/**
 * Set current project path
 */
function setProjectPath(projectPath) {
  currentProjectPath = projectPath;
}

/**
 * Check if gh CLI is available
 */
function checkGhCli() {
  return new Promise((resolve) => {
    exec('gh --version', (error) => {
      resolve(!error);
    });
  });
}

/**
 * Check if current directory is a git repo with GitHub remote
 */
function checkGitHubRepo(projectPath) {
  return new Promise((resolve) => {
    exec('gh repo view --json nameWithOwner', { cwd: projectPath }, (error, stdout) => {
      if (error) {
        resolve({ isGitHubRepo: false, repoName: null });
      } else {
        try {
          const data = JSON.parse(stdout);
          resolve({ isGitHubRepo: true, repoName: data.nameWithOwner });
        } catch {
          resolve({ isGitHubRepo: false, repoName: null });
        }
      }
    });
  });
}

/**
 * Load GitHub issues for current project
 */
async function loadIssues(projectPath, state = 'open') {
  const ghAvailable = await checkGhCli();
  if (!ghAvailable) {
    return { error: 'gh CLI not installed', issues: [] };
  }

  const repoInfo = await checkGitHubRepo(projectPath);
  if (!repoInfo.isGitHubRepo) {
    return { error: 'Not a GitHub repository', issues: [] };
  }

  return new Promise((resolve) => {
    const cmd = `gh issue list --state ${state} --json number,title,state,author,labels,createdAt,updatedAt,url --limit 50`;

    exec(cmd, { cwd: projectPath }, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: stderr || error.message, issues: [], repoName: repoInfo.repoName });
      } else {
        try {
          const issues = JSON.parse(stdout);
          resolve({ error: null, issues, repoName: repoInfo.repoName });
        } catch (e) {
          resolve({ error: 'Failed to parse issues', issues: [], repoName: repoInfo.repoName });
        }
      }
    });
  });
}

/**
 * Load GitHub pull requests for current project
 */
async function loadPullRequests(projectPath, state = 'open') {
  const ghAvailable = await checkGhCli();
  if (!ghAvailable) {
    return { error: 'gh CLI not installed', prs: [] };
  }

  const repoInfo = await checkGitHubRepo(projectPath);
  if (!repoInfo.isGitHubRepo) {
    return { error: 'Not a GitHub repository', prs: [] };
  }

  return new Promise((resolve) => {
    // Get PRs with status check information
    const cmd = `gh pr list --state ${state} --json number,title,state,author,labels,createdAt,updatedAt,url,headRefName,baseRefName,isDraft,mergeable,reviewDecision,statusCheckRollup --limit 50`;

    exec(cmd, { cwd: projectPath }, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: stderr || error.message, prs: [], repoName: repoInfo.repoName });
      } else {
        try {
          const prs = JSON.parse(stdout);
          resolve({ error: null, prs, repoName: repoInfo.repoName });
        } catch (e) {
          resolve({ error: 'Failed to parse pull requests', prs: [], repoName: repoInfo.repoName });
        }
      }
    });
  });
}

/**
 * Load GitHub Actions workflow runs
 */
async function loadActions(projectPath, status = '') {
  const ghAvailable = await checkGhCli();
  if (!ghAvailable) {
    return { error: 'gh CLI not installed', runs: [] };
  }

  const repoInfo = await checkGitHubRepo(projectPath);
  if (!repoInfo.isGitHubRepo) {
    return { error: 'Not a GitHub repository', runs: [] };
  }

  return new Promise((resolve) => {
    // Get workflow runs with status filter
    let cmd = 'gh run list --json databaseId,displayTitle,name,status,conclusion,event,headBranch,createdAt,updatedAt,url,workflowName --limit 30';

    if (status && status !== 'all') {
      cmd += ` --status ${status}`;
    }

    exec(cmd, { cwd: projectPath }, (error, stdout, stderr) => {
      if (error) {
        resolve({ error: stderr || error.message, runs: [], repoName: repoInfo.repoName });
      } else {
        try {
          const runs = JSON.parse(stdout);
          resolve({ error: null, runs, repoName: repoInfo.repoName });
        } catch (e) {
          resolve({ error: 'Failed to parse workflow runs', runs: [], repoName: repoInfo.repoName });
        }
      }
    });
  });
}

/**
 * Open issue/PR/action in browser
 */
function openIssue(url) {
  if (url) {
    shell.openExternal(url);
  }
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  // Load issues
  ipcMain.handle(IPC.LOAD_GITHUB_ISSUES, async (event, { projectPath, state }) => {
    const path = projectPath || currentProjectPath;
    if (!path) {
      return { error: 'No project selected', issues: [] };
    }
    return await loadIssues(path, state);
  });

  // Load pull requests
  ipcMain.handle(IPC.LOAD_GITHUB_PRS, async (event, { projectPath, state }) => {
    const path = projectPath || currentProjectPath;
    if (!path) {
      return { error: 'No project selected', prs: [] };
    }
    return await loadPullRequests(path, state);
  });

  // Load GitHub Actions
  ipcMain.handle(IPC.LOAD_GITHUB_ACTIONS, async (event, { projectPath, status }) => {
    const path = projectPath || currentProjectPath;
    if (!path) {
      return { error: 'No project selected', runs: [] };
    }
    return await loadActions(path, status);
  });

  // Open issue/PR/action in browser
  ipcMain.on(IPC.OPEN_GITHUB_ISSUE, (event, url) => {
    openIssue(url);
  });
}

module.exports = {
  init,
  setProjectPath,
  setupIPC,
  loadIssues,
  openIssue
};
