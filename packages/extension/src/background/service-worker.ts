/**
 * Service Worker - Chrome Extension MV3 Background
 * Handles event-driven architecture with stateless design
 *
 * CRITICAL MV3 REQUIREMENTS:
 * - All event listeners MUST be registered synchronously at top level
 * - Service worker terminates after 30s idle
 * - Storage-first design: always write to chrome.storage immediately
 * - No setInterval/setTimeout - use chrome.alarms
 */

import { storageManager } from './storage-manager';
import { alarmManager } from './alarm-manager';
import { githubOAuth } from '../auth/github-oauth';
import { tokenManager } from '../auth/token-manager';
import { handlePRActivityDetected, initActivityHandler, trySyncActivities } from './activity-handler';
import type { MessageType } from '../types';

// ======================================
// EVENT LISTENER REGISTRATION (TOP LEVEL)
// CRITICAL: Must be synchronous in first event loop
// ======================================

chrome.runtime.onInstalled.addListener(handleInstall);
chrome.runtime.onStartup.addListener(handleStartup);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.tabs.onActivated.addListener(handleTabActivated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);
chrome.idle.onStateChanged.addListener(handleIdleStateChange);
chrome.alarms.onAlarm.addListener((alarm) => alarmManager.handleAlarm(alarm));

// ======================================
// INITIALIZATION
// ======================================

async function handleInstall(details: chrome.runtime.InstalledDetails): Promise<void> {
  console.log('[ServiceWorker] Extension installed:', details.reason);
  await initialize();
}

async function handleStartup(): Promise<void> {
  console.log('[ServiceWorker] Browser started, initializing WorkTime');
  await initialize();
}

async function initialize(): Promise<void> {
  console.log('[ServiceWorker] Initializing service worker');

  try {
    // Reconstruct state from storage (storage-first design)
    await storageManager.initialize();

    // Start periodic alarms for time tracking
    await alarmManager.initialize();

    // Initialize activity handler for PR review tracking
    await initActivityHandler();

    // Setup idle detection
    const settings = await storageManager.getSettings();
    chrome.idle.setDetectionInterval(settings.idleThreshold);

    console.log('[ServiceWorker] Initialization complete');
  } catch (error) {
    console.error('[ServiceWorker] Initialization error:', error);
  }
}

// ======================================
// EVENT HANDLERS
// ======================================

/**
 * Handle messages from content scripts and popup
 */
function handleMessage(
  message: MessageType,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
): boolean {
  console.log('[ServiceWorker] Message received:', message.type);

  if (message.type === 'PR_DETECTED') {
    handlePRDetected(message.data, message.tabId ?? -1).catch(console.error);
  } else if (message.type === 'PR_ACTIVITY_DETECTED') {
    handlePRActivityDetected(message.data).catch(console.error);
  } else if (message.type === 'TAB_HIDDEN') {
    handleTabHidden(message.tabId ?? -1).catch(console.error);
  } else if (message.type === 'TAB_VISIBLE') {
    handleTabVisible(message.tabId ?? -1).catch(console.error);
  } else if (message.type === 'GET_STATUS') {
    getTrackingStatus()
      .then(sendResponse)
      .catch((error) => {
        console.error('[ServiceWorker] Error getting status:', error);
        sendResponse({ error: error.message });
      });
    return true; // Async response
  } else if (message.type === 'GET_ACTIVE_SESSION') {
    getActiveSession()
      .then(sendResponse)
      .catch((error) => {
        console.error('[ServiceWorker] Error getting active session:', error);
        sendResponse(null);
      });
    return true; // Async response
  } else if (message.type === 'GITHUB_LOGIN') {
    handleGitHubLogin()
      .then(sendResponse)
      .catch((error) => {
        console.error('[ServiceWorker] GitHub login error:', error);
        sendResponse({ error: error.message });
      });
    return true; // Async response
  } else if (message.type === 'GITHUB_LOGOUT') {
    handleGitHubLogout()
      .then(sendResponse)
      .catch(console.error);
  } else if (message.type === 'GITHUB_STATUS') {
    getGitHubStatus()
      .then(sendResponse)
      .catch(console.error);
    return true; // Async response
  }

  return false;
}

