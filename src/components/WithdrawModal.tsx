import React, { useState } from 'react';
import { X, AlertTriangle, Check, ArrowRight } from 'lucide-react';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledRoll?: string;
  onWithdrawnSuccess: (newTotalCount?: number) => void;
  eventId?: string;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({
  isOpen,
  onClose,
  prefilledRoll = '',
  onWithdrawnSuccess,
  eventId,
}) => {
  const [rollNumber, setRollNumber] = useState(prefilledRoll);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Sync prefilled roll if provided
  React.useEffect(() => {
    if (prefilledRoll) {
      setRollNumber(prefilledRoll);
    }
  }, [prefilledRoll]);

  if (!isOpen) return null;

  const handleWithdraw = async () => {
    const rollToUse = (rollNumber || '').trim().toUpperCase();
    if (!rollToUse) {
      setError("Please enter your college roll number to confirm.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/participants/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNumber: rollToUse, eventId }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Could not process withdrawal. Please try again.");
        return;
      }

      setIsSuccess(true);
      // Remove or mark in local storage
      localStorage.removeItem('odhkan_user_roll');
      localStorage.removeItem('odhkan_user_name');
      onWithdrawnSuccess(data.totalCount);
    } catch {
      setError("Network issue. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetAndClose = () => {
    setIsSuccess(false);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-2xl border border-[#ECEAE4] shadow-2xl p-6 sm:p-8 transition-all">
        {/* Close Button */}
        <button
          onClick={handleResetAndClose}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 transition-colors p-1.5 rounded-md hover:bg-neutral-100 cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-800 flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6" />
            </div>

            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950 mb-2">
              You're all set.
            </h3>
            <p className="text-sm text-neutral-600 mb-6">
              You've been removed from this Odhkan. You can always join next time or rejoin anytime before groups are locked.
            </p>

            <button
              onClick={handleResetAndClose}
              className="w-full bg-neutral-900 text-white font-medium py-2.5 rounded-lg text-sm hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          <div>
            {/* Modal Header */}
            <h3 className="text-2xl font-bold tracking-tight text-neutral-950 mb-2 font-sans">
              Can't make it?
            </h3>
            <p className="text-sm text-neutral-600 leading-relaxed mb-5">
              No worries. If you can't participate today, you can remove yourself from this Odhkan.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Roll number input if needed */}
            <div className="mb-6">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1.5">
                Confirm your roll number
              </label>
              <input
                type="text"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value.toUpperCase())}
                placeholder="e.g. 24BDXXXX"
                className="w-full px-4 py-2.5 bg-neutral-50 border border-[#D5D2C9] rounded-lg text-sm text-neutral-900 font-mono tracking-wider focus:bg-white focus:outline-none focus:border-black transition-colors"
              />
            </div>

            {/* Buttons: Stay in (neutral/primary) vs I can't make it (subtle) */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full py-3 px-4 rounded-lg bg-neutral-900 text-white text-sm font-semibold hover:bg-neutral-800 transition-colors cursor-pointer shadow-xs"
              >
                Stay in
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={handleWithdraw}
                className="w-full py-2.5 px-4 rounded-lg text-xs font-medium text-neutral-500 hover:text-red-700 hover:bg-red-50/70 transition-colors cursor-pointer border border-transparent hover:border-red-200"
              >
                {loading ? 'Removing...' : "I can't make it"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
