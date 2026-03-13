import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Event, Expense, Participant, Settlement } from '../types';

interface AppContextType {
  events: Event[];
  expenses: Expense[];
  settlements: Settlement[];
  participants: Participant[];
  addEvent: (event: Event) => Promise<void>;
  updateEvent: (id: string, event: Partial<Event>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  addExpense: (expense: Expense) => Promise<void>;
  updateExpense: (id: string, expense: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addSettlement: (settlement: Settlement) => Promise<void>;
  settleExpenses: (_expenseIds: string[]) => void;
  addParticipant: (participantOrEventId: Participant | string, maybeName?: string) => Promise<void>;
}

interface SessionResponse {
  validated: boolean;
  user: {
    id: number;
    username: string | null;
    display_name: string;
  };
  group_chat_id: number | null;
  groups: Array<{ chat_id: number; title: string; type: string }>;
}

type HangoutApi = {
  id: number;
  name: string;
  date: string;
  location?: string;
  settled?: boolean;
  participants?: string[];
};

type ExpenseApi = {
  id: number;
  description: string;
  total_amount: number;
  paid_by: string;
  splits: Record<string, number>;
  created_at?: string;
};

type DetailApi = {
  hangout: HangoutApi;
  expenses: ExpenseApi[];
  settled_payments: Array<{
    id: number;
    from_person: string;
    to_person: string;
    amount: number;
    created_at?: string;
  }>;
  to_settle: Array<{ from: string; to: string; amount: number }>;
  settled: boolean;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

function slugifyName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function participantFromName(name: string): Participant {
  const trimmed = String(name || '').trim();
  return { id: slugifyName(trimmed) || trimmed, name: trimmed };
}

function splitEqually(total: number, names: string[]) {
  const validNames = names.filter(Boolean);
  const splits: Record<string, number> = {};
  if (!validNames.length) return splits;

  const base = Math.floor((total / validNames.length) * 100) / 100;
  let remainder = Number((total - base * validNames.length).toFixed(2));
  for (const name of validNames) {
    let amount = base;
    if (remainder > 0.0001) {
      amount = Number((amount + 0.01).toFixed(2));
      remainder = Number((remainder - 0.01).toFixed(2));
    }
    splits[name] = amount;
  }
  return splits;
}

function withGroup(path: string, groupChatId: number | null) {
  if (!groupChatId) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}group_chat_id=${groupChatId}`;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeGroupChatId, setActiveGroupChatId] = useState<number | null>(null);
  const [currentUserName, setCurrentUserName] = useState('You');

  const env = useMemo(() => {
    const tg = (window as any)?.Telegram?.WebApp;
    if (tg) {
      tg.ready?.();
      tg.expand?.();
    }

    const qs = new URLSearchParams(window.location.search);
    const apiBase =
      qs.get('api')?.replace(/\/$/, '') ||
      (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ||
      `${window.location.origin.replace(/\/$/, '')}/api`;

    const tgUser = tg?.initDataUnsafe?.user;
    const defaultName = tgUser?.username
      ? `@${tgUser.username}`
      : [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') || 'You';

    return {
      apiBase,
      initData: qs.get('init_data') || tg?.initData || '',
      requestedGroupChatId: Number(qs.get('group_chat_id') || 0) || null,
      fallbackUserName: String(qs.get('user_name') || defaultName).trim(),
    };
  }, []);

  const api = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (env.initData) {
      headers.set('X-Telegram-Init-Data', env.initData);
    }

    const res = await fetch(`${env.apiBase}${path}`, { ...options, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const refresh = async () => {
    const mePath = env.requestedGroupChatId ? `/me?group_chat_id=${env.requestedGroupChatId}` : '/me';
    const session = await api<SessionResponse>(mePath);
    const scopedGroupId = Number(session.group_chat_id || env.requestedGroupChatId || 0) || null;
    const scopedUserName = session.user?.display_name || env.fallbackUserName;

    setActiveGroupChatId(scopedGroupId);
    setCurrentUserName(scopedUserName);

    if (!scopedGroupId) {
      const currentUser = participantFromName(scopedUserName);
      setParticipants([currentUser]);
      setEvents([]);
      setExpenses([]);
      setSettlements([]);
      return;
    }

    const hangouts = await api<{ items: HangoutApi[] }>(withGroup('/hangouts', scopedGroupId));
    const peopleResponse = await api<{ items: string[] }>(withGroup('/people', scopedGroupId));
    const details: DetailApi[] = await Promise.all(
      (hangouts.items || []).map((hangout) =>
        api<DetailApi>(withGroup(`/hangouts/${hangout.id}/detail`, scopedGroupId)).catch(() => ({
          hangout,
          expenses: [],
          settled_payments: [],
          to_settle: [],
          settled: true,
        }))
      )
    );

    const eventData: Event[] = (hangouts.items || []).map((hangout) => ({
      id: String(hangout.id),
      name: hangout.name,
      date: hangout.date,
      location: hangout.location || '',
      participants: (hangout.participants || []).map(participantFromName),
    }));

    const expenseData: Expense[] = [];
    for (const detail of details) {
      for (const expense of detail.expenses || []) {
        expenseData.push({
          id: String(expense.id),
          eventId: String(detail.hangout.id),
          description: expense.description,
          amount: Number(expense.total_amount || 0),
          paidBy: participantFromName(expense.paid_by).id,
          splitBetween: Object.keys(expense.splits || {}).map((name) => participantFromName(name).id),
          date: expense.created_at || detail.hangout.date,
          settled: !!detail.settled,
        });
      }
    }

    const settlementData: Settlement[] = [];
    for (const detail of details) {
      for (const settlement of detail.settled_payments || []) {
        settlementData.push({
          id: String(settlement.id),
          eventId: String(detail.hangout.id),
          from: participantFromName(settlement.from_person).id,
          to: participantFromName(settlement.to_person).id,
          amount: Number(settlement.amount || 0),
          expenseIds: [],
          settledDate: settlement.created_at,
          settled: true,
        });
      }
    }

    const participantMap = new Map<string, Participant>();
    for (const name of peopleResponse.items || []) {
      const participant = participantFromName(name);
      participantMap.set(participant.id, participant);
    }
    for (const event of eventData) {
      for (const participant of event.participants) {
        participantMap.set(participant.id, participant);
      }
    }

    const currentUser = participantFromName(scopedUserName);
    participantMap.set(currentUser.id, currentUser);

    setParticipants(Array.from(participantMap.values()));
    setEvents(eventData);
    setExpenses(expenseData);
    setSettlements(settlementData);
  };

  useEffect(() => {
    refresh().catch((error) => {
      console.error(error);
    });
  }, []);

  const resolveNameById = (id: string, eventId?: string) => {
    const event = events.find((item) => item.id === eventId);
    const inEvent = event?.participants.find((participant) => participant.id === id)?.name;
    if (inEvent) return inEvent;
    const global = participants.find((participant) => participant.id === id)?.name;
    if (global) return global;
    return id;
  };

  const addEvent = async (event: Event) => {
    await api(withGroup('/hangouts', activeGroupChatId), {
      method: 'POST',
      body: JSON.stringify({
        group_chat_id: activeGroupChatId,
        name: event.name,
        date: event.date,
        location: event.location || '',
        participants: event.participants.map((participant) => participant.name),
      }),
    });
    await refresh();
  };

  const updateEvent = async (id: string, event: Partial<Event>) => {
    const current = events.find((item) => item.id === id);
    if (!current) return;

    await api(withGroup(`/hangouts/${id}`, activeGroupChatId), {
      method: 'PATCH',
      body: JSON.stringify({
        group_chat_id: activeGroupChatId,
        name: event.name ?? current.name,
        date: event.date ?? current.date,
        location: event.location ?? current.location ?? '',
        participants: (event.participants ?? current.participants).map((participant) => participant.name),
      }),
    });
    await refresh();
  };

  const deleteEvent = async (id: string) => {
    await api(withGroup(`/hangouts/${id}`, activeGroupChatId), { method: 'DELETE' });
    await refresh();
  };

  const addExpense = async (expense: Expense) => {
    const payerName = resolveNameById(expense.paidBy, expense.eventId);
    const splitNames = expense.splitBetween.map((participantId) => resolveNameById(participantId, expense.eventId));
    await api(withGroup(`/hangouts/${expense.eventId}/expenses`, activeGroupChatId), {
      method: 'POST',
      body: JSON.stringify({
        group_chat_id: activeGroupChatId,
        description: expense.description,
        total_amount: Number(expense.amount || 0),
        paid_by: payerName,
        splits: splitEqually(Number(expense.amount || 0), splitNames),
      }),
    });
    await refresh();
  };

  const updateExpense = async (id: string, expense: Partial<Expense>) => {
    const current = expenses.find((item) => item.id === id);
    if (!current) return;

    const merged = { ...current, ...expense };
    const payerName = resolveNameById(merged.paidBy, merged.eventId);
    const splitNames = merged.splitBetween.map((participantId) => resolveNameById(participantId, merged.eventId));

    await api(withGroup(`/expenses/${id}`, activeGroupChatId), {
      method: 'PUT',
      body: JSON.stringify({
        group_chat_id: activeGroupChatId,
        description: merged.description,
        total_amount: Number(merged.amount || 0),
        paid_by: payerName,
        splits: splitEqually(Number(merged.amount || 0), splitNames),
      }),
    });
    await refresh();
  };

  const deleteExpense = async (id: string) => {
    await api(withGroup(`/expenses/${id}`, activeGroupChatId), { method: 'DELETE' });
    await refresh();
  };

  const addSettlement = async (settlement: Settlement) => {
    const fromName =
      settlement.from === 'current-user'
        ? currentUserName
        : resolveNameById(settlement.from, settlement.eventId);
    const toName =
      settlement.to === 'expense-payers' ? '' : resolveNameById(settlement.to, settlement.eventId);

    if (!settlement.eventId) return;

    if (toName && Number(settlement.amount || 0) > 0) {
      await api(withGroup(`/hangouts/${settlement.eventId}/settlements`, activeGroupChatId), {
        method: 'POST',
        body: JSON.stringify({
          group_chat_id: activeGroupChatId,
          from_person: fromName,
          to_person: toName,
          amount: Number(settlement.amount),
        }),
      });
      await refresh();
      return;
    }

    const detail = await api<DetailApi>(withGroup(`/hangouts/${settlement.eventId}/detail`, activeGroupChatId));
    const mine = (detail.to_settle || []).filter(
      (transaction) => transaction.from.toLowerCase() === currentUserName.toLowerCase()
    );
    const targets = mine.length ? mine : detail.to_settle.slice(0, 1);

    for (const transaction of targets) {
      await api(withGroup(`/hangouts/${settlement.eventId}/settlements`, activeGroupChatId), {
        method: 'POST',
        body: JSON.stringify({
          group_chat_id: activeGroupChatId,
          from_person: transaction.from,
          to_person: transaction.to,
          amount: Number(transaction.amount),
        }),
      });
    }
    await refresh();
  };

  const settleExpenses = () => {
    // Settlement is finalized via addSettlement().
  };

  const addParticipant = async (participantOrEventId: Participant | string, maybeName?: string) => {
    if (typeof participantOrEventId !== 'string') {
      const name = participantOrEventId.name?.trim();
      if (!name) return;

      await api(withGroup('/people', activeGroupChatId), {
        method: 'POST',
        body: JSON.stringify({ group_chat_id: activeGroupChatId, name }),
      });
      await refresh();
      return;
    }

    const eventId = participantOrEventId;
    const name = String(maybeName || '').trim();
    if (!name) return;

    await api(withGroup('/people', activeGroupChatId), {
      method: 'POST',
      body: JSON.stringify({ group_chat_id: activeGroupChatId, name }),
    });

    const current = events.find((event) => event.id === eventId);
    if (!current) {
      await refresh();
      return;
    }

    const names = Array.from(new Set([...current.participants.map((participant) => participant.name), name]));
    await api(withGroup(`/hangouts/${eventId}`, activeGroupChatId), {
      method: 'PATCH',
      body: JSON.stringify({
        group_chat_id: activeGroupChatId,
        name: current.name,
        date: current.date,
        location: current.location || '',
        participants: names,
      }),
    });
    await refresh();
  };

  return (
    <AppContext.Provider
      value={{
        events,
        expenses,
        settlements,
        participants,
        addEvent,
        updateEvent,
        deleteEvent,
        addExpense,
        updateExpense,
        deleteExpense,
        addSettlement,
        settleExpenses,
        addParticipant,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

export const MOCK_PARTICIPANTS: Participant[] = [];
