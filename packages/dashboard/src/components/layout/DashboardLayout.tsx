import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';

const SIDEBAR_COLLAPSED_KEY = 'worktime-sidebar-collapsed';

export function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === 'true';
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const toggleSidebar = () => setCollapsed((prev) => !prev);
  const toggleMobile = () => setMobileOpen((prev) => !prev);

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar onMenuClick={toggleMobile} />

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={toggleMobile}
        />
      )}

      {/* Sidebar - hidden on mobile unless open */}
      <div className={`hidden md:block`}>
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      </div>

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 md:hidden transition-transform ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar collapsed={false} onToggle={toggleMobile} />
      </div>

      {/* Main content */}
      <main
        className={`pt-14 transition-all duration-300 ${
          collapsed ? 'md:ml-16' : 'md:ml-64'
        }`}
      >
        <div className="p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
