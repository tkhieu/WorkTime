# Scout Reports Index - WorkTime Chrome Extension

**Date Generated:** 2025-12-20  
**Scope:** Extension codebase architecture analysis at `/Users/hieu.t/Work/WorkTime/packages/extension`

---

## Available Reports

### 1. scout-251220-extension-structure.md (14KB)
**Main architectural report with complete system design**

Contents:
- Executive summary of storage-first, event-driven MV3 architecture
- Detailed breakdown of all key files organized by category
- Complete message flow architecture (session lifecycle, activity detection, sync)
- Design patterns explanation (storage-first, pending queues, dual-ID, etc.)
- Tab management and session lifecycle details
- API contract specification
- Files summary table with line counts
- MV3 requirements checklist
- Unresolved questions list

**Use this for:** Understanding overall architecture, message flows, design decisions

---

### 2. scout-code-patterns.md (10KB)
**Code patterns and implementations reference**

Contents:
- Message sending patterns (content script → service worker)
- Service worker message handler patterns
- Session management patterns (start, end, pause, resume)
- Activity detection patterns (DOM selectors, form listeners, debouncing)
- Storage and sync patterns (cache-first, pending queue, periodic alarms)
- Tab lifecycle patterns (activation, removal, idle state)
- Type definitions quick reference

**Use this for:** Copy-paste examples, implementation patterns, code templates

---

### 3. SCOUT_SUMMARY.txt (5.5KB)
**Quick reference summary and file listing**

Contents:
- Quick file reference organized by category
- Key architecture patterns summary
- Message flow overview
- MV3 requirements checklist
- Session model definition
- Unresolved questions

**Use this for:** Quick lookups, file navigation, pattern reminder

---

## Key Files Location Reference

### Background Service Worker (Core)
```
/src/background/
  ├─ service-worker.ts           (374 lines) - Event dispatcher
  ├─ session-handler.ts          (301 lines) - Session lifecycle
  ├─ activity-handler.ts         (138 lines) - Activity tracking
  ├─ storage-manager.ts          (100+ lines) - Storage abstraction
  ├─ sync-manager.ts             (80+ lines) - Periodic sync
  ├─ api-client.ts               (not examined)
  └─ alarm-manager.ts            (not examined)
```

### Content Scripts
```
/src/content/
  ├─ pr-detector.ts              (142 lines) - PR detection & visibility
  ├─ activity-detector.ts        (220 lines) - Form monitoring
  └─ visibility-tracker.ts       (122 lines) - Page visibility API
```

### Configuration
```
/src/
  ├─ manifest.json               - MV3 config
  └─ types/index.ts              (142 lines) - Type definitions
```

---

## Message Types Supported

**Session Management:**
- `PR_DETECTED` - Content script detected PR page
- `TAB_VISIBLE` / `TAB_HIDDEN` - Page visibility changes
- `GET_ACTIVE_SESSION` - Query current session

**Activity Tracking:**
- `PR_ACTIVITY_DETECTED` - Review/comment submission detected
- `ACTIVITY_HEARTBEAT` - Periodic activity check (from pr-detector)

**Authentication:**
- `GITHUB_LOGIN` / `GITHUB_LOGOUT` / `GITHUB_STATUS`

**Status:**
- `GET_STATUS` - Get tracking status

---

## Session Lifecycle Flow

```
User opens PR page
  ↓
detectPR() → PR_DETECTED message
  ↓
handlePRDetected() → startSession()
  ↓
Save locally + queue 'start' action → trySyncSessions()
  ↓
API: POST /api/sessions → Assign backendId
  ↓
Session active (tracking time)
  ↓
User closes tab
  ↓
handleTabRemoved() → endSession()
  ↓
Save locally + queue 'end' action → trySyncSessions()
  ↓
API: PUT /api/sessions/:id (with duration)
  ↓
Session archived
```

---

## Architecture Highlights

### Storage-First Design
- All mutations written to chrome.storage.local first
- In-memory caches for performance
- Survives service worker termination/restart

### Offline Support
- Pending sessions/activities queued locally
- Auto-sync when online + authenticated
- Persistent queue across browser restarts

### Event-Driven
- Synchronous event listeners at top level (MV3 requirement)
- Message-driven content/background separation
- Clean separation of concerns

### Tab-Aware Tracking
- Pause inactive tabs, resume active ones
- Handle tab lifecycle (activation, removal)
- Idle state detection (user locked screen)

---

## Implementation Notes

### Content Scripts Send, Service Worker Acts
- Content scripts only send messages (stateless)
- Service worker handles all state mutations
- Enables clean testing and modularity

### Dual-ID Pattern
- `localId`: Generated immediately (timestamp + random)
- `backendId`: Assigned by server on first sync
- Enables offline operation + retroactive sync

### Debounced Activity Detection
- 500ms debounce window prevents duplicates
- Form submit listener (primary detection)
- MutationObserver backup for edge cases

### Periodic Sync
- 5-minute intervals via chrome.alarms
- Immediate sync on startup
- Network-aware (skips if offline)
- Auth-aware (skips if not authenticated)

---

## Not Examined

Files not fully examined in this scout:
- `/src/background/api-client.ts` - REST API client implementation
- `/src/background/alarm-manager.ts` - Time tracking alarms
- `/src/popup/popup.ts` - Popup UI (if exists)
- `/src/auth/github-oauth.ts` - OAuth flow details

---

## Quick Navigation

| Need | Document | Section |
|------|----------|---------|
| Architecture overview | scout-251220-extension-structure.md | Executive Summary |
| Message flow details | scout-251220-extension-structure.md | Message Flow Architecture |
| Code examples | scout-code-patterns.md | All sections |
| File locations | SCOUT_SUMMARY.txt | Quick File Reference |
| Design patterns | SCOUT_SUMMARY.txt | Key Architecture Patterns |
| Session model | SCOUT_SUMMARY.txt | Session Model |
| API contracts | scout-251220-extension-structure.md | API Contract |

---

## Report Generation

All reports generated by Scout Agent on 2025-12-20.  
Reports saved to: `/Users/hieu.t/Work/WorkTime/plans/reports/`

Files:
- scout-251220-extension-structure.md
- scout-code-patterns.md
- SCOUT_SUMMARY.txt
- INDEX_SCOUT_EXTENSION.md (this file)

