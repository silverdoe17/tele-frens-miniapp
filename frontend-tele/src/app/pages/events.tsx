import { Link } from 'react-router';
import { Plus, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../context/app-context';
import { format } from 'date-fns';

export function EventsPage() {
  const { events, expenses } = useApp();

  const getEventStatus = (eventId: string) => {
    const eventExpenses = expenses.filter((e) => e.eventId === eventId);
    if (eventExpenses.length === 0) return 'none';
    const allSettled = eventExpenses.every((e) => e.settled);
    return allSettled ? 'settled' : 'unsettled';
  };

  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="min-h-screen p-4">
      <div className="mb-6">
        <h1 className="text-2xl mb-1">Hangouts</h1>
        <p className="text-sm text-muted-foreground">Your group hangouts</p>
      </div>

      <div className="space-y-3">
        {sortedEvents.map((event) => {
          const status = getEventStatus(event.id);
          return (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              className="block"
            >
              <div className="bg-card rounded-2xl p-4 border border-border hover:border-primary transition-all shadow-sm hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg mb-1">{event.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(event.date), 'MMM dd, yyyy')}
                    </p>
                    <div className="flex gap-1 mt-2">
                      {event.participants.slice(0, 3).map((p) => (
                        <div
                          key={p.id}
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-xs"
                        >
                          {p.name[0]}
                        </div>
                      ))}
                      {event.participants.length > 3 && (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">
                          +{event.participants.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    {status === 'settled' && (
                      <CheckCircle2 className="w-5 h-5 text-success" />
                    )}
                    {status === 'unsettled' && (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <Link
        to="/events/create"
        className="fixed bottom-20 right-4 w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all text-white"
      >
        <Plus className="w-6 h-6" />
      </Link>
    </div>
  );
}