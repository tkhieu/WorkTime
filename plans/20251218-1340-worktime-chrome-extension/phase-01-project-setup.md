# Phase 01: Project Setup & Configuration

## Context Links
- [Main Plan](plan.md)
- [Research: Chrome Extension Architecture](research/researcher-01-chrome-extension-architecture.md)
- Next Phase: [Phase 02 - Core Architecture](phase-02-core-architecture.md)

## Overview

**Date:** 2025-12-18
**Description:** Initialize project structure, TypeScript tooling, ESLint, build system, and manifest.json configuration for Manifest V3 Chrome Extension.
**Priority:** High
**Status:** Not Started
**Estimated Time:** 4-6 hours

## Key Insights from Research

- **MV3 Requirements:** Service worker background, no persistent background pages
- **Build Tooling:** Need TypeScript compilation + bundling for service workers
- **Storage First:** All state in chrome.storage, no DOM access in background
- **Manifest Permissions:** tabs, storage, idle, alarms, identity (for OAuth)

## Requirements

### Functional Requirements
- TypeScript project with strict type checking
- ESLint + Prettier for code quality
- Build script to compile TS → JS and bundle for Chrome
- Manifest V3 configuration with correct permissions
- Development vs production build modes

### Non-Functional Requirements
- Fast incremental builds (<5s for development)
- Hot reload support for development
- Source maps for debugging
- Type-safe extension APIs (@types/chrome)

## Architecture

### Project Structure
```
worktime-extension/
├── src/
│   ├── manifest.json          # MV3 manifest
│   ├── background/
│   │   ├── service-worker.ts  # Main service worker entry
│   │   ├── storage-manager.ts # Storage abstraction layer
│   │   └── alarm-manager.ts   # Periodic wake-ups
│   ├── content/
│   │   ├── pr-detector.ts     # GitHub PR detection
│   │   └── visibility-tracker.ts # Page Visibility API
│   ├── popup/
│   │   ├── popup.html         # Popup UI
│   │   ├── popup.ts           # Popup logic
│   │   └── popup.css          # Styling
│   ├── auth/
│   │   ├── github-oauth.ts    # OAuth flow
│   │   └── token-manager.ts   # Token storage/refresh
│   ├── types/
│   │   └── index.ts           # Shared TypeScript types
│   └── utils/
│       └── helpers.ts         # Shared utilities
├── dist/                      # Build output (gitignored)
├── tests/                     # Test files (Phase 07)
├── package.json
├── tsconfig.json
├── .eslintrc.json
├── .prettierrc
├── webpack.config.js          # Build configuration
└── README.md
```

### Technology Stack
- **Language:** TypeScript 5.x
- **Build Tool:** Webpack 5 (alternative: esbuild for faster builds)
- **Linting:** ESLint + @typescript-eslint
- **Formatting:** Prettier
- **Types:** @types/chrome, @types/node

## Related Code Files

### Files to Create
1. `/src/manifest.json` - MV3 manifest with permissions
2. `/package.json` - Dependencies and scripts
3. `/tsconfig.json` - TypeScript configuration
4. `/.eslintrc.json` - ESLint rules
5. `/.prettierrc` - Code formatting rules
6. `/webpack.config.js` - Build configuration
7. `/README.md` - Project documentation
8. `/.gitignore` - Ignore dist, node_modules
9. `/src/types/index.ts` - Shared type definitions

## Implementation Steps

### 1. Initialize Node.js Project
```bash
mkdir worktime-extension && cd worktime-extension
npm init -y
```

### 2. Install Dependencies
```bash
# Core dependencies
npm install --save-dev typescript @types/chrome @types/node

# Build tools
npm install --save-dev webpack webpack-cli ts-loader copy-webpack-plugin

# Linting and formatting
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier

# Development tools
npm install --save-dev webpack-dev-server
```

