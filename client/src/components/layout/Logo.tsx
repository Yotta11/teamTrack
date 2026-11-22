export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? '#FFFFFF' : '#2449D8'} />
        <path d="M9 11h14M9 16h9M9 21h5" stroke={light ? '#2449D8' : '#FFFFFF'} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="22.5" cy="21" r="2.6" fill={light ? '#678BF5' : '#9AB4FB'} />
      </svg>
      <span className={`text-[17px] font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink-900'}`}>TeamTrack</span>
    </span>
  );
}
