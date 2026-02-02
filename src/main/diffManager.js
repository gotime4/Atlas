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

// Memory limits
const MAX_FILE_SIZE = 100 * 1024; // 100KB max file size to snapshot
const MAX_TRACKED_FILES = 200; // Maximum files to track
const MAX_DIFF_LINES = 1000; // Max lines for diff calculation

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
    /release\//,
    /\.asar$/,
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

    // Don't track large files - use same limit as snapshots
    if (stat.size > MAX_FILE_SIZE) return;

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
      const stat = fs.statSync(filePath);

      // Skip files that are too large
      if (stat.size > MAX_FILE_SIZE) {
        return { success: false, reason: 'file too large' };
      }

      // Enforce max tracked files limit
      if (fileSnapshots.size >= MAX_TRACKED_FILES && !fileSnapshots.has(filePath)) {
        // Remove oldest entry to make room
        const oldestKey = fileSnapshots.keys().next().value;
        fileSnapshots.delete(oldestKey);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      fileSnapshots.set(filePath, content);
      return { success: true };
    }
  } catch (err) {
    // File might be binary or unreadable - silently skip
  }
  return { success: false };
}

/**
 * Take snapshots of all files in a directory
 * Now much more conservative to prevent memory issues
 */
function snapshotDirectory(dirPath, depth = 0) {
  // Reduced depth limit and early exit if we've hit file limit
  if (depth > 3 || fileSnapshots.size >= MAX_TRACKED_FILES) return;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Stop if we've hit the file limit
      if (fileSnapshots.size >= MAX_TRACKED_FILES) break;

      if (shouldIgnoreFile(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile()) {
        // Only snapshot common source file types
        const ext = path.extname(entry.name).toLowerCase();
        const sourceExtensions = ['.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.css', '.html', '.vue', '.svelte'];
        if (sourceExtensions.includes(ext)) {
          snapshotFile(fullPath);
        }
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
 * Memory-optimized version with limits for large files
 */
function computeLCS(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;

  // For very large files, use a simpler line-by-line comparison
  // to avoid O(m*n) memory allocation
  if (m > MAX_DIFF_LINES || n > MAX_DIFF_LINES) {
    return computeSimpleLCS(oldLines, newLines);
  }

  // Build LCS table - use only 2 rows to reduce memory from O(m*n) to O(n)
  let prevRow = Array(n + 1).fill(0);
  let currRow = Array(n + 1).fill(0);

  // We need to track the actual matches, so build a simplified path
  const matchMap = new Map();

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        currRow[j] = prevRow[j - 1] + 1;
        matchMap.set(`${i - 1},${j - 1}`, true);
      } else {
        currRow[j] = Math.max(prevRow[j], currRow[j - 1]);
      }
    }
    // Swap rows
    [prevRow, currRow] = [currRow, prevRow];
    currRow.fill(0);
  }

  // Extract matches by finding matching lines
  const matches = [];
  let oldIdx = 0, newIdx = 0;

  while (oldIdx < m && newIdx < n) {
    if (oldLines[oldIdx] === newLines[newIdx]) {
      matches.push({ oldIdx, newIdx });
      oldIdx++;
      newIdx++;
    } else if (matchMap.has(`${oldIdx},${newIdx}`)) {
      matches.push({ oldIdx, newIdx });
      oldIdx++;
      newIdx++;
    } else {
      // Try to find next match
      let foundOld = -1, foundNew = -1;
      for (let k = newIdx; k < Math.min(newIdx + 10, n); k++) {
        if (oldLines[oldIdx] === newLines[k]) {
          foundNew = k;
          break;
        }
      }
      for (let k = oldIdx; k < Math.min(oldIdx + 10, m); k++) {
        if (oldLines[k] === newLines[newIdx]) {
          foundOld = k;
          break;
        }
      }

      if (foundNew >= 0 && (foundOld < 0 || foundNew - newIdx <= foundOld - oldIdx)) {
        newIdx = foundNew;
      } else if (foundOld >= 0) {
        oldIdx = foundOld;
      } else {
        oldIdx++;
        newIdx++;
      }
    }
  }

  return matches;
}

/**
 * Simple LCS for very large files - just find exact line matches
 */
function computeSimpleLCS(oldLines, newLines) {
  const matches = [];
  const newLineSet = new Map();

  // Index new lines by content
  newLines.forEach((line, idx) => {
    if (!newLineSet.has(line)) {
      newLineSet.set(line, []);
    }
    newLineSet.get(line).push(idx);
  });

  let lastNewIdx = -1;

  for (let oldIdx = 0; oldIdx < oldLines.length; oldIdx++) {
    const line = oldLines[oldIdx];
    const newIndices = newLineSet.get(line);

    if (newIndices) {
      // Find the first new index that's after our last match
      for (const newIdx of newIndices) {
        if (newIdx > lastNewIdx) {
          matches.push({ oldIdx, newIdx });
          lastNewIdx = newIdx;
          break;
        }
      }
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
 * Clear all snapshots and pending changes (free memory)
 */
function clearSnapshots() {
  fileSnapshots.clear();
  pendingChanges.clear();
}

/**
 * Get memory usage stats for debugging
 */
function getMemoryStats() {
  return {
    trackedFiles: fileSnapshots.size,
    pendingChanges: pendingChanges.size,
    maxTrackedFiles: MAX_TRACKED_FILES,
    maxFileSize: MAX_FILE_SIZE
  };
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
    // Clear old snapshots when switching projects to free memory
    clearSnapshots();
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
  stopWatching,
  clearSnapshots,
  getMemoryStats
};
