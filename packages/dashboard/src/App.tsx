import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { SessionExpiredModal } from '@/components/auth/SessionExpiredModal';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';
import { router } from './routes';

function AppContent() {
  useTokenRefresh();
  return <RouterProvider router={router} />;
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <SessionExpiredModal />
    </AuthProvider>
  );
}

export default App;
