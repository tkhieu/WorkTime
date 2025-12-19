# WorkTime - Project Overview & PDR

## Project Overview

**WorkTime** is a Chrome extension that tracks time spent reviewing GitHub pull requests, helping developers understand their code review workload and time investment.

### Target Users

- Software developers using GitHub for code reviews
- Engineering teams wanting visibility into review time allocation
- Contributors interested in tracking personal time investments

### Purpose & Problem Statement

Code review is a critical part of software development, yet developers often lack visibility into how much time they spend on it. WorkTime provides passive, non-intrusive tracking that integrates directly into the GitHub workflow.

### Product Vision

Create a transparent, privacy-first solution that:
- Automatically tracks PR review sessions without manual input
- Provides meaningful insights into review patterns and time allocation
- Seamlessly integrates into the GitHub workflow
- Respects user privacy with local-first data storage
- Enables teams to understand their review processes better

---

## Product Development Requirements (PDR)

### Phase 1: Core Session Tracking (MVP)

**Functional Requirements:**
- Detect when user navigates to a GitHub PR page
- Start session timer upon PR page visit
- Stop/pause timer when user leaves PR page
- Store sessions locally in browser storage
- Support offline-first sync with backend

**Non-Functional Requirements:**
- Minimal memory footprint (< 5MB)
- Latency < 100ms for session detection
- Support Chrome MV3 (Manifest V3) security model
- No hardcoded secrets or credentials

**Acceptance Criteria:**
- Sessions accurately tracked ± 5 seconds
- Works with network interruptions
- All data encrypted at rest locally
- Graceful degradation without backend availability

### Phase 2: Authentication & Cloud Sync

**Functional Requirements:**
- OAuth 2.0 + PKCE GitHub authentication
- Sync sessions to Cloudflare Workers backend
- JWT token management with 7-day TTL
- KV-based token storage on backend

**Non-Functional Requirements:**
- Auth flow completes in < 5 seconds
- Token refresh transparent to user
- Secure credential handling (no local storage of secrets)

**Acceptance Criteria:**
- OAuth flow passes GitHub app verification
- Tokens securely rotated before expiry
- User can revoke access at any time

### Phase 3: Insights & Statistics

**Functional Requirements:**
- Daily review time aggregation
- Weekly/monthly statistics dashboard
- PR categorization (by repo, by reviewer, by review type)
- Time spent distribution analysis

**Non-Functional Requirements:**
- Statistics computed on backend for scalability
- Dashboard loads in < 2 seconds
- Support up to 1000 PRs per month per user

**Acceptance Criteria:**
- Accuracy within 1% of stored sessions
- Dashboard responsive on mobile/desktop
- Export stats as CSV/JSON

### Phase 4: Team Insights

**Functional Requirements:**
- Team-level review time analytics
- Contribution metrics per team member
- Review performance trends
- Bottleneck identification

**Non-Functional Requirements:**
- Support up to 100 team members
- Real-time dashboard updates

### Technical Architecture Requirements

**Backend:**
- Cloudflare Workers (Edge computing)
- D1 SQLite database
- KV for token/session caching
- REST API with Hono framework
- Zod schema validation

**Frontend:**
- Chrome Extension MV3 compatible
- Service worker-based architecture
- IndexedDB for local data
- Sync queue with exponential backoff
- Content script for PR detection

**Shared:**
- Zero-dependency TypeScript types
- API contracts via Zod schemas
- Storage interfaces

---

## Key Features

### User-Facing Features

1. **Automatic Session Detection**
   - Background service worker monitors GitHub domain
   - Detects PR page visits via URL pattern matching
   - No user action required

2. **Real-Time Status Indicator**
   - Popup shows current session status
   - Display total review time today
   - Last PR reviewed timestamp
   - Sync status indicator

3. **Review Analytics**
   - Daily/weekly/monthly aggregate time
   - Breakdown by repository
   - Trending insights
   - Personal best days for reviews

4. **Privacy First**
   - All data stored locally first
   - Sync to backend optional
   - Easy data export and deletion
   - No third-party tracking

### Technical Features

1. **Offline-First Sync**
   - Local-first storage with IndexedDB
   - Queue-based sync mechanism
   - Exponential backoff for failures
   - Conflict resolution for concurrent edits

2. **Secure Authentication**
   - OAuth 2.0 with PKCE
   - JWT token validation
   - Automatic token refresh
   - Secure credential storage

3. **Cross-Extension Communication**
   - Service worker message passing
   - Content script to background worker communication
   - Type-safe event definitions

---

## Success Metrics

### Business Metrics
- Adoption: 1000+ active users within 6 months
- Retention: 70%+ monthly active users
- Engagement: 3+ sessions per user per week

### Technical Metrics
- Extension size: < 2MB
- Background memory: < 20MB
- Sync reliability: 99.9% successful deliveries
- API latency: p95 < 500ms
- Data accuracy: ± 5 seconds vs. manual timing

### User Satisfaction
- Rating: 4.5+ stars (minimum 4.0)
- Support ticket resolution: < 24 hours
- Feature request response: 100% acknowledged

---

## Timeline & Milestones

**Phase 05-06: Foundation (Complete)**
- OAuth flow implementation
- Popup UI scaffolding
- Service worker setup
- Storage layer implementation

**Phase 07-08: Core Features (In Progress)**
- D1 schema finalization
- Full PR tracking logic
- Session synchronization
- Comprehensive testing

**Phase 09-10: Polish & Launch**
- Analytics dashboard
- Bug fixes and optimization
- Chrome Web Store submission
- Documentation and onboarding

---

## Risk Assessment

### Technical Risks
- Chrome API deprecation: Mitigated by monitoring MV3 changes
- Privacy concerns: Mitigated by local-first design
- Sync conflicts: Mitigated by CRDT patterns

### Business Risks
- Market adoption: Mitigated by targeting developer-first channels
- Competition: Differentiate with privacy-first approach
- Retention: Focus on valuable insights and accuracy

---

## Dependencies & Assumptions

**Dependencies:**
- Chrome 88+ for MV3 support
- GitHub account for OAuth
- Internet connectivity for sync (optional)
- Cloudflare account for backend

**Assumptions:**
- Users visit GitHub PRs regularly
- Privacy is a key user concern
- Users want lightweight extensions
- Email authentication sufficient for MVP

---

## Out of Scope (for MVP)

- JIRA, GitLab, or other git platforms
- Browser extensions for non-Chrome browsers
- Real-time collaboration on reviews
- Code quality/review feedback analysis
- Integration with project management tools

---

## Documentation References

- [Codebase Summary](./codebase-summary.md)
- [System Architecture](./system-architecture.md)
- [Code Standards](./code-standards.md)
- [Backend Testing Guide](./backend-testing-guide.md)
