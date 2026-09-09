import React from 'react';

interface CommunitySectionProps {
  totalCount: number;
}

export const CommunitySection: React.FC<CommunitySectionProps> = ({ totalCount }) => {
  return (
    <section className="py-20 sm:py-28 px-4 sm:px-6 border-t border-black/10 bg-[#E11D1E]">
      <div className="max-w-3xl mx-auto text-center">
        {/* Live indicator line */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-neutral-200 text-xs font-medium text-neutral-900 shadow-2xs mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-bold tracking-wider uppercase text-[10px] text-neutral-900">
            The college is joining
          </span>
        </div>

        {/* Large live number */}
        <div className="mb-4">
          <span className="text-7xl sm:text-9xl md:text-[10rem] font-extrabold tracking-tighter text-white font-sans block leading-none select-none">
            {totalCount}
          </span>
        </div>

        {/* Subtitle */}
        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3 font-sans">
          students are already part of Odhkan.
        </h2>

        {/* Supporting line */}
        <p className="text-base sm:text-lg text-white/85 font-medium max-w-md mx-auto">
          More people. More circles. More connections.
        </p>
      </div>
    </section>
  );
};
