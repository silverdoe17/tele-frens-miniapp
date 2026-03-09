import { useState } from 'react';
import { useApp } from '../context/app-context';
import { format } from 'date-fns';
import { CheckCircle2, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Button } from '../components/ui/button';

interface OutstandingBalance {
  eventId: string;
  eventName: string;
  amount: number;
  type: 'owe' | 'owed';
  to: string;
  expenseIds: string[];
}

export function SettlementsPage() {
  const { settlements, events, expenses, addSettlement, settleExpenses, participants } = useApp();
  const [selectedBalance, setSelectedBalance] = useState<OutstandingBalance | null>(null);

  // Get all settlements with event information
  const settlementsWithDetails = settlements
    .map((settlement) => {
      const event = events.find((e) => e.id === settlement.eventId);
      const settledExpenses = expenses.filter((e) =>
        settlement.expenseIds.includes(e.id)
      );
      const totalAmount = settledExpenses.length
        ? settledExpenses.reduce((sum, e) => sum + e.amount, 0)
        : settlement.amount;
      
      return {
        ...settlement,
        event,
        totalAmount,
        expenseCount: settlement.expenseIds.length,
      };
    })
    .sort((a, b) => {
      const dateA = a.event ? new Date(a.event.date).getTime() : 0;
      const dateB = b.event ? new Date(b.event.date).getTime() : 0;
      return dateB - dateA;
    });

  // Calculate outstanding balances
  const calculateOutstanding = () => {
    const outstanding: OutstandingBalance[] = [];
    const expensesByEvent = new Map<string, typeof expenses>();

    // Group expenses by event
    expenses.forEach((expense) => {
      if (!expense.settled) {
        if (!expensesByEvent.has(expense.eventId)) {
          expensesByEvent.set(expense.eventId, []);
        }
        expensesByEvent.get(expense.eventId)?.push(expense);
      }
    });

    // Calculate balances per event
    expensesByEvent.forEach((eventExpenses, eventId) => {
      const event = events.find((e) => e.id === eventId);
      if (!event) return;

      const balances: Record<string, { amount: number; to: string; expenseIds: string[] }> = {};

      eventExpenses.forEach((expense) => {
        const splitAmount = expense.amount / expense.splitBetween.length;
        const payer = participants.find((p) => p.id === expense.paidBy);

        expense.splitBetween.forEach((participantId) => {
          if (participantId !== expense.paidBy) {
            const key = `${participantId}-${expense.paidBy}`;
            if (!balances[key]) {
              balances[key] = {
                amount: 0,
                to: payer?.name || 'Unknown',
                expenseIds: [],
              };
            }
            balances[key].amount += splitAmount;
            balances[key].expenseIds.push(expense.id);
          }
        });
      });

      Object.entries(balances).forEach(([key, data]) => {
        outstanding.push({
          eventId,
          eventName: event.name,
          amount: Math.round(data.amount * 100) / 100,
          type: 'owe',
          to: data.to,
          expenseIds: data.expenseIds,
        });
      });
    });

    return outstanding;
  };

  const outstandingBalances = calculateOutstanding();

  const handleSettleBalance = async () => {
    if (!selectedBalance) return;

    // Mark expenses as settled
    settleExpenses(selectedBalance.expenseIds);

    // Create settlement record
    const settlement = {
      id: Date.now().toString(),
      eventId: selectedBalance.eventId,
      from: 'current-user',
      to: selectedBalance.to,
      amount: selectedBalance.amount,
      expenseIds: selectedBalance.expenseIds,
      settledDate: new Date().toISOString(),
      settled: true,
    };

    await addSettlement(settlement);
    setSelectedBalance(null);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="mb-6">
        <h1 className="text-2xl mb-1">Settlements</h1>
        <p className="text-sm text-muted-foreground">Your payment history</p>
      </div>

      {/* Outstanding Summary */}
      {outstandingBalances.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3">Outstanding</h3>
          <div className="space-y-3">
            {outstandingBalances.map((balance, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedBalance(balance)}
                className="w-full bg-card rounded-2xl p-4 border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-left">
                    <Clock className="w-5 h-5 text-destructive flex-shrink-0" />
                    <div>
                      <p>{balance.eventName}</p>
                      <p className="text-sm text-muted-foreground">
                        You owe {balance.to}
                      </p>
                    </div>
                  </div>
                  <p className="text-lg text-destructive">
                    ${balance.amount.toFixed(2)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Settlement History */}
      <div>
        <h3 className="mb-3">History</h3>
        {settlementsWithDetails.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>No settlement history yet</p>
            <p className="text-sm mt-1">Settle expenses to see them here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {settlementsWithDetails.map((settlement) => (
              <div
                key={settlement.id}
                className={`bg-card rounded-2xl p-4 border ${
                  settlement.settled
                    ? 'border-success/20 bg-success/5'
                    : 'border-border'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-start gap-3">
                    <CheckCircle2
                      className={`w-5 h-5 mt-0.5 ${
                        settlement.settled ? 'text-success' : 'text-muted-foreground'
                      }`}
                    />
                    <div>
                      <h4>{settlement.event?.name || 'Unknown Event'}</h4>
                      <p className="text-sm text-muted-foreground">
                        {settlement.expenseCount} expense
                        {settlement.expenseCount !== 1 ? 's' : ''}
                      </p>
                      {settlement.settledDate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Settled on {format(new Date(settlement.settledDate), 'MMM dd, yyyy')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg text-success">
                      ${settlement.totalAmount.toFixed(2)}
                    </p>
                    <span className="text-xs text-success">Settled</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settlement Confirmation Dialog */}
      <Dialog open={!!selectedBalance} onOpenChange={() => setSelectedBalance(null)}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Settle Payment</DialogTitle>
          </DialogHeader>
          {selectedBalance && (
            <div className="space-y-4 mt-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hangout:</span>
                  <span>{selectedBalance.eventName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pay to:</span>
                  <span>{selectedBalance.to}</span>
                </div>
                <div className="flex justify-between text-lg">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="text-primary">${selectedBalance.amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expenses:</span>
                  <span>{selectedBalance.expenseIds.length}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Have you paid {selectedBalance.to} ${selectedBalance.amount.toFixed(2)}? This will mark the expenses as settled.
              </p>
              <div className="flex gap-2">
                <Button onClick={handleSettleBalance} className="flex-1 bg-success">
                  Confirm Settlement
                </Button>
                <Button
                  onClick={() => setSelectedBalance(null)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
