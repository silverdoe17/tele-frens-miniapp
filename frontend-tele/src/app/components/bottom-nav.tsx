import { Home, Calendar, Receipt } from 'lucide-react';
import { Link, useLocation } from 'react-router';

export function BottomNav() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="shrink-0 bg-card border-t border-border">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        <Link
          to="/"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive('/')
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Home className="w-6 h-6" />
          <span className="text-xs mt-1">Hangouts</span>
        </Link>
        <Link
          to="/calendar"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive('/calendar')
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Calendar className="w-6 h-6" />
          <span className="text-xs mt-1">Calendar</span>
        </Link>
        <Link
          to="/settlements"
          className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
            isActive('/settlements')
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt className="w-6 h-6" />
          <span className="text-xs mt-1">Settlements</span>
        </Link>
      </div>
    </nav>
  );
}
