# WorkTime System Architecture

## High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub (github.com)                     │
│  Users visit PR pages → Content script detects URL patterns  │
└────────────┬────────────────────────────────────────────────┘
             │
             │ HTTPS (chrome-extension://...)
             ▼
┌─────────────────────────────────────────────────────────────┐
│              Chrome Extension (MV3)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Background Service Worker (Persistent)               │   │
│  │ • Detects PR page navigation                         │   │
│  │ • Manages session state                              │   │
│  │ • Handles authentication                             │   │
│  │ • Queues sync operations                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                          │                                    │
│           ┌──────────────┼──────────────┐                    │
│           ▼              ▼              ▼                    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        │
│  │ IndexedDB    │ │ chrome.local │ │ Content      │        │
│  │ (Sessions)   │ │ storage      │ │ Script       │        │
│  │              │ │ (Sync Queue) │ │ (PR Detect)  │        │
│  └──────────────┘ └──────────────┘ └──────────────┘        │
│           │              │              │                    │
│           └──────────────┼──────────────┘                    │
│                          │                                    │
└──────────────────────────┬─────────────────────────────────┘
                           │
         HTTPS POST /api/sessions (batched, offline-first)
                           │
┌──────────────────────────▼─────────────────────────────────┐
│       Cloudflare Workers (Edge)                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Hono REST API                                        │  │
│  │ • POST   /auth/github/callback     (OAuth)          │  │
│  │ • POST   /api/sessions             (Create)         │  │
│  │ • PATCH  /api/sessions/:id         (Update)         │  │
│  │ • GET    /api/sessions             (List)           │  │
│  │ • GET    /api/stats/daily          (Aggregate)      │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│           ┌──────────────┼──────────────┐                   │
│           ▼              ▼              ▼                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │ D1 Database  │ │ KV Store     │ │ JWT Secret   │       │
│  │ (Sessions)   │ │ (Token Cache)│ │ (Signed)     │       │
│  │ (Users)      │ │              │ │ (7-day TTL)  │       │
│  └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                              │
└──────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Chrome Extension (MV3)

#### Background Service Worker

**Responsibilities:**
- Monitor all network requests and tab navigation
- Detect GitHub PR page visits via URL pattern matching
- Create and manage session lifecycle
- Handle OAuth authentication flow
- Manage local storage (IndexedDB + chrome.storage.local)
- Queue sessions for backend sync
- Schedule periodic background sync via alarms

**Key Files:**
- `src/background/service-worker.ts` - Main entry point
- `src/background/storage-manager.ts` - IndexedDB wrapper
- `src/background/sync-queue.ts` - Offline-first queue
- `src/background/api-client.ts` - HTTP client
- `src/background/alarm-manager.ts` - Scheduled tasks

**Architecture Pattern:**

```typescript
// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && isPRPage(tab.url)) {
    const session = createSession(tab.url);
    storageManager.addSession(session);
    syncQueue.enqueue({ type: 'session_start', payload: session });
  }
});

// Periodic sync via alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncSessions') {
    syncQueue.processQueue().catch(logError);
  }
});
```

#### Content Script

**Responsibilities:**
- Detect GitHub PR page URLs via DOM inspection
- Monitor page visibility changes
- Send messages to background service worker

**Key Files:**
- `src/content/pr-detector.ts` - URL and DOM-based detection
- `src/content/visibility-tracker.ts` - Page visibility monitoring

**Detection Pattern:**

```typescript
// Match GitHub PR URLs
const PR_PATTERN = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+(?:\/|$)/;

function isPRPage(url: string): boolean {
  return PR_PATTERN.test(url);
}

// Send message to background worker
chrome.runtime.sendMessage({
  type: 'PR_PAGE_DETECTED',
  url: window.location.href
});
```

#### Popup UI

**Responsibilities:**
- Display current session status
- Show today's total review time
- Display sync status
- Provide manual sync button
- Link to settings

**Key Files:**
- `src/popup/popup.ts` - UI controller
- `src/popup/popup-integration.ts` - Message passing

---

### 2. Cloudflare Workers Backend

#### REST API Structure

**Base URL:** `https://api.worktime.dev` (production) or `http://localhost:8787` (dev)

**Routes:**

```
POST   /auth/github/callback
       ├─ Input: code, state (from OAuth flow)
       ├─ Processing: Exchange code for GitHub token
       ├─ Processing: Create/update user in database
       ├─ Processing: Issue JWT token
       └─ Output: { accessToken, refreshToken?, expiresAt }

POST   /api/sessions
       ├─ Auth: JWT Bearer token
       ├─ Input: { prUrl, startTime, endTime?, duration }
       ├─ Processing: Validate PR URL format
       ├─ Processing: Insert into D1 database
       └─ Output: { id, ...session }

GET    /api/sessions?limit=50&offset=0
       ├─ Auth: JWT Bearer token
       ├─ Processing: Query D1 with pagination
       └─ Output: { sessions: [...], total, offset }

GET    /api/stats/daily?date=2024-01-15
       ├─ Auth: JWT Bearer token
       ├─ Processing: Aggregate sessions from D1
       ├─ Processing: Group by repo, calculate metrics
       └─ Output: { date, totalMinutes, repos: [...] }
```

#### Middleware Stack

```typescript
app.use('/*', cors(...));              // CORS headers
app.use('/*', authMiddleware);         // JWT verification
app.use('/*', zValidator(...));        // Zod schema validation
```

**CORS Policy:**
- Allow: `chrome-extension://<extension-id>`
- Allow: `http://localhost:3000`, `http://localhost:8787`
- Credentials: true (cookies for sessions)

#### Authentication Flow

```
Extension                          Backend
    │                                │
    ├─ Trigger OAuth ────────────────>│
    │                            GitHub
    │                                │
    │<───── GitHub Auth Dialog ──────│
    │                                │
    ├─ User grants permissions       │
    │                                │
    │<───── OAuth Code + State ──────│
    │                                │
    ├─ POST /auth/github/callback ──>│
    │  code=abc&state=xyz            │
    │                                │
    │<────── { accessToken, ... } ───│
    │                                │
    ├─ Store token (encrypted)       │
    │                                │
    ├─ Future requests ─────────────>│
    │  Authorization: Bearer <JWT>   │
```

**Token Management:**
- GitHub OAuth token: 7-day TTL, stored in KV with user_id key
- JWT token: 7-day TTL, signed with `JWT_SECRET`
- Refresh mechanism: Check expiry on each request, refresh if < 1 day remaining

#### Database Schema (D1)

```sql
-- Users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER UNIQUE NOT NULL,
  github_login TEXT UNIQUE NOT NULL,
  github_avatar_url TEXT,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  repo_name TEXT GENERATED ALWAYS AS (
    SUBSTR(pr_url, INSTR(pr_url, '/') + 2,
           INSTR(SUBSTR(pr_url, INSTR(pr_url, '/') + 2), '/') - 1)
  ) STORED,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_ms INTEGER GENERATED ALWAYS AS (
    CASE WHEN end_time IS NOT NULL
         THEN (CAST(end_time AS INTEGER) - CAST(start_time AS INTEGER))
         ELSE NULL
    END
  ) STORED,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, DATE(start_time)),
  INDEX idx_repo (repo_name)
);

-- Tokens table
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  user_id INTEGER UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

#### Error Handling

```typescript
// Centralized error handler
app.onError((err, c) => {
  const status = err instanceof ValidationError ? 400 : 500;
  const code = err.code || 'INTERNAL_ERROR';

  return c.json({
    error: err.message,
    code,
    statusCode: status,
    timestamp: new Date().toISOString()
  }, status);
});
```

---

## Data Flow

### Session Creation Flow

```
User visits PR page
     │
     ├─ Content script detects URL pattern
     │
     ├─ Sends message to background worker
     │
     ├─ Background worker creates session
     │     id: UUID
     │     prUrl: "https://github.com/owner/repo/pull/123"
     │     startTime: Date.now()
     │
     ├─ Stores in IndexedDB
     │
     ├─ Adds to sync queue (chrome.storage.local)
     │
     └─ On next alarm (5 min interval):
            ├─ Check internet connectivity
            ├─ GET /auth/github/callback (if no token)
            ├─ Batch queue items into POST /api/sessions
            ├─ Mark as synced in IndexedDB
            └─ Clear from sync queue
```

### Statistics Aggregation Flow

```
Backend (POST /api/sessions):
     │
     ├─ Receive session batch
     ├─ Validate and insert into D1
     │
     └─ On demand (GET /api/stats/daily):
            ├─ Query D1 sessions for date range
            ├─ Group by repo_name
            ├─ Calculate:
            │    • totalMinutes = SUM(duration_ms) / 60000
            │    • sessionCount = COUNT(*)
            │    • avgDuration = AVG(duration_ms)
            ├─ Cache in KV (30 min TTL)
            └─ Return aggregated stats
```

### OAuth Flow

```
Extension popup:
     │
     ├─ User clicks "Connect GitHub"
     │
     ├─ chrome.identity.launchWebAuthFlow()
     │     ├─ Redirect to GitHub OAuth consent page
     │     ├─ User grants permissions
     │     └─ GitHub redirects to:
     │        https://api.worktime.dev/auth/github/callback?code=X&state=Y
     │
     ├─ Backend verifies state (CSRF protection)
     │
     ├─ Backend exchanges code for access token with GitHub
     │
     ├─ Backend creates/updates user in D1
     │
     ├─ Backend stores token in KV: kv.put(
     │        `tokens:user_${userId}`,
     │        JSON.stringify({ accessToken, expiresAt }),
     │        { expirationTtl: 7 * 24 * 60 * 60 }
     │     )
     │
     ├─ Backend signs JWT: sign({ sub: userId, iat, exp })
     │
     └─ Frontend stores JWT in chrome.storage.local (encrypted)
```

---

## Storage Patterns

### Extension Local Storage

**IndexedDB (Primary - Sessions)**
```typescript
interface IndexedDBSchema {
  sessions: {
    keyPath: 'id',
    indexes: ['startTime', 'synced', 'prUrl'],
    data: StoredSession[]
  }
}

interface StoredSession {
  id: string;                    // UUIDv4
  prUrl: string;
  startTime: number;             // ISO timestamp
  endTime?: number;
  duration?: number;             // ms
  synced: boolean;
  syncedAt?: number;
  retryCount: number;
}
```

**chrome.storage.local (Metadata)**
```typescript
interface ChromeStorageLocal {
  tokens: {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
  };

  syncQueue: {
    items: SyncQueueItem[];       // Array of pending sync operations
    lastSync: number;             // ISO timestamp
    isProcessing: boolean;
  };

  settings: {
    autoSync: boolean;
    syncInterval: number;
    privacyMode: boolean;
  };
}

interface SyncQueueItem {
  id: string;
  type: 'session_create' | 'session_update';
  payload: any;
  createdAt: number;
  retryCount: number;
}
```

### Backend Storage

**D1 Database** - Persistent session/user data
**KV Store** - Temporary caching
- Tokens: `tokens:user_{userId}` (7-day TTL)
- Stats: `stats:user_{userId}:daily:{date}` (30-day TTL)
- Cache: `session_batch:{timestamp}` (1-hour TTL)

---

## Synchronization Strategy

### Offline-First Sync

```typescript
// On background service worker
async function syncSessions(): Promise<void> {
  // Check internet connectivity
  if (!navigator.onLine) {
    console.log('Offline: queuing for later');
    return; // Retry on next alarm
  }

  // Fetch queued items
  const queue = await storage.getSyncQueue();

  // Batch into groups of 50
  const batches = chunk(queue, 50);

  for (const batch of batches) {
    try {
      // POST to backend
      const response = await api.post('/api/sessions', batch);

      // Mark as synced in IndexedDB
      for (const item of batch) {
        await storage.markSynced(item.id);
      }

      // Remove from sync queue
      await storage.removeSyncQueue(batch.map(b => b.id));

    } catch (error) {
      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delay = Math.pow(2, item.retryCount) * 1000;
      item.retryCount++;

      if (item.retryCount < MAX_RETRIES) {
        await storage.updateSyncQueue(item);
      } else {
        // Log error and disable sync
        console.error('Max retries exceeded', item);
      }
    }
  }
}

// Schedule via alarm
chrome.alarms.create('syncSessions', {
  periodInMinutes: 5 // Sync every 5 minutes
});
```

### Conflict Resolution

**Last-Write-Wins (LWW)** Strategy
- Each session has `startTime` (immutable)
- Each session has `updatedAt` timestamp
- Backend stores both, uses `updatedAt` for conflict resolution
- Client always sends `updatedAt` with updates

```typescript
// Backend conflict detection
if (incomingSession.updatedAt > storedSession.updatedAt) {
  // Update with new data
  db.update(incomingSession);
} else {
  // Discard old update
  console.warn('Stale update discarded');
}
```

---

## Security Architecture

### Authentication

**OAuth 2.0 + PKCE Flow**
```
1. Extension generates: code_verifier (random string)
2. Extension computes: code_challenge = SHA256(code_verifier)
3. Extension redirects to GitHub with: code_challenge
4. GitHub returns: authorization_code
5. Backend exchanges code + code_challenge for token
6. Token never exposed to browser
```

### Token Management

```typescript
// JWT Structure
{
  header: { alg: 'HS256', typ: 'JWT' },
  payload: {
    sub: userId,           // Subject (user ID)
    iat: issuedAt,         // Issued at
    exp: expiresAt,        // Expires at (7 days)
    scope: 'repo read:user'
  },
  signature: HMAC_SHA256(...)
}

// Stored in: chrome.storage.local (encrypted by Chrome)
// Never sent with XHR: only via Authorization header
// Auto-refresh: if exp < now + 1 day, refresh token
```

### Data Encryption

**Local Storage:**
- Chrome handles encryption automatically
- `chrome.storage.local` is encrypted at rest
- IndexedDB is sandboxed per extension

**In Transit:**
- HTTPS only for all API calls
- Chrome-extension:// protocol uses secure channels
- CORS headers prevent cross-origin abuse

**In Backend:**
- JWT_SECRET never exposed
- Tokens stored with hashed values in KV
- D1 supports encryption at rest

---

## Performance Optimization

### Caching Strategy

**Extension-Side:**
```
IndexedDB (persistent)
    ↓
    ├─ Cache sessions by date
    ├─ Batch queries
    └─ Clear old data (> 90 days)

chrome.storage.local (fast)
    ├─ Cache current session ID
    ├─ Cache sync state
    └─ Cache token with expiry
```

**Backend-Side:**
```
KV Store (edge cache)
    ├─ Cache daily stats (30 min TTL)
    ├─ Cache weekly stats (1 hour TTL)
    └─ Cache user profile (24 hours TTL)

D1 Query Optimization:
    ├─ Index on (user_id, start_time)
    ├─ Index on repo_name
    ├─ Materialized aggregates (precalculate)
    └─ Pagination (limit 100, offset)
```

### Network Optimization

**Batching:**
- Batch up to 50 sessions per sync
- Batch stats requests with 30-min cache

**Compression:**
- Gzip all responses from backend
- Minimize JWT payload

**Lazy Loading:**
- Load popup UI on demand
- Load statistics only when visible

---

## Monitoring & Observability

### Error Tracking

```typescript
// Backend logs via Cloudflare
console.error({
  type: 'SYNC_ERROR',
  userId,
  sessionCount,
  error: err.message,
  timestamp: new Date().toISOString()
});

// Extension logs via chrome.storage
await storage.logError({
  type: 'NETWORK_ERROR',
  retryCount,
  timestamp: Date.now()
});
```

### Metrics

**Backend:**
- API response times (p50, p95, p99)
- Error rates by endpoint
- Sync success rate
- Token refresh frequency

**Extension:**
- Session detection rate
- Sync queue depth
- Storage usage (IndexedDB, local)
- Memory usage

---

## Deployment Architecture

### Extension Deployment

1. Build: `npm run build` → Webpack bundles to `/dist`
2. Package: Create ZIP of `/dist` + manifest
3. Upload: Chrome Web Store developer console
4. Review: Google automatic review (48-72 hours)
5. Publish: Auto-update to users

### Backend Deployment

1. Build: `npm run build` → TypeScript compilation
2. Deploy: `wrangler deploy` → Cloudflare Workers
3. Database: Migrations via `wrangler d1 migrations apply`
4. Secrets: Set via `wrangler secret put`

---

## Related Documentation

- [Codebase Summary](./codebase-summary.md)
- [Code Standards](./code-standards.md)
- [Project Overview & PDR](./project-overview-pdr.md)
