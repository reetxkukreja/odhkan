import React, { useState, useEffect } from 'react';
import { X, Users, Shield, Clock, Search, Calendar, UserCheck } from 'lucide-react';
import { EventHistoryItem } from '../types';
import { parseISTDate } from '../utils/istDate';

interface EventHistoryModalProps {
  eventId: string | null;
  token: string | null;
  onClose: () => void;
}

export const EventHistoryModal: React.FC<EventHistoryModalProps> = ({
  eventId,
  token,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<EventHistoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!eventId) return;

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/events/${eventId}/history`, {
          headers: { Authorization: `Bearer ${token || ''}` },
        });
        const data = await res.json();
        if (data.success && data.history) {
          setHistory(data.history);
        } else {
          setError(data.error || 'Failed to load event history.');
        }
      } catch (err: any) {
        setError(err.message || 'Error fetching event history.');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [eventId, token]);

  if (!eventId) return null;

  const filteredParticipants = (history?.participants || []).filter((p) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return p.name.toLowerCase().includes(s) || p.rollNumber.toLowerCase().includes(s);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-neutral-200 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-neutral-800" />
              <h3 className="text-base font-bold text-neutral-950 font-sans">
                Event History & Participant Roster
              </h3>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Event ID: <code className="font-mono text-[11px] text-neutral-700">{eventId}</code>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-neutral-500">Loading historical records...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
              {error}
            </div>
          ) : history ? (
            <>
              {/* Event Metadata Banner */}
              <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Event Name</span>
                  <strong className="text-neutral-900">{history.event?.name}</strong>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Reveal Time</span>
                  <strong className="text-neutral-900">
                    {parseISTDate(history.event?.revealTime).timeFormatted} IST
                  </strong>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Status</span>
                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                    {history.event?.status}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Publication</span>
                  <strong className="text-neutral-900">
                    {history.event?.isPublished ? 'Published' : 'Draft'}
                  </strong>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search participants by name or roll number..."
                  className="w-full text-xs pl-9 pr-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              {/* Groups Overview */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-2.5 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Groups Generated ({history.groups.length})</span>
                </h4>
                {history.groups.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic">No groups were generated for this event.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {history.groups.map((g) => (
                      <div key={g.id} className="p-3 border border-neutral-200 rounded-xl bg-white shadow-2xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-neutral-900">{g.name}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 font-semibold">
                            {g.members.length} members
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {g.members.map((m) => (
                            <li key={m.id} className="text-xs flex items-center justify-between text-neutral-700">
                              <span>{m.name} <span className="text-neutral-400 text-[11px]">({m.rollNumber})</span></span>
                              <span className="text-[10px] text-neutral-400 font-mono">{m.batch}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Participants Roster */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 mb-2.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Participants ({filteredParticipants.length})</span>
                </h4>
                <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-neutral-50 text-neutral-500 font-semibold border-b border-neutral-200">
                      <tr>
                        <th className="px-3 py-2">Name</th>
                        <th className="px-3 py-2">Roll No</th>
                        <th className="px-3 py-2">Batch</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Group</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {filteredParticipants.map((p) => (
                        <tr key={p.id} className="hover:bg-neutral-50">
                          <td className="px-3 py-2 font-medium text-neutral-900">{p.name}</td>
                          <td className="px-3 py-2 text-neutral-600 font-mono">{p.rollNumber}</td>
                          <td className="px-3 py-2 text-neutral-500">{p.batch}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                p.status === 'active' || p.status === 'valid'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : p.status === 'withdrawn'
                                  ? 'bg-neutral-100 text-neutral-500 line-through'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-neutral-600">
                            {p.groupId ? (
                              <span className="font-semibold text-neutral-800">
                                {history.groups.find((g) => g.id === p.groupId)?.name || p.groupId}
                              </span>
                            ) : (
                              <span className="text-neutral-400">Unassigned</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold bg-neutral-950 text-white hover:bg-neutral-800 rounded-lg cursor-pointer shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