/**
 * Handle PR detected event from content script
 * Phase 03: Full implementation
 */
async function handlePRDetected(
  prInfo: { owner: string; repo: string; prNumber: number; url: string },
  _tabId: number
): Promise<void> {
  console.log('[ServiceWorker] PR detected:', prInfo, 'in tab', _tabId);
  // Phase 03: Create new tracking session
}

/**
 * Handle tab hidden event (Page Visibility API)
 * Phase 04: Full implementation
 */
async function handleTabHidden(tabId: number): Promise<void> {
  console.log('[ServiceWorker] Tab hidden:', tabId);
  // Phase 04: Pause tracking for this tab
}

/**
 * Handle tab visible event (Page Visibility API)
 * Phase 04: Full implementation
 */
async function handleTabVisible(tabId: number): Promise<void> {
  console.log('[ServiceWorker] Tab visible:', tabId);
  // Phase 04: Resume tracking for this tab
}

/**
 * Handle tab activation (user switched tabs)
 */
async function handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  console.log('[ServiceWorker] Tab activated:', activeInfo.tabId);
  // Phase 04: Pause previous tab, resume new tab if PR page
}

/**
 * Handle tab removed (user closed tab)
 */
async function handleTabRemoved(tabId: number): Promise<void> {
  console.log('[ServiceWorker] Tab removed:', tabId);

  // Stop tracking for this tab
  await alarmManager.stopTrackingForTab(tabId);
}

/**
 * Handle idle state change (user went idle or locked screen)
 */
async function handleIdleStateChange(newState: chrome.idle.IdleState): Promise<void> {
  console.log('[ServiceWorker] Idle state changed:', newState);

  const settings = await storageManager.getSettings();

  if ((newState === 'idle' || newState === 'locked') && settings.autoStopOnIdle) {
    // Pause all active tracking
    await alarmManager.stopAllTracking();
    console.log('[ServiceWorker] All tracking stopped due to idle state');
  }
}

/**
 * Get current tracking status
 */
async function getTrackingStatus(): Promise<unknown> {
  const sessions = await storageManager.getAllSessions();
  const activeSessions = Object.values(sessions).filter((s) => s.active);

  const today = new Date().toISOString().split('T')[0];
  const dailyStats = await storageManager.getDailyStats(today);

  return {
    activeSessions: activeSessions.length,
    sessions: activeSessions,
    dailyStats: dailyStats || { date: today, totalTime: 0, prCount: 0, sessions: [] },
  };
}

/**
 * Get active session for popup display
 */
async function getActiveSession(): Promise<unknown> {
  const sessions = await storageManager.getAllSessions();
  const activeSessions = Object.values(sessions).filter((s) => s.active);

  if (activeSessions.length === 0) {
    return null;
  }

  // Return the first active session
  const session = activeSessions[0];
  return {
    prTitle: session.prTitle,
    startTime: session.startTime,
    repoOwner: session.repoOwner,
    repoName: session.repoName,
    prNumber: session.prNumber,
  };
}

/**
 * Handle GitHub login
 */
async function handleGitHubLogin(): Promise<unknown> {
  console.log('[ServiceWorker] GitHub login requested');

  try {
    await githubOAuth.login();
    const authStatus = await githubOAuth.getAuthStatus();
    return {
      success: true,
      authenticated: authStatus.authenticated,
      user: authStatus.user,
    };
  } catch (error) {
    console.error('[ServiceWorker] GitHub login error:', error);
    return {
      error: error instanceof Error ? error.message : 'Login failed',
    };
  }
}

/**
 * Handle GitHub logout
 */
async function handleGitHubLogout(): Promise<void> {
  console.log('[ServiceWorker] GitHub logout requested');
  await githubOAuth.logout();
}

/**
 * Get GitHub authentication status
 */
async function getGitHubStatus(): Promise<unknown> {
  const authStatus = await githubOAuth.getAuthStatus();
  return {
    authenticated: authStatus.authenticated,
    user: authStatus.user,
  };
}

// ======================================
// SERVICE WORKER LIFECYCLE
// ======================================

// Initialize immediately on service worker load
initialize().catch((error) => {
  console.error('[ServiceWorker] Fatal initialization error:', error);
});

console.log('[ServiceWorker] Service worker loaded');
