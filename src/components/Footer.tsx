import React from 'react';

interface FooterProps {
  onOpenAdmin: () => void;
  onOpenWithdraw: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenAdmin, onOpenWithdraw }) => {
  return (
    <footer className="border-t border-black/10 bg-[#E11D1E] py-12 px-4 sm:px-6 text-white">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="text-center sm:text-left flex flex-col items-center sm:items-start gap-1">
          <span className="font-extrabold text-xl tracking-tight text-white font-sans">
            ODHKAN
          </span>
          <p className="text-xs sm:text-sm text-white/75 mt-1">
            Random people. One college. More connections.
          </p>
        </div>

        <div className="flex items-center gap-5 text-xs text-white/70">
          <span>Student initiative</span>
          <span>•</span>
          <button
            onClick={onOpenWithdraw}
            className="text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            Can't make it today?
          </button>
          <span>•</span>
          {/* Subtle Manage link */}
          <button
            onClick={onOpenAdmin}
            id="manage-admin-link"
            className="text-white/60 hover:text-white transition-colors underline-offset-4 hover:underline cursor-pointer"
          >
            Manage
          </button>
        </div>
      </div>
    </footer>
  );
};
