// Content Script for PR Detection
// Runs on GitHub PR pages to detect and track review activity

import { parseGitHubPRUrl } from '@worktime/shared';

console.log('WorkTime PR Detector loaded');

// Detect if current page is a GitHub PR
function detectPR() {
  const url = window.location.href;
  const prInfo = parseGitHubPRUrl(url);

  if (prInfo) {
    console.log('PR detected:', prInfo);
    notifyBackgroundOfPR(prInfo);
  }
}

// Notify background service worker of PR detection
function notifyBackgroundOfPR(prInfo: {
  owner: string;
  repo: string;
  prNumber: number;
}) {
  const prTitle = document.querySelector('.js-issue-title')?.textContent?.trim() || 'Unknown PR';
  const prUrl = window.location.href;

  chrome.runtime.sendMessage({
    type: 'PR_DETECTED',
    data: {
      prUrl,
      prTitle,
      repositoryName: `${prInfo.owner}/${prInfo.repo}`,
      prNumber: prInfo.prNumber,
    },
  });
}

// Monitor for PR page changes (SPA navigation)
let currentUrl = window.location.href;

const observer = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    console.log('URL changed:', currentUrl);
    detectPR();
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial detection
detectPR();

// Track user activity on PR page
let lastActivityTime = Date.now();

function trackActivity() {
  lastActivityTime = Date.now();
  console.log('User activity detected');
}

// Listen for user interactions
document.addEventListener('mousedown', trackActivity);
document.addEventListener('keydown', trackActivity);
document.addEventListener('scroll', trackActivity);

// Periodic activity check (every 30 seconds)
setInterval(() => {
  const timeSinceActivity = Date.now() - lastActivityTime;
  const isIdle = timeSinceActivity > 60000; // 1 minute idle threshold

  if (!isIdle) {
    // User is active, send heartbeat to background
    chrome.runtime.sendMessage({
      type: 'ACTIVITY_HEARTBEAT',
      data: {
        url: window.location.href,
        timestamp: Date.now(),
      },
    });
  }
}, 30000);

export {};
