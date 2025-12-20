import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function SessionExpiredModal() {
  const [show, setShow] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener('session-expired', handler);
    return () => window.removeEventListener('session-expired', handler);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-sm mx-4">
        <h2 className="text-lg font-semibold text-slate-100 mb-2">Session Expired</h2>
        <p className="text-slate-400 mb-4">
          Your session has expired. Please sign in again to continue.
        </p>
        <button
          onClick={() => { setShow(false); login(); }}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
        >
          Sign In Again
        </button>
      </div>
    </div>
  );
}

export function notifySessionExpired() {
  window.dispatchEvent(new CustomEvent('session-expired'));
}
