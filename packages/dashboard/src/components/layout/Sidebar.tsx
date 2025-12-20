import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/sessions', label: 'Sessions', icon: '⏱️' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-slate-900 border-r border-slate-800 transition-all duration-300 flex flex-col ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <nav className="p-2 flex-1">
        {navItems.map(({ path, label, icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                isActive
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            <span className="text-xl">{icon}</span>
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-slate-800">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <span className="text-xl">🚪</span>
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>

      <button
        onClick={onToggle}
        className="p-2 text-slate-400 hover:text-slate-200 border-t border-slate-800"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '→' : '←'}
      </button>
    </aside>
  );
}
