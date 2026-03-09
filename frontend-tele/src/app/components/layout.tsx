import { Outlet } from 'react-router';
import { BottomNav } from './bottom-nav';

export function Layout() {
  return (
    <div className="h-screen flex flex-col max-w-lg mx-auto bg-background overflow-hidden">
      <main className="flex-1 overflow-y-auto pb-16">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}