### 3. Create TypeScript Configuration
**tsconfig.json:**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["chrome", "node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 4. Create Manifest V3 Configuration
**src/manifest.json:**
```json
{
  "manifest_version": 3,
  "name": "WorkTime - PR Tracker",
  "version": "0.1.0",
  "description": "Track time spent reviewing GitHub Pull Requests",
  "permissions": ["tabs", "storage", "idle", "alarms", "identity"],
  "host_permissions": ["https://github.com/*/*"],
  "background": {
    "service_worker": "background/service-worker.js"
  },
  "content_scripts": [
    {
      "matches": ["https://github.com/*/*/pull/*"],
      "js": ["content/pr-detector.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 5. Setup Webpack Build Configuration
**webpack.config.js:**
```javascript
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  entry: {
    'background/service-worker': './src/background/service-worker.ts',
    'content/pr-detector': './src/content/pr-detector.ts',
    'popup/popup': './src/popup/popup.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/popup/popup.css', to: 'popup/popup.css' }
      ]
    })
  ],
  devtool: 'source-map'
};
```

### 6. Configure ESLint
**.eslintrc.json:**
```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "plugins": ["@typescript-eslint", "prettier"],
  "rules": {
    "prettier/prettier": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  },
  "env": {
    "browser": true,
    "webextensions": true,
    "es2020": true
  }
}
```

### 7. Add NPM Scripts
**package.json (scripts section):**
```json
{
  "scripts": {
    "build": "webpack --mode production",
    "build:dev": "webpack --mode development",
    "watch": "webpack --mode development --watch",
    "lint": "eslint 'src/**/*.{ts,tsx}'",
    "lint:fix": "eslint 'src/**/*.{ts,tsx}' --fix",
    "format": "prettier --write 'src/**/*.{ts,tsx,json,css,html}'",
    "typecheck": "tsc --noEmit"
  }
}
```

### 8. Create Placeholder Files
Create empty TypeScript files for structure:
```bash
mkdir -p src/{background,content,popup,auth,types,utils}
touch src/background/service-worker.ts
touch src/content/pr-detector.ts
touch src/popup/popup.ts
touch src/types/index.ts
```

### 9. Add .gitignore
```
node_modules/
dist/
*.log
.DS_Store
.env
```

### 10. Initial Build Test
```bash
npm run build:dev
```

Verify `dist/` folder created with compiled JS files.

## Todo List

- [ ] Initialize npm project
- [ ] Install TypeScript, Webpack, ESLint dependencies
- [ ] Create tsconfig.json with strict mode
- [ ] Create manifest.json with MV3 permissions
- [ ] Setup Webpack configuration for bundling
- [ ] Configure ESLint + Prettier
- [ ] Add npm build scripts
- [ ] Create project folder structure
- [ ] Create placeholder TypeScript files
- [ ] Add .gitignore
- [ ] Test initial build (npm run build:dev)
- [ ] Verify dist/ output contains service-worker.js
- [ ] Load extension in Chrome to test manifest

## Success Criteria

- [ ] `npm run build:dev` completes without errors
- [ ] `dist/` folder contains compiled JS + manifest.json
- [ ] Extension loads in Chrome (chrome://extensions)
- [ ] No manifest errors in Chrome extension management page
- [ ] TypeScript strict mode enabled
- [ ] ESLint runs without errors

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Webpack config complexity | Medium | Medium | Use minimal config, copy official MV3 templates |
| Missing @types/chrome definitions | Low | Medium | Install latest @types/chrome package |
| Build time too slow | Low | Low | Consider esbuild as alternative if >10s builds |

## Security Considerations

- **No secrets in manifest:** GitHub OAuth client ID added in Phase 05
- **Content Security Policy:** MV3 enforces strict CSP by default
- **Permissions minimization:** Only request essential permissions
- **Source maps:** Separate source maps for debugging (not in production build)

## Next Steps

- Phase 02: Implement service worker architecture
- Phase 02: Create storage manager module
- Phase 02: Setup alarm manager for periodic wake-ups
