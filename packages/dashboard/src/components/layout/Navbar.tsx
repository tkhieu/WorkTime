import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface NavbarProps {
  onMenuClick: () => void;
}

function ChevronDown() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

export function Navbar({ onMenuClick }: NavbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getUserInitial = () => {
    return user?.github_username?.charAt(0).toUpperCase() || 'U';
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 z-50">
      <button
        onClick={onMenuClick}
        className="p-2 text-slate-400 hover:text-slate-200 md:hidden"
        aria-label="Toggle menu"
      >
        ☰
      </button>

      <div className="flex items-center gap-2 ml-2 md:ml-0">
        <span className="text-xl">⏱️</span>
        <h1 className="text-lg font-semibold text-slate-100">WorkTime</h1>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {user && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors"
            >
              {user.github_avatar_url ? (
                <img
                  src={user.github_avatar_url}
                  alt={user.github_username}
                  className="w-7 h-7 rounded-full"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-sm font-medium text-white">
                  {getUserInitial()}
                </div>
              )}
              <span className="text-sm text-slate-200 hidden sm:inline">
                {user.github_username}
              </span>
              <ChevronDown />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1">
                <div className="px-4 py-2 border-b border-slate-700">
                  <p className="text-sm font-medium text-slate-200">
                    {user.github_username}
                  </p>
                  {user.email && (
                    <p className="text-xs text-slate-400 truncate">
                      {user.email}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
