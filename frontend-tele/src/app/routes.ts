import { createBrowserRouter } from 'react-router';
import { Layout } from './components/layout';
import { EventsPage } from './pages/events';
import { EventDetailsPage } from './pages/event-details';
import { ExpensesPage } from './pages/expenses';
import { CreateEventPage } from './pages/create-event';
import { CreateExpensePage } from './pages/create-expense';
import { EditExpensePage } from './pages/edit-expense';
import { CalendarPage } from './pages/calendar';
import { SettlementsPage } from './pages/settlements';

const basePath =
  import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/'
    ? import.meta.env.BASE_URL.replace(/\/$/, '')
    : undefined;

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: EventsPage },
      { path: 'events/create', Component: CreateEventPage },
      { path: 'events/:id', Component: EventDetailsPage },
      { path: 'events/:id/expenses', Component: ExpensesPage },
      { path: 'events/:id/expenses/create', Component: CreateExpensePage },
      { path: 'events/:id/expenses/:expenseId/edit', Component: EditExpensePage },
      { path: 'calendar', Component: CalendarPage },
      { path: 'settlements', Component: SettlementsPage },
    ],
  },
], {
  basename: basePath,
});
