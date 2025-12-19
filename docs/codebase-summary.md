# WorkTime Codebase Summary

## Repository Structure

```
WorkTime/
├── packages/
│   ├── backend/              # Cloudflare Workers API
│   ├── extension/            # Chrome Extension MV3
│   └── shared/               # Shared types & utilities
├── docs/                     # Project documentation
├── tsconfig.base.json        # Root TypeScript config
├── pnpm-workspace.yaml       # Workspace definition
├── package.json              # Root package.json
├── CLAUDE.md                 # Development configuration
└── README.md                 # Quick start guide
```

## Package Descriptions

### Backend Package (`@worktime/backend`)

**Purpose:** REST API for session synchronization, authentication, and statistics computation.

**Key Files:**
- `src/index.ts` - Hono app initialization, routes, middleware
- `src/types.ts` - Cloudflare Workers environment types
- `src/routes/auth.ts` - OAuth callback and token endpoints
- `src/routes/sessions.ts` - Session CRUD operations
- `src/routes/stats.ts` - Statistics aggregation endpoints
- `src/middleware/auth.ts` - JWT verification middleware
- `src/middleware/validation.ts` - Zod schema validation
- `src/utils/jwt.ts` - JWT signing/verification utilities
- `src/utils/errors.ts` - Centralized error handling
- `src/db/queries.ts` - D1 database query functions

**Architecture:**
- **Framework:** Hono 3.12.8 (edge-first)
- **Database:** D1 (Cloudflare SQLite)
- **Cache:** KV store (token/session cache)
- **Auth:** JWT with 7-day TTL
- **Validation:** Zod schemas via @hono/zod-validator

**Environment Variables (wrangler.toml):**
```
GITHUB_CLIENT_ID=<OAuth app ID>
GITHUB_CLIENT_SECRET=<OAuth app secret>
JWT_SECRET=<32+ char random string>
ENVIRONMENT=production|development
```

**Key Routes:**
- `GET /health` - Health check
- `POST /auth/github/callback` - OAuth callback handler
- `POST /api/sessions` - Create session
- `PATCH /api/sessions/:id` - Update session
- `GET /api/sessions` - List sessions
- `GET /api/stats/daily` - Daily statistics
- `GET /api/stats/weekly` - Weekly statistics

**Dependencies:**
- hono (3.12.8)
- @hono/zod-validator (0.2.0)
- zod (3.22.4)
- @worktime/shared (workspace)

**Dev Dependencies:**
- wrangler (4.55.0) - Cloudflare CLI
- @cloudflare/workers-types (4.20240129.0)
- typescript (5.3.3)

### Extension Package (`@worktime/extension`)

**Purpose:** Chrome Extension that detects PR pages and tracks review sessions.

**Key Files:**

*Background Service Worker:*
- `src/background/service-worker.ts` - Main service worker entry point
- `src/background/service-worker-integration.ts` - Listener registration
- `src/background/storage-manager.ts` - IndexedDB + chrome.storage wrapper
- `src/background/sync-queue.ts` - Offline-first sync with retry logic
- `src/background/api-client.ts` - HTTP client for backend communication
- `src/background/alarm-manager.ts` - Periodic sync scheduling

*Authentication:*
- `src/auth/github-oauth.ts` - OAuth 2.0 + PKCE flow
- `src/auth/token-manager.ts` - Token storage and refresh
- `src/auth/index.ts` - Auth initialization

*Content Scripts:*
- `src/content/pr-detector.ts` - GitHub PR page detection via URL matching
- `src/content/visibility-tracker.ts` - Page visibility monitoring

*Popup UI:*
- `src/popup/popup.ts` - Popup UI controller
- `src/popup/popup-integration.ts` - Message passing to service worker

*Utilities:*
- `src/utils/helpers.ts` - Time formatting, ID generation
- `src/utils/network.ts` - Network retry with exponential backoff
- `src/types/index.ts` - Extension-specific types

