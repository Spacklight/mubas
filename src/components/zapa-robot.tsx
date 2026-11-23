/** Original mascot for Zapa AI: a friendly study robot in a graduation cap, holding a MUBAS book. */
export function ZapaRobot({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 240" role="img" aria-label="Zapa AI, a friendly study robot" className={className}>
      <defs>
        <linearGradient id="rb-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d9e4f5" /></linearGradient>
        <radialGradient id="rb-eye" cx="0.5" cy="0.5" r="0.6"><stop offset="0" stopColor="#7fe7ff" /><stop offset="1" stopColor="#1fa8ff" /></radialGradient>
      </defs>
      <ellipse cx="108" cy="230" rx="62" ry="8" fill="#0a1054" opacity="0.25" />
      {/* body */}
      <rect x="62" y="136" width="92" height="80" rx="34" fill="url(#rb-body)" />
      <rect x="86" y="150" width="44" height="10" rx="5" fill="#1fa8ff" opacity="0.5" />
      {/* book */}
      <g transform="rotate(-8 70 180)">
        <rect x="34" y="160" width="62" height="50" rx="6" fill="#12307a" />
        <rect x="34" y="160" width="62" height="50" rx="6" fill="none" stroke="#ead9a6" strokeWidth="2" />
        <text x="65" y="192" textAnchor="middle" fontSize="12" fontWeight="800" fill="#ffffff" fontFamily="sans-serif">MUBAS</text>
      </g>
      {/* pointing arm */}
      <path d="M150 156 Q184 140 180 100" fill="none" stroke="#e8eef9" strokeWidth="16" strokeLinecap="round" />
      <circle cx="180" cy="96" r="12" fill="#ffffff" />
      <rect x="176" y="66" width="8" height="28" rx="4" fill="#ffffff" />
      {/* head */}
      <rect x="52" y="54" width="112" height="90" rx="40" fill="url(#rb-body)" />
      <rect x="64" y="70" width="88" height="58" rx="28" fill="#0b1650" />
      <ellipse cx="88" cy="98" rx="13" ry="15" fill="url(#rb-eye)" />
      <ellipse cx="128" cy="98" rx="13" ry="15" fill="url(#rb-eye)" />
      <path d="M96 116 Q108 126 120 116" fill="none" stroke="#7fe7ff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="42" cy="100" r="11" fill="#1fa8ff" />
      <circle cx="174" cy="100" r="11" fill="#1fa8ff" />
      {/* graduation cap */}
      <path d="M108 20 L170 46 L108 72 L46 46 Z" fill="#12307a" />
      <path d="M74 60 V76 Q108 90 142 76 V60" fill="#0e2563" />
      <path d="M108 46 L48 58" stroke="#ead9a6" strokeWidth="3" />
      <circle cx="48" cy="60" r="5" fill="#ead9a6" />
      <path d="M48 62 L42 88" stroke="#e7a93b" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
