# GitHub OAuth Research Report: Chrome Extension Implementation

## Summary
GitHub OAuth Apps provide simpler user authentication for third-party integrations with long-lived tokens, while GitHub Apps use modern JWT-based auth with short-lived tokens. PKCE is now recommended for all clients (2025), and Chrome extensions should use `chrome.identity.launchWebAuthFlow()` for GitHub OAuth with tokens stored in `chrome.storage.session` for security. Required scopes are minimal: `user` for profile access, `public_repo` for public repos, and `repo` for full repo access.

## Key Findings

### GitHub OAuth Flow Options
**OAuth Apps (recommended for extensions):**
- Standard OAuth 2.0 authorization code flow
- Long-lived tokens (no expiration, revoke-only)
- Simpler setup; no installation required
- Best for sign-in + basic API access
- No granular permissions; all-or-nothing resource access
- 5000 req/hr rate limit per user

**GitHub Apps (enterprise-grade):**
- JWT-based auth with Installation Access Tokens (IAT)
- Short-lived tokens (~1 hour) with refresh support
- Fine-grained permissions per repository
- Must be installed; more setup overhead
- Better for automations and org-level integrations
- Scalable rate limits based on repos/users

### PKCE Implementation
- **Now mandatory in OAuth 2.1** (2025 GitHub update)
- Prevents authorization code interception attacks
- Works for all clients (public + confidential)
- Flow: Client generates `code_verifier` → hashes to `code_challenge` → includes in auth request → includes raw verifier in token exchange
- Critical for Chrome extensions (public clients without client secrets)
- Supported by GitHub OAuth as of 2025

### Chrome Extension Considerations
- **Use `chrome.identity.launchWebAuthFlow()`** for GitHub OAuth
- Redirect pattern: `https://<extension-id>.chromiumapp.org/callback`
- Don't use `getAuthToken()` (Google-only)
- Initialize auth on user gesture, not app startup
- Request scopes incrementally (at point of use)
- Test with real extension ID; redirect must match exactly
- No XSS protection in web storage—use `chrome.storage` instead

### Token Security
- **Avoid localStorage/sessionStorage** (XSS-vulnerable)
- **Best option: `chrome.storage.session`**
  - In-memory, 1MB limit
  - Cleared on browser session end
  - Restricted to trusted contexts (extension pages)
  - Not encrypted on disk (acceptable for temp tokens)
- **Fallback: In-memory closure** (most secure)
  - Token visible to code but never readable from outside
  - Lost on service worker restart
- Physical access risk: All browser storage equally vulnerable

### Required Scopes
| Scope | Access | Use Case |
|-------|--------|----------|
| `user` | Public profile, email | Read username, avatar, profile info |
| `public_repo` | Public repos only | Read public repo metadata |
| `repo` | All repos (pub + priv) | Full repo access (read/write) |
| *no write* | Read-only imposed | GitHub forces read+write together |

**Important:** GitHub doesn't offer read-only scopes for repos—`repo` scope enables both read and write. Multiple tokens can be used for different scope combinations (limit: 10 per combo).

## Recommendations

1. **Use OAuth App flow** (simpler for extensions vs GitHub Apps)
2. **Implement PKCE** (mandatory 2025; mitigates code interception)
3. **Use `chrome.identity.launchWebAuthFlow()`** (proper extension pattern)
4. **Store tokens in `chrome.storage.session`** (security baseline)
5. **Request minimal scopes**: Start with `user` + `public_repo`, add `repo` only if needed
6. **Handle scope downgrade** gracefully—users may grant less than requested
7. **Implement refresh logic** manually (no built-in refresh for OAuth Apps)
8. **Test redirect URL** exactly matches extension ID before deployment

## Unresolved Questions
- Does GitHub OAuth support refresh tokens? (research suggests no auto-refresh; manual re-auth required)
- Best practice for handling token expiration in long-running extensions?
- Can multiple GitHub OAuth apps be created for same extension version iterations?

## References
- [GitHub OAuth Apps vs GitHub Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps)
- [GitHub OAuth Best Practices](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app)
- [PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [GitHub OAuth Scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
