/**
 * Diff Manager
 * Watches files for changes and generates diffs
 */

const fs = require('fs');
const path = require('path');
const { IPC } = require('../shared/ipcChannels');

let mainWindow = null;
let fileWatchers = new Map();
let fileSnapshots = new Map(); // Store original file contents
let pendingChanges = new Map(); // Files with uncommitted changes

/**
 * Initialize module
 */
function init(window) {
  mainWindow = window;
}

/**
 * Start watching a project directory for file changes
 */
function watchProject(projectPath) {
  // Stop any existing watchers
  stopWatching();

  if (!projectPath || !fs.existsSync(projectPath)) return;

  try {
    // Watch the project directory recursively
    const watcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Ignore common non-source files
      if (shouldIgnoreFile(filename)) return;

      const filePath = path.join(projectPath, filename);

      if (eventType === 'change' && fs.existsSync(filePath)) {
        handleFileChange(filePath);
      }
    });

    fileWatchers.set(projectPath, watcher);
  } catch (err) {
    console.error('Error watching project:', err);
  }
}

/**
 * Check if file should be ignored
 */
function shouldIgnoreFile(filename) {
  const ignorePatterns = [
    /node_modules/,
    /\.git/,
    /\.DS_Store/,
    /\.swp$/,
    /~$/,
    /\.lock$/,
    /package-lock\.json$/,
    /yarn\.lock$/,
    /\.log$/,
    /dist\//,
    /build\//,
    /\.atlas\//
  ];

  return ignorePatterns.some(pattern => pattern.test(filename));
}

/**
 * Handle file change event
 */
function handleFileChange(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return;

    // Don't track very large files
    if (stat.size > 1024 * 1024) return; // 1MB limit

    const newContent = fs.readFileSync(filePath, 'utf8');
    const oldContent = fileSnapshots.get(filePath);

    // If we have a snapshot and content changed, record the diff
    if (oldContent !== undefined && oldContent !== newContent) {
      const diff = generateDiff(oldContent, newContent);

      pendingChanges.set(filePath, {
        path: filePath,
        filename: path.basename(filePath),
        oldContent,
        newContent,
        diff,
        timestamp: Date.now()
      });

      // Notify renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.FILE_CHANGED, {
          path: filePath,
          filename: path.basename(filePath),
          hasChanges: true
        });
      }
    }

    // Update snapshot
    fileSnapshots.set(filePath, newContent);
  } catch (err) {
    // File might have been deleted or is binary
  }
}

/**
 * Take a snapshot of a file (for tracking changes)
 */
function snapshotFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      fileSnapshots.set(filePath, content);
      return { success: true };
    }
  } catch (err) {
    console.error('Error snapshotting file:', err);
  }
  return { success: false };
}

/**
 * Take snapshots of all files in a directory
 */
function snapshotDirectory(dirPath, depth = 0) {
  if (depth > 5) return; // Limit recursion depth

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (shouldIgnoreFile(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile()) {
        snapshotFile(fullPath);
      } else if (entry.isDirectory()) {
        snapshotDirectory(fullPath, depth + 1);
      }
    }
  } catch (err) {
    // Directory might not be readable
  }
}

/**
 * Generate a simple line-by-line diff
 */
function generateDiff(oldContent, newContent) {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const hunks = [];

  // Simple LCS-based diff
  const lcs = computeLCS(oldLines, newLines);

  let oldIdx = 0;
  let newIdx = 0;
  let currentHunk = null;

  for (const match of lcs) {
    // Add removed lines
    while (oldIdx < match.oldIdx) {
      if (!currentHunk) {
        currentHunk = { startOld: oldIdx + 1, startNew: newIdx + 1, lines: [] };
      }
      currentHunk.lines.push({ type: 'remove', content: oldLines[oldIdx], lineNum: oldIdx + 1 });
      oldIdx++;
    }

    // Add inserted lines
    while (newIdx < match.newIdx) {
      if (!currentHunk) {
        currentHunk = { startOld: oldIdx + 1, startNew: newIdx + 1, lines: [] };
      }
      currentHunk.lines.push({ type: 'add', content: newLines[newIdx], lineNum: newIdx + 1 });
      newIdx++;
    }

    // Close hunk if we had changes
    if (currentHunk && currentHunk.lines.length > 0) {
      hunks.push(currentHunk);
      currentHunk = null;
    }

    oldIdx++;
    newIdx++;
  }

  // Handle remaining lines
  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (!currentHunk) {
      currentHunk = { startOld: oldIdx + 1, startNew: newIdx + 1, lines: [] };
    }

    if (oldIdx < oldLines.length) {
      currentHunk.lines.push({ type: 'remove', content: oldLines[oldIdx], lineNum: oldIdx + 1 });
      oldIdx++;
    }

    if (newIdx < newLines.length) {
      currentHunk.lines.push({ type: 'add', content: newLines[newIdx], lineNum: newIdx + 1 });
      newIdx++;
    }
  }

  if (currentHunk && currentHunk.lines.length > 0) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Compute Longest Common Subsequence for diff
 */
