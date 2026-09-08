/**
 * Flag icons, drawn rather than typed.
 *
 * The obvious implementation is the regional-indicator emoji (🇬🇧, 🇻🇳), and it
 * is the wrong one: Windows ships no colour flag-emoji font, so every Windows
 * player — most of them — sees the bare letters "GB" and "VN" where the flag
 * should be. These are a handful of rects and a star, they render identically
 * everywhere, and they inherit nothing from the platform.
 *
 * Kept deliberately small: a 20x14 field is a favicon, not a vexillological
 * reference, so the Union Jack's diagonals are approximated rather than
 * offset the way the real flag counterchanges them.
 */
export default function Flag({ code, size = 18 }: { code: string; size?: number }) {
  const h = Math.round((size * 14) / 20);
  const common = {
    width: size,
    height: h,
    viewBox: '0 0 20 14',
    // The border keeps a white or red field from bleeding into a pale panel.
    style: { borderRadius: 2, display: 'block', boxShadow: '0 0 0 1px var(--line)' },
    'aria-hidden': true,
  } as const;

  if (code === 'vi') {
    return (
      <svg {...common}>
        <rect width="20" height="14" fill="#da251d" />
        <path
          fill="#ff0"
          d="M10 3.1l1.05 3.23h3.4l-2.75 2 1.05 3.23L10 9.55l-2.75 2 1.05-3.23-2.75-2h3.4z"
        />
      </svg>
    );
  }

  // en, and the fallback for anything unmapped.
  return (
    <svg {...common}>
      <rect width="20" height="14" fill="#012169" />
      {/* Saltire: white first, red laid thinner on top. */}
      <path d="M0 0l20 14M20 0L0 14" stroke="#fff" strokeWidth="3" />
      <path d="M0 0l20 14M20 0L0 14" stroke="#c8102e" strokeWidth="1.4" />
      {/* Cross of St George, over the top of both. */}
      <path d="M10 0v14M0 7h20" stroke="#fff" strokeWidth="4.6" />
      <path d="M10 0v14M0 7h20" stroke="#c8102e" strokeWidth="2.6" />
    </svg>
  );
}
