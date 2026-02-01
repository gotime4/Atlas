/**
 * GitHub Panel Module
 * UI for displaying GitHub issues with tabbed interface
 */

const { ipcRenderer } = require('electron');
const { IPC } = require('../shared/ipcChannels');

let isVisible = false;
let issuesData = [];
let prsData = [];
let actionsData = [];
let currentTab = 'issues'; // issues, prs, actions
let currentFilter = 'open'; // open, closed, all
let currentActionsFilter = 'all'; // all, completed, in_progress, queued, failure
let repoName = null;

// DOM Elements
let panelElement = null;
let contentElement = null;

/**
 * Initialize GitHub panel
 */
function init() {
  panelElement = document.getElementById('github-panel');
  contentElement = document.getElementById('github-content');

  if (!panelElement) {
    console.error('GitHub panel element not found');
    return;
  }

  setupEventListeners();
  setupIPCListeners();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Close button
  const closeBtn = document.getElementById('github-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hide);
  }

  // Collapse button
  const collapseBtn = document.getElementById('github-collapse-btn');
  if (collapseBtn) {
    collapseBtn.addEventListener('click', hide);
  }

  // Refresh button
  const refreshBtn = document.getElementById('github-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', refreshIssues);
  }

  // Tab buttons
  document.querySelectorAll('.github-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      setTab(tab);
    });
  });

  // Filter buttons
  document.querySelectorAll('.github-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = e.target.dataset.filter;
      setFilter(filter);
    });
  });
}

/**
 * Setup IPC listeners
 */
function setupIPCListeners() {
  ipcRenderer.on(IPC.TOGGLE_GITHUB_PANEL, () => {
    toggle();
  });
}

/**
 * Load GitHub issues
 */
async function loadIssues() {
  const state = require('./state');
  const projectPath = state.getProjectPath();

  if (!projectPath) {
    renderError('No project selected');
    return;
  }

  renderLoading();

  try {
    const result = await ipcRenderer.invoke(IPC.LOAD_GITHUB_ISSUES, {
      projectPath,
      state: currentFilter
    });

    if (result.error) {
      renderError(result.error);
    } else {
      issuesData = result.issues;
      repoName = result.repoName;
      render();
    }
  } catch (err) {
    console.error('Error loading issues:', err);
    renderError('Failed to load issues');
  }
}

/**
 * Load GitHub pull requests
 */
async function loadPullRequests() {
  const state = require('./state');
  const projectPath = state.getProjectPath();

  if (!projectPath) {
    renderError('No project selected');
    return;
  }

  renderLoading('pull requests');

  try {
    const result = await ipcRenderer.invoke(IPC.LOAD_GITHUB_PRS, {
      projectPath,
      state: currentFilter
    });

    if (result.error) {
      renderError(result.error);
    } else {
      prsData = result.prs;
      repoName = result.repoName;
      renderPullRequests();
    }
  } catch (err) {
    console.error('Error loading pull requests:', err);
    renderError('Failed to load pull requests');
  }
}

/**
 * Load GitHub Actions workflow runs
 */
async function loadActions() {
  const state = require('./state');
  const projectPath = state.getProjectPath();

  if (!projectPath) {
    renderError('No project selected');
    return;
  }

  renderLoading('workflow runs');

  try {
    const result = await ipcRenderer.invoke(IPC.LOAD_GITHUB_ACTIONS, {
      projectPath,
      status: currentActionsFilter === 'all' ? '' : currentActionsFilter
    });

    if (result.error) {
      renderError(result.error);
    } else {
      actionsData = result.runs;
      repoName = result.repoName;
      renderActions();
    }
  } catch (err) {
    console.error('Error loading actions:', err);
    renderError('Failed to load workflow runs');
  }
}

/**
 * Refresh issues/PRs/actions
 */
async function refreshIssues() {
  const refreshBtn = document.getElementById('github-refresh-btn');

  try {
    if (refreshBtn) {
      refreshBtn.classList.add('spinning');
      refreshBtn.disabled = true;
    }

    if (currentTab === 'issues') {
      await loadIssues();
      showToast('Issues refreshed', 'success');
    } else if (currentTab === 'prs') {
      await loadPullRequests();
      showToast('Pull requests refreshed', 'success');
    } else if (currentTab === 'actions') {
      await loadActions();
      showToast('Workflow runs refreshed', 'success');
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.classList.remove('spinning');
      refreshBtn.disabled = false;
    }
  }
}

