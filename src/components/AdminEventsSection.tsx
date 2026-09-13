import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Users,
  Shield,
  Trash2,
  Edit2,
  Eye,
  Star,
  Layers,
  Lock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { OdhkanEventItem } from '../types';
import { parseISTDate, istToUtcIso } from '../utils/istDate';

interface AdminEventsSectionProps {
  events: OdhkanEventItem[];
  activeEventId?: string;
  selectedEventId?: string;
  onSelectEvent: (eventId: string) => void;
  onSetActiveEvent: (eventId: string) => Promise<void>;
  onCreateEvent: (eventData: Partial<OdhkanEventItem>) => Promise<void>;
  onUpdateEvent: (eventId: string, eventData: Partial<OdhkanEventItem>) => Promise<void>;
  onDeleteEvent: (eventId: string) => Promise<void>;
  onViewHistory: (eventId: string) => void;
  actionLoading: boolean;
}

export const AdminEventsSection: React.FC<AdminEventsSectionProps> = ({
  events,
  activeEventId,
  selectedEventId,
  onSelectEvent,
  onSetActiveEvent,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onViewHistory,
  actionLoading,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<OdhkanEventItem | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State for Create / Edit
  const [eventName, setEventName] = useState('Odhkan 02');
  const [dateInput, setDateInput] = useState('2026-09-19');
  const [timeInput, setTimeInput] = useState('15:00');
  const [regStartDate, setRegStartDate] = useState('');
  const [regEndDate, setRegEndDate] = useState('');
  const [eventStatus, setEventStatus] = useState<OdhkanEventItem['status']>('open');
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    const nextNumber = events.length > 0 ? String(events.length + 1).padStart(2, '0') : '02';
    setEventName(`Odhkan ${nextNumber}`);
    setDateInput('2026-09-19');
    setTimeInput('15:00');
    setRegStartDate('');
    setRegEndDate('');
    setEventStatus('open');
    setFormError(null);
    setEditingEvent(null);
    setSubmitting(false);
  };

  const handleOpenCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handleOpenEdit = (evt: OdhkanEventItem) => {
    setEditingEvent(evt);
    setEventName(evt.name || 'Odhkan Event');
    const parsed = parseISTDate(evt.revealTime);
    setDateInput(parsed.dateInput || '2026-09-19');
    setTimeInput(parsed.timeInput || '15:00');
    setRegStartDate(evt.registrationStart ? parseISTDate(evt.registrationStart).dateInput : '');
    setRegEndDate(evt.registrationEnd ? parseISTDate(evt.registrationEnd).dateInput : '');
    setEventStatus(evt.status || 'open');
    setFormError(null);
    setSubmitting(false);
    setShowCreateModal(true);
  };

  const isTimingLocked =
    Boolean(editingEvent && (editingEvent.isPublished || editingEvent.groupsLocked || editingEvent.status === 'completed'));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || actionLoading) return;

    setFormError(null);

    const trimmedName = eventName.trim();
    if (!trimmedName) {
      setFormError('Please enter an event title/name.');
      return;
    }

    if (!dateInput || !timeInput) {
      setFormError('Please choose both the Event Date and Reveal Time.');
      return;
    }

    if (regStartDate && regEndDate) {
      if (new Date(regEndDate).getTime() < new Date(regStartDate).getTime()) {
        setFormError('Registration end date cannot be earlier than registration start date.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const revealUtcIso = istToUtcIso(dateInput, timeInput);
      const regStartIso = regStartDate ? istToUtcIso(regStartDate, '00:00') : null;
      const regEndIso = regEndDate ? istToUtcIso(regEndDate, '23:59') : null;

      if (editingEvent) {
        await onUpdateEvent(editingEvent.id, {
          name: trimmedName,
          revealTime: isTimingLocked ? editingEvent.revealTime : revealUtcIso,
          eventDate: isTimingLocked ? editingEvent.eventDate : dateInput,
          registrationStart: isTimingLocked ? editingEvent.registrationStart : regStartIso,
          registrationEnd: isTimingLocked ? editingEvent.registrationEnd : regEndIso,
          status: eventStatus,
        });
      } else {
        await onCreateEvent({
          name: trimmedName,
          revealTime: revealUtcIso,
          eventDate: dateInput,
          registrationStart: regStartIso,
          registrationEnd: regEndIso,
          status: eventStatus,
        });
      }
      setShowCreateModal(false);
      resetForm();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save event.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ECEAE4] pb-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-neutral-800" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 font-sans">
              Odhkan Events & Recurring Schedule
            </h3>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage future sessions, countdown timers, participant pools, and published rosters.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          disabled={actionLoading || submitting}
          className="inline-flex items-center gap-2 bg-neutral-950 text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-neutral-800 active:scale-[0.99] transition-all cursor-pointer shadow-xs shrink-0 self-start sm:self-auto disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Create Next Odhkan Event</span>
        </button>
      </div>

      {/* Events List */}
      {events.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-neutral-300 rounded-xl bg-neutral-50">
          <Calendar className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-neutral-700">No events created yet.</p>
          <p className="text-xs text-neutral-500 mt-1">
            Click &quot;Create Next Odhkan Event&quot; above to schedule your next Odhkan reveal.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((evt) => {
            const parsed = parseISTDate(evt.revealTime);
            const isActive = evt.id === activeEventId;
            const isSelected = evt.id === selectedEventId;

            return (
              <div
                key={evt.id}
                className={`border rounded-xl p-4 sm:p-5 transition-all ${
                  isActive
                    ? 'border-emerald-400 bg-emerald-50/30'
                    : isSelected
                    ? 'border-neutral-900 bg-neutral-50/50'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Event Details */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-medium px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded border border-neutral-200">
                        {evt.id}
                      </span>

                      {isActive && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 bg-emerald-600 text-white rounded-full">
                          <Star className="w-3 h-3 fill-current" />
                          <span>Active Public Event</span>
                        </span>
                      )}

                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                          evt.status === 'open'
                            ? 'bg-emerald-100 text-emerald-800'
                            : evt.status === 'completed'
                            ? 'bg-blue-100 text-blue-800'
                            : evt.status === 'closed'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-neutral-100 text-neutral-700'
                        }`}
                      >
                        {evt.status}
                      </span>

                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          evt.isPublished
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {evt.isPublished ? '✓ Published' : 'Draft (Unpublished)'}
                      </span>
                    </div>

                    <h4 className="text-lg font-extrabold text-neutral-950 font-sans tracking-tight">
                      {evt.name || 'Odhkan Event'}
                    </h4>

                    {/* Date and Reveal IST Display */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600 pt-0.5">
                      <div className="flex items-center gap-1 font-semibold text-neutral-900">
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                        <span>{parsed.dayName}, {parsed.dateFormatted}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Reveal: <strong className="text-neutral-900">{parsed.dateFormatted} · {parsed.timeFormatted} IST</strong></span>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500 pt-1">
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        <span>Participants: <strong className="text-neutral-900">{evt.participantsCount ?? 0}</strong></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5" />
                        <span>Groups: <strong className="text-neutral-900">{evt.groupsCount ?? 0}</strong></span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-neutral-400">Stage:</span>
                        <code className="text-[10px] bg-neutral-100 px-1.5 py-0.5 rounded text-neutral-700">
                          {evt.stage}
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 shrink-0">
                    {!isActive && (
                      <button
                        onClick={() => onSetActiveEvent(evt.id)}
                        disabled={actionLoading || submitting}
                        className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800 transition-colors cursor-pointer"
                        title="Set this event as the live public countdown target"
                      >
                        <Star className="w-3.5 h-3.5 text-neutral-500" />
                        <span>Set Active</span>
                      </button>
                    )}

                    <button
                      onClick={() => onSelectEvent(evt.id)}
                      disabled={actionLoading || submitting}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-neutral-950 text-white'
                          : 'border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-800'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>{isSelected ? 'Managing' : 'Manage Event'}</span>
                    </button>

                    <button
                      onClick={() => onViewHistory(evt.id)}
                      disabled={actionLoading || submitting}
                      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition-colors cursor-pointer"
                      title="View participant and group history"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>History</span>
                    </button>

                    <button
                      onClick={() => handleOpenEdit(evt)}
                      disabled={actionLoading || submitting}
                      className="p-1.5 text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer"
                      title="Edit event metadata"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {!isActive && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete event ${evt.name || evt.id}?`)) {
                            onDeleteEvent(evt.id);
                          }
                        }}
                        disabled={actionLoading || submitting}
                        className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT EVENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-neutral-950 font-sans mb-1">
              {editingEvent ? 'Edit Odhkan Event' : 'Create Next Odhkan Event'}
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              {editingEvent
                ? 'Update event details and scheduling parameters in India Standard Time (IST).'
                : 'Select the event date and reveal time in India Standard Time (IST).'}
            </p>

            {isTimingLocked && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 flex items-start gap-2.5 text-xs text-amber-900">
                <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Historical Integrity Protection:</span> This event has locked groups, published rosters, or is marked completed. Date and reveal timing cannot be altered to protect records and reveal history. You can still update the Event Title or Status.
                </div>
              </div>
            )}

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg mb-4 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Event Title / Name
                </label>
                <input
                  type="text"
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g. Odhkan 02"
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-neutral-900"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Event Date (Calendar)
                  </label>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    disabled={isTimingLocked}
                    className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Reveal Time (IST)
                  </label>
                  <input
                    type="time"
                    value={timeInput}
                    onChange={(e) => setTimeInput(e.target.value)}
                    disabled={isTimingLocked}
                    className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
                    required
                  />
                  <span className="text-[10px] text-neutral-400 mt-0.5 block">
                    Defaults to 15:00 (3:00 PM IST)
                  </span>
                </div>
              </div>

              {/* Preview computed IST date */}
              {dateInput && timeInput && (
                <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs">
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold tracking-wider mb-0.5">
                    Preview (India Standard Time)
                  </span>
                  <strong className="text-neutral-900 font-sans">
                    {parseISTDate(istToUtcIso(dateInput, timeInput)).fullDisplay}
                  </strong>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Registration Start (Optional)
                  </label>
                  <input
                    type="date"
                    value={regStartDate}
                    onChange={(e) => setRegStartDate(e.target.value)}
                    disabled={isTimingLocked}
                    className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Registration End (Optional)
                  </label>
                  <input
                    type="date"
                    value={regEndDate}
                    onChange={(e) => setRegEndDate(e.target.value)}
                    disabled={isTimingLocked}
                    className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-100 disabled:text-neutral-500 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Status
                </label>
                <select
                  value={eventStatus}
                  onChange={(e) => setEventStatus(e.target.value as any)}
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:outline-hidden focus:ring-2 focus:ring-neutral-900"
                >
                  <option value="open">Open (Accepting Registrations)</option>
                  <option value="upcoming">Upcoming (Scheduled)</option>
                  <option value="closed">Closed</option>
                  <option value="mixed">Mixed</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting || actionLoading}
                  className="px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || actionLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-neutral-950 text-white hover:bg-neutral-800 active:scale-[0.99] rounded-lg cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingEvent ? (submitting ? 'Saving...' : 'Save Changes') : (submitting ? 'Creating...' : 'Create Event')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

