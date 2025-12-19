# Vite + React pnpm Monorepo for Cloudflare Pages

**Date:** 2025-12-20 | **Research Duration:** Concurrent multi-source analysis

## Executive Summary

Vite + React in pnpm monorepo provides optimal DX with workspace:* dependency linking and seamless Cloudflare Pages integration. Key: pnpm-workspace.yaml, workspace protocol, shared package via @worktime/shared symlinks, TanStack Query for API state, React Router v6 for navigation. Deploy via wrangler.toml with pages_build_output_dir pointing to dist/.

---

## Key Configuration Files & Setup

### 1. Root pnpm-workspace.yaml
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 2. Package Dependency Linking
Use `workspace:*` protocol (NOT version strings):
```json
{
  "dependencies": {
    "@worktime/shared": "workspace:*",
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

pnpm creates symlinks in node_modules, enabling real-time updates without re-publishing. Shared packages marked `private: true` in package.json.

### 3. Root package.json Scripts
```json
{
  "scripts": {
    "dev": "pnpm --filter apps/dashboard dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "type-check": "pnpm -r type-check"
  }
}
```

Use `--filter <package>` for specific workspace, `-r` for recursive all.

### 4. App vite.config.ts
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@worktime/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
```

### 5. Cloudflare Pages wrangler.toml
```toml
name = "worktime-dashboard"
pages_build_output_dir = "dist"
compatibility_date = "2025-12-20"

[env.production]
vars = { API_BASE_URL = "https://api.worktime.app" }

[env.staging]
vars = { API_BASE_URL = "https://staging-api.worktime.app" }
```

Key points:
- `pages_build_output_dir` tells Cloudflare where built app lives
- Environments via [env.name] for preview/production
- Local dev uses wrangler via `wrangler pages dev`

---

## Monorepo Architecture

```
worktime-monorepo/
├── apps/
│   └── dashboard/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   └── hooks/
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   ├── types/
│       │   ├── hooks/
│       │   ├── utils/
│       │   └── index.ts
│       ├── tsconfig.json
│       └── package.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Critical Dependencies

### Dashboard App (apps/dashboard/package.json)
```json
{
  "dependencies": {
    "@worktime/shared": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.28.0",
    "@tanstack/react-query": "^5.51.0",
    "@tanstack/react-query-devtools": "^5.51.0",
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0",
    "typescript": "^5.7.0"
  }
}
```

### Shared Package (packages/shared/package.json)
```json
{
  "name": "@worktime/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^5.4.0"
  }
}
```

---

## TanStack Query Setup

### Query Client (src/lib/queryClient.ts)
```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});
```

### Provider Setup (src/main.tsx)
```typescript
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
```

### Custom Hook (src/hooks/useWorkLogs.ts)
```typescript
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export const useWorkLogs = () => {
  return useQuery({
    queryKey: ['workLogs'],
    queryFn: async () => {
      const { data } = await axios.get('/api/work-logs');
      return data;
    },
  });
};
```

---

## React Router v6 Setup

### Router Configuration (src/router.tsx)
```typescript
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from './layouts/Layout';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/settings', element: <Settings /> },
    ],
  },
]);

export function Router() {
  return <RouterProvider router={router} />;
}
```

### App Entry (src/App.tsx)
```typescript
import { Router } from './router';

export default function App() {
  return <Router />;
}
```

---

## Shared Package Import Example

### Export from shared (packages/shared/src/index.ts)
```typescript
export { useAuthContext } from './hooks/useAuthContext';
export { formatTime } from './utils/time';
export type { WorkLog } from './types';
```

### Import in dashboard (apps/dashboard/src/pages/Dashboard.tsx)
```typescript
import { useAuthContext, formatTime } from '@worktime/shared';

export function Dashboard() {
  const { user } = useAuthContext();
  return <div>{formatTime(new Date())}</div>;
}
```

---

## Build & Deploy Workflow

### Local Development
```bash
pnpm install
pnpm dev  # Starts dashboard on localhost:5173
```

### Build for Cloudflare Pages
```bash
pnpm build  # Builds all packages recursively
```

Outputs to `apps/dashboard/dist/` (specified in wrangler.toml).

### Deploy Preview
```bash
wrangler pages dev apps/dashboard/dist
```

### Deploy to Production
```bash
wrangler pages deploy apps/dashboard/dist --project-name worktime-dashboard
```

---

## Best Practices

1. **Workspace Protocol**: Always use `workspace:*` for internal packages (not version strings)
2. **Peer Dependencies**: Shared libs should declare React as peerDependency
3. **TypeScript Paths**: Configure tsconfig.json with paths for clean imports
4. **Build Outputs**: Shared packages must export dist/ with both .js and .d.ts files
5. **Monorepo Scripts**: Root scripts use `--filter` or `-r` for clarity
6. **Environment Vars**: Use wrangler.toml [env.name] sections, NOT .env files in production
7. **Dev Tools**: Install @tanstack/react-query-devtools for debugging cache

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Shared package not resolving | Verify pnpm-workspace.yaml includes packages path; run `pnpm install` |
| ESM/CJS mismatch | Ensure shared package has `"type": "module"` and exports .js files |
| Vite not seeing shared changes | Vite auto-resolves symlinks; restart dev server if stale |
| wrangler.toml not applying | Ensure pages_build_output_dir matches actual dist location |
| Route not loading on Pages | Check Cloudflare Pages routing rules; add _redirects file if SPA |

---

## Unresolved Questions

- Optimal tree-shaking strategy for shared package across multiple apps?
- Best practices for shared component testing in monorepo?
- Performance impact of workspace symlinks on build time at scale?

---

## Sources

- [React Monorepo Setup Tutorial with pnpm and Vite](https://dev.to/lico/react-monorepo-setup-tutorial-with-pnpm-and-vite-react-project-ui-utils-5705)
- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [Cloudflare Pages Functions & wrangler Configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Integrating React Query with Vite](https://pavankumar-patruni.medium.com/integrating-react-query-with-react-typescript-and-vite-1c23464ef9a0)
- [React Router Installation & Setup](https://reactrouter.com/start/declarative/installation)
- [Master React Router + Vite + TSX: The 2025 Step-by-Step](https://junkangworld.com/blog/master-react-router-vite-tsx-the-2025-step-by-step)
