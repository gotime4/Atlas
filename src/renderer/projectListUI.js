/**
 * Project List UI Module
 * Renders project list in sidebar
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let projectsListElement = null;
let activeProjectPath = null;
let onProjectSelectCallback = null;
let projects = []; // Store projects list for navigation
let focusedIndex = -1; // Currently focused project index
let gitStatusCache = {}; // Cache git status for projects
let recentProjectsLimit = 10; // Max recent projects to show
let showAllProjects = false; // Toggle for showing all vs recent

/**
 * Initialize project list UI
 */
function init(containerId, onSelectCallback) {
  projectsListElement = document.getElementById(containerId);
  onProjectSelectCallback = onSelectCallback;
  setupIPC();
}

/**
 * Load projects from workspace
 */
function loadProjects() {
  ipcRenderer.send(IPC.LOAD_WORKSPACE);
}

/**
 * Render project list
 */
function renderProjects(projectsList) {
  if (!projectsListElement) return;

  projectsListElement.innerHTML = '';

  if (!projectsList || projectsList.length === 0) {
    projects = [];
    const noProjectsMsg = document.createElement('div');
    noProjectsMsg.className = 'no-projects-message';
    noProjectsMsg.textContent = 'No projects yet. Add a project to get started.';
    projectsListElement.appendChild(noProjectsMsg);
    return;
  }

  // Sort by lastOpenedAt (most recent first), then by name
  const sortedProjects = [...projectsList].sort((a, b) => {
    if (a.lastOpenedAt && b.lastOpenedAt) {
      return new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt);
    }
    if (a.lastOpenedAt) return -1;
    if (b.lastOpenedAt) return 1;
    return a.name.localeCompare(b.name);
  });

  // Store sorted projects for navigation
  projects = sortedProjects;

  // Determine which projects to show
  const visibleProjects = showAllProjects
    ? sortedProjects
    : sortedProjects.slice(0, recentProjectsLimit);

  visibleProjects.forEach((project, index) => {
    const projectItem = createProjectItem(project, index);
    projectsListElement.appendChild(projectItem);
    // Request git status for each project
    requestGitStatus(project.path);
  });

  // Add "Show all/less" button if there are more projects
  if (sortedProjects.length > recentProjectsLimit) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'show-all-projects-btn';
    toggleBtn.textContent = showAllProjects
      ? 'Show less'
      : `Show all ${sortedProjects.length} projects`;
    toggleBtn.addEventListener('click', () => {
      showAllProjects = !showAllProjects;
      renderProjects(projectsList);
    });
    projectsListElement.appendChild(toggleBtn);
  }

  // Update focused index based on active project
  focusedIndex = projects.findIndex(p => p.path === activeProjectPath);
}

/**
 * Create a project item element
 */
function createProjectItem(project, index) {
  const item = document.createElement('div');
  item.className = 'project-item';
  item.dataset.path = project.path;
  item.dataset.index = index;
  item.tabIndex = 0; // Make focusable

  if (project.path === activeProjectPath) {
    item.classList.add('active');
  }

  // Project icon
  const icon = document.createElement('span');
  icon.className = 'project-icon';
  icon.textContent = project.isFrameProject ? '📦' : '📁';
  item.appendChild(icon);

  // Project info container
  const infoContainer = document.createElement('div');
  infoContainer.className = 'project-info';

  // Project name
  const name = document.createElement('span');
  name.className = 'project-name';
  name.textContent = project.name;
  name.title = project.path;
  infoContainer.appendChild(name);

  // Git status (will be populated async)
  const gitStatus = document.createElement('span');
  gitStatus.className = 'git-status';
  gitStatus.dataset.projectPath = project.path;
  infoContainer.appendChild(gitStatus);

  item.appendChild(infoContainer);

  // Atlas badge (formerly Frame)
  if (project.isFrameProject) {
    const badge = document.createElement('span');
    badge.className = 'atlas-badge';
    badge.textContent = 'Atlas';
    item.appendChild(badge);
  }

  // Remove button (visible on hover)
  const removeBtn = document.createElement('button');
  removeBtn.className = 'project-remove-btn';
  removeBtn.title = 'Remove from list';
  removeBtn.innerHTML = '&times;';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent project selection
    confirmRemoveProject(project.path, project.name);
  });
  item.appendChild(removeBtn);

  // Click handler
  item.addEventListener('click', () => {
    selectProject(project.path);
  });

  return item;
}

/**
 * Request git status for a project
 */
function requestGitStatus(projectPath) {
  ipcRenderer.send(IPC.GET_GIT_STATUS, projectPath);
}

/**
 * Update git status display for a project
 */
function updateGitStatus(projectPath, status) {
  gitStatusCache[projectPath] = status;

  const gitStatusElement = document.querySelector(`.git-status[data-project-path="${projectPath}"]`);
  if (!gitStatusElement) return;

  if (!status.isGitRepo) {
    gitStatusElement.innerHTML = '';
    return;
  }

  let html = `<span class="git-branch" title="Branch: ${status.branch}">${status.branch}</span>`;

  if (status.uncommittedCount > 0) {
    html += `<span class="git-changes" title="${status.uncommittedCount} uncommitted changes">+${status.uncommittedCount}</span>`;
  }

  if (status.hasUnpushed) {
    html += `<span class="git-unpushed" title="Unpushed commits">↑</span>`;
  }

  gitStatusElement.innerHTML = html;
}

