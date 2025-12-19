import { createBrowserRouter } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout';
import { Dashboard, Sessions, Settings } from '@/pages';

export const router = createBrowserRouter([
  {
    element: <DashboardLayout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/sessions', element: <Sessions /> },
      { path: '/settings', element: <Settings /> },
    ],
  },
]);
