import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface NavbarProps {
  onOpenJoin: () => void;
  onOpenReveal: () => void;
  onOpenWithdraw: () => void;
  isRevealed: boolean;
  totalCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenJoin,
  onOpenReveal,
  onOpenWithdraw,
  isRevealed,
  totalCount,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#E11D1E]/95 backdrop-blur-md border-b border-black/10 text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand Logo - clean previous typography */}
        <a 
          href="#"
          className="group flex items-center gap-2.5 text-white tracking-tight"
        >
          <span className="font-extrabold text-2xl tracking-tight font-sans text-white">
            ODHKAN
          </span>
          <span className="hidden sm:inline-flex items-center text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded border border-white/30 text-white bg-white/10">
            Campus Initiative
          </span>
        </a>

        {/* Right Navigation */}
        <nav className="flex items-center gap-4 sm:gap-6">
          <a
            href="#how-it-works"
            className="hidden sm:inline-block text-sm font-medium text-white/85 hover:text-white transition-colors"
          >
            How it works
          </a>
          <a
            href="#mystery"
            className="hidden sm:inline-block text-sm font-medium text-white/85 hover:text-white transition-colors"
          >
            Friday
          </a>

          {isRevealed ? (
            <button
              onClick={onOpenReveal}
              className="inline-flex items-center gap-2 bg-neutral-950 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-black active:scale-[0.98] transition-all shadow-xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Find your group</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onOpenJoin}
              className="inline-flex items-center gap-2 bg-neutral-950 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-black active:scale-[0.98] transition-all shadow-xs cursor-pointer"
            >
              <span>Join Odhkan</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
