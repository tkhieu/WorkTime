# WorkTime Chrome Extension

Track time spent reviewing GitHub Pull Requests with OAuth authentication.

## Project Status

### ✅ Completed Phases

- **Phase 05: GitHub OAuth** - OAuth 2.0 authentication with PKCE
- **Phase 06: Popup UI** - User interface for tracking display

### 🚧 Pending Phases

- **Phase 01:** Project setup and build configuration
- **Phase 02:** Core architecture (service worker, storage manager)
- **Phase 03:** PR detection (content script)
- **Phase 04:** Activity tracking (idle detection, timers)
- **Phase 07:** Testing and polish

## Directory Structure

```
src/
├── auth/
│   ├── token-manager.ts     ✅ Token storage and validation
│   └── github-oauth.ts      ✅ OAuth 2.0 flow with PKCE
├── background/
│   └── service-worker.ts    🚧 Service worker with OAuth handlers
├── content/
│   └── pr-detector.ts       🚧 PR detection (placeholder)
├── popup/
│   ├── popup.html          ✅ Popup interface
│   ├── popup.css           ✅ Styling
│   └── popup.ts            ✅ UI logic and real-time updates
└── types/
    └── index.ts            ✅ TypeScript type definitions
```

## Phase 05-06 Implementation

### GitHub OAuth (Phase 05)

**Files:**
- `src/auth/token-manager.ts` - Token storage in chrome.storage.local
- `src/auth/github-oauth.ts` - OAuth flow with PKCE
- `src/types/index.ts` - GitHubAuth type definition

**Features:**
- PKCE code verifier/challenge generation
- chrome.identity.launchWebAuthFlow() integration
- Token exchange via GitHub API
- User info fetching from /user endpoint
- Secure token storage

**Configuration Required:**
1. Register GitHub OAuth App at https://github.com/settings/developers
2. Replace placeholders in `github-oauth.ts`:
   - `GITHUB_CLIENT_ID` - Your OAuth App Client ID
   - `GITHUB_CLIENT_SECRET` - Your OAuth App Client Secret
3. Set redirect URI to: `chrome-extension://<extension-id>/`

### Popup UI (Phase 06)

**Files:**
- `src/popup/popup.html` - HTML structure
- `src/popup/popup.css` - Modern gradient design
- `src/popup/popup.ts` - UI logic with real-time updates

**Features:**
- Login/logout flow
- User profile display (avatar, name)
- Current tracking status with live timer
- Today's statistics (total time, PR count)
- Recent sessions list (last 5)
- Settings panel:
  - Idle threshold slider (30-300s)
  - Auto-pause toggle
  - Clear history button

## Setup Instructions

### 1. Install Dependencies

```bash
# TODO: Add package.json and build configuration (Phase 01)
npm install
```

### 2. Configure GitHub OAuth

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in details:
   - Name: WorkTime PR Tracker
   - Homepage: https://github.com/your-username/worktime
   - Callback URL: Get from chrome.identity.getRedirectURL()
4. Copy Client ID and Client Secret
5. Update `src/auth/github-oauth.ts` with your credentials

### 3. Build Extension

```bash
# TODO: Add build scripts (Phase 01)
npm run build
```

### 4. Load in Chrome

1. Open chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder
5. Note the extension ID for OAuth callback configuration

## Usage

1. Click extension icon to open popup
2. Click "Connect GitHub" to authenticate
3. Authorize the app on GitHub
4. View tracking status and statistics
5. Adjust settings as needed

## API Integration

### Message Types

The extension uses Chrome message passing for communication:

```typescript
// GitHub OAuth
chrome.runtime.sendMessage({ type: 'GITHUB_LOGIN' })
chrome.runtime.sendMessage({ type: 'GITHUB_LOGOUT' })
chrome.runtime.sendMessage({ type: 'GITHUB_STATUS' })

// Tracking Status
chrome.runtime.sendMessage({ type: 'GET_STATUS' })
```

### Storage Schema

```typescript
chrome.storage.local:
  - github_auth: GitHubAuth
  - sessions: { [id: string]: TrackingSession }
  - dailyStats: { [date: string]: DailyStats }
  - settings: UserSettings
  - pkce_code_verifier: string (temporary)
```

## Security Considerations

- PKCE flow for public OAuth clients
- Tokens stored in chrome.storage.local (not localStorage)
- No inline scripts (MV3 CSP compliant)
- XSS protection (textContent, not innerHTML)
- HTTPS-only API calls

## Next Steps

1. **Phase 01:** Setup build system (Webpack/TypeScript)
2. **Phase 03:** Implement PR detection content script
3. **Phase 04:** Add activity tracking and timers
4. **Phase 07:** Comprehensive testing and polish

## Development Notes

- Manifest V3 service worker architecture
- TypeScript strict mode enabled
- Real-time UI updates via chrome.storage.onChanged
- Idle detection via chrome.idle API
- OAuth token validation on startup

## License

MIT
