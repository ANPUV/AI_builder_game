import { useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hover tooltip rendered into a body-level portal.
 *
 * A portal rather than a child element because both sidebars are
 * `overflow-y: auto`, which clips anything positioned outside them — and every
 * tooltip here needs to sit beside the sidebar, not inside it.
 */
export default function Tip({
  content,
  children,
  side = 'right',
  width = 260,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'right' | 'left';
  width?: number;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    // The host span is `display: contents` so it does not disturb the layout it
    // wraps — which also means it has no box of its own. Measure the child.
    const el = (host.firstElementChild as HTMLElement | null) ?? host;
    const r = el.getBoundingClientRect();
    // Keep the panel on screen vertically; 320 is a generous height guess.
    const y = Math.max(8, Math.min(r.top, window.innerHeight - 320));
    setPos({ x: side === 'right' ? r.right + 10 : r.left - 10, y });
  }, [side]);

  const hide = useCallback(() => setPos(null), []);

  return (
    <span ref={hostRef} className="tip-host" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {pos &&
        createPortal(
          <div
            className="tip"
            style={{
              left: pos.x,
              top: pos.y,
              width,
              transform: side === 'left' ? 'translateX(-100%)' : undefined,
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
