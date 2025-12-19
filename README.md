# WorkTime

A Chrome Extension that automatically tracks time spent reviewing GitHub pull requests.

## Overview

WorkTime provides passive, non-intrusive time tracking for code reviews. The extension detects when you visit a GitHub PR and automatically logs your review session without any manual input required.

**Key Features:**
- Automatic PR page detection
- Local-first session storage (privacy-focused)
- Offline-first sync with backend
- GitHub OAuth 2.0 authentication
- Daily/weekly review analytics
- Real-time status in popup UI

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8.0+
- Chrome/Chromium browser
- GitHub account

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/worktime.git
cd worktime

# Install dependencies
pnpm install
```

### Development

```bash
# Start development mode for all packages
pnpm dev

# OR start individual packages:

# Extension development (watch mode)
cd packages/extension && npm run dev

# Backend development (Cloudflare Workers local server)
cd packages/backend && npm run dev
```

### Building

```bash
# Build all packages
pnpm build

# Build specific package
cd packages/extension && npm run build
cd packages/backend && npm run build
```

### Testing

```bash
# Run tests
pnpm test

# Test with coverage
cd packages/extension && npm run test:coverage
```

### Linting & Formatting

```bash
# Check code quality
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format
```

## Project Structure

```
WorkTime/
├── packages/
│   ├── backend/          # Cloudflare Workers API (Hono)
│   │   ├── src/
│   │   │   ├── routes/   # REST endpoints
│   │   │   ├── middleware/
│   │   │   ├── db/       # D1 database queries
│   │   │   └── utils/    # Utilities
│   │   ├── wrangler.toml # Cloudflare configuration
│   │   └── package.json
│   │
│   ├── extension/        # Chrome Extension MV3
│   │   ├── src/
│   │   │   ├── background/   # Service worker
│   │   │   ├── content/      # Content scripts
│   │   │   ├── popup/        # Popup UI
│   │   │   ├── auth/         # OAuth flow
│   │   │   ├── utils/        # Helpers
│   │   │   └── manifest.json
│   │   ├── webpack.config.js
│   │   └── package.json
│   │
│   └── shared/           # Shared types & utilities
│       ├── src/
│       │   ├── types/    # TypeScript types
│       │   └── utils/    # Zero-dependency utilities
│       └── package.json
│
├── docs/                 # Documentation
│   ├── project-overview-pdr.md      # Project overview & requirements
│   ├── codebase-summary.md          # Codebase structure
│   ├── system-architecture.md       # Architecture & data flow
│   ├── code-standards.md            # Coding standards
│   ├── backend-testing-guide.md     # Testing documentation
│   └── PHASE-*.md                   # Phase-specific docs
│
├── tsconfig.base.json    # Root TypeScript config
├── pnpm-workspace.yaml   # Monorepo configuration
├── CLAUDE.md             # Development environment config
└── README.md             # This file
```

## Architecture

### High Level

```
GitHub PR Page
       ↓
   [Content Script Detects URL]
       ↓
[Background Service Worker]
       ↓
[IndexedDB + chrome.storage.local]
       ↓
[Offline-First Sync Queue]
       ↓
[Cloudflare Workers API]
       ↓
[D1 Database + KV Store]
       ↓
[Analytics Dashboard]
```

For detailed architecture information, see [System Architecture Documentation](./docs/system-architecture.md).

## Key Technologies

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript | 5.3.3 |
| Frontend | Chrome Extension MV3 | - |
| Build (Ext) | Webpack | 5.89.0 |
| Backend | Cloudflare Workers | - |
| Web Framework | Hono | 3.12.8 |
| Database | D1 (SQLite) | - |
| Validation | Zod | 3.22.4 |
| Testing | Jest | 30.2.0 |
| Linting | ESLint + Prettier | 8.56.0 + 3.2.4 |

## Development Workflow

### Adding a Feature

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes following [Code Standards](./docs/code-standards.md)
3. Write tests: `jest --watch`
4. Run linting: `pnpm lint:fix`
5. Commit with clear message: `git commit -am "feat: add feature"`
6. Push and create pull request

### Running Tests

```bash
# Extension tests
cd packages/extension && npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Environment Setup

#### Backend (.env / wrangler.toml)

```toml
[env.development]
vars = { ENVIRONMENT = "development" }

[env.production]
vars = { ENVIRONMENT = "production" }

[secret]
GITHUB_CLIENT_ID = "your-github-oauth-app-id"
GITHUB_CLIENT_SECRET = "your-github-oauth-app-secret"
JWT_SECRET = "generate-a-random-32-char-string"
```