**Architecture:**
- **Build Tool:** Webpack 5 + TypeScript
- **Testing:** Jest 30
- **Storage:** IndexedDB (primary) + chrome.storage.local (sync state)
- **Sync Strategy:** Queue-based with exponential backoff
- **Auth Flow:** OAuth 2.0 + PKCE for GitHub

**Manifest (MV3):**
```json
{
  "manifest_version": 3,
  "name": "WorkTime",
  "permissions": ["storage", "alarms", "webRequest"],
  "host_permissions": ["https://github.com/*"],
  "background": {
    "service_worker": "background/service-worker.ts"
  },
  "content_scripts": [{
    "matches": ["https://github.com/*"],
    "js": ["content/pr-detector.ts"]
  }],
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

**Local Storage Schema:**
```typescript
interface ExtensionStorage {
  sessions: StoredSession[];         // Local session cache
  tokens: OAuthTokens;               // GitHub OAuth tokens
  syncQueue: SyncQueueItem[];         // Pending sync items
  settings: {
    autoSync: boolean;
    syncInterval: number;            // ms
    privacyMode: boolean;
  };
}

interface StoredSession {
  id: string;                        // UUID
  prUrl: string;                     // Full PR URL
  startTime: number;                 // ISO timestamp
  endTime?: number;
  duration: number;                  // ms
  synced: boolean;
  syncedAt?: number;
}
```

**Dependencies:**
- @worktime/shared (workspace)

**Dev Dependencies:**
- webpack (5.89.0)
- webpack-cli (5.1.4)
- ts-loader (9.5.1)
- jest (30.2.0)
- ts-jest (29.4.6)
- @types/chrome (0.0.256)
- @types/jest (30.0.0)
- typescript (5.3.3)

### Shared Package (`@worktime/shared`)

**Purpose:** Centralized TypeScript types and validation schemas shared between extension and backend.

**Key Files:**
- `src/index.ts` - Package entry point
- `src/types/api.ts` - API request/response types
- `src/types/storage.ts` - Storage schemas
- `src/types/auth.ts` - OAuth types
- `src/types/models.ts` - Domain models
- `src/utils/formatters.ts` - Time/URL formatting utilities
- `src/utils/validators.ts` - Zod schemas for validation
- `src/utils/parsers.ts` - URL and data parsing utilities

**Key Types & Schemas:**

```typescript
// API Contracts
interface SessionStartRequest {
  prUrl: string;
  startTime: number;
}

interface SessionEndRequest {
  sessionId: string;
  endTime: number;
}

interface DailyStats {
  date: string;
  totalMinutes: number;
  sessionCount: number;
  repos: RepoBreakdown[];
}

// OAuth
interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
}

