# Chrome Extension Auth Patterns Report

## Summary
Chrome Manifest V3 extensions require backend-assisted OAuth flows due to security constraints. Use `chrome.identity.launchWebAuthFlow` with Authorization Code + PKCE for cross-browser compatibility. Store tokens in `chrome.storage.session` (memory-only) rather than local storage. Never embed client secrets in extension code.

## Key Findings

### MV3 OAuth Considerations
- **No Remote Code Loading**: Manifest V3 prohibits external script loading for security; all OAuth logic must be bundled
- **Service Worker Only**: Background scripts are ephemeral service workers with limitations on creating auth windows
- **Application Type Critical**: OAuth credentials must use "Chrome Extension" type in Google Cloud Console, not "Web application"
- **Content Security Policy (CSP)**: Inline scripts and eval() forbidden; impacts auth flow implementation

### chrome.identity API Methods
**getAuthToken()** (Google-only, simpler UX):
- Built-in account selection UI
- Requires oauth2 manifest configuration
- Browser-dependent (not available in Brave, Edge, others)
- Limited to Google authentication

**launchWebAuthFlow()** (Universal, PKCE-capable):
- Works with any OAuth provider via Authorization Code flow
- Interactive flag controls UX flow (true = visible, false = silent)
- Caches user sessions (requires `prompt=select_account` for account switching)
- Requires valid redirect URL format: `https://<app-id>.chromiumapp.org/*`
- Session caching prevents re-authentication until browser restart

### Backend-Assisted Flow (Recommended)
**Architecture**:
1. Extension calls `chrome.identity.launchWebAuthFlow` with PKCE code_challenge
2. OAuth provider redirects with authorization code to chromiumapp.org URL
3. Extension extracts code and sends to backend
4. Backend exchanges code + PKCE code_verifier for access token (client secret never exposed)
5. Backend stores token securely and returns session cookie/identifier
6. Extension uses session identifier for subsequent API calls

**Security Benefit**: Client secret never stored in extension code; backend owns token lifecycle

### Token Storage Security
**chrome.storage.session** (RECOMMENDED):
- Data held in memory while extension loaded
- Cleared on extension reload, update, browser restart
- Default access restricted to trusted contexts (service workers, extension pages)
- 10 MB quota
- No disk persistence = cannot be extracted via physical access

**chrome.storage.local** (AVOID for tokens):
- Persists unencrypted to disk
- Accessible across all contexts by default
- Remains after browser restart
- Physical disk access exposes tokens
- If required: encrypt before storing

### Extension-to-Backend Authentication Patterns
1. **Authorization Code Exchange**: Backend validates code + PKCE verifier, returns access token (keep backend-only)
2. **Session-Based**: Backend issues session cookie/JWT after token exchange; extension uses for API calls
3. **Refresh Token Handling**: PKCE flow provides 24-hour refresh tokens; re-launch `launchWebAuthFlow` before expiry for silent refresh (fails post-restart)
4. **Permissions Required**: Request `identity`, `cookies`, and `storage` permissions in manifest

## Recommendations

1. **Use Authorization Code Flow + PKCE** over Implicit flow for extensions
2. **Implement Backend Token Exchange** - never embed client secrets in extension code
3. **Store Access Tokens in chrome.storage.session** only
4. **Use launchWebAuthFlow over getAuthToken** unless Google-only is acceptable
5. **Handle Refresh Tokens** with pre-restart re-launch or require re-authentication post-restart
6. **Add prompt=select_account** parameter for multi-account support
7. **Verify OAuth Redirect URL** format matches manifest (trailing slash required)
8. **Never expose API keys, client secrets, or long-lived tokens** in extension code

## References

- [Chrome Extensions OAuth2 Manifest Reference](https://developer.chrome.com/docs/extensions/reference/manifest/oauth2)
- [Chrome Identity API Documentation](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [OAuth 2.0 with Google - Chrome Developers](https://developer.chrome.com/docs/extensions/how-to/integrate/oauth)
- [PKCE Protocol - OAuth.net](https://oauth.net/2/pkce/)
- [Best Practices for Token Storage - Curity](https://curity.medium.com/best-practices-for-storing-access-tokens-in-the-browser-6b3d515d9814)
- [Backend-Assisted OAuth with Flask - DEV Community](https://dev.to/saloni28/how-i-built-a-chrome-extension-that-connects-securely-to-a-flask-backend-with-google-oauth-cloud-1307)
- [Chrome Storage API Security](https://developer.chrome.com/docs/extensions/reference/api/storage)

---

**Research Completed**: 2025-12-19 | **Token Efficiency**: 70K tokens | **Conciseness**: 150 lines
