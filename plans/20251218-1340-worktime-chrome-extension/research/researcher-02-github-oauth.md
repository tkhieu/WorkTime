# GitHub OAuth Research for Chrome Extensions

## Executive Summary
GitHub OAuth authentication for Chrome Extensions uses `chrome.identity.launchWebAuthFlow()` with callback URL `https://<extension-id>.chromiumapp.org/`. GitHub Apps are recommended over OAuth Apps for fine-grained permissions, short-lived tokens, and better rate limits. Tokens should be stored in chrome.storage with PKCE for security.

## OAuth Flow Options

### GitHub OAuth Apps vs GitHub Apps

**GitHub OAuth Apps:**
- Standard OAuth 2.0 flow, user grants app permission to access GitHub data
- Provides long-lived access tokens
- Broad repository access (all repos user has permission to view)
- Lower rate limits (5,000 requests/hour for authenticated requests)
- Simpler to implement for basic use cases

**GitHub Apps (Recommended):**
- Installation-based authorization (specific repos/organizations)
- Short-lived Installation Access Tokens (IAT) via JWT, typically 1-hour expiry
- Fine-grained permissions (precise control over repository access)
- Dynamic rate limits (scale with number of installed repositories)
- Better security model (no long-lived tokens)
- Can function independently without user context

**Recommendation:** Use GitHub Apps for production. GitHub officially recommends them for modern integrations due to superior security, granular permissions, and better token management.

## Chrome Identity API Integration

### Implementation Pattern

**Manifest V3 Configuration:**
```json
{
  "manifest_version": 3,
  "permissions": ["identity", "storage"],
  "oauth2": {
    "client_id": "YOUR_GITHUB_CLIENT_ID",
    "scopes": ["repo"]
  }
}
```

**OAuth Flow:**
```javascript
// Use chrome.identity.launchWebAuthFlow() for non-Google OAuth
chrome.identity.launchWebAuthFlow({
  url: `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URL)}&scope=repo`,
  interactive: true
}, (redirectUrl) => {
  // Extract authorization code from redirectUrl
  const code = new URL(redirectUrl).searchParams.get('code');
  // Exchange code for access token
});
```

**Redirect URL Format:**
- Use `chrome.identity.getRedirectURL()` to generate: `https://<extension-id>.chromiumapp.org/`
- Must include trailing `/` when registering in GitHub OAuth App settings
- Extension ID can be fixed using `key` field in manifest.json

### Key APIs
- `chrome.identity.launchWebAuthFlow()` - Launch OAuth flow
- `chrome.identity.getRedirectURL()` - Get callback URL
- `chrome.storage.local` - Store tokens securely

## Token Security

### Storage Best Practices

**Primary Recommendation:**
Use `chrome.storage.local` API (NOT localStorage) for token storage in Chrome Extensions.

**Security Hierarchy (Most to Least Secure):**
1. Browser memory (most secure but not persistent)
2. Chrome storage API with encryption
3. Platform-specific secure storage (Keychain/Keystore)
4. LocalStorage (vulnerable to XSS attacks)

**Key Security Measures:**
- **Never store tokens in plain text**
- **Use PKCE (Proof Key for Code Exchange)** for authorization code flow
- **Short-lived tokens**: Prefer 1-hour expiry tokens (GitHub Apps)
- **HTTPS only**: Always transmit tokens over HTTPS
- **Revoke immediately**: Delete tokens when no longer needed
- **Service Worker pattern**: Intercept API calls to add tokens (keeps them off main thread)

**XSS Mitigation:**
- Avoid localStorage (vulnerable to XSS attacks)
- Use Content Security Policy (CSP) in manifest
- Minimize third-party JavaScript dependencies
- Implement token encryption at rest

### Token Refresh Strategy

**OAuth Apps:**
- No built-in refresh mechanism
- User must re-authorize when token expires
- Consider implementing background re-auth flow

