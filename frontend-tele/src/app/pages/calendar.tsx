import { useState } from 'react';
import { useApp } from '../context/app-context';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export function CalendarPage() {
  const { events, expenses } = useApp();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDay = (day: Date) => {
    return events.filter((event) => isSameDay(new Date(event.date), day));
  };

  const getEventStatus = (eventId: string) => {
    const eventExpenses = expenses.filter((e) => e.eventId === eventId);
    if (eventExpenses.length === 0) return 'none';
    const allSettled = eventExpenses.every((e) => e.settled);
    return allSettled ? 'settled' : 'unsettled';
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  return (
    <div className="min-h-screen p-4">
      <div className="mb-6">
        <h1 className="text-2xl mb-1">Calendar</h1>
        <p className="text-sm text-muted-foreground">View events by date</p>
      </div>

      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-6 bg-card rounded-2xl p-4 border border-border">
        <button
          onClick={prevMonth}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl">{format(currentMonth, 'MMMM yyyy')}</h2>
        <button
          onClick={nextMonth}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-card rounded-2xl p-4 border border-border">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center text-sm text-muted-foreground py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={day.toString()}
                className={`aspect-square p-1 rounded-lg ${
                  !isCurrentMonth ? 'opacity-40' : ''
                } ${isToday ? 'bg-primary/10 border border-primary' : ''}`}
              >
                <div className="h-full flex flex-col">
                  <span className={`text-sm text-center ${isToday ? '' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  <div className="flex-1 flex flex-col gap-1 mt-1">
                    {dayEvents.slice(0, 2).map((event) => {
                      const status = getEventStatus(event.id);
                      let gradientClass = 'bg-gradient-to-r from-primary to-secondary';
                      
                      if (status === 'settled') {
                        gradientClass = 'bg-gradient-to-r from-accent to-success';
                      } else if (status === 'unsettled') {
                        gradientClass = 'bg-gradient-to-r from-destructive to-secondary';
                      }
                      
                      return (
                        <Link
                          key={event.id}
                          to={`/events/${event.id}`}
                          className={`w-2/3 h-1 rounded-full ${gradientClass}`}
                          title={event.name}
                        />
                      );
                    })}
                    {dayEvents.length > 2 && (
                      <span className="text-xs text-muted-foreground text-center">
                        +{dayEvents.length - 2}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="mt-6">
        <h3 className="mb-3">Upcoming Hangouts</h3>
        <div className="space-y-3">
          {events
            .filter((event) => new Date(event.date) >= new Date())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 5)
            .map((event) => (
              <Link key={event.id} to={`/events/${event.id}`}>
                <div className="bg-card rounded-2xl p-4 border border-border hover:border-primary transition-all">
                  <h4>{event.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(event.date), 'MMM dd, yyyy')}
                  </p>
                </div>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}