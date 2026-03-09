import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { ArrowLeft, ChevronRight, Edit2, X, Plus } from 'lucide-react';
import { useApp } from '../context/app-context';
import { format } from 'date-fns';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

export function EventDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { events, updateEvent, participants, addParticipant } = useApp();
  const event = events.find((e) => e.id === id);

  const [editingField, setEditingField] = useState<'name' | 'date' | 'location' | 'participants' | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newParticipantName, setNewParticipantName] = useState('');

  if (!event) {
    return (
      <div className="p-4">
        <p>Event not found</p>
      </div>
    );
  }

  const handleEdit = (field: 'name' | 'date' | 'location' | 'participants', currentValue: string) => {
    setEditingField(field);
    setTempValue(currentValue);
    if (field === 'participants') {
      setSelectedParticipants(event.participants.map((p) => p.id));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingField) return;

    if (editingField === 'participants') {
      const updatedParticipants = participants.filter((p) => selectedParticipants.includes(p.id));
      await updateEvent(event.id, { participants: updatedParticipants });
    } else {
      await updateEvent(event.id, { [editingField]: tempValue } as any);
    }

    setEditingField(null);
    setTempValue('');
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setTempValue('');
    setSelectedParticipants([]);
  };

  const handleAddParticipant = async () => {
    if (newParticipantName.trim()) {
      await addParticipant(event.id, newParticipantName.trim());
      setNewParticipantName('');
      setShowAddParticipant(false);
    }
  };

  const toggleParticipant = (participantId: string) => {
    if (selectedParticipants.includes(participantId)) {
      setSelectedParticipants(selectedParticipants.filter((pid) => pid !== participantId));
    } else {
      setSelectedParticipants([...selectedParticipants, participantId]);
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
        <h2>Hangout Details</h2>
      </div>

      <div className="p-4 space-y-6">
        <div className="bg-card rounded-2xl p-4 border border-border">
          {editingField === 'name' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Edit2 className="w-4 h-4" />
                <span>Edit Hangout Name</span>
              </div>
              <Input value={tempValue} onChange={(e) => setTempValue(e.target.value)} className="bg-input-background" autoFocus />
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit} className="flex-1 bg-primary">Save</Button>
                <Button onClick={handleCancelEdit} variant="outline" className="flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">Hangout Name</p>
                <h3 className="text-xl">{event.name}</h3>
              </div>
              <button onClick={() => handleEdit('name', event.name)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
                <Edit2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl p-4 border border-border">
          {editingField === 'date' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Edit2 className="w-4 h-4" />
                <span>Edit Date</span>
              </div>
              <Input type="date" value={tempValue} onChange={(e) => setTempValue(e.target.value)} className="bg-input-background" autoFocus />
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit} className="flex-1 bg-primary">Save</Button>
                <Button onClick={handleCancelEdit} variant="outline" className="flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">Date</p>
                <h3 className="text-xl">{format(new Date(event.date), 'MMMM dd, yyyy')}</h3>
              </div>
              <button onClick={() => handleEdit('date', event.date)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
                <Edit2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl p-4 border border-border">
          {editingField === 'location' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Edit2 className="w-4 h-4" />
                <span>Edit Location</span>
              </div>
              <Input
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                className="bg-input-background"
                autoFocus
                placeholder="Add location..."
              />
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit} className="flex-1 bg-primary">Save</Button>
                <Button onClick={handleCancelEdit} variant="outline" className="flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-1">Location</p>
                <p>{event.location || 'No location set'}</p>
              </div>
              <button onClick={() => handleEdit('location', event.location || '')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
                <Edit2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

        <div className="bg-card rounded-2xl p-4 border border-border">
          {editingField === 'participants' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Edit2 className="w-4 h-4" />
                <span>Edit Participants</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {participants.map((participant) => {
                  const isSelected = selectedParticipants.includes(participant.id);
                  return (
                    <button
                      key={participant.id}
                      type="button"
                      onClick={() => toggleParticipant(participant.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all ${
                        isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${
                          isSelected ? 'bg-gradient-to-br from-primary to-secondary' : 'bg-muted text-muted-foreground'
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
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit} className="flex-1 bg-primary">Save</Button>
                <Button onClick={handleCancelEdit} variant="outline" className="flex-1">Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-3">Participants</p>
                <div className="space-y-2">
                  {event.participants.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white">
                        {participant.name[0]}
                      </div>
                      <p>{participant.name}</p>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => handleEdit('participants', '')} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
                <Edit2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>

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
                <Button onClick={handleAddParticipant} className="flex-1 bg-primary">Add</Button>
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

        <Link to={`/events/${event.id}/expenses`}>
          <div className="bg-gradient-to-br from-primary to-secondary rounded-2xl p-4 text-white flex items-center justify-between hover:shadow-lg transition-shadow">
            <div>
              <h3 className="text-lg">Expenses</h3>
              <p className="text-sm opacity-90">View and manage expenses</p>
            </div>
            <ChevronRight className="w-6 h-6" />
          </div>
        </Link>
      </div>
    </div>
  );
}
