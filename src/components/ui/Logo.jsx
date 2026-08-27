import React from 'react';

/**
 * Logo — Official ARCA Budgeting brand logo component
 * Matches exact design: 3 stacked gold/bronze pill bars mark + lowercase 'stacked' + uppercase 'BUDGETING'
 */
export default function Logo({ size = 'md', className = '' }) {
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  const markHeight = isSm ? 'h-7' : isLg ? 'h-11' : 'h-8';
  const titleText = isSm ? 'text-lg' : isLg ? 'text-3xl' : 'text-2xl';
  const subText = isSm ? 'text-[8px] tracking-[0.22em]' : isLg ? 'text-[10px] tracking-[0.3em]' : 'text-[9px] tracking-[0.26em]';

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      {/* 3 ARCA Gold/Bronze Pill Bars Mark */}
      <svg
        viewBox="0 0 36 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${markHeight} w-auto shrink-0`}
      >
        <rect x="0" y="2" width="36" height="10" rx="3.5" fill="#8c6d37" />
        <rect x="0" y="17" width="36" height="10" rx="3.5" fill="#cfa143" />
        <rect x="0" y="32" width="36" height="10" rx="3.5" fill="#e7b956" />
      </svg>

      {/* Brand Name & Subtitle */}
      <div className="flex flex-col justify-center leading-none">
        <span className={`font-extrabold text-white tracking-tight ${titleText} font-sans`}>
          ARCA
        </span>
        <span className={`font-semibold text-zinc-400 uppercase mt-1 ${subText} font-sans`}>
          BUDGETING
        </span>
      </div>
    </div>
  );
}
