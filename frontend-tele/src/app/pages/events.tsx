import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { Plus, CheckCircle2, XCircle, Trash2 } from 'lucide-react';
import { useApp } from '../context/app-context';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

export function EventsPage() {
  const { events, expenses, deleteEvent } = useApp();
  const [swipedEventId, setSwipedEventId] = useState<string | null>(null);
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);

  const getEventStatus = (eventId: string) => {
    const eventExpenses = expenses.filter((e) => e.eventId === eventId);
    if (eventExpenses.length === 0) return 'none';
    const allSettled = eventExpenses.every((e) => e.settled);
    return allSettled ? 'settled' : 'unsettled';
  };

  const sortedEvents = [...events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const handleTouchStart = (e: React.TouchEvent, eventId: string) => {
    touchStartX.current = e.touches[0].clientX;
    if (swipedEventId && swipedEventId !== eventId) {
      setSwipedEventId(null);
    }
  };

  const handleTouchMove = (e: React.TouchEvent, eventId: string) => {
    const diff = touchStartX.current - e.touches[0].clientX;
    if (diff > 45) {
      setSwipedEventId(eventId);
    } else if (diff < -20) {
      setSwipedEventId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteEventId) return;
    await deleteEvent(deleteEventId);
    setDeleteEventId(null);
    setSwipedEventId(null);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="mb-6">
        <h1 className="text-2xl mb-1">Hangouts</h1>
        <p className="text-sm text-muted-foreground">Your group hangouts</p>
      </div>

      <div className="space-y-3">
        {sortedEvents.map((event) => {
          const status = getEventStatus(event.id);
          const isSwiped = swipedEventId === event.id;

          return (
            <div key={event.id} className="relative overflow-hidden rounded-2xl">
              <button
                type="button"
                onClick={() => setDeleteEventId(event.id)}
                className="absolute right-0 top-0 h-full w-20 bg-destructive text-destructive-foreground flex items-center justify-center"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              <Link
                to={`/events/${event.id}`}
                onTouchStart={(e) => handleTouchStart(e, event.id)}
                onTouchMove={(e) => handleTouchMove(e, event.id)}
                onClick={() => {
                  if (isSwiped) {
                    setSwipedEventId(null);
                  }
                }}
                className={`block transition-transform duration-200 ${isSwiped ? '-translate-x-20' : 'translate-x-0'}`}
              >
                <div className="bg-card rounded-2xl p-4 border border-border hover:border-primary transition-all shadow-sm hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg mb-1">{event.name}</h3>
                      <p className="text-sm text-muted-foreground">{format(new Date(event.date), 'MMM dd, yyyy')}</p>
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
                      {status === 'settled' && <CheckCircle2 className="w-5 h-5 text-success" />}
                      {status === 'unsettled' && <XCircle className="w-5 h-5 text-destructive" />}
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      <Link
        to="/events/create"
        className="fixed bottom-20 right-4 w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all text-white"
      >
        <Plus className="w-6 h-6" />
      </Link>

      <AlertDialog open={!!deleteEventId} onOpenChange={() => setDeleteEventId(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Hangout</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this hangout? All related expenses and settlements will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
