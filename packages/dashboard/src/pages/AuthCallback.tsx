import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function AuthCallback() {
  const [searchParams] = useSearchParams();
  const { handleOAuthCallback } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('GitHub authentication was denied');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      if (!code) {
        setError('No authorization code received');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
      if (!codeVerifier) {
        setError('Invalid session - please try logging in again');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      try {
        await handleOAuthCallback(code, codeVerifier);
        navigate('/');
      } catch (err) {
        console.error('OAuth callback error:', err);
        setError('Authentication failed - please try again');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    processCallback();
  }, [searchParams, handleOAuthCallback, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-4 p-8 text-center">
        {error ? (
          <>
            <div className="text-red-600 font-semibold">
              {error}
            </div>
            <div className="text-sm text-gray-600">
              Redirecting to login...
            </div>
          </>
        ) : (
          <>
            <div className="text-gray-900 font-semibold">
              Completing authentication...
            </div>
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
