import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Button } from './ui';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="relative grid h-[calc(100dvh-5rem)] min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3 sm:pb-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-1 lg:gap-3">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden"
        />
      )}

      <div className="glass relative z-[60] flex min-h-11 items-center gap-2 rounded-xl px-2 lg:hidden">
        <Button
          type="button"
          size="icon"
          aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </Button>
        <span className="text-sm font-medium">Navigation</span>
      </div>

      <Sidebar
        mobileOpen={sidebarOpen}
        onNavigate={() => setSidebarOpen(false)}
      />

      <main className="glass row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-white/5 lg:col-start-2 lg:row-start-1">
        <Outlet />
      </main>
    </div>
  );
}