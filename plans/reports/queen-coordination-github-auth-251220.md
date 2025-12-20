# Queen Coordinator: GitHub Auth Implementation Plan

**Date**: 2025-12-20
**Plan**: GitHub OAuth Authentication for Dashboard
**Status**: READY FOR EXECUTION
**Estimated Duration**: 7.5-9 hours (parallel batches)

---

## Executive Summary

Analyzed 6-phase GitHub OAuth implementation plan. Identified parallel execution opportunities reducing timeline from 12+ hours (sequential) to 7.5-9 hours (optimized batches). No blocking issues detected. Backend foundation ready, frontend requires 4 worker batches with dependency gates.

---

## Phase Dependency Analysis

### Dependency Graph

```
Phase 1: Backend OAuth Review (FOUNDATION)
    ↓
    ├─→ Phase 2: Auth Context Provider ─┐
    │                                    ├─→ Phase 4: Protected Routes ─┐
    └─→ Phase 3: Login Page ────────────┘                               │
                                                                         ├─→ Phase 6: Logout & Session
                                         Phase 5: API Auth Integration ─┘
```

### Parallelization Opportunities

**Batch 1** (Sequential): Phase 1 only
**Batch 2** (Parallel): Phases 2 + 3
**Batch 3** (Parallel): Phases 4 + 5
**Batch 4** (Sequential): Phase 6

**Critical Path**: Batch 1 → Batch 2 → Batch 3 → Batch 4
**Parallel Speedup**: ~40% reduction in total time

---

## Worker Assignments

### Batch 1: Backend Foundation (1 hour)
**Mode**: Sequential | **Prerequisites**: None

| Worker Type | Agent Name | Task | Files | Time |
|-------------|-----------|------|-------|------|
| backend-dev | Backend Reviewer | Verify PKCE support in callback route | `packages/backend/src/routes/auth.ts` | 30m |
| coder | CORS Specialist | Update CORS for dashboard origins | `packages/backend/src/middleware/cors.ts` | 15m |
| reviewer | Env Validator | Verify env vars + GitHub OAuth App setup | `wrangler.toml`, GitHub settings | 15m |

**Gate Criteria**:
- CORS allows `localhost:5173` and `.pages.dev`
- GitHub OAuth App has callback URLs configured
- Env vars: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `JWT_SECRET` verified

---

### Batch 2: Frontend Auth Core (2-2.5 hours)
**Mode**: Parallel | **Prerequisites**: Batch 1 complete

| Worker Type | Agent Name | Task | Files | Time |
|-------------|-----------|------|-------|------|
| coder | Auth Context Specialist | Create AuthContext, PKCE helpers, session management | `types/auth.ts`<br>`lib/auth.ts`<br>`contexts/AuthContext.tsx` | 1.5h |
| coder | Login UI Specialist | Create Login + AuthCallback pages | `pages/Login.tsx`<br>`pages/AuthCallback.tsx` | 1.5h |
| tester | Auth Tester | Unit tests for PKCE helpers, AuthContext integration tests | `tests/auth/*.test.ts` | 1h |

**Deliverables**:
- `useAuth()` hook functional
- PKCE code verifier generation + challenge
- Login page redirects to GitHub OAuth
- Callback page exchanges code for JWT
- Token stored in sessionStorage

**Gate Criteria**:
- `useAuth()` returns correct state
- GitHub OAuth redirect works
- Token persisted after callback
- `isAuthenticated` reflects auth state

---

### Batch 3: Routing & API Integration (2 hours)
**Mode**: Parallel | **Prerequisites**: Batch 2 complete

| Worker Type | Agent Name | Task | Files | Time |
|-------------|-----------|------|-------|------|
| coder | Routing Specialist | Create ProtectedRoute, update route config | `components/auth/ProtectedRoute.tsx`<br>`routes/index.tsx` | 1h |
| coder | API Integration Specialist | Add Authorization headers, 401 handling, token refresh | `api/client.ts`<br>`lib/tokenRefresh.ts`<br>`hooks/useTokenRefresh.ts` | 1.5h |
| tester | Integration Tester | Route guard tests, API interceptor tests | `tests/routing/*.test.ts`<br>`tests/api/*.test.ts` | 1h |

