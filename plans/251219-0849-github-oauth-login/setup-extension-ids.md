# Dev/Prod Extension IDs Setup Guide

## Overview

Chrome extensions have unique IDs. The ID changes between:
- **Unpacked (dev)**: Generated from extension path, changes per machine
- **Published (prod)**: Fixed ID assigned by Chrome Web Store

OAuth callback URLs use this ID: `https://<extension-id>.chromiumapp.org/`

## Getting Extension IDs

### Development (Unpacked)

1. Load unpacked extension in `chrome://extensions`
2. Copy the ID shown (e.g., `abcdefghijklmnopqrstuvwxyzabcdef`)
3. Callback URL: `https://abcdefghijklmnopqrstuvwxyzabcdef.chromiumapp.org/`

**Note:** ID changes if you move the extension folder or load on different machine.

### Production (Before Publishing)

Generate a consistent ID using a key:

```bash
# Generate key pair
openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem

# Get extension ID from key
openssl rsa -in key.pem -pubout -outform DER | openssl dgst -sha256 -binary | head -c 32 | base64 | tr '+/' '-_' | cut -c 1-32
```

Add to `manifest.json` for consistent dev ID:
```json
{
  "key": "MIIBIjANBgkqh..."
}
```

### Production (After Publishing)

1. Submit to Chrome Web Store
2. Get assigned ID from dashboard
3. Update OAuth app callback URL

## GitHub OAuth Apps Configuration

### Option A: Single App (Simpler)

Register one OAuth App with multiple callback URLs:
- **Callback URL**: `https://<dev-id>.chromiumapp.org/,https://<prod-id>.chromiumapp.org/`

**Note:** GitHub may not support multiple URLs. Use Option B if needed.

### Option B: Separate Apps (Recommended)

**Development App:**
- Name: `WorkTime Dev`
- Callback: `https://<dev-id>.chromiumapp.org/`
- Client ID → `GITHUB_CLIENT_ID_DEV`

**Production App:**
- Name: `WorkTime`
- Callback: `https://<prod-id>.chromiumapp.org/`
- Client ID → `GITHUB_CLIENT_ID_PROD`

## Environment Configuration

### Backend (wrangler.toml)

```toml
# Development
[env.dev.vars]
GITHUB_CLIENT_ID = "dev_client_id"
ALLOWED_EXTENSION_IDS = "abcdef123456,xyz789abc"

# Production
[env.production.vars]
GITHUB_CLIENT_ID = "prod_client_id"
ALLOWED_EXTENSION_IDS = "prod_extension_id"
```

### Extension (webpack.config.js)

```javascript
const webpack = require('webpack');

module.exports = (env) => ({
  plugins: [
    new webpack.DefinePlugin({
      'process.env.GITHUB_CLIENT_ID': JSON.stringify(
        env.production ? 'prod_client_id' : 'dev_client_id'
      ),
      'process.env.API_BASE_URL': JSON.stringify(
        env.production ? 'https://api.worktime.app' : 'http://localhost:8787'
      ),
    }),
  ],
});
```

Build commands:
```bash
# Development
npm run build:dev   # webpack --env development

# Production
npm run build       # webpack --env production
```

## CORS Validation (Backend)

Optionally validate extension ID in CORS:

```typescript
// packages/backend/src/middleware/cors.ts
const ALLOWED_IDS = (c.env.ALLOWED_EXTENSION_IDS || '').split(',');

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return null;

    // Validate chrome-extension:// origins
    const match = origin.match(/^chrome-extension:\/\/([a-z]{32})$/);
    if (match && ALLOWED_IDS.includes(match[1])) {
      return origin;
    }

    // Allow localhost for development
    if (origin.includes('localhost')) return origin;

    return null;
  },
});
```

## Checklist

### Development Setup
- [ ] Load unpacked extension, note ID
- [ ] Register GitHub OAuth App (dev)
- [ ] Set `GITHUB_CLIENT_ID` in backend dev env
- [ ] Set `GITHUB_CLIENT_ID` in extension dev build
- [ ] Test login flow

### Production Setup
- [ ] Generate consistent extension key (or use Web Store ID)
- [ ] Register GitHub OAuth App (prod)
- [ ] Set `GITHUB_CLIENT_ID` in backend prod env
- [ ] Set `GITHUB_CLIENT_ID` in extension prod build
- [ ] Update `ALLOWED_EXTENSION_IDS` in backend
- [ ] Test login flow in production

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| OAuth redirect fails | Wrong callback URL | Verify extension ID matches OAuth app |
| CORS blocked | Extension ID not allowed | Add ID to `ALLOWED_EXTENSION_IDS` |
| Different ID on each load | No `key` in manifest | Add generated key to manifest.json |
| Login works in dev, not prod | Using dev credentials | Switch to prod OAuth app credentials |
