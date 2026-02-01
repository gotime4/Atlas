/**
 * File Tree UI Module
 * Renders collapsible file tree in sidebar
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let fileTreeElement = null;
let currentProjectPath = null;
let onFileClickCallback = null;
let focusedItem = null;
let expandedPaths = new Set(); // Track which folders are expanded
let lastLoadedProjectPath = null; // Track which project the tree was loaded for
let lastFileTreeHash = ''; // Hash to detect if file tree changed

/**
 * Initialize file tree UI
 */
function init(elementId, getProjectPath) {
  fileTreeElement = document.getElementById(elementId);

  // Store reference to get current project path
  if (typeof getProjectPath === 'function') {
    currentProjectPath = getProjectPath;
  }

  setupIPC();
}

/**
 * Set project path getter
 */
function setProjectPathGetter(getter) {
  currentProjectPath = getter;
}

/**
 * Set file click callback
 */
function setOnFileClick(callback) {
  onFileClickCallback = callback;
}

/**
 * Render file tree recursively
 */
function renderFileTree(files, parentElement, indent = 0) {
  files.forEach(file => {
    // Create wrapper for folder + children
    const wrapper = document.createElement('div');
    wrapper.className = 'file-wrapper';

    const fileItem = document.createElement('div');
    fileItem.className = 'file-item' + (file.isDirectory ? ' folder' : '');
    fileItem.style.paddingLeft = `${8 + indent * 16}px`;
    fileItem.tabIndex = 0; // Make focusable
    fileItem.dataset.path = file.path;

    // Add arrow for folders
    if (file.isDirectory) {
      const arrow = document.createElement('span');
      arrow.textContent = '▶ ';
      arrow.style.fontSize = '10px';
      arrow.style.marginRight = '4px';
      arrow.style.display = 'inline-block';
      arrow.style.transition = 'transform 0.2s';
      arrow.className = 'folder-arrow';
      fileItem.appendChild(arrow);
    }

    // File icon
    const icon = document.createElement('span');
    if (file.isDirectory) {
      icon.className = 'file-icon folder-icon';
    } else {
      const ext = file.name.split('.').pop();
      icon.className = `file-icon file-icon-${ext}`;
      if (!['js', 'json', 'md'].includes(ext)) {
        icon.className = 'file-icon file-icon-default';
      }
    }

    // File name
    const name = document.createElement('span');
    name.textContent = file.name;

    fileItem.appendChild(icon);
    fileItem.appendChild(name);
    wrapper.appendChild(fileItem);

    // Handle folder clicks
    if (file.isDirectory) {
      // Create children container if folder has children
      let childrenContainer = null;
      if (file.children && file.children.length > 0) {
        childrenContainer = document.createElement('div');
        childrenContainer.className = 'folder-children';
        wrapper.appendChild(childrenContainer);

        // Recursively render children
        renderFileTree(file.children, childrenContainer, indent + 1);
      }

      // Check if this folder was previously expanded (restore state on re-render)
      const wasExpanded = expandedPaths.has(file.path);
      const arrow = fileItem.querySelector('.folder-arrow');

      if (wasExpanded && childrenContainer) {
        childrenContainer.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(90deg)';
      } else {
        if (childrenContainer) childrenContainer.style.display = 'none';
        if (arrow) arrow.style.transform = 'rotate(0deg)';
      }

      // Toggle folder on click
      fileItem.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();

        const arrowEl = fileItem.querySelector('.folder-arrow');
        const isExpanded = expandedPaths.has(file.path);

        if (isExpanded) {
          // Collapse
          expandedPaths.delete(file.path);
          if (childrenContainer) {
            childrenContainer.style.display = 'none';
          }
          if (arrowEl) arrowEl.style.transform = 'rotate(0deg)';
        } else {
          // Expand
          expandedPaths.add(file.path);
          if (childrenContainer) {
            childrenContainer.style.display = 'block';
          }
          if (arrowEl) arrowEl.style.transform = 'rotate(90deg)';
        }
      });
    } else {
      // File click handler - open in editor
      fileItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onFileClickCallback) {
          onFileClickCallback(file.path, 'fileTree');
        }
      });
    }

    parentElement.appendChild(wrapper);
  });
}

/**
 * Clear file tree
 */
function clearFileTree() {
  if (fileTreeElement) {
    fileTreeElement.innerHTML = '';
  }
}

/**
 * Reset file tree state (including expanded folders)
 */
function resetFileTree() {
  clearFileTree();
  expandedPaths.clear();
}

/**
 * Refresh file tree
 */
function refreshFileTree(projectPath) {
  const path = projectPath || (currentProjectPath && currentProjectPath());
  if (path) {
    // Use loadFileTree to benefit from debouncing
    loadFileTree(path);
  }
}