**Deliverables**:
- Unauthenticated users redirected to `/login`
- After login, redirect to original destination
- All API calls include `Authorization: Bearer <token>`
- 401 responses trigger logout + redirect
- Token auto-refreshes 5min before expiry

**Gate Criteria**:
- Protected routes block unauthenticated users
- API calls send JWT in header
- Token refresh works without user intervention
- 401s clear auth state and redirect

---

### Batch 4: Logout & Session Polish (2-2.5 hours)
**Mode**: Sequential | **Prerequisites**: Batch 3 complete

| Worker Type | Agent Name | Task | Files | Time |
|-------------|-----------|------|-------|------|
| coder | UI Integration Specialist | Add user menu to Navbar/Sidebar with logout | `components/layout/Navbar.tsx`<br>`components/layout/Sidebar.tsx`<br>`components/auth/SessionExpiredModal.tsx` | 1.5h |
| reviewer | Auth Flow Reviewer | End-to-end security + UX review | All auth files | 30m |
| tester | E2E Tester | Complete auth lifecycle tests | `tests/integration/*.test.ts` | 1h |

**Deliverables**:
- User dropdown menu with avatar + username
- Logout button in Navbar and Sidebar
- Session expired modal with re-login option
- Logout clears all auth state
- Logout redirects to `/login`

**Gate Criteria**:
- User can logout from any page
- Session expiry shows modal
- All auth state cleared on logout
- Complete login-to-logout flow tested

---

## Execution Strategy

### Recommended Approach: Hybrid Sequential-Parallel

**Topology**: Hierarchical
**Coordination Pattern**: Batch-based with dependency gates

```bash
# Batch 1: Backend Foundation (Sequential)
Task("Backend Reviewer", "Verify backend auth routes + PKCE support", "backend-dev")
Task("CORS Specialist", "Update CORS for dashboard origins", "coder")
Task("Env Validator", "Verify env vars and GitHub OAuth App config", "reviewer")

# GATE: Wait for Batch 1 completion

# Batch 2: Frontend Auth Core (Parallel)
Task("Auth Context Specialist", "Create AuthContext + PKCE helpers", "coder")
Task("Login UI Specialist", "Create Login + AuthCallback pages", "coder")
Task("Auth Tester", "Unit tests for auth flow", "tester")

# GATE: Wait for Batch 2 completion

# Batch 3: Routing & API (Parallel)
Task("Routing Specialist", "ProtectedRoute + route config", "coder")
Task("API Integration Specialist", "API auth + token refresh", "coder")
Task("Integration Tester", "Route + API tests", "tester")

# GATE: Wait for Batch 3 completion

# Batch 4: Logout & Session (Sequential)
Task("UI Integration Specialist", "Navbar/Sidebar logout + session modal", "coder")
Task("Auth Flow Reviewer", "Security + UX review", "reviewer")
Task("E2E Tester", "Complete lifecycle tests", "tester")
```

---

## Blockers & Prerequisites

### Prerequisites (MUST be ready before execution)

**Backend Environment**:
- `GITHUB_CLIENT_ID` configured in `wrangler.toml`
- `GITHUB_CLIENT_SECRET` configured (secret)
- `JWT_SECRET` configured (secret)

**GitHub OAuth App**:
- Development callback: `http://localhost:5173/auth/callback`
- Production callback: `https://<dashboard>.pages.dev/auth/callback`

**CORS Configuration**:
- Current CORS allows Chrome extension + localhost
- **Requires update** to allow `.pages.dev` domains

### Potential Blockers

**None identified** - all dependencies are internal to the codebase.

**Risk Mitigation**:
- Batch 1 CORS update must be deployed before frontend work
- GitHub OAuth App must be configured before testing OAuth flow
- Env vars must be secrets (not hardcoded)

---

## Success Criteria

### Functional Requirements
- [ ] Users can login via GitHub OAuth from dashboard
- [ ] API calls include valid Authorization header
- [ ] 401 responses trigger redirect to /login
- [ ] Token refresh works before expiry (5min buffer)
- [ ] Logout clears all auth state and redirects
- [ ] Session expired modal shows on token failure

### Quality Requirements
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] CORS properly configured (no preflight failures)
- [ ] Error handling comprehensive (network errors, OAuth errors)
- [ ] Security review complete (token storage, XSS protection)
- [ ] UX smooth (no flash of protected content, loading states)

