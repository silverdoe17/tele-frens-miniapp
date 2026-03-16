import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, X, Plus } from 'lucide-react';
import { useApp } from '../context/app-context';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';

export function CreateEventPage() {
  const navigate = useNavigate();
  const {
    addEvent,
    addParticipant,
    participants,
    currentGroup,
    currentUserName,
    availableGroups,
    selectGroup,
  } = useApp();

  const [name, setName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [isAddingParticipantInline, setIsAddingParticipantInline] = useState(false);
  const [manualGroupId, setManualGroupId] = useState('');
  const [hasInitializedParticipants, setHasInitializedParticipants] = useState(false);

  const currentUserParticipant = useMemo(() => {
    const name = currentUserName.trim();
    if (!name) return null;
    return {
      id: name.toLowerCase().replace(/\s+/g, '-'),
      name,
    };
  }, [currentUserName]);

  const visibleParticipants = useMemo(() => {
    if (!currentUserParticipant) return participants;
    return participants.some((participant) => participant.id === currentUserParticipant.id)
      ? participants
      : [currentUserParticipant, ...participants];
  }, [participants, currentUserParticipant]);

  const participantSuggestions = useMemo(() => {
    const query = newParticipantName.trim().toLowerCase();
    if (!query) {
      return visibleParticipants.slice(0, 6);
    }

    return visibleParticipants
      .filter((participant) => participant.name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [newParticipantName, visibleParticipants]);

  useEffect(() => {
    setSelectedParticipants([]);
    setHasInitializedParticipants(false);
  }, [currentGroup?.chatId]);

  useEffect(() => {
    if (!hasInitializedParticipants && visibleParticipants.length) {
      setSelectedParticipants(visibleParticipants.map((participant) => participant.id));
      setHasInitializedParticipants(true);
    }
  }, [visibleParticipants, hasInitializedParticipants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentGroup) {
      alert('Link this hangout to a Telegram group first');
      return;
    }

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
      participants: visibleParticipants.filter((p) =>
        selectedParticipants.includes(p.id)
      ),
    };

    await addEvent(newEvent);
    navigate('/');
  };

  const toggleParticipant = (id: string) => {
    setSelectedParticipants((prev) =>
      prev.includes(id) ? prev.filter((participantId) => participantId !== id) : [...prev, id]
    );
  };

  const handleAddNewParticipant = async () => {
    if (newParticipantName.trim()) {
      const participantName = newParticipantName.trim();
      const newParticipant = {
        id: participantName.toLowerCase().replace(/\s+/g, '-'),
        name: participantName,
      };
      try {
        await addParticipant(newParticipant);
        setSelectedParticipants((prev) => (prev.includes(newParticipant.id) ? prev : [...prev, newParticipant.id]));
        setNewParticipantName('');
        setIsAddingParticipantInline(false);
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Unable to add participant');
      }
    }
  };

  const handlePickSuggestedParticipant = (participantId: string) => {
    setSelectedParticipants((prev) => (prev.includes(participantId) ? prev : [...prev, participantId]));
    setNewParticipantName('');
    setIsAddingParticipantInline(false);
  };

  const handleManualGroupLink = async () => {
    const parsed = Number(manualGroupId);
    if (!Number.isFinite(parsed)) {
      alert('Enter a valid Telegram group chat id');
      return;
    }

    try {
      await selectGroup(parsed);
      setManualGroupId('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to link Telegram group');
    }
  };

  return (
    <div className="h-full">
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
        <div className="bg-card rounded-2xl p-4 border border-border">
          <p className="text-sm text-muted-foreground mb-1">Linked Group</p>
          <div className="space-y-3">
            {currentGroup ? (
              <>
                <p>{currentGroup.title}</p>
                <p className="text-xs text-muted-foreground">Chat ID: {currentGroup.chatId}</p>
              </>
            ) : (
              <p className="text-sm">No group linked yet. Choose a group or paste a chat id.</p>
            )}

            {availableGroups.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {availableGroups.map((group) => {
                  const isActive = currentGroup?.chatId === group.chatId;
                  return (
                    <Button
                      key={group.chatId}
                      type="button"
                      variant={isActive ? 'default' : 'outline'}
                      className={isActive ? 'bg-primary' : ''}
                      onClick={() => {
                        void selectGroup(group.chatId);
                      }}
                    >
                      {group.title}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No known groups loaded yet from the bot. You can still link one manually now.
              </p>
            )}

            <div className="flex gap-2">
              <Input
                value={manualGroupId}
                onChange={(e) => setManualGroupId(e.target.value)}
                placeholder="-1001234567890"
                className="bg-input-background"
              />
              <Button
                type="button"
                onClick={() => {
                  void handleManualGroupLink();
                }}
                className="bg-primary"
              >
                Link
              </Button>
            </div>
          </div>
        </div>

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
          <p className="text-xs text-muted-foreground">
            Telegram group members are shown with `@username` when the bot knows their Telegram account. Add `@username` or a name inline to store it in this group's roster.
          </p>
          {!currentGroup && (
            <p className="text-xs text-destructive">
              Link a Telegram group above to sync the shared roster. You can still add names inline on this page first.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {visibleParticipants.map((participant) => {
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
              onClick={() => setIsAddingParticipantInline((prev) => !prev)}
              className="flex items-center gap-2 px-4 py-2 rounded-full border-2 border-dashed border-primary hover:bg-primary/10 transition-all"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-secondary text-white">
                <Plus className="w-5 h-5" />
              </div>
              <span>Add participant</span>
            </button>
          </div>
          {isAddingParticipantInline && (
            <div className="space-y-2 pt-2">
              <div className="flex gap-2">
                <Input
                  value={newParticipantName}
                  onChange={(e) => setNewParticipantName(e.target.value)}
                  placeholder="Add @username or name"
                  className="bg-input-background"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddNewParticipant();
                    }
                    if (e.key === 'Escape') {
                      setIsAddingParticipantInline(false);
                      setNewParticipantName('');
                    }
                  }}
                />
                <Button type="button" onClick={handleAddNewParticipant} className="bg-primary">
                  Add
                </Button>
              </div>
              {participantSuggestions.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-2">
                  <p className="px-2 pb-2 text-xs text-muted-foreground">Suggestions</p>
                  <div className="flex flex-wrap gap-2">
                    {participantSuggestions.map((participant) => (
                      <button
                        key={participant.id}
                        type="button"
                        onClick={() => handlePickSuggestedParticipant(participant.id)}
                        className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-primary hover:bg-primary/10 transition-colors"
                      >
                        {participant.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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

    </div>
  );
}
