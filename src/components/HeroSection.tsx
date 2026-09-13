import React from 'react';
import { ArrowRight, Clock, Users, Sparkles } from 'lucide-react';
import { CountdownTime } from '../types';
import { formatCountdownString } from '../utils/countdown';

interface HeroSectionProps {
  totalCount: number;
  countdown: CountdownTime;
  isRevealed: boolean;
  onJoinClick: () => void;
  onRevealClick: () => void;
  eventDate?: string;
  eventDay?: string;
  eventTimeFormatted?: string;
  eventDisplayTitle?: string;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  totalCount,
  countdown,
  isRevealed,
  onJoinClick,
  onRevealClick,
  eventDate,
  eventDay,
  eventTimeFormatted,
  eventDisplayTitle,
}) => {
  return (
    <section className="relative pt-12 sm:pt-20 pb-16 sm:pb-20 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        {/* Brand Tag Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/30 bg-white/10 text-xs text-white shadow-2xs mb-8 sm:mb-10">
          <span className="font-semibold text-white tracking-wide uppercase text-[10px]">
            COLLEGE INITIATIVE
          </span>
          <span className="text-white/40">•</span>
          <span>Meet beyond your circle.</span>
        </div>

        {/* Hero Heading: Grounded, warm, community-focused */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.06] mb-6 font-sans">
          You know your people. <br />
          <span className="text-white/75 font-normal">
            Now meet some more.
          </span>
        </h1>

        {/* Supporting Copy */}
        <p className="text-lg sm:text-xl text-white/90 leading-relaxed font-normal mb-8 max-w-2xl">
          Odhkan brings students from across your college together in small groups so you can meet people outside your usual circle.
        </p>

        {/* Primary CTA and supporting text */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-14 sm:mb-16">
          {isRevealed ? (
            <button
              onClick={onRevealClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-neutral-950 text-white px-7 py-3.5 rounded-lg text-base font-semibold hover:bg-black active:scale-[0.99] transition-all shadow-xs group cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-neutral-300" />
              <span>Find your group</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ) : (
            <button
              onClick={onJoinClick}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-neutral-950 text-white px-7 py-3.5 rounded-lg text-base font-semibold hover:bg-black active:scale-[0.99] transition-all shadow-xs group cursor-pointer"
            >
              <span>Join Odhkan</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}

          <span className="text-xs sm:text-sm text-white/80 font-medium px-1">
            20 seconds. That's it.
          </span>
        </div>

        {/* Live Participation Counter & Friday Countdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-8 border-t border-black/15">
          {/* Live Participant Block */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 sm:p-6 shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-bold tracking-wider uppercase text-neutral-900">
                The college is joining
              </span>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-neutral-950 tracking-tight">
              {totalCount} students are in Odhkan.
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              More people. More circles. More connections.
            </p>
          </div>

          {/* Dynamic Event Countdown Block */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 sm:p-6 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2 text-neutral-600">
              <Clock className="w-3.5 h-3.5 text-neutral-700" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-800">
                Groups meet {eventDisplayTitle || 'Friday at 3:00 PM'}
              </span>
            </div>

            {isRevealed ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-xl sm:text-2xl">
                  <span>● Groups Revealed</span>
                </div>
                <p className="text-xs text-neutral-500">
                  {eventDate ? `${eventDate} · Reveal active` : 'The wait is over. Find your group.'}
                </p>
              </div>
            ) : (
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-neutral-950 tracking-tight font-mono">
                  {formatCountdownString(countdown)}
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  Three people from across the college · {eventDate || 'Coming soon'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
