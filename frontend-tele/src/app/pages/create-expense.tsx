import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, X } from 'lucide-react';
import { useApp } from '../context/app-context';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';

export function CreateExpensePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { events, addExpense } = useApp();
  const event = events.find((e) => e.id === id);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [splitBetween, setSplitBetween] = useState<string[]>([]);

  if (!event) {
    return <div className="p-4">Hangout not found</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description || !amount || !paidBy || splitBetween.length === 0) {
      alert('Please fill in all required fields');
      return;
    }

    const newExpense = {
      id: Date.now().toString(),
      eventId: event.id,
      description,
      amount: parseFloat(amount),
      paidBy,
      splitBetween,
      date: new Date().toISOString(),
      settled: false,
    };

    await addExpense(newExpense);
    navigate(`/events/${id}/expenses`);
  };

  const toggleSplitParticipant = (participantId: string) => {
    if (splitBetween.includes(participantId)) {
      setSplitBetween(splitBetween.filter((p) => p !== participantId));
    } else {
      setSplitBetween([...splitBetween, participantId]);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center gap-3">
        <button
          onClick={() => navigate(`/events/${id}/expenses`)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2>Add Expense</h2>
          <p className="text-sm text-muted-foreground">{event.name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">
            Description <span className="text-destructive">*</span>
          </Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you pay for?"
            className="bg-input-background"
            required
          />
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label htmlFor="amount">
            Amount <span className="text-destructive">*</span>
          </Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="bg-input-background"
            required
          />
        </div>

        {/* Paid By */}
        <div className="space-y-2">
          <Label>
            Paid By <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {event.participants.map((participant) => {
              const isSelected = paidBy === participant.id;
              return (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() => setPaidBy(participant.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${
                      isSelected
                        ? 'bg-gradient-to-br from-primary to-secondary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {participant.name[0]}
                  </div>
                  <span>{participant.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Split Between */}
        <div className="space-y-2">
          <Label>
            Split Between <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {event.participants.map((participant) => {
              const isSelected = splitBetween.includes(participant.id);
              return (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() => toggleSplitParticipant(participant.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${
                      isSelected
                        ? 'bg-gradient-to-br from-accent to-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {participant.name[0]}
                  </div>
                  <span>{participant.name}</span>
                  {isSelected && <X className="w-4 h-4" />}
                </button>
              );
            })}
          </div>
          {splitBetween.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Each person owes: ${(parseFloat(amount || '0') / splitBetween.length).toFixed(2)}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="submit" className="flex-1 bg-gradient-to-r from-primary to-secondary">
            Add Expense
          </Button>
          <Button
            type="button"
            onClick={() => navigate(`/events/${id}/expenses`)}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
