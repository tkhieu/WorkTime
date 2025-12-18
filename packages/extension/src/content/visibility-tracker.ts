/**
 * Visibility Tracker - Page Visibility API integration
 * Detects when tab becomes hidden/visible and notifies service worker
 * This enables accurate pause/resume of time tracking
 */

import type { MessageType } from '../types';

class VisibilityTracker {
  private isVisible: boolean;
  private initialized: boolean = false;

  constructor() {
    this.isVisible = !document.hidden;
    this.init();
  }

  private init(): void {
    if (this.initialized) {
      return;
    }

    console.log(
      '[WorkTime] Visibility tracker initialized, current state:',
      this.isVisible ? 'visible' : 'hidden'
    );

    // Listen to visibility changes (tab hidden/visible, minimize, lock screen)
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));

    // Listen to focus changes (additional safety for edge cases)
    window.addEventListener('focus', this.handleFocus.bind(this));
    window.addEventListener('blur', this.handleBlur.bind(this));

    // Send initial state if page is visible
    if (this.isVisible) {
      this.notifyVisible();
    }

    this.initialized = true;
  }

  private handleVisibilityChange(): void {
    const wasVisible = this.isVisible;
    this.isVisible = !document.hidden;

    console.log('[WorkTime] Visibility changed:', this.isVisible ? 'visible' : 'hidden');

    // Only notify on state change to prevent duplicate messages
    if (this.isVisible !== wasVisible) {
      if (this.isVisible) {
        this.notifyVisible();
      } else {
        this.notifyHidden();
      }
    }
  }

  private handleFocus(): void {
    console.log('[WorkTime] Window focused');

    // Update visibility state if it changed
    if (!this.isVisible && !document.hidden) {
      this.isVisible = true;
      this.notifyVisible();
    }
  }

  private handleBlur(): void {
    console.log('[WorkTime] Window blurred');

    // Note: We don't immediately pause on blur because user might
    // just be clicking on another window but still viewing the tab
    // We rely on visibilitychange for accurate hidden state
  }

  private notifyVisible(): void {
    const message: MessageType = {
      type: 'TAB_VISIBLE',
      tabId: -1 // Service worker will get real tabId from sender
    };

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[WorkTime] Failed to send TAB_VISIBLE:', chrome.runtime.lastError);
      } else {
        console.log('[WorkTime] TAB_VISIBLE message sent successfully');
      }
    });
  }

  private notifyHidden(): void {
    const message: MessageType = {
      type: 'TAB_HIDDEN',
      tabId: -1 // Service worker will get real tabId from sender
    };

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[WorkTime] Failed to send TAB_HIDDEN:', chrome.runtime.lastError);
      } else {
        console.log('[WorkTime] TAB_HIDDEN message sent successfully');
      }
    });
  }

  /**
   * Cleanup method for testing or manual destruction
   */
  public destroy(): void {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.removeEventListener('focus', this.handleFocus.bind(this));
    window.removeEventListener('blur', this.handleBlur.bind(this));
    this.initialized = false;
  }
}

// Initialize tracker immediately when content script loads
new VisibilityTracker();

export default VisibilityTracker;
