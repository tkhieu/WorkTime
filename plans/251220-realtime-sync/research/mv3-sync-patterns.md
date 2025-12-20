# MV3 Real-Time Sync Patterns Research

**Date**: 2025-12-20
**Status**: Complete research snapshot

## 1. Service Worker Lifecycle Limitations

### Termination Behavior
- **30-second idle timeout**: SW terminates after 30s of inactivity
- **5-minute task limit**: Long-running tasks (>5min) force termination
- **Event-driven model**: SW only activates on events, no persistent background execution
- **Random termination**: Even with keep-alive patterns, SWs get killed after 2-6 hours unpredictably

**Impact**: No true persistent connections. Real-time push impossible without workarounds.

### No DOM Access
- Service workers cannot directly interact with DOM
- Requires content scripts (content.js) for DOM modifications
- Increases architecture complexity for synced UI updates

Sources: [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/mv3/service_workers/service-worker-lifecycle/), [Building Persistent MV3 Extensions](https://rahulnegi20.medium.com/building-persistent-chrome-extension-using-manifest-v3-198000bf1db6)

---

## 2. Chrome.alarms API Best Practices

### Minimum Interval (Chrome 120+)
```javascript
// 30-second minimum (0.5 minutes)
chrome.alarms.create("sync", { periodInMinutes: 0.5 });

// NOT honored (will warn):
chrome.alarms.create("sync", { periodInMinutes: 0.2 });
```

### Reliable Alarm Pattern
```javascript
async function initAlarm() {
  const alarm = await chrome.alarms.get("my-alarm");
  if (!alarm) {
    await chrome.alarms.create("my-alarm", { periodInMinutes: 1 });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "my-alarm") {
    // Sync logic here - keeps SW alive during network ops
  }
});
```

### Key Constraints
- **500 alarm limit** (Chrome 117+): Extension can have max 500 active alarms
- **Throttling**: At most once per 30 seconds minimum
- **Device sleep**: Alarms continue during sleep; no device wake-up
- **Missed alarms**: Fire once on device wake, then reschedule from wake time

### Why Alarms > setTimeout/setInterval
- `setTimeout/setInterval` get cancelled when SW terminates
- `chrome.alarms` persist across SW restarts
- SW wakes specifically for alarm events

Sources: [Chrome Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms), [Deep Dive into Chrome Alarm API](https://dev.to/scriptjsh/deep-dive-into-chrome-alarm-api-scheduling-timed-events-in-chrome-extensions-2glc)

---

## 3. Sync-on-Close Patterns

### Page Lifecycle Events Limitations
Modern browsers (including Chrome) have **unreliable unload guarantees**:
- `beforeunload`: Only fires with user interaction; unsafe for cleanup
- `unload`: Deprecated; Chrome doesn't guarantee firing
- `pagehide`: More reliable than unload but still not guaranteed
- Device closes/crashes: No cleanup firing at all

### Recommended Cleanup Pattern for MV3

**For popup/offscreen documents:**
```javascript
// Use visibilitychange + pagehide combo
const terminationEvent = 'onpagehide' in self ? 'pagehide' : 'unload';

window.addEventListener(terminationEvent, async () => {
  // Use navigator.sendBeacon for async operations (no keepalive needed)
  // Do NOT use sync XHR
  await navigator.sendBeacon('/sync', JSON.stringify(state));

  // OR use fetch with keepalive flag (unreliable in page context)
  fetch('/sync', {
    method: 'POST',
    keepalive: true,
    body: JSON.stringify(state)
  });
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Intermediate sync - page may return
  }
});
```

**For service worker context:**
```javascript
// SW gets killed without warning - NOT recommended for sync
// Instead: use chrome.alarms for periodic sync
// Manual triggers: chrome.runtime.onMessage from popup
// Storage sync: chrome.storage.onChanged listener
```

### Key Insight: **MV3 Extensions ≠ Web Pages**
- Service workers don't have page lifecycle events
- Popups/offscreen pages are ephemeral (don't rely on unload)
- Recommended: Alarm-driven periodic sync + message-driven manual sync

Sources: [Page Lifecycle API](https://developer.chrome.com/articles/page-lifecycle-api/), [Deprecating Unload Event](https://developer.chrome.com/docs/web-platform/deprecating-unload)

---

## 4. Recommended MV3 Sync Architecture

### Periodic Sync (Reliable)
```javascript
// background.js / service-worker.js
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'bg-sync') {
    try {
      const data = await chrome.storage.local.get('pendingSync');
      if (data.pendingSync) {
        await fetch('/api/sync', {
          method: 'POST',
          body: JSON.stringify(data.pendingSync)
        });
        await chrome.storage.local.remove('pendingSync');
      }
    } catch (err) {
      console.error('Sync failed:', err);
      // Retry on next alarm
    }
  }
});

// Init alarm once
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('bg-sync', { periodInMinutes: 1 });
});
```

### Manual Sync (User-Triggered)
```javascript
// From popup
chrome.runtime.sendMessage({ action: 'sync' }, (response) => {
  console.log('Sync complete:', response);
});

// In service worker
chrome.runtime.onMessage.addListener(async (req, sender, send) => {
  if (req.action === 'sync') {
    const result = await performSync();
    send({ success: true, data: result });
  }
});
```

### Storage-Based State Persistence
```javascript
// Always store sync state in chrome.storage.local
// Service worker can access without DOM
await chrome.storage.local.set({
  pendingSync: { /* data */ },
  lastSyncTime: Date.now()
});

// Listen for changes from other contexts
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.pendingSync) {
    // Storage synced from another device or popup
    performSync(changes.pendingSync.newValue);
  }
});
```

---

## 5. Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|---|---|---|
| `setInterval` in SW | Cancelled on termination | Use `chrome.alarms` |
| Sync XHR in `beforeunload` | Deprecated, unreliable | Use `navigator.sendBeacon` or fetch with keepalive |
| WebSocket in SW | SW doesn't persist | Use HTTP polling via alarms |
| No alarm existence check | Creates duplicate alarms | Check + create atomically |
| Frequent alarms (<30s) | Throttled, wastes resources | Minimum 0.5 minutes |
| Ignoring SW termination | Data loss | Always persist state to storage |

---

## 6. Unresolved Questions

1. **Keepalive fetch reliability**: How reliable is `fetch(..., {keepalive: true})` in popup context on close?
2. **Storage.sync cross-device timing**: What's typical latency for `chrome.storage.sync` on closed browser?
3. **Alarm fire-on-wake ordering**: If multiple alarms fire on device wake, guaranteed order?
4. **Offscreen document + SW coordination**: Best pattern for keeping offscreen doc alive during sync?

---

## Sources

- [Service Worker Lifecycle](https://developer.chrome.com/docs/extensions/mv3/service_workers/service-worker-lifecycle/)
- [Chrome Alarms API Reference](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [Building Persistent MV3 Extensions](https://rahulnegi20.medium.com/building-persistent-chrome-extension-using-manifest-v3-198000bf1db6)
- [Page Lifecycle API](https://developer.chrome.com/articles/page-lifecycle-api/)
- [Deep Dive into Chrome Alarm API](https://dev.to/scriptjsh/deep-dive-into-chrome-alarm-api-scheduling-timed-events-in-chrome-extensions-2glc)
- [Deprecating Unload Event](https://developer.chrome.com/docs/web-platform/deprecating-unload)
