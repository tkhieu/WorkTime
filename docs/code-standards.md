# WorkTime Code Standards

## TypeScript Configuration

### Base Configuration (`tsconfig.base.json`)

```json
{
  "compilerOptions": {
    "target": "ES2020",                      // Modern JavaScript features
    "module": "ES2020",                      // ES modules
    "lib": ["ES2020"],                       // ES2020 standard library
    "strict": true,                          // All strict type checks
    "esModuleInterop": true,                 // CommonJS/ES module compatibility
    "skipLibCheck": true,                    // Skip type checking of declaration files
    "forceConsistentCasingInFileNames": true,// Enforce consistent file casing
    "moduleResolution": "node",              // Node-style module resolution
    "resolveJsonModule": true,               // Allow JSON imports
    "declaration": true,                     // Generate .d.ts files
    "declarationMap": true,                  // Generate declaration source maps
    "sourceMap": true,                       // Generate source maps
    "noUnusedLocals": true,                  // Error on unused variables
    "noUnusedParameters": true,              // Error on unused parameters
    "noImplicitReturns": true,               // Error on missing return statements
    "noFallthroughCasesInSwitch": true,      // Error on switch fallthrough
    "allowSyntheticDefaultImports": true     // Allow default imports
  },
  "exclude": ["node_modules", "dist", "build"]
}
```

### Key Compiler Rules

1. **Strict Mode**: All strict type checking enabled
   - `noImplicitAny` - Require explicit types
   - `strictNullChecks` - Explicit null/undefined handling
   - `strictFunctionTypes` - Strict function type checking
   - `strictPropertyInitialization` - Properties must be initialized

2. **No Unused Code**: Catch dead code automatically
   - `noUnusedLocals` - Error on unused variables
   - `noUnusedParameters` - Error on unused function parameters

3. **Code Flow**: Ensure complete code paths
   - `noImplicitReturns` - All code paths must return
   - `noFallthroughCasesInSwitch` - No switch fallthrough

---

## Naming Conventions

### TypeScript Files

```
src/
├── index.ts                   # Entry points
├── types.ts                   # Type definitions only
├── middleware/
│   ├── auth.ts               # Middleware modules
│   └── validation.ts
├── routes/
│   ├── auth.ts               # Route handlers
│   ├── sessions.ts
│   └── stats.ts
├── utils/
│   ├── jwt.ts                # Utility modules
│   ├── errors.ts
│   └── index.ts              # Barrel export
└── db/
    └── queries.ts            # Database operations
```

### Naming Patterns

**Type Names** - PascalCase
```typescript
type SessionResponse = { id: string; duration: number };
interface ExtensionStorage { sessions: StoredSession[] }
enum SyncStatus { PENDING, SYNCED, FAILED }
class AuthError extends Error {}
```

**Function Names** - camelCase
```typescript
function formatDuration(ms: number): string {}
async function fetchUserStats(userId: string): Promise<DailyStats> {}
const validateSession = (session: any): boolean => {}
```

**Constant Names** - UPPER_SNAKE_CASE (for module-level constants)
```typescript
const DEFAULT_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRY_ATTEMPTS = 3;
const GITHUB_OAUTH_SCOPE = 'repo read:user';
```

**Variable Names** - camelCase
```typescript
let sessionCount = 0;
const prDetectionPatterns = [/github\.com\/.*\/pull\/\d+/];
let isSyncing = false;
```

**Enum Members** - PascalCase
```typescript
enum SessionState {
  ACTIVE = 'active',
  PAUSED = 'paused',
  ENDED = 'ended'
}

enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  NOT_FOUND = 'NOT_FOUND',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}
```

---

## Linting Rules

### ESLint Configuration (`.eslintrc.json`)

```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "no-debugger": "error",
    "no-var": "error",
    "prefer-const": "error",
    "@typescript-eslint/explicit-function-return-types": "warn",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "error"
  }
}
```

### Key Rules

| Rule | Level | Reason |
|------|-------|--------|
| `no-var` | Error | Use `const`/`let` for modern scoping |
| `prefer-const` | Error | Prefer immutability |
| `no-debugger` | Error | Never commit debugger statements |
| `no-console` | Warn | Limit console output |
| `explicit-function-return-types` | Warn | Clear API contracts |
| `no-any` | Warn | Prefer specific types |
| `no-unused-vars` | Error | Catch dead code |

---