/**
 * Show GitHub panel
 */
function show() {
  if (panelElement) {
    panelElement.classList.add('visible');
    isVisible = true;
    loadIssues();
  }
}

/**
 * Hide GitHub panel
 */
function hide() {
  if (panelElement) {
    panelElement.classList.remove('visible');
    isVisible = false;
  }
}

/**
 * Toggle GitHub panel visibility
 */
function toggle() {
  if (isVisible) {
    hide();
  } else {
    show();
  }
}

/**
 * Set active tab
 */
function setTab(tab) {
  currentTab = tab;

  // Update active tab button
  document.querySelectorAll('.github-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  // Update filter buttons visibility based on tab
  updateFilterButtons(tab);

  if (tab === 'issues') {
    loadIssues();
  } else if (tab === 'prs') {
    loadPullRequests();
  } else if (tab === 'actions') {
    loadActions();
  } else {
    renderComingSoon(tab);
  }
}

/**
 * Update filter buttons based on current tab
 */
function updateFilterButtons(tab) {
  const filterContainer = document.querySelector('.github-filters');
  if (!filterContainer) return;

  if (tab === 'actions') {
    // Show actions-specific filters
    filterContainer.innerHTML = `
      <button class="github-filter-btn ${currentActionsFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
      <button class="github-filter-btn ${currentActionsFilter === 'in_progress' ? 'active' : ''}" data-filter="in_progress">Running</button>
      <button class="github-filter-btn ${currentActionsFilter === 'completed' ? 'active' : ''}" data-filter="completed">Completed</button>
      <button class="github-filter-btn ${currentActionsFilter === 'failure' ? 'active' : ''}" data-filter="failure">Failed</button>
    `;
  } else {
    // Show standard open/closed/all filters
    filterContainer.innerHTML = `
      <button class="github-filter-btn ${currentFilter === 'open' ? 'active' : ''}" data-filter="open">Open</button>
      <button class="github-filter-btn ${currentFilter === 'closed' ? 'active' : ''}" data-filter="closed">Closed</button>
      <button class="github-filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">All</button>
    `;
  }

  // Re-attach event listeners
  filterContainer.querySelectorAll('.github-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = e.target.dataset.filter;
      setFilter(filter);
    });
  });
}

/**
 * Set filter
 */
function setFilter(filter) {
  // Update active filter button
  document.querySelectorAll('.github-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  if (currentTab === 'actions') {
    currentActionsFilter = filter;
    loadActions();
  } else {
    currentFilter = filter;
    if (currentTab === 'issues') {
      loadIssues();
    } else if (currentTab === 'prs') {
      loadPullRequests();
    }
  }
}

/**
 * Render loading state
 */
function renderLoading(type = 'issues') {
  if (!contentElement) return;

  contentElement.innerHTML = `
    <div class="github-loading">
      <div class="github-loading-spinner"></div>
      <p>Loading ${type}...</p>
    </div>
  `;
}

/**
 * Render error state
 */
function renderError(message) {
  if (!contentElement) return;

  let helpText = '';
  if (message === 'gh CLI not installed') {
    helpText = '<span>Install GitHub CLI: <a href="#" onclick="require(\'electron\').shell.openExternal(\'https://cli.github.com/\')">cli.github.com</a></span>';
  } else if (message === 'Not a GitHub repository') {
    helpText = '<span>This project is not connected to a GitHub repository</span>';
  }

  contentElement.innerHTML = `
    <div class="github-error">
      <div class="github-error-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p>${escapeHtml(message)}</p>
      ${helpText}
    </div>
  `;
}

/**
 * Render coming soon state for unimplemented tabs
 */
function renderComingSoon(tab) {
  if (!contentElement) return;

  const tabNames = {
    prs: 'Pull Requests',
    actions: 'Actions'
  };

  contentElement.innerHTML = `
    <div class="github-coming-soon">
      <div class="github-coming-soon-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <p>${tabNames[tab] || tab} - Coming Soon</p>
      <span>This feature will be available in a future update</span>
    </div>
  `;
}

