import React, { useState, useEffect } from 'react';
import { X, Search, Sparkles, Phone, AlertCircle, ArrowRight, UserCheck, MessageSquare } from 'lucide-react';
import { GroupRevealResponse, GroupContactInfo } from '../types';

interface RevealModalProps {
  isOpen: boolean;
  onClose: () => void;
  isRevealed: boolean;
  onOpenWithdraw: (prefilledRoll?: string) => void;
  eventId?: string;
}

export const RevealModal: React.FC<RevealModalProps> = ({
  isOpen,
  onClose,
  isRevealed,
  onOpenWithdraw,
  eventId,
}) => {
  const [rollNumber, setRollNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupData, setGroupData] = useState<GroupRevealResponse | null>(null);

  // Controlled contact reveal state
  const [showContacts, setShowContacts] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contacts, setContacts] = useState<GroupContactInfo[]>([]);
  const [contactsError, setContactsError] = useState<string | null>(null);

  // Auto-fill from localStorage if available
  useEffect(() => {
    if (isOpen) {
      const savedRoll = localStorage.getItem('odhkan_user_roll');
      if (savedRoll) {
        setRollNumber(savedRoll);
        if (isRevealed) {
          fetchGroup(savedRoll);
        }
      }
    }
  }, [isOpen, isRevealed]);

  if (!isOpen) return null;

  const fetchGroup = async (rollToFetch: string) => {
    if (!rollToFetch.trim()) {
      setError("Please enter your college roll number.");
      return;
    }

    setLoading(true);
    setError(null);
    setShowContacts(false);
    setContacts([]);

    try {
      const res = await fetch('/api/group/reveal-my-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNumber: rollToFetch.trim(), eventId }),
      });

      const data: GroupRevealResponse = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Could not retrieve your Odhkan group.");
        setGroupData(null);
      } else {
        setGroupData(data);
        setError(null);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGroup(rollNumber);
  };

  // Controlled contact revelation (Section 18)
  const handleRevealContacts = async () => {
    if (!rollNumber.trim()) return;
    setContactsLoading(true);
    setContactsError(null);

    try {
      const res = await fetch('/api/group/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNumber: rollNumber.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setContactsError(data.error || "Could not load contact details.");
      } else {
        setContacts(data.contacts || []);
        setShowContacts(true);
      }
    } catch {
      setContactsError("Could not retrieve contacts. Please try again.");
    } finally {
      setContactsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl border border-[#ECEAE4] shadow-2xl p-6 sm:p-9 transition-all max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 transition-colors p-1.5 rounded-md hover:bg-neutral-100 cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. If event not yet revealed */}
        {!isRevealed ? (
          <div className="text-center py-6">
            <span className="inline-block text-xs uppercase tracking-wider font-semibold px-2.5 py-1 bg-neutral-100 text-neutral-800 rounded-full mb-4">
              Friday at 3:00 PM
            </span>
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-950 mb-2 font-sans">
              Here's who you're meeting.
            </h3>
            <p className="text-neutral-600 mb-6 text-sm sm:text-base">
              Groups will be revealed right here on Friday at 3:00 PM IST.
            </p>
            <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-5 mb-6">
              <p className="text-sm font-medium text-neutral-800">
                Three people from across the college. Meeting on Friday.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-neutral-950 text-white py-3 rounded-lg font-medium text-sm hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
            >
              Check back at 3:00 PM
            </button>
          </div>
        ) : groupData && groupData.group ? (
          /* 2. REVEALED GROUP STATE */
          <div className="space-y-6">
            <div className="text-center pt-2">
              <span className="text-xs uppercase tracking-widest font-bold text-[#E11D1E] block mb-1">
                Your group
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-950 font-sans">
                Here's who you're meeting.
              </h2>
              <p className="text-sm text-neutral-600 mt-1.5">
                Three people who probably wouldn't have ended up talking otherwise.
              </p>
            </div>

            {/* Note if a member withdrew after reveal */}
            {groupData.group.hasWithdrawnMember && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
                <span className="font-semibold block mb-0.5">Note:</span>
                One member couldn't make it today. Your group connects with the remaining members.
              </div>
            )}

            {/* Group Members List */}
            <div className="space-y-3">
              {groupData.group.members.map((member, idx) => (
                <div
                  key={idx}
                  className={`bg-[#FAF9F5] border rounded-xl p-4 flex items-center justify-between transition-all ${
                    member.isWithdrawn
                      ? 'opacity-60 border-dashed border-neutral-300'
                      : 'border-[#ECEAE4] hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-neutral-950 text-white flex items-center justify-center font-bold text-xs">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-bold text-neutral-950 text-sm sm:text-base tracking-tight">
                        {member.name}
                      </h4>
                      <p className="text-xs text-neutral-500">
                        {member.batch} Batch
                      </p>
                    </div>
                  </div>

                  {member.isWithdrawn ? (
                    <span className="text-[11px] font-medium text-neutral-500 italic">
                      Couldn't make it today
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs font-mono font-semibold px-2 py-0.5 rounded bg-white border border-[#E2DFD6] text-neutral-700">
                      {member.batch}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Controlled Option: Contact your group */}
            <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-4 text-center space-y-3">
              <div>
                <h4 className="font-bold text-neutral-950 text-sm">
                  Go find them.
                </h4>
                <p className="text-xs text-neutral-600 mt-0.5">
                  Can't spot them around campus? You have a way to reach them.
                </p>
              </div>

              {!showContacts ? (
                <div>
                  <button
                    type="button"
                    disabled={contactsLoading}
                    onClick={handleRevealContacts}
                    className="inline-flex items-center gap-2 bg-white border border-neutral-300 hover:border-neutral-900 text-neutral-900 text-xs font-semibold py-2 px-3.5 rounded-lg transition-colors cursor-pointer shadow-2xs"
                  >
                    <Phone className="w-3.5 h-3.5 text-neutral-700" />
                    <span>{contactsLoading ? 'Loading contacts...' : "Can't find them? Contact your group"}</span>
                  </button>
                  {contactsError && (
                    <p className="text-[11px] text-red-600 mt-2">{contactsError}</p>
                  )}
                </div>
              ) : (
                <div className="pt-2 border-t border-[#ECEAE4] space-y-2 text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                    Group Contact Numbers
                  </span>
                  {contacts.map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-neutral-100 last:border-0">
                      <span className="font-medium text-neutral-800">{c.name}</span>
                      <a
                        href={`tel:${c.phoneNumber}`}
                        className="font-mono text-neutral-900 hover:text-black font-semibold underline underline-offset-2"
                      >
                        {c.phoneNumber}
                      </a>
                    </div>
                  ))}
                  <p className="text-[10px] text-neutral-400 pt-1 text-center">
                    Please use responsibly for coordinating your meet-up on campus.
                  </p>
                </div>
              )}
            </div>

            {/* Closing Note */}
            <div className="text-center pt-2">
              <p className="text-xs text-neutral-500">
                Start with a hello. See you around campus.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[#ECEAE4]">
              <button
                onClick={() => setGroupData(null)}
                className="text-xs text-neutral-500 hover:text-neutral-900 cursor-pointer"
              >
                Look up another roll number
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenWithdraw(rollNumber);
                }}
                className="text-xs text-neutral-400 hover:text-red-700 cursor-pointer"
              >
                Can't make it today?
              </button>
            </div>
          </div>
        ) : (
          /* 3. LOOKUP FORM */
          <div>
            <div className="mb-6">
              <span className="text-xs uppercase tracking-widest font-bold text-[#E11D1E] block mb-1">
                Friday Connections
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-950 font-sans">
                Find your group
              </h2>
              <p className="text-sm text-neutral-600 mt-1">
                Enter your college roll number to see who you're meeting.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs sm:text-sm flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1.5">
                  College roll number
                </label>
                <input
                  type="text"
                  required
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. 24BDXXXX"
                  className="w-full px-4 py-2.5 bg-white border border-[#D5D2C9] rounded-lg text-sm text-neutral-950 placeholder:text-neutral-400 font-mono tracking-wider focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-neutral-950 text-white py-3 px-4 rounded-lg font-semibold text-sm hover:bg-neutral-800 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                <span>{loading ? 'Finding your group...' : 'Find my group →'}</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