## Prettier Configuration (`.prettierrc.json`)

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always"
}
```

### Formatting Standards

1. **Semicolons**: Always required
2. **Quotes**: Single quotes (except JSON)
3. **Line Length**: Maximum 100 characters
4. **Indentation**: 2 spaces (not tabs)
5. **Trailing Commas**: ES5 style (last item in arrays/objects)
6. **Arrow Functions**: Always use parentheses `(x) => {}`

---

## Code Organization Patterns

### Module Exports

**Barrel Exports** - Combine related exports
```typescript
// src/utils/index.ts
export { formatDuration } from './formatters';
export { validateSession } from './validators';
export { parseGitHubUrl } from './parsers';
```

**Single Exports** - Keep related code together
```typescript
// src/middleware/auth.ts
export interface AuthContext { userId: string }
export class AuthError extends Error {}
export function verifyJWT(token: string): AuthContext {}
```

### Type Organization

**Grouped by Domain**
```typescript
// src/types/api.ts - API contracts
export interface SessionRequest {}
export interface SessionResponse {}
export type ApiError = { code: string; message: string };

// src/types/storage.ts - Storage schemas
export interface ExtensionStorage {}
export interface StoredSession {}

// src/types/auth.ts - Authentication
export interface OAuthTokens {}
export interface GitHubUser {}
```

### Utility Functions

**Collocate with Usage**
```typescript
// Prefer: Keep formatters with their domain
// src/utils/formatters.ts
export function formatDuration(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

// Use in:
// src/background/service-worker.ts
import { formatDuration } from '../utils';
```

---

## API Design Standards

### Route Naming

```typescript
// Consistent REST patterns
GET    /api/sessions           // List
GET    /api/sessions/:id       // Get one
POST   /api/sessions           // Create
PATCH  /api/sessions/:id       // Update
DELETE /api/sessions/:id       // Delete

GET    /api/stats/daily        // Custom endpoints after resource
GET    /api/stats/weekly
```

### Error Responses

**Consistent Error Format**
```typescript
interface ApiError {
  error: string;              // Human readable message
  code: string;               // Machine readable code
  statusCode: number;         // HTTP status
  timestamp: string;          // ISO 8601 timestamp
  details?: Record<string, any>; // Optional extra data
}

// Usage
throw {
  error: 'Session not found',
  code: 'NOT_FOUND',
  statusCode: 404,
  timestamp: new Date().toISOString()
};
```

### Request Validation

**Use Zod Schemas**
```typescript
import { z } from 'zod';

const SessionSchema = z.object({
  prUrl: z.string().url(),
  startTime: z.number().int(),
  endTime: z.number().int().optional()
});

type Session = z.infer<typeof SessionSchema>;

// In Hono route
app.post('/', zValidator('json', SessionSchema), (c) => {
  const data = c.req.valid('json'); // Typed automatically
  return c.json({ success: true });
});
```

---

## File Size Guidelines

| File Type | Max Size | Reason |
|-----------|----------|--------|
| Single module | 500 lines | Readability & testing |
| Type definition | 200 lines | Clarity |
| Test file | 1000 lines | Comprehensive coverage |
| Route handler | 300 lines | Single responsibility |
| Utility module | 300 lines | Reusability |

**Guidelines:**
- If a file exceeds max size, split into focused modules
- Group related functions into a module
- Use barrel exports to maintain clean imports

---

## Async/Await Standards

### Promise Handling

**Prefer async/await**
```typescript
// Good
async function fetchSessions(): Promise<Session[]> {
  const response = await api.get('/sessions');
  return response.data;
}

// Avoid
function fetchSessions(): Promise<Session[]> {
  return api.get('/sessions').then((res) => res.data);
}
```

### Error Handling

**Always catch async errors**
```typescript
try {
  const result = await syncSessions();
  handleSuccess(result);
} catch (error) {
  if (error instanceof AuthError) {
    refreshTokens();
  } else {
    logError(error);
  }
}
```

### Timeout Protection

```typescript
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error('Timeout')),
        timeoutMs
      )
    ),
  ]);
}

// Usage
const sessions = await withTimeout(
  fetchSessions(),
  5000 // 5 second timeout
);
```

---

## Testing Standards

### Test File Organization

```
src/
├── feature.ts
└── __tests__/
    └── feature.test.ts       // One test per source file
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom', // Extension tests
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
};
```

### Test Naming

```typescript
describe('SessionManager', () => {
  describe('createSession', () => {
    test('should create session with valid data', () => {});
    test('should throw error with invalid URL', () => {});
    test('should set default end time if not provided', () => {});
  });
});
```

**Naming Pattern:** `should [expected behavior] [condition]`

---

## Security Standards

### Secrets Management

**Never commit secrets**
```typescript
// Bad - DO NOT DO THIS
const JWT_SECRET = 'my-super-secret-key-123';