// Storage
interface SyncQueueItem {
  id: string;
  type: 'session_start' | 'session_end' | 'stats_update';
  payload: any;
  createdAt: number;
  retryCount: number;
}
```

**Zod Schemas:**
- `sessionSchema` - Session validation
- `statsSchema` - Stats validation
- `oauthSchema` - OAuth response validation
- `durationSchema` - Duration formatting

**No Runtime Dependencies:** Pure TypeScript types and validation, zero external runtime dependencies.

**Build Output:**
- CommonJS: `dist/index.js`
- Types: `dist/index.d.ts`
- Source maps: `dist/index.d.ts.map`

---

## Technology Stack

### Core Technologies

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Language | TypeScript | 5.3.3 | Type safety across all packages |
| Package Manager | pnpm | 8.0.0+ | Monorepo workspace management |
| Backend | Cloudflare Workers | - | Serverless edge computing |
| Frontend | Chrome Extension MV3 | - | Browser automation |
| Web Framework | Hono | 3.12.8 | Lightweight REST API |
| Database | D1 (SQLite) | - | Serverless SQL database |
| Cache | Cloudflare KV | - | Distributed key-value store |
| Validation | Zod | 3.22.4 | Runtime schema validation |
| Build (Backend) | TypeScript Compiler | - | Simple compilation |
| Build (Extension) | Webpack | 5.89.0 | Module bundling |
| Testing | Jest | 30.2.0 | Unit and integration tests |
| Linting | ESLint | 8.56.0 | Code quality enforcement |
| Formatting | Prettier | 3.2.4 | Code formatting |

### Key Dependencies Breakdown

**Backend Specific:**
- `@hono/zod-validator` - Integrates Zod with Hono
- `@cloudflare/workers-types` - Type definitions for Cloudflare Workers
- `wrangler` - Cloudflare Workers CLI

**Extension Specific:**
- `@types/chrome` - Chrome API types
- `copy-webpack-plugin` - Copies manifest and assets
- `ts-jest` - TypeScript support for Jest
- `jest-environment-jsdom` - DOM testing environment

**Shared Specific:**
- Zero runtime dependencies (pure TypeScript)

---

## Implementation Status

### Completed (Phase 01)
- D1 schema implementation with four core tables:
  - `users` - GitHub user accounts
  - `time_sessions` - PR review session tracking
  - `daily_stats` - Aggregated daily statistics
  - `pr_review_activities` - User PR review actions (comment, approve, request_changes)
- TypeScript types for all database entities
- Migration files for schema deployment
- Index optimization for common query patterns

### Completed (Phase 05-06)
- OAuth 2.0 + PKCE flow implementation
- Popup UI scaffolding (basic interface)
- Service worker architecture
- Storage manager (IndexedDB wrapper)
- Token manager for secure storage
- GitHub OAuth integration

### In Progress (Phase 07-08)
- Full PR tracking logic refinement
- Session synchronization testing
- Comprehensive unit/integration tests
- Error handling and edge cases
- Database query layer implementation

### Pending (Phase 09-10)
- Analytics dashboard UI
- Performance optimization
- Chrome Web Store submission
- User documentation
- Team insights features

---

## Build & Development Scripts

### Root Level (`package.json`)
```bash
npm run build              # Build all packages
npm run build:dev         # Dev build all packages
npm run dev               # Watch mode for all packages
npm run lint              # Lint all packages
npm run lint:fix          # Fix linting issues
npm run format            # Format all files with Prettier
npm run typecheck         # Type check all packages
npm run clean             # Clean all builds and dependencies
```

### Backend Scripts
```bash
cd packages/backend
npm run dev               # Start wrangler dev server
npm run build             # Compile TypeScript
npm run deploy            # Deploy to Cloudflare Workers
npm run typecheck         # Type check only
npm run lint              # Lint TypeScript
npm run lint:fix          # Fix linting issues
```

### Extension Scripts
```bash
cd packages/extension
npm run build             # Production build
npm run build:dev         # Development build
npm run dev               # Watch mode
npm run test              # Run Jest tests
npm run test:watch        # Watch mode testing
npm run test:coverage     # Coverage report
npm run typecheck         # Type check only
npm run lint              # Lint TypeScript
npm run lint:fix          # Fix linting issues
```

### Shared Scripts
```bash
cd packages/shared
npm run build             # Compile to dist/
npm run build:dev         # Watch mode
npm run dev               # Watch alias
npm run typecheck         # Type check only
npm run lint              # Lint TypeScript
npm run lint:fix          # Fix linting issues
```

---

## File Organization Patterns

### Backend File Organization
```
packages/backend/src/
├── routes/               # API endpoint handlers
│   ├── auth.ts
│   ├── sessions.ts
│   └── stats.ts
├── middleware/           # Request/response interceptors
│   ├── auth.ts          # JWT verification
│   └── validation.ts    # Zod schema validation
├── utils/               # Utility functions
│   ├── errors.ts        # Error handling
│   ├── jwt.ts           # Token management
│   └── logger.ts        # Logging (optional)
├── db/                  # Database operations
│   └── queries.ts       # D1 SQL queries
├── types.ts             # Environment and type definitions
└── index.ts             # App initialization
```

### Extension File Organization
```
packages/extension/src/
├── background/          # Service worker files
│   ├── service-worker.ts
│   ├── storage-manager.ts
│   ├── sync-queue.ts
│   ├── api-client.ts
│   └── alarm-manager.ts
├── auth/                # Authentication flow
│   ├── github-oauth.ts
│   ├── token-manager.ts
│   └── index.ts
├── content/             # Content scripts
│   ├── pr-detector.ts
│   └── visibility-tracker.ts
├── popup/               # Popup UI
│   ├── popup.ts
│   └── popup-integration.ts
├── utils/               # Helper functions
│   ├── helpers.ts
│   ├── network.ts
│   └── index.ts
└── types/               # Type definitions
    └── index.ts
