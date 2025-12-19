interface NavbarProps {
  onMenuClick: () => void;
}

export function Navbar({ onMenuClick }: NavbarProps) {
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
        <span className="text-sm text-slate-400">Dashboard</span>
      </div>
    </header>
  );
}
