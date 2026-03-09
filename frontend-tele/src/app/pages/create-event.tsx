import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, X, Plus } from 'lucide-react';
import { useApp } from '../context/app-context';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

export function CreateEventPage() {
  const navigate = useNavigate();
  const { addEvent, addParticipant, participants } = useApp();

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [showAddParticipant, setShowAddParticipant] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !date) {
      alert('Please fill in all required fields');
      return;
    }

    if (selectedParticipants.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    const newEvent = {
      id: Date.now().toString(),
      name,
      date,
      location,
      participants: participants.filter((p) =>
        selectedParticipants.includes(p.id)
      ),
    };

    await addEvent(newEvent);
    navigate('/');
  };

  const toggleParticipant = (id: string) => {
    if (selectedParticipants.includes(id)) {
      setSelectedParticipants(selectedParticipants.filter((p) => p !== id));
    } else {
      setSelectedParticipants([...selectedParticipants, id]);
    }
  };

  const handleAddNewParticipant = async () => {
    if (newParticipantName.trim()) {
      const name = newParticipantName.trim();
      const newParticipant = {
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
      };
      await addParticipant(newParticipant);
      setSelectedParticipants([...selectedParticipants, newParticipant.id]);
      setNewParticipantName('');
      setShowAddParticipant(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2>Create Event</h2>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-6">
        {/* Event Name */}
        <div className="space-y-2">
          <Label htmlFor="name">
            Hangout Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Beach Day, Movie Night..."
            className="bg-input-background"
            required
          />
        </div>

        {/* Date */}
        <div className="space-y-2">
          <Label htmlFor="date">
            Date <span className="text-destructive">*</span>
          </Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-input-background"
            required
          />
        </div>

        {/* Participants */}
        <div className="space-y-2">
          <Label>
            Participants <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {participants.map((participant) => {
              const isSelected = selectedParticipants.includes(participant.id);
              return (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() => toggleParticipant(participant.id)}
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
                  {isSelected && <X className="w-4 h-4" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowAddParticipant(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-dashed border-primary hover:bg-primary/10 transition-all"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-secondary text-white">
                <Plus className="w-5 h-5" />
              </div>
            </button>
          </div>
        </div>

        {/* Location */}
        <div className="space-y-2">
          <Label htmlFor="location">Location (Optional)</Label>
          <Input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Where will this happen?"
            className="bg-input-background"
          />
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="submit" className="flex-1 bg-gradient-to-r from-primary to-secondary">
            Create Hangout
          </Button>
          <Button
            type="button"
            onClick={() => navigate('/')}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </form>

      {/* Add Participant Dialog */}
      <Dialog open={showAddParticipant} onOpenChange={setShowAddParticipant}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Add New Participant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              value={newParticipantName}
              onChange={(e) => setNewParticipantName(e.target.value)}
              placeholder="Enter participant name"
              className="bg-input-background"
              autoFocus
            />
            <div className="flex gap-2">
              <Button onClick={handleAddNewParticipant} className="flex-1 bg-primary">
                Add
              </Button>
              <Button
                onClick={() => {
                  setShowAddParticipant(false);
                  setNewParticipantName('');
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
    </div>
  );
}
