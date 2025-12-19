import { NavLink } from 'react-router-dom';

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
  return (
    <aside
      className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] bg-slate-900 border-r border-slate-800 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <nav className="p-2">
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

      <button
        onClick={onToggle}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 p-2 text-slate-400 hover:text-slate-200"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '→' : '←'}
      </button>
    </aside>
  );
}
