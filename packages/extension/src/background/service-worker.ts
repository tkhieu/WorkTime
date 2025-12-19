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
import {
  initSessionHandler,
  startSession,
  endSession,
  pauseSession,
  resumeSession,
  getActiveSessionForTab,
  trySyncSessions,
} from './session-handler';
import { initSyncManager, handleSyncAlarm, forceSyncNow } from './sync-manager';
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
chrome.alarms.onAlarm.addListener((alarm) => {
  alarmManager.handleAlarm(alarm);
  handleSyncAlarm(alarm);
});

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

    // Initialize session handler for session tracking
    await initSessionHandler();

    // Initialize sync manager for periodic sync
    await initSyncManager();

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
 * Creates or resumes session for the detected PR
 */
async function handlePRDetected(
  prInfo: {
    prUrl: string;
    prTitle: string;
    repositoryName: string;
    prNumber: number;
  },
  tabId: number
): Promise<void> {
  console.log('[ServiceWorker] PR detected:', prInfo, 'in tab', tabId);

  // Check for existing active session for this tab
  const existingSession = await getActiveSessionForTab(tabId);

  if (existingSession) {
    // Same PR? Resume session. Different PR? End old, start new.
    const sameRepo = existingSession.repoOwner + '/' + existingSession.repoName === prInfo.repositoryName;
    const samePR = existingSession.prNumber === prInfo.prNumber;

    if (sameRepo && samePR) {
      // Resume existing session
      await resumeSession(existingSession.id);
      console.log('[ServiceWorker] Resumed existing session:', existingSession.id);
      return;
    } else {
      // End old session, start new
      await endSession(existingSession.id);
      console.log('[ServiceWorker] Ended old session for new PR');
    }
  }

  // Start new session
  const session = await startSession(prInfo, tabId);
  console.log('[ServiceWorker] Started new session:', session.id);
}

/**
 * Handle tab hidden event (Page Visibility API)
 * Pauses tracking for the tab
 */
async function handleTabHidden(tabId: number): Promise<void> {
  console.log('[ServiceWorker] Tab hidden:', tabId);

  const session = await getActiveSessionForTab(tabId);
  if (session) {
    await pauseSession(session.id);
    console.log('[ServiceWorker] Paused session:', session.id);
  }
}

/**
 * Handle tab visible event (Page Visibility API)
 * Resumes tracking for the tab
 */
async function handleTabVisible(tabId: number): Promise<void> {
  console.log('[ServiceWorker] Tab visible:', tabId);

  const session = await getActiveSessionForTab(tabId);
  if (session) {
    await resumeSession(session.id);
    console.log('[ServiceWorker] Resumed session:', session.id);
  }
}

/**
 * Handle tab activation (user switched tabs)
 * Pauses previous tab's session, resumes new tab's session
 */
async function handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
  console.log('[ServiceWorker] Tab activated:', activeInfo.tabId);

  // Get all active sessions
  const activeSessions = await storageManager.getActiveSessions();

  for (const session of activeSessions) {
    if (session.tabId === activeInfo.tabId) {
      // This is the newly activated tab - resume it
      await resumeSession(session.id);
    } else if (session.active) {
      // Pause other tabs' sessions
      await pauseSession(session.id);
    }
  }
}

/**
 * Handle tab removed (user closed tab)
 */
async function handleTabRemoved(tabId: number): Promise<void> {
  console.log('[ServiceWorker] Tab removed:', tabId);

  // End session for this tab (includes API sync)
  const session = await getActiveSessionForTab(tabId);
  if (session) {
    await endSession(session.id);
    console.log('[ServiceWorker] Ended session for closed tab:', session.id);
  }

  // Also stop alarm tracking (existing behavior)
  await alarmManager.stopTrackingForTab(tabId);
}

/**
 * Handle idle state change (user went idle or locked screen)
 */
async function handleIdleStateChange(newState: chrome.idle.IdleState): Promise<void> {
  console.log('[ServiceWorker] Idle state changed:', newState);

  const settings = await storageManager.getSettings();

  if ((newState === 'idle' || newState === 'locked') && settings.autoStopOnIdle) {
    // Pause all active sessions
    const activeSessions = await storageManager.getActiveSessions();
    for (const session of activeSessions) {
      await pauseSession(session.id);
    }
    console.log('[ServiceWorker] All sessions paused due to idle state');

    // Also stop alarm tracking
    await alarmManager.stopAllTracking();
  } else if (newState === 'active') {
    // Resume sessions when user becomes active
    // Note: Sessions will resume naturally when user interacts with tabs
    console.log('[ServiceWorker] User active again');
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

  // Sync pending data before logout
  await forceSyncNow();

  // Then logout
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