/**
 * Render issues list
 */
function render() {
  if (!contentElement) return;

  // Update repo name in header
  const repoNameEl = document.getElementById('github-repo-name');
  if (repoNameEl) {
    repoNameEl.textContent = repoName || '';
    repoNameEl.style.display = repoName ? 'block' : 'none';
  }

  if (!issuesData || issuesData.length === 0) {
    contentElement.innerHTML = `
      <div class="github-empty">
        <div class="github-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <p>No ${currentFilter} issues</p>
        <span>${currentFilter === 'open' ? 'All issues are resolved!' : 'No issues found with this filter'}</span>
      </div>
    `;
    return;
  }

  contentElement.innerHTML = issuesData.map(issue => renderIssueItem(issue)).join('');

  // Add event listeners to issue items
  contentElement.querySelectorAll('.github-issue-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      if (url) {
        ipcRenderer.send(IPC.OPEN_GITHUB_ISSUE, url);
      }
    });
  });
}

/**
 * Render single issue item
 */
function renderIssueItem(issue) {
  const stateClass = issue.state === 'OPEN' ? 'open' : 'closed';
  const stateIcon = issue.state === 'OPEN'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>';

  const labels = issue.labels && issue.labels.length > 0
    ? issue.labels.map(label => {
        const bgColor = label.color ? `#${label.color}` : 'var(--bg-hover)';
        const textColor = label.color ? getContrastColor(label.color) : 'var(--text-secondary)';
        return `<span class="github-label" style="background: ${bgColor}; color: ${textColor}">${escapeHtml(label.name)}</span>`;
      }).join('')
    : '';

  const createdAt = formatRelativeTime(issue.createdAt);
  const author = issue.author ? issue.author.login : 'unknown';

  return `
    <div class="github-issue-item ${stateClass}" data-url="${escapeHtml(issue.url)}">
      <div class="github-issue-state ${stateClass}">
        ${stateIcon}
      </div>
      <div class="github-issue-content">
        <div class="github-issue-header">
          <span class="github-issue-number">#${issue.number}</span>
          <span class="github-issue-title">${escapeHtml(issue.title)}</span>
        </div>
        ${labels ? `<div class="github-issue-labels">${labels}</div>` : ''}
        <div class="github-issue-meta">
          <span>opened ${createdAt} by ${escapeHtml(author)}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render pull requests list
 */
function renderPullRequests() {
  if (!contentElement) return;

  // Update repo name in header
  const repoNameEl = document.getElementById('github-repo-name');
  if (repoNameEl) {
    repoNameEl.textContent = repoName || '';
    repoNameEl.style.display = repoName ? 'block' : 'none';
  }

  if (!prsData || prsData.length === 0) {
    contentElement.innerHTML = `
      <div class="github-empty">
        <div class="github-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <p>No ${currentFilter} pull requests</p>
        <span>${currentFilter === 'open' ? 'All PRs are merged or closed!' : 'No PRs found with this filter'}</span>
      </div>
    `;
    return;
  }

  contentElement.innerHTML = prsData.map(pr => renderPRItem(pr)).join('');

  // Add event listeners to PR items
  contentElement.querySelectorAll('.github-pr-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      if (url) {
        ipcRenderer.send(IPC.OPEN_GITHUB_ISSUE, url);
      }
    });
  });
}

/**
 * Render single pull request item
 */
function renderPRItem(pr) {
  const stateClass = pr.state === 'OPEN' ? 'open' : (pr.state === 'MERGED' ? 'merged' : 'closed');

  // PR state icon
  let stateIcon;
  if (pr.state === 'MERGED') {
    stateIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 9v6a3 3 0 0 0 3 3h6"/></svg>';
  } else if (pr.state === 'OPEN') {
    stateIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 9v12"/><path d="M18 9a9 9 0 0 0-9 9"/></svg>';
  } else {
    stateIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  }

  // CI/CD Status
  const statusInfo = getPRStatus(pr);
  const statusBadge = statusInfo ? `
    <span class="github-pr-status ${statusInfo.class}" title="${statusInfo.title}">
      ${statusInfo.icon}
      <span>${statusInfo.text}</span>
    </span>
  ` : '';

  // Review status
  const reviewBadge = getReviewBadge(pr.reviewDecision);

  // Draft badge
  const draftBadge = pr.isDraft ? '<span class="github-pr-draft">Draft</span>' : '';

  // Labels
  const labels = pr.labels && pr.labels.length > 0
    ? pr.labels.map(label => {
        const bgColor = label.color ? `#${label.color}` : 'var(--bg-hover)';
        const textColor = label.color ? getContrastColor(label.color) : 'var(--text-secondary)';
        return `<span class="github-label" style="background: ${bgColor}; color: ${textColor}">${escapeHtml(label.name)}</span>`;
      }).join('')
    : '';

  const createdAt = formatRelativeTime(pr.createdAt);
  const author = pr.author ? pr.author.login : 'unknown';

  return `
    <div class="github-pr-item ${stateClass}" data-url="${escapeHtml(pr.url)}">
      <div class="github-pr-state ${stateClass}">
        ${stateIcon}
      </div>
      <div class="github-pr-content">
        <div class="github-pr-header">
          <span class="github-pr-number">#${pr.number}</span>
          <span class="github-pr-title">${escapeHtml(pr.title)}</span>
          ${draftBadge}
        </div>
        <div class="github-pr-branch">
          <span class="github-pr-branch-name">${escapeHtml(pr.headRefName)}</span>
          <span class="github-pr-arrow">→</span>
          <span class="github-pr-branch-name">${escapeHtml(pr.baseRefName)}</span>
        </div>
        <div class="github-pr-badges">
          ${statusBadge}
          ${reviewBadge}
        </div>
        ${labels ? `<div class="github-pr-labels">${labels}</div>` : ''}
        <div class="github-pr-meta">
          <span>opened ${createdAt} by ${escapeHtml(author)}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render GitHub Actions workflow runs
 */
function renderActions() {
  if (!contentElement) return;

  // Update repo name in header
  const repoNameEl = document.getElementById('github-repo-name');
  if (repoNameEl) {
    repoNameEl.textContent = repoName || '';
    repoNameEl.style.display = repoName ? 'block' : 'none';
  }

  if (!actionsData || actionsData.length === 0) {
    contentElement.innerHTML = `
      <div class="github-empty">
        <div class="github-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <p>No workflow runs found</p>
        <span>${currentActionsFilter === 'all' ? 'No GitHub Actions have been run yet' : 'No runs match this filter'}</span>
      </div>
    `;
    return;
  }

  contentElement.innerHTML = actionsData.map(run => renderActionItem(run)).join('');

  // Add event listeners to action items
  contentElement.querySelectorAll('.github-action-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      if (url) {
        ipcRenderer.send(IPC.OPEN_GITHUB_ISSUE, url);
      }
    });
  });
}

/**
 * Render single action/workflow run item
 */
function renderActionItem(run) {
  const statusInfo = getActionStatus(run);

  // Event icon
  const eventIcon = getEventIcon(run.event);

  const createdAt = formatRelativeTime(run.createdAt);

  return `
    <div class="github-action-item ${statusInfo.class}" data-url="${escapeHtml(run.url)}">
      <div class="github-action-status ${statusInfo.class}">
        ${statusInfo.icon}
      </div>
      <div class="github-action-content">
        <div class="github-action-header">
          <span class="github-action-title">${escapeHtml(run.displayTitle || run.name)}</span>
        </div>
        <div class="github-action-workflow">
          <span class="github-action-workflow-name">${escapeHtml(run.workflowName)}</span>
        </div>
        <div class="github-action-meta">
          <span class="github-action-event" title="Trigger: ${run.event}">
            ${eventIcon}
            ${escapeHtml(run.event)}
          </span>
          <span class="github-action-branch" title="Branch: ${run.headBranch}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="6" y1="3" x2="6" y2="15"/>
              <circle cx="18" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
            ${escapeHtml(run.headBranch)}
          </span>
          <span class="github-action-time">${createdAt}</span>
        </div>
      </div>
      <div class="github-action-badge ${statusInfo.class}">
        ${statusInfo.text}
      </div>
    </div>
  `;
}

/**
 * Get action/workflow run status
 */
function getActionStatus(run) {
  const status = run.status;
  const conclusion = run.conclusion;

  if (status === 'in_progress' || status === 'queued' || status === 'pending' || status === 'waiting') {
    return {
      class: 'running',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
      text: status === 'queued' ? 'Queued' : 'Running'
    };
  }

  if (conclusion === 'success') {
    return {
      class: 'success',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/></svg>',
      text: 'Success'
    };
  }

  if (conclusion === 'failure') {
    return {
      class: 'failure',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      text: 'Failed'
    };
  }

  if (conclusion === 'cancelled') {
    return {
      class: 'cancelled',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6"/></svg>',
      text: 'Cancelled'
    };
  }

  if (conclusion === 'skipped') {
    return {
      class: 'skipped',
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4V8z"/></svg>',
      text: 'Skipped'
    };
  }

  return {
    class: 'neutral',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    text: status || 'Unknown'
  };
}

/**
 * Get event icon for workflow trigger
 */
function getEventIcon(event) {
  switch (event) {
    case 'push':
      return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    case 'pull_request':
    case 'pull_request_target':
      return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 9v12"/><path d="M18 9a9 9 0 0 0-9 9"/></svg>';
    case 'schedule':
      return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
    case 'workflow_dispatch':
      return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>';
    case 'release':
      return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
    default:
      return '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
  }
}

/**
 * Get PR CI/CD status from statusCheckRollup
 */
function getPRStatus(pr) {
  if (!pr.statusCheckRollup || pr.statusCheckRollup.length === 0) {
    return null;
  }

  // Count status states
  let pending = 0, success = 0, failure = 0;

  for (const check of pr.statusCheckRollup) {
    const state = check.status || check.state || check.conclusion;
    if (state === 'SUCCESS' || state === 'COMPLETED' || state === 'success') {
      success++;
    } else if (state === 'FAILURE' || state === 'ERROR' || state === 'failure' || state === 'error' || state === 'TIMED_OUT') {
      failure++;
    } else if (state === 'PENDING' || state === 'IN_PROGRESS' || state === 'QUEUED' || state === 'pending') {
      pending++;
    }
  }

  const total = pr.statusCheckRollup.length;

  if (failure > 0) {
    return {
      class: 'status-failure',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      text: `${failure}/${total} failed`,
      title: `${failure} checks failed, ${success} passed, ${pending} pending`
    };
  } else if (pending > 0) {
    return {
      class: 'status-pending',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      text: `${pending} running`,
      title: `${pending} checks running, ${success} passed`
    };
  } else if (success > 0) {
    return {
      class: 'status-success',
      icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
      text: `${success}/${total} passed`,
      title: `All ${total} checks passed`
    };
  }

  return null;
}

/**
 * Get review decision badge
 */
function getReviewBadge(reviewDecision) {
  if (!reviewDecision) return '';

  switch (reviewDecision) {
    case 'APPROVED':
      return '<span class="github-pr-review approved" title="Approved"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Approved</span>';
    case 'CHANGES_REQUESTED':
      return '<span class="github-pr-review changes-requested" title="Changes requested"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/></svg> Changes requested</span>';
    case 'REVIEW_REQUIRED':
      return '<span class="github-pr-review review-required" title="Review required"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v.01"/><path d="M12 12v-4"/></svg> Review required</span>';
    default:
      return '';
  }
}

/**
 * Get contrasting text color for a background color
 */
function getContrastColor(hexColor) {
  const r = parseInt(hexColor.substr(0, 2), 16);
  const g = parseInt(hexColor.substr(2, 2), 16);
  const b = parseInt(hexColor.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
}

/**
 * Format relative time
 */
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return diffMinutes <= 1 ? 'just now' : `${diffMinutes} minutes ago`;
    }
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }

  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.github-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = `github-toast github-toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${getToastIcon(type)}</span>
    <span class="toast-message">${message}</span>
  `;

  if (panelElement) {
    panelElement.appendChild(toast);
  }

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

/**
 * Get toast icon based on type
 */
function getToastIcon(type) {
  switch (type) {
    case 'success':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    case 'error':
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    default:
      return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

module.exports = {
  init,
  show,
  hide,
  toggle,
  loadIssues,
  isVisible: () => isVisible
};
