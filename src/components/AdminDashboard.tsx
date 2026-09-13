import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Shield,
  Shuffle,
  Lock,
  Send,
  AlertTriangle,
  CheckCircle,
  Download,
  Search,
  RefreshCw,
  LogOut,
  ExternalLink,
  PlusCircle,
  Trash2,
  Check,
  AlertCircle,
  Phone,
  ToggleLeft,
  ToggleRight,
  Calendar,
  Layers,
  Clock,
  Sparkles,
  UserMinus,
  Mail,
} from 'lucide-react';
import {
  AdminData,
  IntegrityCheckResult,
  RegistrationItem,
  OdhkanEventItem,
} from '../types';
import { AdminEventsSection } from './AdminEventsSection';
import { AdminWithdrawalSection } from './AdminWithdrawalSection';
import { AdminEmailSection } from './AdminEmailSection';
import { EventHistoryModal } from './EventHistoryModal';
import { parseISTDate } from '../utils/istDate';

const INITIAL_SAFE_DATA: AdminData = {
  totalRegistrations: 0,
  activeParticipants: 0,
  withdrawnCount: 0,
  duplicateCount: 0,
  invalidCount: 0,
  uniqueParticipants: 0,
  totalGroups: 0,
  withdrawnAfterMatchingCount: 0,
  needsRemix: false,
  event: {
    stage: 'REGISTRATION_OPEN',
    revealTime: new Date().toISOString(),
    registrationOpen: true,
    groupsLocked: false,
    isPublished: false,
    publishedAt: null,
  },
  duplicateSummary: {
    duplicateCount: 0,
    unresolvedCount: 0,
    issues: [],
  },
  batchDistribution: {},
  registrations: [],
  groups: [],
  lastMixedAt: null,
};