/**
 * Show confirmation dialog and remove project
 */
function confirmRemoveProject(projectPath, projectName) {
  const confirmed = window.confirm(
    `Remove "${projectName}" from the project list?\n\nThis will only remove it from Atlas. The project files will not be deleted.`
  );

  if (confirmed) {
    // If removing the active project, select another one
    if (projectPath === activeProjectPath) {
      const otherProject = projects.find(p => p.path !== projectPath);
      if (otherProject) {
        selectProject(otherProject.path);
      } else {
        activeProjectPath = null;
        if (onProjectSelectCallback) {
          onProjectSelectCallback(null);
        }
      }
    }
    removeProject(projectPath);
  }
}

/**
 * Select a project
 * Terminal session switching is handled by state.js via multiTerminalUI
 */
function selectProject(projectPath) {
  setActiveProject(projectPath);

  if (onProjectSelectCallback) {
    onProjectSelectCallback(projectPath);
  }
}

/**
 * Set active project (visual only)
 */
function setActiveProject(projectPath) {
  activeProjectPath = projectPath;

  // Update visual state
  if (projectsListElement) {
    const items = projectsListElement.querySelectorAll('.project-item');
    items.forEach(item => {
      if (item.dataset.path === projectPath) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
}

/**
 * Get active project path
 */
function getActiveProject() {
  return activeProjectPath;
}

/**
 * Add project to workspace
 */
function addProject(projectPath, projectName, isFrameProject = false) {
  ipcRenderer.send(IPC.ADD_PROJECT_TO_WORKSPACE, {
    projectPath,
    name: projectName,
    isFrameProject
  });
}

/**
 * Remove project from workspace
 */
function removeProject(projectPath) {
  ipcRenderer.send(IPC.REMOVE_PROJECT_FROM_WORKSPACE, projectPath);
}

/**
 * Setup IPC listeners
 */
function setupIPC() {
  ipcRenderer.on(IPC.WORKSPACE_DATA, (event, projects) => {
    renderProjects(projects);
  });

  ipcRenderer.on(IPC.WORKSPACE_UPDATED, (event, projects) => {
    renderProjects(projects);
  });

  // Git status updates
  ipcRenderer.on(IPC.GIT_STATUS_DATA, (event, { projectPath, status }) => {
    updateGitStatus(projectPath, status);
  });
}

/**
 * Refresh git status for all visible projects
 */
function refreshAllGitStatus() {
  projects.forEach(project => {
    requestGitStatus(project.path);
  });
}

/**
 * Select next project in list
 */
function selectNextProject() {
  if (projects.length === 0) return;

  const currentIndex = projects.findIndex(p => p.path === activeProjectPath);
  const nextIndex = currentIndex < projects.length - 1 ? currentIndex + 1 : 0;
  selectProject(projects[nextIndex].path);
}

/**
 * Select previous project in list
 */
function selectPrevProject() {
  if (projects.length === 0) return;

  const currentIndex = projects.findIndex(p => p.path === activeProjectPath);
  const prevIndex = currentIndex > 0 ? currentIndex - 1 : projects.length - 1;
  selectProject(projects[prevIndex].path);
}

/**
 * Focus project list for keyboard navigation
 */
function focus() {
  if (!projectsListElement || projects.length === 0) return;

  // Focus current active project or first project
  const currentIndex = projects.findIndex(p => p.path === activeProjectPath);
  focusedIndex = currentIndex >= 0 ? currentIndex : 0;

  const items = projectsListElement.querySelectorAll('.project-item');
  if (items[focusedIndex]) {
    items[focusedIndex].focus();
    items[focusedIndex].classList.add('focused');
  }

  // Setup keyboard navigation (one-time)
  if (!projectsListElement.dataset.keyboardSetup) {
    projectsListElement.dataset.keyboardSetup = 'true';
    projectsListElement.addEventListener('keydown', handleKeydown);
  }
}

/**
 * Handle keyboard navigation in project list
 */
function handleKeydown(e) {
  const items = projectsListElement.querySelectorAll('.project-item');

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[focusedIndex]?.classList.remove('focused');

    if (e.key === 'ArrowDown') {
      focusedIndex = focusedIndex < projects.length - 1 ? focusedIndex + 1 : 0;
    } else {
      focusedIndex = focusedIndex > 0 ? focusedIndex - 1 : projects.length - 1;
    }

    items[focusedIndex]?.focus();
    items[focusedIndex]?.classList.add('focused');
  }

  if (e.key === 'Enter' && focusedIndex >= 0) {
    e.preventDefault();
    selectProject(projects[focusedIndex].path);
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    items[focusedIndex]?.classList.remove('focused');
    // Return focus to terminal
    if (typeof window.terminalFocus === 'function') {
      window.terminalFocus();
    }
  }
}

/**
 * Blur/unfocus project list
 */
function blur() {
  const items = projectsListElement?.querySelectorAll('.project-item');
  items?.forEach(item => item.classList.remove('focused'));
}

module.exports = {
  init,
  loadProjects,
  renderProjects,
  selectProject,
  setActiveProject,
  getActiveProject,
  addProject,
  removeProject,
  selectNextProject,
  selectPrevProject,
  focus,
  blur,
  refreshAllGitStatus,
  requestGitStatus
};
