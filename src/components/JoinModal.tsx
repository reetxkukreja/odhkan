import React, { useState } from 'react';
import { X, Check, Copy, AlertCircle, Phone, Lock, HeartHandshake } from 'lucide-react';
import { CountdownTime } from '../types';
import { formatCountdownString } from '../utils/countdown';

interface JoinModalProps {
  isOpen: boolean;
  onClose: () => void;
  countdown: CountdownTime;
  totalCount: number;
  onParticipantJoined: (name: string, roll: string) => void;
  onOpenWithdraw: (prefilledRoll?: string) => void;
}

export const JoinModal: React.FC<JoinModalProps> = ({
  isOpen,
  onClose,
  countdown,
  totalCount,
  onParticipantJoined,
  onOpenWithdraw,
}) => {
  const [name, setName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Duplicate state
  const [isDuplicate, setIsDuplicate] = useState(false);

  // Success state
  const [isSuccess, setIsSuccess] = useState(false);
  const [registeredName, setRegisteredName] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  // Indian mobile validation helper
  const validateIndianMobile = (raw: string) => {
    const cleaned = raw.replace(/[\s\-\(\)\.]/g, '');
    const match = cleaned.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
    return Boolean(match && match[1]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsDuplicate(false);

    if (!name.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }
    if (!rollNumber.trim()) {
      setErrorMessage("That roll number doesn't look right. Check it once and try again.");
      return;
    }
    if (!phoneNumber.trim() || !validateIndianMobile(phoneNumber)) {
      setErrorMessage("That phone number doesn't look right. Check it once and try again.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/participants/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          rollNumber: rollNumber.trim(),
          phoneNumber: phoneNumber.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.error === "You're already in Odhkan." || data.error?.includes('already in Odhkan')) {
          setIsDuplicate(true);
          localStorage.setItem('odhkan_user_roll', rollNumber.trim().toUpperCase());
          localStorage.setItem('odhkan_user_name', name.trim());
        } else {
          setErrorMessage(data.error || "That roll number doesn't look right. Check it once and try again.");
        }
        return;
      }

      // Success
      setIsSuccess(true);
      setRegisteredName(data.participant?.name || name.trim());
      localStorage.setItem('odhkan_user_roll', rollNumber.trim().toUpperCase());
      localStorage.setItem('odhkan_user_name', data.participant?.name || name.trim());
      onParticipantJoined(data.participant?.name || name.trim(), rollNumber.trim());
    } catch {
      setErrorMessage("Couldn't connect to Odhkan. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setIsDuplicate(false);
    setName('');
    setRollNumber('');
    setPhoneNumber('');
    setErrorMessage(null);
    onClose();
  };

  const handleTriggerWithdraw = () => {
    const currentRoll = rollNumber.trim().toUpperCase() || localStorage.getItem('odhkan_user_roll') || '';
    handleResetAndClose();
    onOpenWithdraw(currentRoll);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl border border-[#ECEAE4] shadow-2xl p-6 sm:p-9 transition-all overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleResetAndClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 transition-colors p-1.5 rounded-md hover:bg-neutral-100 cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 1. DUPLICATE STATE */}
        {isDuplicate ? (
          <div className="text-center py-3">
            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-800 flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6" />
            </div>

            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-950 mb-2 font-sans">
              You're already in Odhkan.
            </h3>

            <p className="text-base text-neutral-600 font-medium mb-6">
              You're all set. See you Friday at 3.
            </p>

            <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-4 mb-6">
              <span className="text-xs uppercase tracking-widest text-neutral-500 font-semibold block mb-1">
                Reveal Countdown
              </span>
              <span className="font-mono text-xl sm:text-2xl font-bold text-neutral-950">
                {formatCountdownString(countdown)}
              </span>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleResetAndClose}
                className="w-full bg-neutral-950 text-white font-medium py-3 rounded-lg hover:bg-neutral-800 transition-colors text-sm cursor-pointer shadow-xs"
              >
                Got it
              </button>

              {/* Subtle withdrawal link */}
              <p className="text-xs text-neutral-500 text-center">
                Plans changed?{' '}
                <button
                  type="button"
                  onClick={handleTriggerWithdraw}
                  className="text-neutral-700 underline underline-offset-2 hover:text-neutral-950 cursor-pointer font-medium"
                >
                  Can't make it today?
                </button>
              </p>
            </div>
          </div>
        ) : isSuccess ? (
          /* 2. SUCCESS STATE */
          <div className="py-2">
            <span className="inline-block text-xs uppercase tracking-wider font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full mb-3">
              Registration Confirmed
            </span>

            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-950 mb-1 font-sans">
              You're in.
            </h3>

            <p className="text-base font-semibold text-neutral-800 mb-1">
              Welcome to Odhkan, {registeredName}.
            </p>

            <p className="text-sm text-neutral-600 mb-5">
              You're part of this Friday's community connections.
            </p>

            {/* Community card */}
            <div className="bg-[#FAF9F5] border border-[#ECEAE4] rounded-xl p-5 mb-5 space-y-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block mb-0.5">
                  The college is joining
                </span>
                <span className="text-xl font-extrabold text-neutral-950">
                  {totalCount} students are already part of Odhkan.
                </span>
                <p className="text-xs text-neutral-500 mt-0.5">
                  More people. More circles. More connections.
                </p>
              </div>

              <div className="border-t border-[#ECEAE4] pt-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">
                  Groups revealed Friday at 3:00 PM
                </span>
                <span className="font-mono text-lg font-bold text-neutral-950 block">
                  {formatCountdownString(countdown)}
                </span>
              </div>

              <div className="border-t border-[#ECEAE4] pt-2 text-xs text-neutral-600">
                Three people from across the college. Meeting on Friday.
              </div>
            </div>

            {/* Share & Withdrawal options */}
            <div className="space-y-3">
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white py-3 px-4 rounded-lg font-medium text-sm hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Link copied to clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Invite a friend to join</span>
                  </>
                )}
              </button>

              {/* Explicit "Can't make it today?" withdrawal option */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleTriggerWithdraw}
                  className="text-xs text-neutral-500 hover:text-neutral-800 underline underline-offset-2 cursor-pointer transition-colors"
                >
                  Can't make it today?
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 3. REGISTRATION FORM */
          <div>
            <div className="mb-5">
              <span className="text-xs uppercase tracking-widest font-bold text-[#E11D1E] mb-1 block">
                Friday Connection
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-950 mb-1.5 font-sans">
                Join Odhkan
              </h2>
              <p className="text-sm text-neutral-600">
                Random people. One college. Meet beyond your usual circle.
              </p>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs sm:text-sm flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1.5">
                  Your name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Reet Kukreja"
                  className="w-full px-4 py-2.5 bg-white border border-[#D5D2C9] rounded-lg text-sm text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-colors"
                />
              </div>

              {/* Roll Number field */}
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

              {/* Phone Number field */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 mb-1.5">
                  Phone number
                </label>
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g. 98765 43210"
                  className="w-full px-4 py-2.5 bg-white border border-[#D5D2C9] rounded-lg text-sm text-neutral-950 placeholder:text-neutral-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition-colors"
                />
                <p className="text-[11px] text-neutral-500 mt-1.5 leading-relaxed">
                  Only used so your group can find each other if needed. It won't be publicly displayed.
                </p>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-neutral-950 text-white py-3 px-4 rounded-lg font-semibold text-sm hover:bg-neutral-800 active:scale-[0.99] transition-all disabled:opacity-50 mt-4 cursor-pointer shadow-xs"
              >
                <span>{loading ? 'Submitting...' : 'Join Odhkan →'}</span>
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleTriggerWithdraw}
                  className="text-xs text-neutral-400 hover:text-neutral-700 underline underline-offset-2 cursor-pointer transition-colors"
                >
                  Already joined but can't make it today?
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