interface AdminDashboardProps {
  token: string | null;
  onLogout: () => void;
  onNavigateHome: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  token,
  onLogout,
  onNavigateHome,
}) => {
  const [data, setData] = useState<AdminData>(INITIAL_SAFE_DATA);
  const [events, setEvents] = useState<OdhkanEventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(undefined);
  const [activeEventId, setActiveEventId] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'events' | 'operations' | 'withdrawals' | 'emails'>('events');
  const [historyEventId, setHistoryEventId] = useState<string | null>(null);

  // Helper for formatting withdrawal timestamp to exact IST specification
  const formatWithdrawalIST = (ts?: number | null) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return '—';
      const datePart = d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });
      const timePart = d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      });
      return `${datePart} · ${timePart} IST`;
    } catch {
      return '—';
    }
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'active' | 'withdrawn' | 'duplicate' | 'invalid'>('ALL');
  const [batchFilter, setBatchFilter] = useState('ALL');

  // Modals & Controls
  const [showMixConfirm, setShowMixConfirm] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [testName, setTestName] = useState('');
  const [testRoll, setTestRoll] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [integrityCheck, setIntegrityCheck] = useState<IntegrityCheckResult | null>(null);

  const authHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  }), [token]);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => {
      setFeedbackMsg(null);
    }, 4000);
  };

  // Fetch Events and Admin Data
  const fetchAdminData = async (targetEventId?: string) => {
    try {
      setLoading(true);
      setError(null);

      const queryEventId = targetEventId !== undefined ? targetEventId : selectedEventId;
      const url = queryEventId ? `/api/admin/data?eventId=${encodeURIComponent(queryEventId)}` : '/api/admin/data';

      const [resData, resEvents] = await Promise.all([
        fetch(url, { headers: authHeaders }),
        fetch('/api/admin/events', { headers: authHeaders }),
      ]);

      if (!resData.ok) {
        if (resData.status === 401 || resData.status === 403) {
          onLogout();
          return;
        }
        throw new Error(`Server returned HTTP ${resData.status}`);
      }

      const json = await resData.json();

      let fetchedEvents: OdhkanEventItem[] = [];
      if (resEvents.ok) {
        const eventsJson = await resEvents.json();
        if (eventsJson.success && Array.isArray(eventsJson.events)) {
          fetchedEvents = eventsJson.events;
          setEvents(fetchedEvents);
        }
      }

      const activeEvt = fetchedEvents.find((e) => e.isActive) || fetchedEvents[0];
      const activeId = activeEvt?.id || json?.activeEventId || json?.event?.id;
      setActiveEventId(activeId);

      const effectiveSelectedId = queryEventId || activeId;
      setSelectedEventId(effectiveSelectedId);

      setData({
        totalRegistrations: Number(json?.totalRegistrations) || 0,
        activeParticipants: Number(json?.activeParticipants) || Number(json?.uniqueParticipants) || 0,
        withdrawnCount: Number(json?.withdrawnCount) || 0,
        duplicateCount: Number(json?.duplicateCount) || 0,
        invalidCount: Number(json?.invalidCount) || 0,
        uniqueParticipants: Number(json?.uniqueParticipants) || 0,
        totalGroups: Number(json?.totalGroups) || 0,
        withdrawnAfterMatchingCount: Number(json?.withdrawnAfterMatchingCount) || 0,
        needsRemix: Boolean(json?.needsRemix),
        event: {
          id: json?.event?.id,
          name: json?.event?.name,
          stage: json?.event?.stage || 'REGISTRATION_OPEN',
          revealTime: json?.event?.revealTime || new Date().toISOString(),
          registrationOpen: json?.event?.registrationOpen ?? true,
          groupsLocked: json?.event?.groupsLocked ?? false,
          isPublished: json?.event?.isPublished ?? false,
          publishedAt: json?.event?.publishedAt ?? null,
        },
        events: fetchedEvents,
        activeEventId: activeId,
        duplicateSummary: {
          duplicateCount: Number(json?.duplicateSummary?.duplicateCount) || 0,
          unresolvedCount: Number(json?.duplicateSummary?.unresolvedCount) || 0,
          issues: Array.isArray(json?.duplicateSummary?.issues) ? json.duplicateSummary.issues : [],
        },
        batchDistribution: json?.batchDistribution || {},
        registrations: Array.isArray(json?.registrations) ? json.registrations : [],
        groups: Array.isArray(json?.groups) ? json.groups : [],
        lastMixedAt: json?.lastMixedAt,
      });
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
      setError(err?.message || 'Something went wrong loading the dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [token]);

  // Event Management Handlers
  const handleCreateEvent = async (eventData: Partial<OdhkanEventItem>) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(eventData),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to create event');
      }
      showFeedback('success', `Created event "${result.event?.name || result.event?.id}".`);
      await fetchAdminData(result.event?.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateEvent = async (eventId: string, eventData: Partial<OdhkanEventItem>) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(eventData),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to update event');
      }
      showFeedback('success', 'Event updated successfully.');
      await fetchAdminData(selectedEventId);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete event');
      }
      showFeedback('success', 'Event deleted.');
      await fetchAdminData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetActiveEvent = async (eventId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/activate`, {
        method: 'POST',
        headers: authHeaders,
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to set active event');
      }
      showFeedback('success', `Active event set to ${result.event?.name || eventId}. Countdown updated!`);
      await fetchAdminData(eventId);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelectEvent = async (eventId: string) => {
    setSelectedEventId(eventId);
    setActiveTab('operations');
    await fetchAdminData(eventId);
  };

  // Toggle Registration Status
  const handleToggleRegistration = async () => {
    setActionLoading(true);
    try {
      const nextState = !data.event?.registrationOpen;
      const res = await fetch('/api/admin/toggle-registration', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ isOpen: nextState, eventId: selectedEventId }),
      });
      if (res.ok) {
        await fetchAdminData(selectedEventId);
        showFeedback('success', `Registration is now ${nextState ? 'OPEN' : 'CLOSED'}.`);
      } else {
        showFeedback('error', 'Failed to toggle registration.');
      }
    } catch {
      showFeedback('error', 'Network error toggling registration.');
    } finally {
      setActionLoading(false);
    }
  };

  // Duplicate Check
  const handleRunDuplicateCheck = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/duplicate-check', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ eventId: selectedEventId }),
      });
      if (res.ok) {
        await fetchAdminData(selectedEventId);
        showFeedback('success', 'Duplicate check complete.');
      } else {
        showFeedback('error', 'Duplicate check failed.');
      }
    } catch {
      showFeedback('error', 'Network error during duplicate check.');
    } finally {
      setActionLoading(false);
    }
  };

  // Resolve Duplicate
  const handleResolveDuplicate = async (rollNumber: string, choice: 'first' | 'latest') => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/resolve-duplicate', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ rollNumber, choice }),
      });
      if (res.ok) {
        await fetchAdminData(selectedEventId);
        showFeedback('success', `Resolved duplicate for ${rollNumber}.`);
      } else {
        showFeedback('error', 'Failed to resolve duplicate.');
      }
    } catch {
      showFeedback('error', 'Failed to resolve duplicate.');
    } finally {
      setActionLoading(false);
    }
  };

  // Mix Match
  const handleMixMatch = async () => {
    setShowMixConfirm(false);
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/mix-match', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ eventId: selectedEventId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        showFeedback('error', result.error || 'Mix match failed.');
      } else {
        await fetchAdminData(selectedEventId);
        showFeedback('success', `Mix complete! Generated ${result.groupsCount} groups.`);
      }
    } catch {
      showFeedback('error', 'Error running matching algorithm.');
    } finally {
      setActionLoading(false);
    }
  };

  // Lock Groups
  const handleLockGroups = async () => {
    setShowLockConfirm(false);
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/lock-groups', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ eventId: selectedEventId }),
      });
      if (res.ok) {
        await fetchAdminData(selectedEventId);
        showFeedback('success', 'Groups locked.');
      } else {
        showFeedback('error', 'Failed to lock groups.');
      }
    } catch {
      showFeedback('error', 'Failed to lock groups.');
    } finally {
      setActionLoading(false);
    }
  };

  // Pre-Publish Integrity Check
  const handleRunIntegrityCheck = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/final-check', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ eventId: selectedEventId }),
      });
      if (res.ok) {
        const check: IntegrityCheckResult = await res.json();
        setIntegrityCheck(check);
        setShowPublishModal(true);
      } else {
        showFeedback('error', 'Integrity check failed.');
      }
    } catch {
      showFeedback('error', 'Failed to run integrity check.');
    } finally {
      setActionLoading(false);
    }
  };

  // Publish Final List
  const handlePublishFinalList = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/publish-final-list', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ eventId: selectedEventId }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        showFeedback('error', result.error || 'Failed to publish list.');
      } else {
        await fetchAdminData(selectedEventId);
        setShowPublishModal(false);
        showFeedback('success', 'Final Odhkan list published to public website!');
      }
    } catch {
      showFeedback('error', 'Error publishing final list.');
    } finally {
      setActionLoading(false);
    }
  };

  // Add Participant
  const handleAddTestParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testName.trim() || !testRoll.trim()) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/add-participant', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: testName.trim(),
          rollNumber: testRoll.trim(),
          phoneNumber: testPhone.trim() || '9876543210',
          eventId: selectedEventId,
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        await fetchAdminData(selectedEventId);
        setShowAddModal(false);
        setTestName('');
        setTestRoll('');
        setTestPhone('');
        showFeedback('success', `Added ${result.participant.name} (${testRoll.trim().toUpperCase()})`);
      } else {
        showFeedback('error', result.error || 'Failed to add participant.');
      }
    } catch {
      showFeedback('error', 'Network error adding participant.');
    } finally {
      setActionLoading(false);
    }
  };

  // Reset Seed Data
  const handleResetData = async () => {
    setActionLoading(true);
    try {
      await fetch('/api/admin/reset-data', { method: 'POST', headers: authHeaders });
      await fetchAdminData();
      showFeedback('success', 'Reset demo seed data.');
    } finally {
      setActionLoading(false);
    }
  };

  // Clear All Data
  const handleClearData = async () => {
    if (!window.confirm('Clear all registrations and groups to test zero-state?')) return;
    setActionLoading(true);
    try {
      await fetch('/api/admin/clear-data', { method: 'POST', headers: authHeaders });
      await fetchAdminData();
      showFeedback('success', 'Cleared all registrations. Database is at zero state.');
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered registrations
  const filteredRegistrations = useMemo(() => {
    let list = [...(data.registrations || [])];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        r => r.name.toLowerCase().includes(term) || r.rollNumber.toLowerCase().includes(term)
      );
    }

    if (statusFilter !== 'ALL') {
      if (statusFilter === 'active') {
        list = list.filter(r => r.status === 'active' || r.status === 'valid');
      } else {
        list = list.filter(r => r.status === statusFilter);
      }
    }

    if (batchFilter !== 'ALL') {
      list = list.filter(r => r.batch === batchFilter);
    }

    return list.sort((a, b) => b.registeredAt - a.registeredAt);
  }, [data.registrations, searchTerm, statusFilter, batchFilter]);

  const batches = Object.keys(data.batchDistribution || {}).sort();
  const unresolvedDuplicatesCount = data.duplicateSummary?.unresolvedCount ?? 0;
  const isReadyToMix = unresolvedDuplicatesCount === 0 && (data.activeParticipants ?? data.uniqueParticipants ?? 0) >= 3;

  // Render Loading State
  if (loading && data.totalRegistrations === 0 && !error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF9F5] p-4">
        <div className="w-8 h-8 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin mb-3" />
        <h2 className="text-base font-bold text-neutral-900 font-sans">Loading Odhkan Admin...</h2>
        <p className="text-xs text-neutral-500 mt-1">Retrieving registration records & matching status</p>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FAF9F5] p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-xl p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-neutral-950 mb-1">
            Something went wrong loading the dashboard.
          </h2>
          <p className="text-xs text-neutral-600 mb-5 font-mono bg-neutral-50 p-2.5 rounded border border-neutral-200 break-words">
            {error}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={onNavigateHome}
              className="px-4 py-2 border border-neutral-300 text-xs font-semibold rounded-lg hover:bg-neutral-100 cursor-pointer"
            >
              Back to Home
            </button>
            <button
              onClick={() => fetchAdminData()}
              className="px-4 py-2 bg-neutral-950 text-white text-xs font-semibold rounded-lg hover:bg-neutral-800 cursor-pointer"
            >
              Retry Loading
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-neutral-950 pb-20">
      {/* 1. TOP HEADER & NAVBAR */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#ECEAE4] px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-neutral-950 tracking-tight leading-none font-sans">
              Odhkan Admin
            </h1>
            <p className="text-[11px] text-neutral-500 mt-0.5">
              Organizer management console
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {feedbackMsg && (
            <span
              className={`text-xs px-2.5 py-1 rounded-md font-medium animate-in fade-in ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {feedbackMsg.text}
            </span>
          )}

          <button
            onClick={() => fetchAdminData()}
            disabled={loading}
            className="p-2 rounded-lg text-neutral-600 hover:text-black hover:bg-neutral-100 transition-colors cursor-pointer"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onNavigateHome}
            className="hidden sm:inline-flex items-center gap-1 text-xs text-neutral-600 hover:text-black px-2.5 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            <span>Public Site</span>
            <ExternalLink className="w-3 h-3" />
          </button>

          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg transition-colors border border-red-200 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
        {/* TAB CONTROLS & EVENT SELECTOR */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 sm:p-3 rounded-2xl border border-[#ECEAE4] shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5 bg-neutral-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('events')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'events'
                  ? 'bg-white text-neutral-950 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Events</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-800 font-mono">
                {events.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('operations')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'operations'
                  ? 'bg-white text-neutral-950 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Operations</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-mono font-bold">
                {data.activeParticipants}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('withdrawals')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'withdrawals'
                  ? 'bg-white text-neutral-950 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <UserMinus className="w-3.5 h-3.5 text-red-600" />
              <span>Withdrawals</span>
              {data.withdrawnCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-100 text-red-800 font-mono font-bold">
                  {data.withdrawnCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('emails')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'emails'
                  ? 'bg-white text-neutral-950 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <Mail className="w-3.5 h-3.5 text-amber-600" />
              <span>Email System</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900 font-mono font-bold">
                ₹0 Free
              </span>
            </button>
          </div>

          {/* Active / Selected Event Selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-neutral-500 font-medium hidden md:inline">Selected Event:</span>
            <select
              value={selectedEventId || ''}
              onChange={(e) => handleSelectEvent(e.target.value)}
              className="text-xs font-semibold bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 cursor-pointer max-w-[260px] truncate"
            >
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.name || evt.id} {evt.id === activeEventId ? '★ (Active)' : ''} ({evt.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* EVENTS SECTION */}
        {activeTab === 'events' && (
          <AdminEventsSection
            events={events}
            activeEventId={activeEventId}
            selectedEventId={selectedEventId}
            onSelectEvent={handleSelectEvent}
            onSetActiveEvent={handleSetActiveEvent}
            onCreateEvent={handleCreateEvent}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
            onViewHistory={(id) => setHistoryEventId(id)}
            actionLoading={actionLoading}
          />
        )}

        {/* OPERATIONS CONTENT */}
        {activeTab === 'operations' && (
          <div className="space-y-6">
            {/* Selected Event Details Header */}
            <div className="bg-white rounded-2xl border border-[#ECEAE4] p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center font-bold text-sm">
                  {data.event?.id ? data.event.id.slice(0, 2).toUpperCase() : 'OD'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-neutral-950 font-sans">
                      {data.event?.name || 'Odhkan Event'}
                    </h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-100 text-neutral-600 border border-neutral-200">
                      {data.event?.id || selectedEventId}
                    </span>
                    {selectedEventId === activeEventId && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                        Live Countdown Target
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Reveal: {parseISTDate(data.event?.revealTime || new Date().toISOString()).fullDisplay}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHistoryEventId(selectedEventId || activeEventId || null)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Participant History</span>
                </button>
              </div>
            </div>

            {/* 2. POST-MATCHING WITHDRAWAL NOTICE (Section 10 prompt requirement) */}
            {data.needsRemix && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-950 font-sans">
                      {data.withdrawnAfterMatchingCount} participant{data.withdrawnAfterMatchingCount > 1 ? 's' : ''} withdrew after matching.
                    </h4>
                    <p className="text-xs text-amber-900 mt-0.5">
                      Groups need to be remixed before publishing the final list.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleMixMatch}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 bg-neutral-950 text-white text-xs font-bold px-4 py-2.5 rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>Mix Again</span>
                </button>
              </div>
            )}

        {/* 3. REGISTRATION OVERVIEW CARDS (Section 10 breakdown) */}
        <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4 border-b border-[#ECEAE4] pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Registration Overview
            </h3>

            {/* Registration Open/Closed Status with Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-neutral-600">
                Status:
              </span>
              <button
                onClick={handleToggleRegistration}
                disabled={actionLoading}
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                  data.event?.registrationOpen
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                }`}
                title="Click to toggle registration status"
              >
                {data.event?.registrationOpen ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Registration Open</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>Registration Closed</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total Registrations */}
            <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">
                Total Registrations
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-neutral-950 font-mono">
                {data.totalRegistrations}
              </span>
            </div>

            {/* Active Participants */}
            <div className="bg-[#FAF9F5] border border-emerald-200/80 rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-emerald-800 font-semibold block mb-1">
                Active Participants
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-950 font-mono">
                {data.activeParticipants ?? data.uniqueParticipants}
              </span>
            </div>

            {/* Withdrawn */}
            <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">
                Withdrawn
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-neutral-700 font-mono">
                {data.withdrawnCount ?? 0}
              </span>
            </div>

            {/* Duplicates */}
            <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">
                Duplicates
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-amber-700 font-mono">
                {data.duplicateCount ?? 0}
              </span>
            </div>

            {/* Invalid */}
            <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">
                Invalid
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-neutral-500 font-mono">
                {data.invalidCount ?? 0}
              </span>
            </div>

            {/* Groups */}
            <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-3.5">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">
                Groups Formed
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold text-neutral-950 font-mono">
                {data.totalGroups}
              </span>
            </div>
          </div>
        </section>

        {/* 4. REGISTRATIONS TABLE SECTION */}
        <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ECEAE4] pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-neutral-950 tracking-tight font-sans">
                Registrations
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {data.totalRegistrations === 0
                  ? 'No registrations received yet.'
                  : `Showing ${filteredRegistrations.length} of ${data.totalRegistrations} total records (${data.activeParticipants ?? data.uniqueParticipants} active).`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 bg-neutral-950 text-white rounded-lg hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add Participant</span>
              </button>
            </div>
          </div>

          {data.totalRegistrations === 0 ? (
            /* ZERO STATE as requested */
            <div className="py-16 text-center bg-[#FAF9F5] rounded-xl border border-dashed border-[#ECEAE4]">
              <p className="text-sm font-semibold text-neutral-800 mb-1">
                No registrations yet.
              </p>
              <p className="text-xs text-neutral-500 mb-4">
                Students will appear here once they register on the public website.
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add Test Registration</span>
              </button>
            </div>
          ) : (
            /* TABLE VIEW */
            <div className="space-y-3">
              {/* Search & Status Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search name, roll or phone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>

                {/* Status Filter Dropdown */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-medium"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="active">Active Only</option>
                  <option value="withdrawn">Withdrawn Only</option>
                  <option value="duplicate">Duplicates Only</option>
                  <option value="invalid">Invalid Only</option>
                </select>

                {batches.length > 0 && (
                  <select
                    value={batchFilter}
                    onChange={(e) => setBatchFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-mono"
                  >
                    <option value="ALL">All Batches</option>
                    {batches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Table with Name | Roll Number | Batch | Registered At | Withdrawn At | Status */}
              <div className="border border-[#ECEAE4] rounded-xl overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-[#FAF9F5] border-b border-[#ECEAE4] text-neutral-600 font-semibold uppercase text-[10px] tracking-wider sticky top-0">
                      <tr>
                        <th className="py-2.5 px-4">Name</th>
                        <th className="py-2.5 px-4">Roll Number</th>
                        <th className="py-2.5 px-4">Batch</th>
                        <th className="py-2.5 px-4">Registered At</th>
                        <th className="py-2.5 px-4">Withdrawn At</th>
                        <th className="py-2.5 px-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ECEAE4]">
                      {filteredRegistrations.map((reg) => (
                        <tr key={reg.id} className="hover:bg-neutral-50/50">
                          <td className="py-2.5 px-4 font-semibold text-neutral-950">
                            {reg.name}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-neutral-800">
                            {reg.rollNumber}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-neutral-600">
                            {reg.batch}
                          </td>
                          <td className="py-2.5 px-4 text-neutral-500 text-xs">
                            {new Date(reg.registeredAt).toLocaleString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                              timeZone: 'Asia/Kolkata',
                            })}
                          </td>
                          <td className="py-2.5 px-4 text-xs font-mono">
                            {reg.status === 'withdrawn' ? (
                              <span className="text-red-700 font-semibold bg-red-50/80 px-2 py-0.5 rounded border border-red-200/50">
                                {formatWithdrawalIST(reg.withdrawnAt)}
                              </span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            {reg.status === 'active' || reg.status === 'valid' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <Check className="w-3 h-3" />
                                <span>Active</span>
                              </span>
                            ) : reg.status === 'withdrawn' ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                                <span>Withdrawn</span>
                              </span>
                            ) : reg.status === 'duplicate' ? (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
                                title={reg.flagReason || 'Duplicate registration'}
                              >
                                <AlertTriangle className="w-3 h-3" />
                                <span>Duplicate</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[11px] font-semibold text-neutral-600 bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded-full">
                                <span>Invalid</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 5. DUPLICATE CHECK SECTION */}
        <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#ECEAE4] pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-neutral-950 tracking-tight font-sans">
                Duplicate Check
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Roll numbers must be unique. Only one active record enters the matching pool.
              </p>
            </div>

            <button
              onClick={handleRunDuplicateCheck}
              disabled={actionLoading || data.totalRegistrations === 0}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 bg-neutral-950 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-40 transition-colors shadow-xs cursor-pointer"
            >
              <span>Check for Duplicates</span>
            </button>
          </div>

          {data.totalRegistrations === 0 ? (
            <div className="py-8 text-center bg-[#FAF9F5] rounded-xl border border-dashed border-[#ECEAE4]">
              <p className="text-sm font-semibold text-neutral-600">
                No registrations to check.
              </p>
            </div>
          ) : data.duplicateSummary?.issues?.length === 0 ? (
            <div className="py-4 px-4 bg-emerald-50/50 border border-emerald-200 rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <span className="text-xs font-bold text-emerald-900 block">
                  0 duplicates found
                </span>
                <span className="text-xs text-emerald-700">
                  All active participants have verified unique roll numbers.
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {data.duplicateSummary?.issues?.map((issue) => (
                <div
                  key={issue.rollNumber}
                  className={`p-4 rounded-xl border transition-all ${
                    issue.resolved
                      ? 'bg-neutral-50 border-neutral-200'
                      : 'bg-amber-50/60 border-amber-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-sm text-neutral-900">
                          {issue.rollNumber}
                        </span>
                        <span className="text-xs text-neutral-500">
                          ({issue.entries?.length || 0} entries)
                        </span>
                        {issue.resolved && (
                          <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            Resolved
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-600 mt-0.5">{issue.reason}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleResolveDuplicate(issue.rollNumber, 'first')}
                        disabled={actionLoading}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 transition-colors shadow-2xs cursor-pointer"
                      >
                        Keep first
                      </button>
                      <button
                        onClick={() => handleResolveDuplicate(issue.rollNumber, 'latest')}
                        disabled={actionLoading}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 transition-colors shadow-2xs cursor-pointer"
                      >
                        Keep latest
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-white p-3 rounded-lg border border-neutral-200 text-xs">
                    {issue.entries?.map((entry, idx) => (
                      <div
                        key={entry.id}
                        className={`flex items-center justify-between p-2 rounded ${
                          entry.status === 'active' || entry.status === 'valid'
                            ? 'bg-emerald-50 border border-emerald-200 font-medium'
                            : 'text-neutral-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-neutral-400 font-mono text-[11px]">
                            #{idx + 1}
                          </span>
                          <span className="text-neutral-900 font-semibold">{entry.name}</span>
                          <span className="text-neutral-400 font-mono">({entry.rollNumber})</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-neutral-400 text-[11px]">
                            {new Date(entry.registeredAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span className="text-[11px] font-bold uppercase">
                            {entry.status === 'active' || entry.status === 'valid' ? 'Selected' : 'Duplicate'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 6. MATCHING SECTION */}
        <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ECEAE4] pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-neutral-950 tracking-tight font-sans">
                Matching
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Randomly creates groups of 3 with preference for mixing students from different batches.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowMixConfirm(true)}
                disabled={!isReadyToMix || actionLoading || (data.event?.groupsLocked ?? false)}
                className="inline-flex items-center gap-2 bg-neutral-950 text-white text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
              >
                <Shuffle className="w-4 h-4" />
                <span>{data.totalGroups > 0 ? 'Mix Again' : 'Mix Match'}</span>
              </button>
            </div>
          </div>

          {/* Conditional Guidance Banner */}
          {(data.activeParticipants ?? data.uniqueParticipants ?? 0) < 3 ? (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Need at least 3 active participants to create a group.</span>
            </div>
          ) : unresolvedDuplicatesCount > 0 ? (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Resolve {unresolvedDuplicatesCount} duplicate issue(s) before mixing.</span>
            </div>
          ) : data.totalGroups > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-[#FAF9F5] p-3 rounded-xl border border-[#ECEAE4] gap-3">
                <span className="text-xs font-bold text-neutral-800">
                  Mix complete. {data.activeParticipants ?? data.uniqueParticipants} active participants in {data.totalGroups} groups.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMixConfirm(true)}
                    disabled={data.event?.groupsLocked || actionLoading}
                    className="text-xs font-semibold px-3 py-1.5 border border-neutral-300 bg-white rounded-lg hover:bg-neutral-50 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Mix Again
                  </button>
                  <button
                    onClick={() => setShowLockConfirm(true)}
                    disabled={data.event?.groupsLocked || actionLoading}
                    className="text-xs font-semibold px-3 py-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    {data.event?.groupsLocked ? 'Groups Locked ✓' : 'Lock Groups'}
                  </button>
                </div>
              </div>

              {/* Group Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {data.groups?.map((grp) => (
                  <div key={grp.id} className="bg-white border border-[#ECEAE4] rounded-xl p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 mb-2">
                      <span className="font-bold text-xs font-mono text-neutral-900">{grp.name}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700">
                        {grp.uniqueBatchesCount} batches
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {grp.members?.map((m) => (
                        <div
                          key={m.id}
                          className={`flex items-center justify-between text-xs py-1 px-2 rounded ${
                            m.status === 'withdrawn' ? 'bg-red-50 text-red-700 opacity-60' : 'bg-[#FAF9F5]'
                          }`}
                        >
                          <span className="font-medium text-neutral-900">{m.name}</span>
                          <span className="font-mono text-[11px] font-bold text-neutral-600 bg-white border border-neutral-200 px-1 py-0.2 rounded">
                            {m.batch}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-500 py-2">
              Ready to mix {data.activeParticipants ?? data.uniqueParticipants} active participants. Click Mix Match to generate initial groups.
            </p>
          )}
        </section>

        {/* 7. FINAL LIST SECTION */}
        <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ECEAE4] pb-4 mb-4">
            <div>
              <h2 className="text-lg font-bold text-neutral-950 tracking-tight font-sans">
                Final List
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {data.event?.isPublished
                  ? `Published at ${data.event.publishedAt ? new Date(data.event.publishedAt).toLocaleString() : 'Friday 3:00 PM'} · Status: PUBLIC`
                  : !data.event?.groupsLocked
                  ? 'Groups must be generated and locked before publishing.'
                  : 'Groups are locked. Run final integrity check and publish.'}
              </p>
            </div>

            <button
              onClick={handleRunIntegrityCheck}
              disabled={!data.event?.groupsLocked || (data.event?.isPublished ?? false) || actionLoading}
              className="inline-flex items-center gap-2 bg-emerald-700 text-white text-xs sm:text-sm font-bold px-6 py-3 rounded-xl hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>
                {data.event?.isPublished ? 'Already Published ✓' : 'PUBLISH FINAL LIST'}
              </span>
            </button>
          </div>

          <div className="text-xs text-neutral-600">
            {data.event?.isPublished ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                <span className="font-bold block mb-1">List is publicly live!</span>
                <span>Students can now enter their roll number on the public site to reveal who they're meeting.</span>
              </div>
            ) : !data.event?.groupsLocked ? (
              <span className="text-neutral-500">
                The PUBLISH FINAL LIST button will become active once groups have been mixed, reviewed, and locked.
              </span>
            ) : (
              <span className="text-emerald-700 font-semibold">
                Groups are locked. Click PUBLISH FINAL LIST to run the integrity audits and make the list visible publicly.
              </span>
            )}
          </div>
        </section>

        {/* 8. DEVELOPER & TESTING CONTROLS */}
        <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">
              Developer & Testing Controls
            </h3>
            <span className="text-[11px] text-neutral-400">Organizer quick actions</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <button
              onClick={handleClearData}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 rounded-lg font-semibold transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All (Test Zero State)</span>
            </button>

            <button
              onClick={handleResetData}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-neutral-300 text-neutral-800 bg-white hover:bg-neutral-50 rounded-lg font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Demo Seed (40 students, 2 duplicates)</span>
            </button>

            <a
              href="/api/admin/export?format=csv"
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-neutral-300 text-neutral-800 bg-white hover:bg-neutral-50 rounded-lg font-semibold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </a>
          </div>
        </section>
        </div>
        )}

        {/* 3. WITHDRAWAL ACTIVITY & ANALYTICS TAB */}
        {activeTab === 'withdrawals' && (
          <AdminWithdrawalSection
            token={token}
            selectedEventId={selectedEventId}
            onRefreshData={() => fetchAdminData(selectedEventId)}
          />
        )}

        {/* 4. AUTOMATED EMAIL SYSTEM (₹0) TAB */}
        {activeTab === 'emails' && (
          <AdminEmailSection
            token={token}
            selectedEvent={events.find((e) => e.id === selectedEventId) || events[0]}
            onRefreshData={() => fetchAdminData(selectedEventId)}
          />
        )}
      </main>

      {/* MODAL: EVENT HISTORY & PARTICIPANT ROSTER */}
      <EventHistoryModal
        eventId={historyEventId}
        token={token}
        onClose={() => setHistoryEventId(null)}
      />

      {/* MODAL: ADD TEST PARTICIPANT */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-neutral-300 shadow-2xl">
            <h3 className="font-bold text-base text-neutral-900 mb-3 font-sans">
              Add Participant
            </h3>
            <form onSubmit={handleAddTestParticipant} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="e.g. Reet Kukreja"
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Roll Number
                </label>
                <input
                  type="text"
                  required
                  value={testRoll}
                  onChange={(e) => setTestRoll(e.target.value.toUpperCase())}
                  placeholder="e.g. 24BD1042"
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Phone Number (Private)
                </label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 text-xs font-semibold bg-neutral-950 text-white rounded-lg hover:bg-neutral-800 cursor-pointer shadow-xs"
                >
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MIX CONFIRM */}
      {showMixConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-neutral-300 shadow-2xl">
            <h3 className="font-bold text-base text-neutral-900 mb-2 font-sans">
              Confirm Mix Match
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              This will run the algorithm to partition all active participants into groups of 3 with maximum batch diversity.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowMixConfirm(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleMixMatch}
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs font-bold bg-neutral-950 text-white rounded-lg hover:bg-neutral-800 cursor-pointer shadow-xs"
              >
                {data.totalGroups > 0 ? 'Mix Again' : 'Generate Groups'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LOCK CONFIRM */}
      {showLockConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-neutral-300 shadow-2xl">
            <h3 className="font-bold text-base text-neutral-900 mb-2 font-sans">
              Lock Groups
            </h3>
            <p className="text-xs text-neutral-600 mb-4">
              Freezes group assignments. Once locked, remixing is disabled unless unlocked.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLockConfirm(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLockGroups}
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs font-bold bg-neutral-950 text-white rounded-lg hover:bg-neutral-800 cursor-pointer shadow-xs"
              >
                Lock Groups
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PUBLISH CHECK */}
      {showPublishModal && integrityCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-neutral-300 shadow-2xl">
            <h3 className="font-bold text-base text-neutral-900 mb-2 font-sans">
              Pre-Publish Integrity Check
            </h3>

            {integrityCheck.passed ? (
              <div className="space-y-3 mb-5">
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>All integrity rules passed. Ready to publish!</span>
                </div>
                <div className="bg-[#FAF9F5] p-3 rounded-lg border border-neutral-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Active participants:</span>
                    <span className="font-bold">{integrityCheck.stats.activeParticipants}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Assigned into groups:</span>
                    <span className="font-bold">{integrityCheck.stats.assignedCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Total groups:</span>
                    <span className="font-bold">{integrityCheck.stats.groupsCount}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 mb-5">
                <div className="p-3 bg-red-50 text-red-800 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Cannot publish. {integrityCheck.issues.length} audit issue(s) detected:</span>
                </div>
                <ul className="text-xs text-red-700 list-disc list-inside space-y-1 bg-neutral-50 p-2.5 rounded border border-neutral-200">
                  {integrityCheck.issues.map((iss, i) => (
                    <li key={i}>{iss}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowPublishModal(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 cursor-pointer"
              >
                Close
              </button>
              {integrityCheck.passed && (
                <button
                  onClick={handlePublishFinalList}
                  disabled={actionLoading}
                  className="px-4 py-1.5 text-xs font-bold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 cursor-pointer shadow-xs"
                >
                  Publish Publicly Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
