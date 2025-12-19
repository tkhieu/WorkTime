# Phase 01: Package Setup

**Parent Plan**: [plan.md](./plan.md)
**Dependencies**: None

## Overview

| Field | Value |
|-------|-------|
| Date | 2025-12-20 |
| Description | Create dashboard package with Vite + React + Tailwind |
| Priority | High |
| Estimated Time | 30 min |

---

## Steps

### Step 1: Create Directory Structure

```bash
mkdir -p packages/dashboard/src/{api,components,features,pages,routes}
mkdir -p packages/dashboard/src/components/{ui,layout}
```

### Step 2: Create package.json

File: `packages/dashboard/package.json`

```json
{
  "name": "@worktime/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@worktime/shared": "workspace:*",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.28.0",
    "@tanstack/react-query": "^5.51.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "@tailwindcss/vite": "^4.0.0-beta.8",
    "tailwindcss": "^4.0.0-beta.8",
    "vite": "^5.4.0",
    "typescript": "^5.7.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

### Step 3: Create vite.config.ts

File: `packages/dashboard/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
```

### Step 4: Create tsconfig.json

File: `packages/dashboard/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

### Step 5: Create Entry Files

File: `packages/dashboard/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WorkTime Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

File: `packages/dashboard/src/main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
```

File: `packages/dashboard/src/App.tsx`

```typescript
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';

function App() {
  return <RouterProvider router={router} />;
}

export default App;
```

File: `packages/dashboard/src/index.css`

```css
@import "tailwindcss";

/* Dark mode base */
:root {
  @apply bg-slate-950 text-slate-50;
}

/* Custom scrollbar for dark mode */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  @apply bg-slate-900;
}

::-webkit-scrollbar-thumb {
  @apply bg-slate-700 rounded;
}
```

### Step 6: Create Placeholder Router

File: `packages/dashboard/src/routes/index.tsx`

```typescript
import { createBrowserRouter } from 'react-router-dom';

// Placeholder - will be replaced in Phase 2
export const router = createBrowserRouter([
  {
    path: '/',
    element: <div className="p-8 text-center">WorkTime Dashboard - Setup Complete</div>,
  },
]);
```

### Step 7: Create wrangler.toml

File: `packages/dashboard/wrangler.toml`

```toml
name = "worktime-dashboard"
pages_build_output_dir = "dist"
compatibility_date = "2025-12-20"

[env.production]
vars = { VITE_API_BASE_URL = "https://worktime-api.your-domain.workers.dev" }

[env.preview]
vars = { VITE_API_BASE_URL = "https://worktime-api.your-domain.workers.dev" }
```

### Step 8: Create SPA Redirect

File: `packages/dashboard/public/_redirects`

```
/* /index.html 200
```

### Step 9: Install Dependencies

```bash
pnpm install
```

---

## Verification

```bash
# Start dev server
pnpm --filter @worktime/dashboard dev

# Should see:
# VITE v5.4.x ready in xxx ms
# Local: http://localhost:5173/
```

Open http://localhost:5173 - should see "WorkTime Dashboard - Setup Complete"

---

## Success Criteria

- [ ] `packages/dashboard/` directory exists with all files
- [ ] `pnpm install` completes without errors
- [ ] `pnpm --filter @worktime/dashboard dev` starts Vite server
- [ ] Browser shows placeholder text at localhost:5173
- [ ] TypeScript compiles without errors

---

## Files Created

| File | Purpose |
|------|---------|
| `package.json` | Package config with dependencies |
| `vite.config.ts` | Vite + React + Tailwind + proxy |
| `tsconfig.json` | TypeScript strict config |
| `index.html` | HTML entry point |
| `src/main.tsx` | React entry with QueryClient |
| `src/App.tsx` | Root component with RouterProvider |
| `src/index.css` | Tailwind + dark mode base |
| `src/routes/index.tsx` | Router placeholder |
| `wrangler.toml` | Cloudflare Pages config |
| `public/_redirects` | SPA routing for Pages |

---

## Next Phase

[Phase 02: Core Layout](./phase-02-core-layout.md)
