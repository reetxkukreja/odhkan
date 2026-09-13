import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  RefreshCw,
  CheckCircle,
  CheckCheck,
  AlertTriangle,
  Clock,
  Sparkles,
  ShieldCheck,
  Search,
  RotateCcw,
  Info,
  Server,
} from 'lucide-react';
import { EmailLogItem, OdhkanEventItem, EmailProviderStatus } from '../types';

interface AdminEmailSectionProps {
  token: string | null;
  selectedEvent?: OdhkanEventItem;
  onRefreshData?: () => void;
}

export const AdminEmailSection: React.FC<AdminEmailSectionProps> = ({
  token,
  selectedEvent,
  onRefreshData,
}) => {
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [providerStatus, setProviderStatus] = useState<EmailProviderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Test email modal/inputs
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testEmailType, setTestEmailType] = useState<'reminder' | 'reveal'>('reminder');
  const [logFilter, setLogFilter] = useState<'ALL' | 'reminder' | 'reveal' | 'failed' | 'sent' | 'delivered'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchEmailData = async () => {
    try {
      setLoading(true);
      const [logsRes, providerRes] = await Promise.all([
        fetch('/api/admin/emails/logs', {
          headers: { Authorization: `Bearer ${token || ''}` },
        }),
        fetch('/api/admin/emails/provider-status', {
          headers: { Authorization: `Bearer ${token || ''}` },
        }),
      ]);

      const logsJson = await logsRes.json();
      if (logsJson.success) {
        setLogs(logsJson.logs || []);
      }

      const providerJson = await providerRes.json();
      if (providerJson.success) {
        setProviderStatus(providerJson);
      }
    } catch (err: any) {
      console.error('Failed to fetch email data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmailData();
  }, [token]);

  const showFeedback = (type: 'success' | 'error' | 'info', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 6000);
  };

  const handleSendReminders = async () => {
    if (!window.confirm('Send 1-hour reminder emails to all active participants in this event?')) return;
    try {
      setActionLoading(true);
      const res = await fetch('/api/admin/emails/send-reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({ eventId: selectedEvent?.id }),
      });
      const json = await res.json();
      if (json.success) {
        showFeedback(
          'success',
          `Dispatched ${json.totalSent} reminder emails (${json.skippedCount} already sent earlier).`
        );
        fetchEmailData();
      } else {
        showFeedback('error', json.error || 'Failed to send reminders.');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendReveal = async () => {
    if (!selectedEvent?.isPublished) {
      alert('Event must be published before sending reveal emails.');
      return;
    }
    if (!window.confirm('Send personalized group reveal emails to all participants in published groups?')) return;
    try {
      setActionLoading(true);
      const res = await fetch('/api/admin/emails/send-reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({ eventId: selectedEvent?.id }),
      });
      const json = await res.json();
      if (json.success) {
        showFeedback(
          'success',
          `Dispatched ${json.totalSent} reveal emails with personalized rhymes (${json.skippedCount} already sent).`
        );
        fetchEmailData();
      } else {
        showFeedback('error', json.error || 'Failed to send reveal emails.');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryFailed = async () => {
    try {
      setActionLoading(true);
      const res = await fetch('/api/admin/emails/retry-failed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
      });
      const json = await res.json();
      if (json.success) {
        showFeedback('success', `Retried ${json.retriedCount} emails. Successfully dispatched ${json.successCount}.`);
        fetchEmailData();
      } else {
        showFeedback('error', json.error || 'Failed to retry emails.');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
      showFeedback('error', 'Please enter a valid email address.');
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch('/api/admin/emails/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({ email: testEmailAddress, type: testEmailType }),
      });
      const json = await res.json();
      if (json.success) {
        const statusLabel = json.status === 'sent' ? 'Accepted by server/provider (Status: Sent)' : json.status === 'simulated' ? 'Simulated Preview (Logged to server console)' : 'Dispatched';
        showFeedback('success', `Test email to ${testEmailAddress}: ${statusLabel}.`);
        fetchEmailData();
      } else {
        showFeedback('error', json.error || 'Failed to send test email.');
      }
    } catch (err: any) {
      showFeedback('error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const failedCount = logs.filter(l => l.status === 'failed').length;
  const sentCount = logs.filter(l => l.status === 'sent').length;
  const deliveredCount = logs.filter(l => l.status === 'delivered').length;
  const simulatedCount = logs.filter(l => l.status === 'simulated').length;

  const filteredLogs = logs.filter(item => {
    if (logFilter === 'failed' && item.status !== 'failed') return false;
    if (logFilter === 'sent' && item.status !== 'sent') return false;
    if (logFilter === 'delivered' && item.status !== 'delivered') return false;
    if (logFilter === 'reminder' && item.emailType !== 'reminder') return false;
    if (logFilter === 'reveal' && item.emailType !== 'reveal') return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.recipientName.toLowerCase().includes(q) ||
      item.recipientEmail.toLowerCase().includes(q) ||
      (item.subject && item.subject.toLowerCase().includes(q)) ||
      (item.messageId && item.messageId.toLowerCase().includes(q)) ||
      (item.provider && item.provider.toLowerCase().includes(q))
    );
  });

  const renderStatusBadge = (log: EmailLogItem) => {
    switch (log.status) {
      case 'delivered':
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
            title="Confirmed delivered to recipient inbox by provider webhook"
          >
            <CheckCheck className="w-3 h-3 text-emerald-600" />
            <span>Delivered</span>
          </span>
        );
      case 'sent':
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full"
            title="Accepted by SMTP/API provider for transmission (pending inbox delivery confirmation)"
          >
            <Send className="w-3 h-3 text-blue-600" />
            <span>Sent (Accepted)</span>
          </span>
        );
      case 'simulated':
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"
            title="Simulated preview mode (No SMTP or API key configured in .env; logged to server console)"
          >
            <Clock className="w-3 h-3 text-amber-600" />
            <span>Simulated</span>
          </span>
        );
      case 'failed':
        return (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"
            title={log.errorMessage || 'Failed to send'}
          >
            <AlertTriangle className="w-3 h-3 text-red-600" />
            <span>Failed</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center text-[11px] font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-full">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. STATUS BANNER & CONFIGURATION OVERVIEW */}
      <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#ECEAE4] pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-neutral-950 tracking-tight font-sans flex items-center gap-2">
                <Mail className="w-5 h-5 text-amber-600" />
                <span>Automated Email Dispatch System</span>
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                ₹0 Completely Free
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Automated server-side scheduler (runs every 30s) · 1-hour reminders · Dynamic reveal emails with personalized rhymes.
            </p>
          </div>

          <button
            onClick={fetchEmailData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer text-neutral-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Logs</span>
          </button>
        </div>

        {/* Active Provider Card */}
        <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-3.5 mb-4 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white rounded-lg border border-[#ECEAE4]">
              <Server className="w-4 h-4 text-neutral-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-900">Configured Provider:</span>
                <span className="font-mono font-bold uppercase text-[11px] px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-800">
                  {providerStatus?.provider || 'Detecting...'}
                </span>
                {providerStatus?.configured ? (
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                    {providerStatus?.provider === 'smtp' ? 'Incomplete Config' : 'Simulation Mode'}
                  </span>
                )}
              </div>
              <div className="text-neutral-500 text-[11px] mt-0.5">
                From: <span className="font-mono text-neutral-800">{providerStatus?.fromAddress || 'Odhkan <odhkan@college.edu>'}</span>
                {providerStatus?.details && ` · ${providerStatus.details}`}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-neutral-500 bg-white border border-[#ECEAE4] px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              <strong>Sent</strong> = Provider accepted message. <strong>Delivered</strong> = Webhook confirmation.
            </span>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium mb-4 flex items-center gap-2 border ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : feedback.type === 'error'
                ? 'bg-red-50 text-red-900 border-red-200'
                : 'bg-blue-50 text-blue-900 border-blue-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : feedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-red-600" />
            ) : (
              <Info className="w-4 h-4 text-blue-600" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Email Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* 1-Hour Reminder */}
          <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-neutral-700" />
                <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  1-Hour Reminder
                </span>
              </div>
              <p className="text-xs text-neutral-500 mb-3">
                Sends minimal "You're in. Your group goes live at 3:00 PM" notice 1 hour before reveal.
              </p>
            </div>
            <button
              onClick={handleSendReminders}
              disabled={actionLoading}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-40 transition-colors shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Dispatch Reminders Now</span>
            </button>
          </div>

          {/* Group Reveal Email */}
          <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Group Reveal Email
                </span>
              </div>
              <p className="text-xs text-neutral-500 mb-3">
                Sends hyper-personalized reveal copy with custom name rhymes and assigned group members.
              </p>
            </div>
            <button
              onClick={handleSendReveal}
              disabled={actionLoading || !selectedEvent?.isPublished}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {selectedEvent?.isPublished ? 'Dispatch Reveal Emails Now' : 'Requires Event Published'}
              </span>
            </button>
          </div>

          {/* Test Email Form */}
          <form onSubmit={handleSendTestEmail} className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Mail className="w-4 h-4 text-neutral-700" />
                <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider">
                  Send Test Preview
                </span>
              </div>
              <div className="space-y-2 mb-3">
                <input
                  type="email"
                  placeholder="admin@college.edu"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                  required
                />
                <select
                  value={testEmailType}
                  onChange={(e) => setTestEmailType(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-medium"
                >
                  <option value="reminder">Reminder Email Preview</option>
                  <option value="reveal">Group Reveal Email Preview (with rhyme)</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={actionLoading}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 bg-white border border-neutral-300 text-neutral-800 rounded-lg hover:bg-neutral-50 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Test Preview</span>
            </button>
          </form>
        </div>

        {/* Failed retries if any */}
        {failedCount > 0 && (
          <div className="mt-4 p-4 bg-red-50/80 border border-red-200 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-red-900 font-bold">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Failed Emails ({failedCount})</span>
              </div>
              <button
                onClick={handleRetryFailed}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-40 transition-colors cursor-pointer shadow-xs"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                <span>Retry Failed Emails</span>
              </button>
            </div>

            <div className="border border-red-200 bg-white rounded-lg overflow-x-auto shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-red-50/50 border-b border-red-200 text-red-950 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2 px-3">Name</th>
                    <th className="py-2 px-3">Email</th>
                    <th className="py-2 px-3">Event</th>
                    <th className="py-2 px-3">Provider</th>
                    <th className="py-2 px-3">Error</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {logs
                    .filter((l) => l.status === 'failed')
                    .map((item) => (
                      <tr key={item.id} className="hover:bg-red-50/30">
                        <td className="py-2 px-3 font-semibold text-neutral-900">{item.recipientName}</td>
                        <td className="py-2 px-3 font-mono text-neutral-600 text-[11px]">{item.recipientEmail}</td>
                        <td className="py-2 px-3 text-neutral-700">{item.eventName || item.eventId}</td>
                        <td className="py-2 px-3 font-mono text-neutral-500 uppercase text-[10px]">{item.provider || '—'}</td>
                        <td className="py-2 px-3 text-red-700 max-w-xs truncate" title={item.errorMessage || 'Unknown error'}>
                          {item.errorMessage || 'Delivery failed'}
                        </td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-800 bg-red-100 border border-red-200 px-2 py-0.5 rounded-full">
                            failed
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 2. LIVE EMAIL LOGS TABLE */}
      <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#ECEAE4] pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-950 tracking-tight font-sans">
              Email Dispatch & Delivery Logs
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {logs.length} logged emails ({sentCount} sent/accepted, {deliveredCount} delivered, {simulatedCount} simulated, {failedCount} failed).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-[180px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Search recipient / msg ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
              />
            </div>

            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="sent">Sent (Accepted)</option>
              <option value="delivered">Delivered (Confirmed)</option>
              <option value="reminder">Reminders Only</option>
              <option value="reveal">Reveals Only</option>
              <option value="failed">Failed Only</option>
            </select>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-12 text-center bg-[#FAF9F5] rounded-xl border border-dashed border-[#ECEAE4]">
            <p className="text-sm font-semibold text-neutral-800 mb-0.5">
              No email logs match your filter.
            </p>
            <p className="text-xs text-neutral-500">
              When reminders or reveal emails are dispatched, their delivery records will be tracked here.
            </p>
          </div>
        ) : (
          <div className="border border-[#ECEAE4] rounded-xl overflow-hidden">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF9F5] border-b border-[#ECEAE4] text-neutral-600 font-semibold uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Recipient</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Subject / Message ID</th>
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECEAE4]">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50/50">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-neutral-900">{log.recipientName}</div>
                        <div className="font-mono text-neutral-500 text-[11px]">{log.recipientEmail}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          log.emailType === 'reminder'
                            ? 'bg-neutral-100 text-neutral-800'
                            : log.emailType === 'reveal'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-purple-100 text-purple-900'
                        }`}>
                          {log.emailType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 max-w-[240px]">
                        <div className="font-medium text-neutral-800 truncate">{log.subject || '—'}</div>
                        {log.messageId ? (
                          <div className="font-mono text-[10px] text-neutral-400 truncate" title={`Message ID: ${log.messageId}`}>
                            ID: {log.messageId}
                          </div>
                        ) : (
                          <div className="text-neutral-500 text-[11px] truncate">{log.previewText || ''}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-600 uppercase">
                        {log.provider || 'simulation'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-neutral-500 text-[11px] whitespace-nowrap">
                        {log.sentAt
                          ? new Date(log.sentAt).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true,
                              timeZone: 'Asia/Kolkata',
                            }) + ' IST'
                          : 'Pending'}
                      </td>
                      <td className="py-2.5 px-3">
                        {renderStatusBadge(log)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
