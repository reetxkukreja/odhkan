import React from 'react';

export const HowItWorksSection: React.FC = () => {
  const steps = [
    {
      number: '01',
      title: 'Join in.',
      description: 'Add your name, roll number and phone number.',
    },
    {
      number: '02',
      title: 'Meet outside your circle.',
      description: "We'll put you into a small group with people you may not usually interact with.",
    },
    {
      number: '03',
      title: 'Show up.',
      description: 'Meet your group on Friday and start with a hello.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 sm:py-28 px-4 sm:px-6 border-t border-black/10 bg-[#E11D1E]">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/70 mb-3">
          The Process
        </p>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-14 font-sans">
          How Odhkan works
        </h2>

        {/* 3 clean steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-10">
          {steps.map((step) => (
            <div
              key={step.number}
              className="flex flex-col border-t-2 border-white/40 pt-6"
            >
              {/* Large step number */}
              <span className="font-mono text-3xl sm:text-4xl font-light text-white/50 mb-4">
                {step.number}
              </span>

              {/* Step title */}
              <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight mb-2 font-sans">
                {step.title}
              </h3>

              {/* Description */}
              <p className="text-sm sm:text-base text-white/85 leading-relaxed font-normal">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
