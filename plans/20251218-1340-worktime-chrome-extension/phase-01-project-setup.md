# Phase 01: Project Setup & Configuration

## Context Links
- [Main Plan](plan.md)
- [Research: Chrome Extension Architecture](research/researcher-01-chrome-extension-architecture.md)
- Next Phase: [Phase 02 - Core Architecture](phase-02-core-architecture.md)

## Overview

**Date:** 2025-12-18
**Description:** Initialize monorepo structure with pnpm workspaces, TypeScript tooling, ESLint, build system for Chrome Extension (MV3) and Cloudflare Workers backend. Establish shared types package.
**Priority:** High
**Status:** Not Started
**Estimated Time:** 6-8 hours

## Key Insights from Research

**Extension (MV3):**
- Service worker background, no persistent pages
- TypeScript + bundling for MV3 compatibility
- Manifest permissions: tabs, storage, idle, alarms, identity

**Backend (Cloudflare):**
- Workers with Hono.js framework
- D1 for SQLite storage, KV for tokens
- Wrangler for development and deployment

**Monorepo:**
- pnpm workspaces for shared types
- Separate build pipelines per package
- Shared TypeScript config with overrides

## Requirements

### Functional Requirements
- pnpm workspace monorepo with 3 packages (extension, backend, shared)
- TypeScript with strict mode across all packages
- ESLint + Prettier for code quality
- Extension build with Webpack for MV3 bundling
- Backend build with Wrangler for Cloudflare Workers
- Shared types package consumed by both extension and backend
- Development vs production build modes per package

### Non-Functional Requirements
- Fast incremental builds (<5s per package)
- Hot reload for extension development
- Source maps for debugging all packages
- Type-safe APIs (@types/chrome, Hono types)

## Architecture

### Project Structure
```
worktime/
├── packages/
│   ├── extension/              # Chrome Extension
│   │   ├── src/
│   │   │   ├── manifest.json
│   │   │   ├── background/
│   │   │   ├── content/
│   │   │   ├── popup/
│   │   │   └── auth/
│   │   ├── dist/               # Build output
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── webpack.config.js
│   ├── backend/                # Cloudflare Workers
│   │   ├── src/
│   │   │   ├── index.ts        # Hono.js app entry
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   └── db/
│   │   ├── migrations/         # D1 migrations
│   │   ├── tests/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── wrangler.toml
│   └── shared/                 # Shared types
│       ├── src/
│       │   ├── types/
│       │   └── utils/
│       ├── package.json
│       └── tsconfig.json
├── package.json                # Root workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json          # Base TS config
├── .eslintrc.json
├── .prettierrc
└── README.md
```

### Technology Stack
**Extension:**
- TypeScript 5.x + Webpack 5 for bundling
- @types/chrome for type safety

**Backend:**
- TypeScript 5.x + Wrangler for Workers
- Hono.js framework (14kB, edge-optimized)

**Monorepo:**
- pnpm workspaces for package management
- Shared ESLint + Prettier configs
- Shared base tsconfig.json

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
