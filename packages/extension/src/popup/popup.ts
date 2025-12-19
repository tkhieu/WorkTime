// Popup script for WorkTime extension
// Displays current tracking status and controls

import { formatDuration } from '@worktime/shared';

console.log('WorkTime Popup loaded');

// DOM elements - Auth
const loginPrompt = document.getElementById('login-prompt') as HTMLDivElement;
const userInfo = document.getElementById('user-info') as HTMLDivElement;
const mainContent = document.getElementById('main-content') as HTMLElement;
const githubLoginBtn = document.getElementById('github-login-btn') as HTMLButtonElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
const userAvatar = document.getElementById('user-avatar') as HTMLImageElement;
const userName = document.getElementById('user-name') as HTMLSpanElement;

// DOM elements - Tracking
const statusElement = document.getElementById('status') as HTMLDivElement;
const currentPRElement = document.getElementById('current-pr') as HTMLDivElement;
const timerElement = document.getElementById('timer') as HTMLDivElement;

// Initialize popup
async function initializePopup() {
  console.log('Initializing popup...');

  // Check authentication status first
  const authStatus = await chrome.runtime.sendMessage({ type: 'GITHUB_STATUS' });

  if (!authStatus.authenticated) {
    showLoginUI();
    return;
  }

  // Show authenticated UI
  showAuthenticatedUI(authStatus.user);

  // Get current active session
  const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_SESSION' });

  if (response) {
    displayActiveSession(response);
  } else {
    displayNoActiveSession();
  }
}

// Show login UI
function showLoginUI() {
  loginPrompt.style.display = 'flex';
  userInfo.style.display = 'none';
  mainContent.style.display = 'none';
}

// Show authenticated UI
function showAuthenticatedUI(user: any) {
  loginPrompt.style.display = 'none';
  userInfo.style.display = 'flex';
  mainContent.style.display = 'block';

  // Update user info
  if (user) {
    userName.textContent = user.name || user.login || 'User';
    if (user.avatar_url) {
      userAvatar.src = user.avatar_url;
    }
  }
}

// Display active tracking session
function displayActiveSession(session: any) {
  statusElement.textContent = 'Tracking active';
  statusElement.className = 'status active';

  // Display PR with number and title: "#123 - PR Title"
  const prDisplay = session.prNumber
    ? `#${session.prNumber} - ${session.prTitle || 'Unknown PR'}`
    : session.prTitle || 'Unknown PR';
  currentPRElement.textContent = prDisplay;

  // Start timer
  updateTimer(session.startTime);
}

// Display no active session state
function displayNoActiveSession() {
  statusElement.textContent = 'Not tracking';
  statusElement.className = 'status inactive';

  currentPRElement.textContent = 'No active PR review';
  timerElement.textContent = '0m 0s';
}

// Update timer display
function updateTimer(startTime: number) {
  const updateTimerInterval = setInterval(() => {
    const elapsed = Date.now() - startTime;
    timerElement.textContent = formatDuration(elapsed);
  }, 1000);

  // Store interval ID for cleanup
  (window as any).timerInterval = updateTimerInterval;
}

// GitHub login button handler
githubLoginBtn?.addEventListener('click', async () => {
  console.log('GitHub login clicked');

  // Disable button and show loading state
  githubLoginBtn.disabled = true;
  githubLoginBtn.textContent = 'Logging in...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GITHUB_LOGIN',
    });

    if (response && response.error) {
      alert(`Login failed: ${response.error}`);
      githubLoginBtn.disabled = false;
      githubLoginBtn.textContent = 'Login with GitHub';
    } else {
      // Refresh popup to show authenticated state
      initializePopup();
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('Login failed. Please try again.');
    githubLoginBtn.disabled = false;
    githubLoginBtn.textContent = 'Login with GitHub';
  }
});

// Logout button handler
logoutBtn?.addEventListener('click', async () => {
  console.log('Logout clicked');

  if (!confirm('Are you sure you want to logout?')) {
    return;
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'GITHUB_LOGOUT',
    });

    // Refresh popup to show login state
    initializePopup();
  } catch (error) {
    console.error('Logout error:', error);
    alert('Logout failed. Please try again.');
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initializePopup);

export {};