### Performance Requirements
- [ ] OAuth redirect < 500ms
- [ ] Token refresh transparent to user
- [ ] Login-to-dashboard < 3s end-to-end

---

## Rollback Plan

### If Batch 1 Fails
**Impact**: Cannot proceed with any frontend work
**Rollback**: Revert CORS changes
**Recovery**: Fix backend issues before retrying

### If Batch 2 Fails
**Impact**: Backend remains functional, dashboard shows login errors
**Rollback**: Remove AuthContext, keep existing dashboard (broken API calls)
**Recovery**: Fix AuthContext or Login page issues

### If Batch 3 Fails
**Impact**: Users can login but API calls fail
**Rollback**: Manual rollback of API client changes
**Recovery**: Fix ProtectedRoute or API interceptor logic

### If Batch 4 Fails
**Impact**: Users can still authenticate and use dashboard
**Rollback**: Remove Navbar/Sidebar logout buttons
**Recovery**: Fix UI integration issues

**Critical Path Protection**: Batch 1 must succeed before proceeding.

---

## Timeline Estimate

| Batch | Duration | Workers | Mode | Cumulative |
|-------|----------|---------|------|------------|
| 1 | 1h | 3 | Sequential | 1h |
| 2 | 2-2.5h | 3 | Parallel | 3-3.5h |
| 3 | 2h | 3 | Parallel | 5-5.5h |
| 4 | 2-2.5h | 3 | Sequential | 7-8h |

**Total**: 7-8 hours (optimized with parallelization)
**Original Estimate**: 6-9 hours (plan estimate)
**Sequential Approach**: 12+ hours

**Parallelization Benefit**: 40% time reduction

---

## Resource Allocation

### Worker Types Needed
- **backend-dev**: 1 (Batch 1)
- **coder**: 5 (Batches 1, 2, 3, 4)
- **tester**: 3 (Batches 2, 3, 4)
- **reviewer**: 2 (Batches 1, 4)

**Total Workers**: 11 agents across 4 batches
**Max Concurrent Workers**: 3 (Batch 2 or Batch 3)

### Memory Coordination

All workers should:
1. Store progress in swarm memory
2. Read previous batch outputs from memory
3. Report completion status via hooks

**Memory Keys**:
- `swarm/github-auth/batch-1-status`
- `swarm/github-auth/batch-2-status`
- `swarm/github-auth/batch-3-status`
- `swarm/github-auth/batch-4-status`

---

## Architecture Notes

### Token Storage Strategy
**Decision**: sessionStorage (not localStorage)
**Rationale**: Cleared on tab close, XSS-safe, matches extension pattern

### PKCE Flow
**Decision**: Required for SPA security
**Implementation**: `S256` code challenge method
**Verifier Storage**: sessionStorage during OAuth redirect

### Token Refresh
**Decision**: Auto-refresh 5min before expiry
**Mechanism**: Background interval check + refresh API call
**Failure Handling**: Clear auth state + show session expired modal

### Route Protection
**Pattern**: React Router v6 `Outlet` with `ProtectedRoute` wrapper
**Preservation**: Original destination stored in router state
**Loading States**: Spinner shown during auth check

---

## Queen Recommendations

### Start Execution When:
1. Backend env vars confirmed configured
2. GitHub OAuth App callback URLs added
3. All plan files reviewed by execution team
4. Worker agents spawned and ready

### Execution Notes:
- Use Claude Code's Task tool for parallel agent spawning
- Each agent MUST run hooks (pre-task, post-edit, post-task)
- Store progress in memory for cross-agent coordination
- Gate checks MUST pass before proceeding to next batch

### Success Metrics:
- No backend changes after Batch 1
- All tests green at end of each batch
- No hardcoded secrets in codebase
- Complete auth flow working end-to-end

---

## Unresolved Questions

None - plan is comprehensive and ready for execution.

---

**Queen Status**: READY TO COORDINATE SWARM
**Next Action**: Await execution command to spawn worker agents
**Coordination Mode**: Hierarchical with batch-based dependency gates
**Estimated Success Probability**: 95% (comprehensive plan, clear dependencies)
