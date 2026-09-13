import React, { useState, useEffect } from 'react';
import {
  UserMinus,
  Clock,
  TrendingDown,
  Calendar,
  AlertCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { WithdrawalActivityItem, EventWithdrawalAnalyticsItem } from '../types';

interface AdminWithdrawalSectionProps {
  token: string | null;
  selectedEventId?: string;
  onRefreshData?: () => void;
}

export const AdminWithdrawalSection: React.FC<AdminWithdrawalSectionProps> = ({
  token,
  selectedEventId,
  onRefreshData,
}) => {
  const [loading, setLoading] = useState(false);
  const [analytics, setAnalytics] = useState<EventWithdrawalAnalyticsItem[]>([]);
  const [activity, setActivity] = useState<WithdrawalActivityItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchWithdrawalData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/analytics', {
        headers: {
          Authorization: `Bearer ${token || ''}`,
        },
      });
      const json = await res.json();
      if (json.success) {
        setAnalytics(json.withdrawalAnalytics || []);
        setActivity(json.withdrawalActivity || []);
      }
    } catch (err) {
      console.error('Failed to load withdrawal analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWithdrawalData();
  }, [token, selectedEventId]);

  // Selected event metrics or overall
  const currentEventStats = selectedEventId
    ? analytics.find(a => a.eventId === selectedEventId)
    : analytics[0];

  const filteredActivity = activity.filter(item => {
    if (selectedEventId && item.eventId !== selectedEventId) {
      return false;
    }
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.rollNumber.toLowerCase().includes(q) ||
      item.batch.toLowerCase().includes(q) ||
      item.eventName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. WITHDRAWAL ANALYTICS CARDS */}
      <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#ECEAE4] pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-950 tracking-tight font-sans flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-red-600" />
              <span>Withdrawal Analytics</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Event-specific metrics and timeline tracking for cancellations.
            </p>
          </div>

          <button
            onClick={() => {
              fetchWithdrawalData();
              if (onRefreshData) onRefreshData();
            }}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer text-neutral-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">
              Total Registered
            </span>
            <span className="text-2xl font-extrabold text-neutral-950 font-mono">
              {currentEventStats?.totalRegistrations ?? 0}
            </span>
          </div>

          <div className="bg-red-50/50 border border-red-200/60 rounded-xl p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-red-700 font-semibold block mb-1">
              Total Withdrawals
            </span>
            <span className="text-2xl font-extrabold text-red-700 font-mono">
              {currentEventStats?.totalWithdrawals ?? 0}
            </span>
          </div>

          <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">
              Withdrawal Rate
            </span>
            <span className="text-2xl font-extrabold text-neutral-950 font-mono">
              {currentEventStats?.withdrawalRate ?? 0}%
            </span>
          </div>

          <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-3.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold block mb-1">
              Latest Withdrawal
            </span>
            <span className="text-xs font-medium text-neutral-800 truncate block mt-1">
              {currentEventStats?.latestWithdrawalIST || 'None'}
            </span>
          </div>
        </div>

        {/* First vs Latest timestamps */}
        {currentEventStats && currentEventStats.totalWithdrawals > 0 && (
          <div className="mt-4 pt-3 border-t border-[#ECEAE4] flex flex-wrap items-center gap-4 text-xs text-neutral-600">
            <div>
              <span className="text-neutral-400 mr-1.5">First withdrawal:</span>
              <strong className="text-neutral-900">{currentEventStats.firstWithdrawalIST || '—'}</strong>
            </div>
            <div>
              <span className="text-neutral-400 mr-1.5">Latest withdrawal:</span>
              <strong className="text-neutral-900">{currentEventStats.latestWithdrawalIST || '—'}</strong>
            </div>
          </div>
        )}
      </section>

      {/* 2. WITHDRAWAL ACTIVITY FEED */}
      <section className="bg-white rounded-2xl border border-[#ECEAE4] p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#ECEAE4] pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-neutral-950 tracking-tight font-sans flex items-center gap-2">
              <Clock className="w-5 h-5 text-neutral-700" />
              <span>Withdrawal Activity</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Chronological log of participant cancellations with exact server-side IST timestamps.
            </p>
          </div>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search activity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
            />
          </div>
        </div>

        {filteredActivity.length === 0 ? (
          <div className="py-12 text-center bg-[#FAF9F5] rounded-xl border border-dashed border-[#ECEAE4]">
            <p className="text-sm font-semibold text-neutral-800 mb-0.5">
              No withdrawals recorded.
            </p>
            <p className="text-xs text-neutral-500">
              When participants click "I can't make it", their exact withdrawal records will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#ECEAE4]">
            {filteredActivity.map((item) => (
              <div
                key={item.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-neutral-50/50 rounded-lg px-2 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-50 text-red-700 border border-red-200 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                    ✕
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-neutral-950">{item.name}</span>
                      <span className="text-xs font-mono text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded">
                        {item.rollNumber}
                      </span>
                      <span className="text-xs text-neutral-400">· Batch {item.batch}</span>
                    </div>
                    <div className="text-xs text-neutral-500 mt-0.5">
                      Withdrew from <strong className="text-neutral-700">{item.eventName}</strong> · {item.formattedDateIST}
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col sm:items-end justify-between text-xs font-mono text-neutral-600 pl-11 sm:pl-0">
                  <span className="font-semibold text-neutral-900 bg-neutral-100 px-2 py-0.5 rounded">
                    {item.formattedTimeIST}
                  </span>
                  <span className="text-[11px] text-neutral-400 mt-0.5">
                    {item.timeSinceRegistrationFormatted} after joining
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
