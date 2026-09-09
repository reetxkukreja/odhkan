import React from 'react';
import { CountdownTime } from '../types';

interface MysterySectionProps {
  countdown: CountdownTime;
  isRevealed: boolean;
  onRevealClick: () => void;
}

export const MysterySection: React.FC<MysterySectionProps> = ({
  countdown,
  isRevealed,
  onRevealClick,
}) => {
  return (
    <section id="mystery" className="py-24 sm:py-32 px-4 sm:px-6 border-t border-black/10 bg-[#E11D1E]">
      <div className="max-w-3xl mx-auto text-center">
        {/* Community Anticipation Headline */}
        <h2 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-3 leading-tight font-sans text-white">
          Three people from across the college.
        </h2>

        {/* Supporting copy */}
        <p className="text-xl sm:text-2xl font-medium text-white/80 mb-6">
          Meeting on Friday.
        </p>

        {/* Grounded Paragraph */}
        <p className="text-base sm:text-lg text-white/90 max-w-xl mx-auto leading-relaxed mb-10">
          Small groups. People from different circles and years. Start with a simple hello.
        </p>

        {/* Reveal Target Banner Card */}
        <div className="inline-flex flex-col items-center bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-md text-neutral-950">
          <span className="text-xs font-semibold uppercase tracking-widest text-[#E11D1E] mb-2">
            Friday at 3:00 PM
          </span>

          <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-950 mb-4 font-sans">
            Here's who you're meeting.
          </span>

          {isRevealed ? (
            <div className="mt-2">
              <span className="inline-block bg-neutral-950 text-white text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full mb-3">
                Groups Revealed
              </span>
              <p className="text-sm text-neutral-700 mb-4">
                The countdown is complete. Check who you're meeting.
              </p>
              <button
                onClick={onRevealClick}
                className="bg-neutral-950 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-black transition-colors cursor-pointer"
              >
                Find your group →
              </button>
            </div>
          ) : (
            <div className="w-full">
              {/* Structured Countdown Tiles */}
              <div className="grid grid-cols-4 gap-2 sm:gap-3 my-2">
                <div className="bg-[#FAF9F5] border border-neutral-200 rounded-lg p-3 text-center">
                  <span className="block font-mono text-2xl sm:text-3xl font-bold text-neutral-950">
                    {countdown.days}
                  </span>
                  <span className="text-[10px] sm:text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Days
                  </span>
                </div>
                <div className="bg-[#FAF9F5] border border-neutral-200 rounded-lg p-3 text-center">
                  <span className="block font-mono text-2xl sm:text-3xl font-bold text-neutral-950">
                    {countdown.hours.toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] sm:text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Hours
                  </span>
                </div>
                <div className="bg-[#FAF9F5] border border-neutral-200 rounded-lg p-3 text-center">
                  <span className="block font-mono text-2xl sm:text-3xl font-bold text-neutral-950">
                    {countdown.minutes.toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] sm:text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Mins
                  </span>
                </div>
                <div className="bg-[#FAF9F5] border border-neutral-200 rounded-lg p-3 text-center">
                  <span className="block font-mono text-2xl sm:text-3xl font-bold text-neutral-950">
                    {countdown.seconds.toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] sm:text-xs font-medium text-neutral-500 uppercase tracking-wider">
                    Secs
                  </span>
                </div>
              </div>
              <p className="text-xs text-neutral-500 mt-4 font-medium">
                Groups revealed Friday at 3:00 PM IST
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