Generate JWT_SECRET:
```bash
openssl rand -base64 32
```

#### Extension (manifest.json)

Update `host_permissions` to match your GitHub domain:
```json
"host_permissions": ["https://github.com/*"]
```

## API Reference

### Authentication
- **OAuth 2.0 + PKCE** for GitHub authentication
- **JWT tokens** with 7-day TTL
- Auto-refresh on backend requests

### Session Endpoints

**Create Session**
```
POST /api/sessions
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "prUrl": "https://github.com/owner/repo/pull/123",
  "startTime": 1234567890,
  "endTime": 1234571490
}
```

**List Sessions**
```
GET /api/sessions?limit=50&offset=0
Authorization: Bearer <JWT>
```

### Stats Endpoints

**Daily Stats**
```
GET /api/stats/daily?date=2024-01-15
Authorization: Bearer <JWT>
```

**Weekly Stats**
```
GET /api/stats/weekly?week=2024-01-15
Authorization: Bearer <JWT>
```

## Contributing

### Code Style

- **TypeScript**: Strict mode enabled
- **Naming**: camelCase for functions/variables, PascalCase for types
- **Imports**: Group external, monorepo, local, then types
- **No hardcoded secrets**: Use environment variables
- **Comments**: Explain "why", not "what"

See [Code Standards](./docs/code-standards.md) for complete guidelines.

### Pull Request Process

1. Fork the repository
2. Create feature branch from `main`
3. Make changes with tests
4. Run `pnpm format && pnpm lint:fix && pnpm test`
5. Push and create pull request with description
6. Await code review and merge

## Documentation

- [Project Overview & PDR](./docs/project-overview-pdr.md) - Vision, requirements, timeline
- [Codebase Summary](./docs/codebase-summary.md) - Package structure, dependencies
- [System Architecture](./docs/system-architecture.md) - Architecture, data flow, security
- [Code Standards](./docs/code-standards.md) - TypeScript, naming, linting rules
- [Backend Testing Guide](./docs/backend-testing-guide.md) - Testing strategies

## Troubleshooting

### Extension not detecting PR pages
- Verify `manifest.json` has `host_permissions: ["https://github.com/*"]`
- Check content script is loaded: Open DevTools > Extensions tab
- Reload extension: Click reload button in chrome://extensions

### OAuth authentication fails
- Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set
- Check GitHub OAuth app settings: Settings > Developer settings > OAuth Apps
- Ensure redirect URI matches: `https://api.worktime.dev/auth/github/callback`

### Backend sync not working
- Check internet connectivity: `navigator.onLine`
- Verify JWT token is valid and not expired
- Check browser console for errors
- Review sync queue in chrome.storage.local (DevTools > Storage)

### Tests failing
- Clear cache: `pnpm clean`
- Reinstall: `pnpm install`
- Run in isolation: `jest --testNamePattern="specific test"`

## Performance Metrics

**Target Metrics:**
- Extension size: < 2MB
- Background worker memory: < 20MB
- API response time: p95 < 500ms
- Sync reliability: 99.9%
- Data accuracy: ± 5 seconds

## Security

- **Local-first**: All data stored locally first
- **Privacy**: No third-party tracking
- **Encryption**: HTTPS for all API calls
- **Tokens**: Secure credential storage with auto-refresh
- **Validation**: Zod schema validation on all inputs

For detailed security architecture, see [System Architecture](./docs/system-architecture.md#security-architecture).

## Roadmap

### Phase 05-06: Foundation (Complete)
- OAuth flow
- Popup UI
- Service worker
- Storage layer

### Phase 07-08: Core Features (In Progress)
- D1 schema finalization
- Full PR tracking
- Session synchronization
- Comprehensive testing

### Phase 09-10: Polish & Launch
- Analytics dashboard
- Bug fixes
- Chrome Web Store submission
- Documentation

## Support

For issues, questions, or feature requests:
- Open GitHub issues: [GitHub Issues](https://github.com/yourusername/worktime/issues)
- Email: support@worktime.dev
- Documentation: See [docs/](./docs/) folder

## License

MIT License - see LICENSE file for details

## Authors

- Your Name (lead developer)
- Contributors: [GitHub Contributors](https://github.com/yourusername/worktime/graphs/contributors)

---

**For more information, visit [docs/](./docs/) directory or check out the [Project Overview](./docs/project-overview-pdr.md).**
