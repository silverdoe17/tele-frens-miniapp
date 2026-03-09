import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Event, Expense, Settlement, Participant } from '../types';

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

const AppContext = createContext<AppContextType | undefined>(undefined);

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
  hangout_id?: number;
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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

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

    const chatId = Number(qs.get('chat_id') || tg?.initDataUnsafe?.chat?.id || 0) || 1;
    const userNameFromTelegram =
      tg?.initDataUnsafe?.user?.username ||
      [tg?.initDataUnsafe?.user?.first_name, tg?.initDataUnsafe?.user?.last_name].filter(Boolean).join(' ');
    const currentUserName = String(qs.get('user_name') || userNameFromTelegram || 'You').trim();

    return { apiBase, chatId, currentUserName };
  }, []);

  const api = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${env.apiBase}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const refresh = async () => {
    const hangouts = await api<{ items: HangoutApi[] }>(`/hangouts?chat_id=${env.chatId}`);
    const peopleResponse = await api<{ items: string[] }>(`/people?chat_id=${env.chatId}`).catch(
      () => ({ items: [] })
    );

    const details: DetailApi[] = await Promise.all(
      (hangouts.items || []).map((h) =>
        api<DetailApi>(`/hangouts/${h.id}/detail?chat_id=${env.chatId}`).catch(() => ({
          hangout: h,
          expenses: [],
          settled_payments: [],
          to_settle: [],
          settled: true,
        }))
      )
    );

    const eventData: Event[] = (hangouts.items || []).map((h) => ({
      id: String(h.id),
      name: h.name,
      date: h.date,
      location: h.location || '',
      participants: (h.participants || []).map(participantFromName),
    }));

    const expenseData: Expense[] = [];
    for (const detail of details) {
      for (const exp of detail.expenses || []) {
        expenseData.push({
          id: String(exp.id),
          eventId: String(detail.hangout.id),
          description: exp.description,
          amount: Number(exp.total_amount || 0),
          paidBy: participantFromName(exp.paid_by).id,
          splitBetween: Object.keys(exp.splits || {}).map((name) => participantFromName(name).id),
          date: exp.created_at || detail.hangout.date,
          settled: !!detail.settled,
        });
      }
    }

    const settlementData: Settlement[] = [];
    for (const detail of details) {
      for (const s of detail.settled_payments || []) {
        settlementData.push({
          id: String(s.id),
          eventId: String(detail.hangout.id),
          from: participantFromName(s.from_person).id,
          to: participantFromName(s.to_person).id,
          amount: Number(s.amount || 0),
          expenseIds: [],
          settledDate: s.created_at,
          settled: true,
        });
      }
    }

    const participantSet = new Map<string, Participant>();
    for (const person of peopleResponse.items || []) {
      const p = participantFromName(person);
      participantSet.set(p.id, p);
    }
    for (const e of eventData) {
      for (const p of e.participants) participantSet.set(p.id, p);
    }
    setParticipants(Array.from(participantSet.values()));
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
    const event = events.find((e) => e.id === eventId);
    const inEvent = event?.participants.find((p) => p.id === id)?.name;
    if (inEvent) return inEvent;
    const global = participants.find((p) => p.id === id)?.name;
    if (global) return global;
    return id;
  };

  const addEvent = async (event: Event) => {
    await api('/hangouts', {
      method: 'POST',
      body: JSON.stringify({
        chat_id: env.chatId,
        name: event.name,
        date: event.date,
        location: event.location || '',
        participants: event.participants.map((p) => p.name),
      }),
    });
    await refresh();
  };

  const updateEvent = async (id: string, event: Partial<Event>) => {
    const current = events.find((e) => e.id === id);
    if (!current) return;
    await api(`/hangouts/${id}?chat_id=${env.chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: event.name ?? current.name,
        date: event.date ?? current.date,
        location: event.location ?? current.location ?? '',
        participants: (event.participants ?? current.participants).map((p) => p.name),
      }),
    });
    await refresh();
  };

  const deleteEvent = async (id: string) => {
    await api(`/hangouts/${id}?chat_id=${env.chatId}`, { method: 'DELETE' });
    await refresh();
  };

  const addExpense = async (expense: Expense) => {
    const payerName = resolveNameById(expense.paidBy, expense.eventId);
    const splitNames = expense.splitBetween.map((pid) => resolveNameById(pid, expense.eventId));
    await api(`/hangouts/${expense.eventId}/expenses?chat_id=${env.chatId}`, {
      method: 'POST',
      body: JSON.stringify({
        description: expense.description,
        total_amount: Number(expense.amount || 0),
        paid_by: payerName,
        splits: splitEqually(Number(expense.amount || 0), splitNames),
      }),
    });
    await refresh();
  };

  const updateExpense = async (id: string, expense: Partial<Expense>) => {
    const current = expenses.find((e) => e.id === id);
    if (!current) return;
    const merged = { ...current, ...expense };
    const payerName = resolveNameById(merged.paidBy, merged.eventId);
    const splitNames = merged.splitBetween.map((pid) => resolveNameById(pid, merged.eventId));

    await api(`/expenses/${id}?chat_id=${env.chatId}`, {
      method: 'PUT',
      body: JSON.stringify({
        description: merged.description,
        total_amount: Number(merged.amount || 0),
        paid_by: payerName,
        splits: splitEqually(Number(merged.amount || 0), splitNames),
      }),
    });
    await refresh();
  };

  const deleteExpense = async (id: string) => {
    await api(`/expenses/${id}?chat_id=${env.chatId}`, { method: 'DELETE' });
    await refresh();
  };

  const addSettlement = async (settlement: Settlement) => {
    const fromName =
      settlement.from === 'current-user'
        ? env.currentUserName
        : resolveNameById(settlement.from, settlement.eventId);
    const toName =
      settlement.to === 'expense-payers' ? '' : resolveNameById(settlement.to, settlement.eventId);

    if (!settlement.eventId) return;

    if (toName && Number(settlement.amount || 0) > 0) {
      await api(`/hangouts/${settlement.eventId}/settlements?chat_id=${env.chatId}`, {
        method: 'POST',
        body: JSON.stringify({
          from_person: fromName,
          to_person: toName,
          amount: Number(settlement.amount),
        }),
      });
      await refresh();
      return;
    }

    const detail = await api<DetailApi>(`/hangouts/${settlement.eventId}/detail?chat_id=${env.chatId}`);
    const mine = (detail.to_settle || []).filter(
      (tx) => tx.from.toLowerCase() === env.currentUserName.toLowerCase()
    );
    const targets = mine.length ? mine : detail.to_settle.slice(0, 1);

    for (const tx of targets) {
      await api(`/hangouts/${settlement.eventId}/settlements?chat_id=${env.chatId}`, {
        method: 'POST',
        body: JSON.stringify({
          from_person: tx.from,
          to_person: tx.to,
          amount: Number(tx.amount),
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
      await api('/people', {
        method: 'POST',
        body: JSON.stringify({ chat_id: env.chatId, name }),
      });
      await refresh();
      return;
    }

    const eventId = participantOrEventId;
    const name = String(maybeName || '').trim();
    if (!name) return;
    await api('/people', {
      method: 'POST',
      body: JSON.stringify({ chat_id: env.chatId, name }),
    });
    const current = events.find((e) => e.id === eventId);
    if (!current) {
      await refresh();
      return;
    }
    const names = Array.from(new Set([...current.participants.map((p) => p.name), name]));
    await api(`/hangouts/${eventId}?chat_id=${env.chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({
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
