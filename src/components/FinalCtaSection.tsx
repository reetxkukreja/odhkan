import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface FinalCtaSectionProps {
  onJoinClick: () => void;
  onRevealClick: () => void;
  isRevealed: boolean;
}

export const FinalCtaSection: React.FC<FinalCtaSectionProps> = ({
  onJoinClick,
  onRevealClick,
  isRevealed,
}) => {
  return (
    <section className="py-24 sm:py-32 px-4 sm:px-6 border-t border-black/10 bg-[#E11D1E]">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-3 font-sans">
          Don't overthink it.
        </h2>
        <p className="text-xl sm:text-2xl text-white/85 font-medium mb-8">
          Meet people outside your usual circle.
        </p>

        {isRevealed ? (
          <button
            onClick={onRevealClick}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-neutral-950 text-white px-8 py-4 rounded-lg text-base font-semibold hover:bg-black active:scale-[0.99] transition-all shadow-xs group cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-neutral-300" />
            <span>Find your group</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ) : (
          <button
            onClick={onJoinClick}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-neutral-950 text-white px-8 py-4 rounded-lg text-base font-semibold hover:bg-black active:scale-[0.99] transition-all shadow-xs group cursor-pointer"
          >
            <span>Join Odhkan</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        <p className="text-xs text-white/70 mt-4 font-normal">
          Takes 20 seconds. Random people. One college. More connections.
        </p>
      </div>
    </section>
  );
};
