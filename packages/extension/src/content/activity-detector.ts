/**
 * PR Review Activity Detector
 * Detects comment, approve, and request_changes submissions on GitHub PR pages
 */

import { parseGitHubPRUrl } from '@worktime/shared';
import type { PRReviewActivityType, PRActivityData } from '../types';

// Debounce tracking to prevent duplicates
let lastActivityTime = 0;
let lastActivityType: PRReviewActivityType | null = null;
const DEBOUNCE_MS = 500;

// GitHub DOM selectors for review actions (2025)
const SELECTORS = {
  // Review submission form
  reviewForm: 'form[action*="/reviews"]',
  // Review action radio buttons
  reviewAction: 'input[name="pull_request_review[event]"]',
  // Submit button
  submitButton: 'button[type="submit"].btn-primary',
  // Review submitted indicator in timeline
  reviewSubmitted: '.timeline-comment-wrapper[data-gid*="PullRequestReview"]',
  // Comment form (standalone, not part of review)
  commentForm: 'form.js-new-comment-form',
  // Inline comment form
  inlineCommentForm: 'form.js-inline-comment-form',
};

/**
 * Determine activity type from review form
 */
function getReviewActionType(): PRReviewActivityType | null {
  const checkedRadio = document.querySelector(
    `${SELECTORS.reviewAction}:checked`
  ) as HTMLInputElement | null;

  if (!checkedRadio) return null;

  switch (checkedRadio.value) {
    case 'approve':
      return 'approve';
    case 'request_changes':
      return 'request_changes';
    case 'comment':
      return 'comment';
    default:
      return null;
  }
}

/**
 * Get PR context from current URL
 */
function getPRContext(): { owner: string; repo: string; prNumber: number } | null {
  const prInfo = parseGitHubPRUrl(window.location.href);
  if (!prInfo) return null;

  return {
    owner: prInfo.owner,
    repo: prInfo.repo,
    prNumber: prInfo.prNumber,
  };
}

/**
 * Check if activity should be debounced
 */
function shouldDebounce(activityType: PRReviewActivityType): boolean {
  const now = Date.now();
  if (
    now - lastActivityTime < DEBOUNCE_MS &&
    lastActivityType === activityType
  ) {
    return true;
  }
  lastActivityTime = now;
  lastActivityType = activityType;
  return false;
}

/**
 * Send activity to service worker
 */
function sendActivity(activityType: PRReviewActivityType, metadata?: object): void {
  if (shouldDebounce(activityType)) {
    console.log('[ActivityDetector] Debounced duplicate:', activityType);
    return;
  }

  const prContext = getPRContext();
  if (!prContext) {
    console.warn('[ActivityDetector] No PR context found');
    return;
  }

  const data: PRActivityData = {
    activity_type: activityType,
    repo_owner: prContext.owner,
    repo_name: prContext.repo,
    pr_number: prContext.prNumber,
    metadata: metadata as any,
    timestamp: Date.now(),
  };

  console.log('[ActivityDetector] Sending activity:', data);

  chrome.runtime.sendMessage({
    type: 'PR_ACTIVITY_DETECTED',
    data,
  });

  // Close session when review is submitted (approval, request changes, or comment)
  if (['approve', 'request_changes', 'comment'].includes(activityType)) {
    chrome.runtime.sendMessage({ type: 'REVIEW_SUBMITTED' }).catch(() => {
      // Ignore - service worker handles it
    });
  }
}

/**
 * Handle review form submission
 */
function handleReviewSubmit(event: SubmitEvent): void {
  const form = event.target as HTMLFormElement;
  if (!form.matches(SELECTORS.reviewForm)) return;

  const activityType = getReviewActionType();
  if (!activityType) return;

  // Get comment length from textarea
  const textarea = form.querySelector('textarea') as HTMLTextAreaElement | null;
  const commentLength = textarea?.value?.length || 0;

  sendActivity(activityType, { comment_length: commentLength });
}

/**
 * Handle standalone comment submission (not a review)
 */
function handleCommentSubmit(event: SubmitEvent): void {
  const form = event.target as HTMLFormElement;

  const isCommentForm =
    form.matches(SELECTORS.commentForm) ||
    form.matches(SELECTORS.inlineCommentForm);

  if (!isCommentForm) return;

  // Don't track if this is part of a review submission
  if (form.closest(SELECTORS.reviewForm)) return;

  const textarea = form.querySelector('textarea') as HTMLTextAreaElement | null;
  const commentLength = textarea?.value?.length || 0;
  const isInline = form.matches(SELECTORS.inlineCommentForm);

  sendActivity('comment', {
    comment_length: commentLength,
    is_inline_comment: isInline,
  });
}

/**
 * Setup form submission listeners
 */
function setupFormListeners(): void {
  document.addEventListener('submit', (event) => {
    handleReviewSubmit(event as SubmitEvent);
    handleCommentSubmit(event as SubmitEvent);
  }, true); // Capture phase to catch before form clears
}

/**
 * Setup MutationObserver for dynamically added review forms (backup detection)
 */
function setupMutationObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;

      // Check for newly added review submissions in timeline
      const addedNodesArray = Array.from(mutation.addedNodes);
      for (const node of addedNodesArray) {
        if (!(node instanceof HTMLElement)) continue;

        // Detect review submission by timeline update
        const reviewItem = node.matches(SELECTORS.reviewSubmitted)
          ? node
          : node.querySelector(SELECTORS.reviewSubmitted);

        if (reviewItem) {
          // Review was submitted (backup detection via DOM mutation)
          console.log('[ActivityDetector] Review detected via mutation observer');
          // Primary detection already handled via form submit
        }
      }
    }
  });

  // Observe the PR timeline container
  const timeline = document.querySelector('.js-discussion');
  if (timeline) {
    observer.observe(timeline, {
      childList: true,
      subtree: true,
    });
  }
}

/**
 * Initialize activity detector
 */
export function initActivityDetector(): void {
  const prContext = getPRContext();
  if (!prContext) {
    console.log('[ActivityDetector] Not a PR page, skipping');
    return;
  }

  console.log('[ActivityDetector] Initializing for PR:', prContext);

  setupFormListeners();
  setupMutationObserver();
}

export { sendActivity, getPRContext };
