/** Original illustration of a campus at dusk, drawn in the Zapa palette. */
const LEFT = [
  [0, 0], [1, 1], [2, 0], [0, 1], [1, 0], [2, 1], [0, 2], [1, 2], [2, 2],
];
const TOWER = [0, 1, 0, 1, 1, 0, 1, 0];

export function CampusScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 640 380" role="img" aria-label="Students gathering between two campus buildings at dusk" className={className}>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2397" />
          <stop offset="1" stopColor="#1c1669" />
        </linearGradient>
      </defs>
      <rect width="640" height="380" rx="28" fill="url(#sky)" />
      <circle cx="320" cy="150" r="130" fill="#ffffff" opacity="0.06" />
      <g className="twinkle" fill="#ead9a6">
        <circle cx="70" cy="48" r="3" />
        <circle cx="150" cy="78" r="2.4" />
        <circle cx="520" cy="44" r="2.8" />
        <circle cx="585" cy="96" r="2" />
        <circle cx="260" cy="36" r="2" />
      </g>
      <path d="M0 330 L640 300 V380 H0 Z" fill="#ead9a6" />
      <path d="M0 352 L640 328 V380 H0 Z" fill="#d9c486" />
      <g transform="translate(34 150)">
        <rect width="150" height="190" rx="6" fill="#148bc2" />
        <rect width="150" height="16" rx="4" fill="#0c6a96" />
        {LEFT.map(([c, r], i) => (
          <rect key={i} x={18 + c * 42} y={34 + r * 50} width="28" height="34" rx="3" fill={i === 4 ? "#1c1669" : i % 4 === 1 ? "#ead9a6" : "#f6f3ea"} />
        ))}
      </g>
      <g transform="translate(446 70)">
        <rect x="40" width="70" height="60" rx="5" fill="#148bc2" />
        <rect x="34" y="-6" width="82" height="12" rx="3" fill="#ead9a6" />
        <rect x="70" y="-30" width="4" height="26" fill="#ead9a6" />
        <circle cx="72" cy="-34" r="7" fill="#ead9a6" />
        <rect x="52" y="16" width="14" height="22" rx="2" fill="#f6f3ea" />
        <rect x="84" y="16" width="14" height="22" rx="2" fill="#ead9a6" />
        <rect y="60" width="160" height="230" rx="6" fill="#0f7fb5" />
        <rect y="60" width="160" height="14" rx="3" fill="#ead9a6" />
        {TOWER.map((on, i) => (
          <rect key={i} x={20 + (i % 3) * 44} y={92 + Math.floor(i / 3) * 48} width="28" height="32" rx="3" fill={i === 4 ? "#1c1669" : on ? "#ead9a6" : "#f6f3ea"} />
        ))}
      </g>
      <g transform="translate(250 262)">
        <ellipse cx="68" cy="102" rx="64" ry="9" fill="#1c1669" opacity="0.12" />
        <circle cx="68" cy="52" r="52" fill="none" stroke="#148bc2" strokeWidth="5" />
        <g fill="#1c1669">
          <rect x="52" y="-2" width="32" height="52" rx="16" />
          <rect x="6" y="14" width="26" height="42" rx="13" />
          <rect x="104" y="18" width="26" height="40" rx="13" />
        </g>
        <g fill="#f6f3ea">
          <circle cx="68" cy="-12" r="11" />
          <circle cx="19" cy="4" r="9" />
          <circle cx="117" cy="8" r="9" />
        </g>
      </g>
      <g className="drift" opacity="0.95">
        <path d="M24 64 Q80 24 160 52" fill="none" stroke="#148bc2" strokeWidth="3" />
        <circle cx="50" cy="48" r="8" fill="#148bc2" />
        <circle cx="86" cy="42" r="7" fill="#ead9a6" />
        <circle cx="124" cy="46" r="6" fill="#f6f3ea" />
      </g>
    </svg>
  );
}
