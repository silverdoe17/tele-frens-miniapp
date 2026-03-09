export interface Participant {
  id: string;
  name: string;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  participants: Participant[];
  location?: string;
}

export interface Expense {
  id: string;
  eventId: string;
  description: string;
  amount: number;
  paidBy: string;
  splitBetween: string[];
  date: string;
  settled: boolean;
}

export interface Settlement {
  id: string;
  eventId: string;
  from: string;
  to: string;
  amount: number;
  expenseIds: string[];
  settledDate?: string;
  settled: boolean;
}