// Good - Use environment variables
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
```

### Token Storage

**Extension Storage**
```typescript
// Bad - Never store in localStorage
localStorage.setItem('token', accessToken);

// Good - Use chrome.storage with encryption
chrome.storage.local.set({
  tokens: {
    accessToken: encryptedToken,
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000
  }
});
```

### Input Validation

**Always validate and sanitize**
```typescript
// Always validate user input
const validatePRUrl = (url: string): boolean => {
  const pattern = /^https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+$/;
  return pattern.test(url);
};

// Sanitize in database queries
app.post('/sessions', (c) => {
  const { prUrl } = c.req.valid('json');
  if (!validatePRUrl(prUrl)) {
    return c.json({ error: 'Invalid PR URL' }, 400);
  }
  // Process safely
});
```

---

## Documentation Standards

### Type Documentation

```typescript
/**
 * Represents a tracking session for a GitHub PR review
 * @example
 * const session: Session = {
 *   id: 'abc123',
 *   prUrl: 'https://github.com/user/repo/pull/123',
 *   startTime: Date.now(),
 *   duration: 3600000
 * };
 */
interface Session {
  /** Unique session identifier */
  id: string;

  /** Full GitHub PR URL */
  prUrl: string;

  /** Session start time (milliseconds since epoch) */
  startTime: number;

  /** Session duration in milliseconds */
  duration: number;
}
```

### Function Documentation

```typescript
/**
 * Formats a duration in milliseconds to a human-readable string
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "5m 30s"
 * @throws Error if ms is negative
 * @example
 * formatDuration(330000) // "5m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) throw new Error('Duration must be positive');
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
```

---

## Import Organization

### Import Order

```typescript
// 1. External packages
import { Hono } from 'hono';
import { z } from 'zod';

// 2. Monorepo packages
import { Session, formatDuration } from '@worktime/shared';

// 3. Local modules (relative imports)
import { authMiddleware } from './middleware/auth';
import { SessionQueries } from './db/queries';
import type { Env } from './types';

// 4. Type imports
import type { Request, Response } from '@cloudflare/workers-types';
```

### Type vs Value Imports

```typescript
// Use 'type' for type-only imports (reduces bundle size)
import type { SessionResponse } from './types';

// Use regular import for values and classes
import { SessionError, validateSession } from './utils';

// Mixed imports
import { Router, type Request } from 'hono';
```

---

## Performance Optimization

### Code Splitting

**Lazy load large modules**
```typescript
// In extension background script
const importSyncQueue = () => import('./sync-queue');

// Later, when needed
const { SyncQueue } = await importSyncQueue();
```

### Memoization

**Cache expensive computations**
```typescript
const memoize = <T, R>(fn: (arg: T) => R) => {
  const cache = new Map<T, R>();
  return (arg: T) => {
    if (!cache.has(arg)) {
      cache.set(arg, fn(arg));
    }
    return cache.get(arg)!;
  };
};

export const getUserStats = memoize(async (userId: string) => {
  // Expensive computation
});
```

---

## Comments & Clarity

### When to Comment

**Comment the "why", not the "what"**

```typescript
// Good comment - explains intent
// Retry with exponential backoff to handle rate limiting
// GitHub API returns 403 when limits are exceeded
const retryDelay = Math.pow(2, attempt) * 1000;

// Bad comment - just restates code
// Increment counter by 1
count += 1;
```

### Avoid Over-Commenting

```typescript
// Unnecessary comments
const user = getUserById(userId); // Get user by ID
const sessions = filterActiveSessions(allSessions); // Filter active sessions

// Better: Code is self-documenting
const currentUser = getUserById(userId);
const activeSessions = filterActiveSessions(allSessions);
```

---

## Related Files

- **Configuration Files:**
  - `/tsconfig.base.json` - TypeScript configuration
  - `packages/*/tsconfig.json` - Package-specific settings
  - `.eslintrc.json` - ESLint rules
  - `.prettierrc.json` - Prettier formatting
  - `jest.config.js` - Jest testing configuration

- **Related Documentation:**
  - [Codebase Summary](./codebase-summary.md)
  - [System Architecture](./system-architecture.md)