**GitHub Apps:**
- Generate new IAT using JWT every hour
- No user interaction needed for refresh
- Store JWT private key securely (not in extension)

## Required API Scopes

### Fine-Grained Tokens (Recommended)

**Minimal permissions for reading PR data:**
- `Pull requests: Read-only` - Access PR data
- `Metadata: Read-only` - Automatically added (mandatory)
- `Contents: Read-only` - Often needed in practice (avoids GraphQL errors)

### Classic Personal Access Tokens

**Scope options:**
- `public_repo` - Access public repositories only (safer for public repos)
- `repo` - Full access to private repositories (required for private repos)
- `read:user` - Read user profile data (if needed for user context)

### Recommended Minimal Scopes
For WorkTime extension reading PR data:
```
repo (or public_repo if public repos only)
read:user
```

**Note:** Fine-grained tokens provide better security by limiting access to specific repositories.

## Rate Limiting

### 2025 Rate Limit Structure

**Unauthenticated Requests:**
- Very limited (updated May 2025)
- Applies to HTTPS clones, anonymous REST API calls
- Not suitable for production extensions

**Authenticated Requests:**
- OAuth Apps: 5,000 requests/hour
- GitHub Apps: Dynamic limits (scales with installations)
- Personal Access Tokens: 5,000 requests/hour

### Rate Limit Management Strategies

**1. Monitor Rate Limit Headers:**
```javascript
// Check response headers
'X-RateLimit-Limit'      // Total limit
'X-RateLimit-Remaining'  // Remaining requests
'X-RateLimit-Reset'      // Unix timestamp when limit resets
```

**2. Caching Strategy:**
- Cache frequent API responses in chrome.storage
- Use ETags for conditional requests (saves quota)
- Implement cache expiration policies

**3. Exponential Backoff:**
```javascript
// Retry with exponential delays: 1s, 2s, 4s, 8s, etc.
const delay = Math.pow(2, retryCount) * 1000;
```

**4. GraphQL Alternative:**
- Consider GraphQL API instead of REST
- Fetch only needed fields (reduces request count)
- More efficient for complex data queries

**5. Token Bucket Algorithm:**
- System adds tokens at constant rate
- Each request consumes a token
- Requests wait when bucket empty

## Key Recommendations

1. **Use GitHub Apps** over OAuth Apps for production (better security, permissions, rate limits)
2. **Implement PKCE** for OAuth code flow (required for public clients like Chrome Extensions)
3. **Store tokens in chrome.storage.local** with encryption, never localStorage
4. **Use fine-grained permissions** (Pull requests: Read-only, Contents: Read-only, Metadata: Read-only)
5. **Monitor rate limit headers** and implement exponential backoff retry logic
6. **Cache API responses** aggressively to reduce request count
7. **Use short-lived tokens** (1-hour IATs from GitHub Apps preferred)
8. **Implement CSP** in manifest to prevent XSS attacks
9. **Consider GraphQL API** if making multiple related requests
10. **Register extension with fixed ID** using manifest key field for stable redirect URL

## References

- [Chrome Identity API Tutorial](https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/extensions/mv3/tut_oauth/index.md)
- [GitHub OAuth with Chrome Extensions](https://dev.to/artem_turlenko/simplifying-chrome-extension-development-with-github-oauth-55i6)
- [GitHub OAuth Apps vs GitHub Apps](https://www.gocodeo.com/post/github-authorization-oauth-vs-github-apps)
- [OAuth Token Storage Best Practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices)
- [Auth0 Token Storage Security](https://auth0.com/docs/secure/security-guidance/data-security/token-storage)
- [GitHub API Scopes Documentation](https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/)
- [GitHub API Rate Limiting Guide](https://www.lunar.dev/post/a-developers-guide-managing-rate-limits-for-the-github-api)
- [Chrome Extension Security Best Practices](https://www.creolestudios.com/chrome-extension-development-best-practices-for-security/)
