# Backend Sync Reliability Patterns Research

**Date:** 2025-12-20
**Focus:** Extension-to-backend sync patterns, offline resilience, guaranteed delivery

---

## 1. Optimistic Sync vs Eventual Consistency

### Optimistic Sync
- **Approach:** Accept user action immediately, apply locally first, sync server asynchronously
- **Benefits:** Instant UI feedback, responsive UX, works offline
- **Trade-offs:** Temporary data divergence, requires conflict resolution
- **Use case:** Browser extensions (immediate action feedback expected)

### Eventual Consistency
- **Approach:** Prioritize availability & partition tolerance over immediate accuracy
- **Guarantee:** All nodes converge to same state when updates stop
- **Benefits:** Scalable, highly available, handles network partitions
- **Trade-offs:** Stale reads possible temporarily, complex conflict handling
- **Use case:** Distributed backend systems, multiple client scenarios

### Hybrid Pattern (Recommended)
```
Client Action → Local State Update (optimistic)
              → Queue Sync Operation
              → Attempt Server Update
              → If Failed: Retry with Backoff
              → If Stale Conflict: Resolution Strategy
```

**Key Insight:** Extensions benefit from optimistic + eventual consistency: update locally immediately, sync reliably in background with automatic conflict resolution.

---

## 2. Retry/Backoff Strategies

### Exponential Backoff with Jitter
**Formula:** `delay = baseDelay * (2 ^ retryCount) + random(jitterRange)`

**Recommended Configuration:**
- Base delay: 100-500ms (AWS SDK uses 100ms default)
- Max retries: 3-5 for user-triggered, 10+ for background
- Max delay cap: 30-60 seconds (prevent infinite wait)
- Jitter range: ±25% of calculated delay (avoid thundering herd)

**Example Progression:**
```
Retry 1: 100ms + jitter
Retry 2: 200ms + jitter
Retry 3: 400ms + jitter
Retry 4: 800ms + jitter (capped at 30s max)
```

### Idempotency & Deduplication
- **Critical:** All sync operations must be idempotent (safe to replay)
- **Method:** Use unique request IDs (`requestId`) to detect duplicates
- **Server-side:** Store processed request IDs with TTL (24h), reject duplicates
- **Prevents:** Double-submissions on retry, data corruption

### Non-Retryable Errors
Do NOT retry:
- 400 Bad Request (validation failed)
- 401 Unauthorized (auth failed)
- 403 Forbidden (permission denied)
- 422 Unprocessable Entity (business logic failed)

Retry only:
- 408 Request Timeout
- 429 Too Many Requests (rate limited - respect Retry-After header)
- 500-599 Server errors
- Network timeouts/connection refused

