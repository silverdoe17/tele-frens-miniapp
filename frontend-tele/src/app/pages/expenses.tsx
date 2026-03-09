import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { ArrowLeft, Plus, Handshake } from 'lucide-react';
import { useApp } from '../context/app-context';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
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
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';

export function ExpensesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { events, expenses, addSettlement, settleExpenses, deleteExpense, participants } = useApp();
  const event = events.find((e) => e.id === id);
  const eventExpenses = expenses.filter((e) => e.eventId === id);

  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);

  if (!event) {
    return <div className="p-4">Hangout not found</div>;
  }

  const handleDeleteExpense = async () => {
    if (deleteExpenseId) {
      await deleteExpense(deleteExpenseId);
      setDeleteExpenseId(null);
    }
  };

  const calculateSettlement = () => {
    const balances: Record<string, number> = {};

    eventExpenses.forEach((expense) => {
      if (!expense.settled) {
        const splitAmount = expense.amount / expense.splitBetween.length;
        balances[expense.paidBy] = (balances[expense.paidBy] || 0) + expense.amount;
        expense.splitBetween.forEach((participantId) => {
          balances[participantId] = (balances[participantId] || 0) - splitAmount;
        });
      }
    });

    return Object.entries(balances)
      .map(([pid, balance]) => ({
        participant: participants.find((p) => p.id === pid)?.name || pid,
        balance: Math.round(balance * 100) / 100,
      }))
      .filter((b) => Math.abs(b.balance) > 0.01);
  };

  const settlementSummary = calculateSettlement();

  const handleSettle = async () => {
    if (selectedExpenses.length === 0) {
      alert('Please select at least one expense to settle');
      return;
    }

    settleExpenses(selectedExpenses);
    const settlement = {
      id: Date.now().toString(),
      eventId: event.id,
      from: 'current-user',
      to: 'expense-payers',
      amount: 0,
      expenseIds: selectedExpenses,
      settledDate: new Date().toISOString(),
      settled: true,
    };

    await addSettlement(settlement);
    setShowSettleDialog(false);
    setSelectedExpenses([]);
  };

  const unsettledExpenses = eventExpenses.filter((e) => !e.settled);

  return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center gap-3">
        <button
          onClick={() => navigate(`/events/${id}`)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2>{event.name}</h2>
          <p className="text-sm text-muted-foreground">Expenses</p>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-3">
          {eventExpenses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No expenses yet</p>
              <p className="text-sm mt-1">Tap + to add your first expense</p>
            </div>
          ) : (
            eventExpenses.map((expense) => {
              const payer = participants.find((p) => p.id === expense.paidBy);
              return (
                <div
                  key={expense.id}
                  className={`bg-card rounded-2xl p-4 border ${
                    expense.settled ? 'border-success/20 bg-success/5' : 'border-border'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4>{expense.description}</h4>
                      <p className="text-sm text-muted-foreground">Paid by {payer?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg">${expense.amount.toFixed(2)}</p>
                      {expense.settled && <span className="text-xs text-success">Settled</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {expense.splitBetween.map((pId) => {
                      const p = participants.find((participant) => participant.id === pId);
                      return (
                        <div
                          key={pId}
                          className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs"
                        >
                          {p?.name[0]}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {settlementSummary.length > 0 && (
          <div className="bg-card rounded-2xl p-4 border border-border">
            <h3 className="mb-3">Settlement Summary</h3>
            <div className="space-y-2">
              {settlementSummary.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center py-2 border-b border-border last:border-0"
                >
                  <span>{item.participant}</span>
                  <span className={item.balance > 0 ? 'text-success' : 'text-destructive'}>
                    {item.balance > 0 ? '+' : ''}${item.balance.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Link
        to={`/events/${id}/expenses/create`}
        className="fixed bottom-36 right-4 w-14 h-14 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all text-white"
      >
        <Plus className="w-6 h-6" />
      </Link>

      {unsettledExpenses.length > 0 && (
        <button
          onClick={() => setShowSettleDialog(true)}
          className="fixed bottom-20 right-4 w-14 h-14 bg-gradient-to-br from-accent to-success rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all text-white"
        >
          <Handshake className="w-6 h-6" />
        </button>
      )}

      <Dialog open={showSettleDialog} onOpenChange={setShowSettleDialog}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Settle Expenses</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">Select the expenses you've paid for:</p>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {unsettledExpenses.map((expense) => {
                const payer = participants.find((p) => p.id === expense.paidBy);
                return (
                  <div
                    key={expense.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-border"
                  >
                    <Checkbox
                      checked={selectedExpenses.includes(expense.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedExpenses([...selectedExpenses, expense.id]);
                        } else {
                          setSelectedExpenses(selectedExpenses.filter((eid) => eid !== expense.id));
                        }
                      }}
                    />
                    <div className="flex-1">
                      <p>{expense.description}</p>
                      <p className="text-sm text-muted-foreground">
                        ${expense.amount.toFixed(2)} - Paid by {payer?.name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSettle} className="flex-1 bg-primary">
                Settle Selected
              </Button>
              <Button
                onClick={() => {
                  setShowSettleDialog(false);
                  setSelectedExpenses([]);
                }}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteExpenseId} onOpenChange={() => setDeleteExpenseId(null)}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteExpense}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