function computeLCS(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matches
  const matches = [];
  let i = m, j = n;

  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      matches.unshift({ oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

/**
 * Get all pending changes
 */
function getPendingChanges() {
  return Array.from(pendingChanges.values()).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get diff for a specific file
 */
function getFileDiff(filePath) {
  return pendingChanges.get(filePath) || null;
}

/**
 * Accept changes (update snapshot to current)
 */
function acceptChanges(filePath) {
  const change = pendingChanges.get(filePath);
  if (change) {
    fileSnapshots.set(filePath, change.newContent);
    pendingChanges.delete(filePath);
    return { success: true };
  }
  return { success: false, error: 'No pending changes for file' };
}

/**
 * Revert changes (restore original content)
 */
function revertChanges(filePath) {
  const change = pendingChanges.get(filePath);
  if (change) {
    try {
      fs.writeFileSync(filePath, change.oldContent, 'utf8');
      fileSnapshots.set(filePath, change.oldContent);
      pendingChanges.delete(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, error: 'No pending changes for file' };
}

/**
 * Revert a specific hunk
 */
function revertHunk(filePath, hunkIndex) {
  const change = pendingChanges.get(filePath);
  if (!change || !change.diff[hunkIndex]) {
    return { success: false, error: 'Hunk not found' };
  }

  try {
    // Reconstruct file with this hunk reverted
    const hunk = change.diff[hunkIndex];
    let lines = change.newContent.split('\n');

    // This is a simplified revert - for a proper implementation
    // we'd need to track line mappings more carefully
    const removedLines = hunk.lines.filter(l => l.type === 'add').map(l => l.content);
    const addedLines = hunk.lines.filter(l => l.type === 'remove').map(l => l.content);

    // Find and replace the hunk in the new content
    // This is approximate - a production version would need more precision
    let newContent = change.newContent;
    for (const line of removedLines) {
      newContent = newContent.replace(line + '\n', '');
    }

    fs.writeFileSync(filePath, newContent, 'utf8');

    // Regenerate diff
    const newDiff = generateDiff(change.oldContent, newContent);
    if (newDiff.length === 0) {
      pendingChanges.delete(filePath);
    } else {
      change.newContent = newContent;
      change.diff = newDiff;
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Clear all pending changes (accept all)
 */
function clearAllChanges() {
  for (const [filePath, change] of pendingChanges) {
    fileSnapshots.set(filePath, change.newContent);
  }
  pendingChanges.clear();
  return { success: true };
}

/**
 * Stop watching files
 */
function stopWatching() {
  for (const watcher of fileWatchers.values()) {
    watcher.close();
  }
  fileWatchers.clear();
}

/**
 * Setup IPC handlers
 */
function setupIPC(ipcMain) {
  ipcMain.handle(IPC.GET_PENDING_CHANGES, () => {
    return getPendingChanges();
  });

  ipcMain.handle(IPC.GET_FILE_DIFF, (event, filePath) => {
    return getFileDiff(filePath);
  });

  ipcMain.handle(IPC.ACCEPT_CHANGES, (event, filePath) => {
    return acceptChanges(filePath);
  });

  ipcMain.handle(IPC.REVERT_CHANGES, (event, filePath) => {
    return revertChanges(filePath);
  });

  ipcMain.handle(IPC.REVERT_HUNK, (event, { filePath, hunkIndex }) => {
    return revertHunk(filePath, hunkIndex);
  });

  ipcMain.handle(IPC.CLEAR_ALL_CHANGES, () => {
    return clearAllChanges();
  });

  ipcMain.on(IPC.WATCH_PROJECT, (event, projectPath) => {
    watchProject(projectPath);
    snapshotDirectory(projectPath);
  });

  ipcMain.on(IPC.SNAPSHOT_FILE, (event, filePath) => {
    snapshotFile(filePath);
  });
}

module.exports = {
  init,
  setupIPC,
  watchProject,
  snapshotFile,
  snapshotDirectory,
  getPendingChanges,
  getFileDiff,
  acceptChanges,
  revertChanges,
  stopWatching
};
