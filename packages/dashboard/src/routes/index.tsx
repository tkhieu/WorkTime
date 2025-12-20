import { createBrowserRouter } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout';
import { ProtectedRoute } from '@/components/auth';
import { Dashboard, Sessions, Settings, Login, AuthCallback } from '@/pages';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/auth/callback',
    element: <AuthCallback />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: '/', element: <Dashboard /> },
          { path: '/sessions', element: <Sessions /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
    ],
  },
]);
