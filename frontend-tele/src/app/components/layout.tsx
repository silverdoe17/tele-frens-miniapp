import { Outlet } from 'react-router';
import { BottomNav } from './bottom-nav';

export function Layout() {
  return (
    <div className="h-dvh flex flex-col max-w-lg mx-auto bg-background overflow-hidden">
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <footer className="shrink-0 border-t border-border/60 bg-background px-4 py-2 text-center text-[11px] text-muted-foreground">
        v{__APP_VERSION__} - {new Date(__BUILD_TIME__).toLocaleString()}
      </footer>
      <BottomNav />
    </div>
  );
}