**Implementation:** [Exponential Backoff Patterns](https://betterstack.com/community/guides/monitoring/exponential-backoff/) | [AWS SDK Retry Strategy](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/retry-strategy.html)

---

## 3. Handling Offline/Network Errors

### IndexedDB-Based Queue
- **Storage:** Persist pending operations in IndexedDB
- **Structure:** Queue table with `{id, operation, payload, timestamp, retryCount}`
- **Benefit:** Survives browser restart, tab close, extension reload

### Service Worker Integration
**Flow:**
1. Intercept network request from popup/content script
2. If online: attempt sync immediately
3. If offline: store in IndexedDB queue
4. Listen for online event → resume syncing
5. Background Sync API triggers even if tab closed

### Workbox Background Sync
- **Standard:** Chrome/Firefox support Background Sync API
- **Queue Storage:** Automatic IndexedDB management via Workbox
- **Trigger:** `navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-tag'))`
- **Reliability:** Survives browser restarts, retries on connectivity restore

**Key Limitation:** No guarantee on browser crash; Pending Beacon API (experimental) addresses this.

### Network Detection
```javascript
// Check online status
navigator.onLine // unreliable, use only as hint

// Better: Attempt probe request to reliable endpoint
async function checkConnectivity() {
  try {
    const res = await fetch('/api/health', {
      method: 'HEAD',
      cache: 'no-store',
      timeout: 2000
    });
    return res.ok;
  } catch { return false; }
}

// Listen for events
window.addEventListener('online', retryPendingSyncs);
window.addEventListener('offline', pauseSyncs);
```

**Implementation Ref:** [Workbox Background Sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync/) | [LogRocket Offline-First Apps](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)

---

## 4. Beacon API for Guaranteed Delivery on Page Close

### sendBeacon() Method
```javascript
// Syntax: boolean = navigator.sendBeacon(url, data);
navigator.sendBeacon('https://api.example.com/events',
  JSON.stringify({ action: 'extension-closed', timestamp: Date.now() })
);
```

**Guarantees:**
- Request initiated before page unload (browser batches & sends as soon as possible)
- Non-blocking (doesn't delay navigation)
- Asynchronous (no promise/status feedback)
- Queued at OS level if needed

**Limitations:**
- Max payload: ~64KB (check browser docs)
- No response status returned (fire-and-forget)
- No promise/callback for confirmation
- Limited header control (CORS restricted)

### When to Use Beacon API
✅ **Good for:**
- Analytics events on page close
- Session end notifications
- Last-minute telemetry
- Non-critical updates that can be lost

❌ **Not suitable for:**
- Critical data needing confirmation
- Large payloads
- Operations requiring retry logic

### Pending Beacon API (Experimental)
- **Proposed:** Stateful beaconing with guaranteed delivery even on crash
- **Status:** WICG spec draft, limited browser support
- **Feature:** Browser queues beacons, retries on restart
- **Availability:** Monitor [WICG/pending-beacon](https://github.com/WICG/pending-beacon)

### Practical Pattern for Extensions
```javascript
// On extension unload/page close:
window.addEventListener('beforeunload', () => {
  // Critical sync: use direct fetch with short timeout
  try {
    navigator.sendBeacon('/api/sync', pendingData);
  } catch (e) {
    // Fallback: rely on background sync queue
    console.error('Beacon failed, relying on background sync');
  }
});

// Non-critical: let background sync handle it
// (service worker continues after page close)
```

**Ref:** [MDN Beacon API](https://developer.mozilla.org/en-US/docs/Web/API/Beacon_API) | [Chrome Beacon Implementation](https://developer.chrome.com/blog/send-beacon-data-in-chrome-39)

---

## 5. Recommended Architecture for Extension Sync

### Layered Approach
```
┌─────────────────────────────────────────────┐
│ Extension UI (Popup/Content Script)         │
├─────────────────────────────────────────────┤
│ Local State (Optimistic Update)             │
├─────────────────────────────────────────────┤
│ IndexedDB Queue (Offline Persistence)       │
├─────────────────────────────────────────────┤
│ Service Worker (Background Sync Manager)    │
├─────────────────────────────────────────────┤
│ Retry Engine (Exponential Backoff + Jitter) │
├─────────────────────────────────────────────┤
│ Backend API (Idempotency Check)             │
└─────────────────────────────────────────────┘
```

### Implementation Steps
1. **UI Action** → Optimistic update + queue operation
2. **Sync Attempt** → Fetch with 5s timeout, expo backoff (base 100ms, max 30s)
3. **Offline** → Store in IndexedDB, signal service worker
4. **Online Restore** → Background sync retries queued operations
5. **Close Handler** → sendBeacon() for critical final state
6. **Backend** → Verify idempotency by requestId, apply once, return cached result

### Conflict Resolution
- **Timestamp-based:** Server-side timestamp wins (last-write-wins)
- **Versioning:** Increment version on each change, reject stale updates
- **User notification:** Alert user of conflicts, offer merge UI

---

## 6. Code Patterns & Libraries

### Exponential Backoff Implementation
```javascript
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 100) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      if (!isRetryableError(err)) throw err;

      const delay = baseDelay * Math.pow(2, i) + Math.random() * (baseDelay * i);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}
```

### Popular Libraries
- **exponential-backoff (npm):** Focused retry utility
- **axios-retry:** HTTP client with built-in retry
- **workbox-background-sync:** Google's standard background sync solution
- **idb:** Promise-based IndexedDB wrapper

**Ref:** [exponential-backoff npm](https://www.npmjs.com/package/exponential-backoff) | [Retry Patterns Guide](https://dev.to/abhivyaktii/retrying-failed-requests-with-exponential-backoff-48ld)

---

## 7. Testing & Validation

### Chrome DevTools Testing
- **Offline simulation:** Use Network tab throttling, NOT Application > Offline (service worker still works)
- **IndexedDB inspection:** Application > IndexedDB > {db-name} > inspect queue
- **Service worker:** Application > Service Workers, check registration & sync events

### Manual Testing Scenarios
1. ✅ Normal sync (online, immediate success)
2. ✅ Retry scenario (online, fails 1-2x then succeeds)
3. ✅ Offline offline (goes offline, returns online → auto-retry)
4. ✅ Page close (close tab/extension, verify beacon sent)
5. ✅ Browser restart (offline change, restart browser → verify queued sync resumes)
6. ✅ Duplicate prevention (same request sent twice → idempotency check prevents duplicate)

---

## Key Takeaways

| Pattern | Behavior | Best For |
|---------|----------|----------|
| **Optimistic Sync** | Update locally, sync async | UI responsiveness |
| **Eventual Consistency** | Accept divergence, converge later | Distributed systems |
| **Expo Backoff + Jitter** | 100ms → 200ms → 400ms → ... (capped) | Transient errors |
| **IndexedDB Queue** | Persist pending ops | Offline resilience |
| **Background Sync** | Retry when online (auto) | Long-term reliability |
| **Beacon API** | Fire-and-forget on close | Analytics, non-critical |
| **Idempotency Keys** | Dedup by requestId | Prevent double-submit |

**Extension Sync Maturity Model:**
1. **Basic:** Immediate fetch, no retry → failures lost
2. **Resilient:** Retry with backoff + IndexedDB queue → survives offline
3. **Reliable:** Background sync + idempotency + conflict resolution → production-ready
4. **Enterprise:** Rate limiting, circuit breakers, telemetry, user conflict UI

---

## Unresolved Questions

1. **Consistency guarantee scope:** How to handle cross-tenant consistency in PR activity (multiple users, same PR)?
2. **Conflict resolution UI:** Design for user-facing conflict merging (diff view, selection)?
3. **Sync event ordering:** Ensure PR review actions maintain causal order across network reordering?
4. **Backend circuit breaker:** When to stop retrying (health check strategy)?
5. **Quota management:** How to cap pending queue size to prevent unbounded IndexedDB growth?

---

## Sources

- [MDN Beacon API](https://developer.mozilla.org/en-US/docs/Web/API/Beacon_API)
- [Chrome Beacon Implementation](https://developer.chrome.com/blog/send-beacon-data-in-chrome-39)
- [WICG Pending Beacon Spec](https://github.com/WICG/pending-beacon)
- [Workbox Background Sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync/)
- [Better Stack Exponential Backoff Guide](https://betterstack.com/community/guides/monitoring/exponential-backoff/)
- [AWS SDK JavaScript Retry Strategy](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/retry-strategy.html)
- [LogRocket Offline-First Apps 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)
- [Design Gurus Consistency Patterns](https://www.designgurus.io/blog/consistency-patterns-distributed-systems)
- [DEV Community Exponential Backoff](https://dev.to/abhivyaktii/retrying-failed-requests-with-exponential-backoff-48ld)