/**
 * Load file tree for path
 */
let loadDebounceTimer = null;
function loadFileTree(projectPath) {
  // Reset expanded paths if loading a different project
  if (projectPath !== lastLoadedProjectPath) {
    expandedPaths.clear();
    lastLoadedProjectPath = projectPath;
    lastFileTreeHash = ''; // Reset hash for new project
  }

  // Debounce rapid load requests
  if (loadDebounceTimer) {
    clearTimeout(loadDebounceTimer);
  }
  loadDebounceTimer = setTimeout(() => {
    ipcRenderer.send(IPC.LOAD_FILE_TREE, projectPath);
    loadDebounceTimer = null;
  }, 100);
}

/**
 * Create a simple hash of the file tree for comparison
 */
function hashFileTree(files) {
  return JSON.stringify(files.map(f => ({
    n: f.name,
    p: f.path,
    d: f.isDirectory,
    c: f.children ? hashFileTree(f.children) : null
  })));
}

/**
 * Setup IPC listeners
 */
let ipcSetup = false;
function setupIPC() {
  // Prevent duplicate listeners
  if (ipcSetup) return;
  ipcSetup = true;

  ipcRenderer.on(IPC.FILE_TREE_DATA, (event, files) => {
    // Check if file tree actually changed
    const newHash = hashFileTree(files);
    if (newHash === lastFileTreeHash) {
      // File tree unchanged, skip re-render
      return;
    }
    lastFileTreeHash = newHash;

    clearFileTree();
    renderFileTree(files, fileTreeElement);
  });
}

/**
 * Focus file tree for keyboard navigation
 */
function focus() {
  if (!fileTreeElement) return;

  const items = getVisibleItems();
  if (items.length === 0) return;

  // If we have a previously focused item that's still in the DOM, use it
  let targetItem = null;
  if (focusedItem && fileTreeElement.contains(focusedItem)) {
    targetItem = focusedItem;
  } else {
    targetItem = items[0];
  }

  targetItem.focus();
  targetItem.classList.add('focused');
  focusedItem = targetItem;

  // Setup keyboard navigation (one-time)
  if (!fileTreeElement.dataset.keyboardSetup) {
    fileTreeElement.dataset.keyboardSetup = 'true';
    fileTreeElement.addEventListener('keydown', handleKeydown);
  }
}

/**
 * Get all visible file items (for navigation)
 */
function getVisibleItems() {
  if (!fileTreeElement) return [];
  const allItems = fileTreeElement.querySelectorAll('.file-item');
  return Array.from(allItems).filter(item => {
    // Check if parent folder is expanded
    let parent = item.parentElement;
    while (parent && parent !== fileTreeElement) {
      if (parent.classList.contains('folder-children') && parent.style.display === 'none') {
        return false;
      }
      parent = parent.parentElement;
    }
    return true;
  });
}

/**
 * Handle keyboard navigation in file tree
 */
function handleKeydown(e) {
  const items = getVisibleItems();
  const currentIndex = items.indexOf(focusedItem);

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    focusedItem?.classList.remove('focused');

    let newIndex;
    if (e.key === 'ArrowDown') {
      newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    } else {
      newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
    }

    focusedItem = items[newIndex];
    focusedItem?.focus();
    focusedItem?.classList.add('focused');
  }

  if (e.key === 'ArrowRight' && focusedItem?.classList.contains('folder')) {
    // Expand folder
    e.preventDefault();
    const wrapper = focusedItem.parentElement;
    const children = wrapper.querySelector('.folder-children');
    const arrow = focusedItem.querySelector('.folder-arrow');
    if (children && children.style.display === 'none') {
      children.style.display = 'block';
      if (arrow) arrow.style.transform = 'rotate(90deg)';
    }
  }

  if (e.key === 'ArrowLeft' && focusedItem?.classList.contains('folder')) {
    // Collapse folder
    e.preventDefault();
    const wrapper = focusedItem.parentElement;
    const children = wrapper.querySelector('.folder-children');
    const arrow = focusedItem.querySelector('.folder-arrow');
    if (children && children.style.display !== 'none') {
      children.style.display = 'none';
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    focusedItem?.click();
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    focusedItem?.classList.remove('focused');
    // Return focus to terminal
    if (typeof window.terminalFocus === 'function') {
      window.terminalFocus();
    }
  }
}

/**
 * Blur/unfocus file tree
 */
function blur() {
  focusedItem?.classList.remove('focused');
  focusedItem = null;
}

// Expose focus function globally for editor to restore focus
window.fileTreeFocus = focus;

module.exports = {
  init,
  setProjectPathGetter,
  setOnFileClick,
  renderFileTree,
  clearFileTree,
  resetFileTree,
  refreshFileTree,
  loadFileTree,
  focus,
  blur
};
