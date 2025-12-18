// Popup script for WorkTime extension
// Displays current tracking status and controls

import { formatDuration } from '@worktime/shared';

console.log('WorkTime Popup loaded');

// DOM elements
const statusElement = document.getElementById('status') as HTMLDivElement;
const currentPRElement = document.getElementById('current-pr') as HTMLDivElement;
const timerElement = document.getElementById('timer') as HTMLDivElement;
const startButton = document.getElementById('start-btn') as HTMLButtonElement;
const stopButton = document.getElementById('stop-btn') as HTMLButtonElement;

// Initialize popup
async function initializePopup() {
  console.log('Initializing popup...');

  // Get current active session
  const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_SESSION' });

  if (response) {
    displayActiveSession(response);
  } else {
    displayNoActiveSession();
  }
}

// Display active tracking session
function displayActiveSession(session: any) {
  statusElement.textContent = 'Tracking active';
  statusElement.className = 'status active';

  currentPRElement.textContent = session.prTitle || 'Unknown PR';

  // Start timer
  updateTimer(session.startTime);

  startButton.disabled = true;
  stopButton.disabled = false;
}

// Display no active session state
function displayNoActiveSession() {
  statusElement.textContent = 'Not tracking';
  statusElement.className = 'status inactive';

  currentPRElement.textContent = 'No active PR review';
  timerElement.textContent = '0m 0s';

  startButton.disabled = false;
  stopButton.disabled = true;
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

// Start tracking button handler
startButton?.addEventListener('click', async () => {
  console.log('Start tracking clicked');

  // Get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab.url?.includes('github.com') && tab.url.includes('/pull/')) {
    await chrome.runtime.sendMessage({
      type: 'START_TRACKING',
      data: {
        prUrl: tab.url,
        prTitle: tab.title || 'Unknown PR',
      },
    });

    // Refresh popup state
    initializePopup();
  } else {
    alert('Please navigate to a GitHub PR page to start tracking');
  }
});

// Stop tracking button handler
stopButton?.addEventListener('click', async () => {
  console.log('Stop tracking clicked');

  await chrome.runtime.sendMessage({
    type: 'STOP_TRACKING',
    data: {},
  });

  // Clear timer interval
  if ((window as any).timerInterval) {
    clearInterval((window as any).timerInterval);
  }

  // Refresh popup state
  initializePopup();
});

// Initialize on load
document.addEventListener('DOMContentLoaded', initializePopup);

export {};