```

### Shared File Organization
```
packages/shared/src/
├── types/               # Type definitions
│   ├── api.ts           # Request/response types
│   ├── storage.ts       # Storage schemas
│   ├── auth.ts          # OAuth types
│   ├── models.ts        # Domain models
│   └── index.ts
├── utils/               # Utilities (zero dependencies)
│   ├── formatters.ts    # Time/URL formatting
│   ├── validators.ts    # Zod schemas
│   ├── parsers.ts       # URL/data parsing
│   └── index.ts
└── index.ts             # Package entry
```

---

## Database Schema (D1)

### Implemented Tables (Phase 01)

**users**
```sql
CREATE TABLE users (
  user_id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_user_id TEXT UNIQUE NOT NULL,
  github_username TEXT NOT NULL,
  github_avatar_url TEXT,
  email TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

**time_sessions**
```sql
CREATE TABLE time_sessions (
  session_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
```

**daily_stats**
```sql
CREATE TABLE daily_stats (
  stat_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  total_seconds INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  UNIQUE(user_id, date)
);
```

**pr_review_activities** (Added 2025-12-19)
```sql
CREATE TABLE pr_review_activities (
  activity_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL CHECK(activity_type IN ('comment', 'approve', 'request_changes')),
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  session_id INTEGER,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (session_id) REFERENCES time_sessions(session_id) ON DELETE SET NULL
);
```

**Key Indexes:**
- `idx_users_github_id` - GitHub user lookup
- `idx_sessions_user_id` - User sessions
- `idx_sessions_status` - Active session tracking
- `idx_sessions_repo` - Repository-scoped queries
- `idx_daily_stats_user_date` - Daily aggregations
- `idx_activities_user_created` - User activity timeline
- `idx_activities_type_created` - Analytics by activity type
- `idx_activities_repo` - Repository activity tracking
- `idx_activities_pr` - PR-scoped activities and session linking

---

## Environment Configuration

### Backend (`wrangler.toml`)
Required fields for production deployment:
- `GITHUB_CLIENT_ID` - OAuth app client ID
- `GITHUB_CLIENT_SECRET` - OAuth app client secret
- `JWT_SECRET` - 32+ character random string
- `ENVIRONMENT` - "production" or "development"
- `D1_DATABASE_ID` - Cloudflare D1 database binding
- `KV_NAMESPACE_ID` - Cloudflare KV namespace for tokens

### Extension (`manifest.json`)
- `host_permissions` - GitHub domain only
- `permissions` - storage, alarms
- `oauth_client_id` - Registered OAuth app ID (used in content script)

---

## Testing Strategy

### Backend
- Unit tests for utility functions
- Integration tests for routes
- Database query tests
- Auth middleware tests
- Error handling scenarios

### Extension
- Service worker listener tests
- Storage manager CRUD tests
- API client request tests
- OAuth flow tests (mocked)
- Content script detection tests

### Shared
- Zod schema validation tests
- Formatter utility tests
- Parser utility tests

---

## Performance Targets

- Extension size: < 2MB
- Background worker memory: < 20MB
- Backend API response: p95 < 500ms
- Sync reliability: 99.9%
- Data accuracy: ± 5 seconds

---

## Next Steps & Roadmap

1. Complete D1 schema setup and migrations
2. Implement comprehensive error handling
3. Add full test coverage (target 80%+)
4. Optimize extension bundle size
5. Set up CI/CD pipeline for automated testing
6. Prepare Chrome Web Store submission materials

---

## Related Documentation

- [System Architecture](./system-architecture.md)
- [Code Standards](./code-standards.md)
- [Project Overview & PDR](./project-overview-pdr.md)
- [Backend Testing Guide](./backend-testing-guide.md)
