import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Hover tooltip rendered into a body-level portal.
 *
 * A portal rather than a child element because both sidebars are
 * `overflow-y: auto`, which clips anything positioned outside them — and every
 * tooltip here needs to sit beside the sidebar, not inside it.
 *
 * The portal sits a few pixels away from the host in the document, not inside
 * it, so the mouse crosses a real gap moving from one to the other — hiding on
 * the host's `onMouseLeave` alone closes it mid-crossing. That went unnoticed
 * while every tooltip was read-only, but the Venture Capital one put a real
 * button inside — a gap the player can never actually reach is a dead button.
 * Hiding is now debounced and cancelled by entering either side, so a normal
 * hand crossing the gap keeps it open.
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
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    cancelHide();
    const host = hostRef.current;
    if (!host) return;
    // The host span is `display: contents` so it does not disturb the layout it
    // wraps — which also means it has no box of its own. Measure the child.
    const el = (host.firstElementChild as HTMLElement | null) ?? host;
    const r = el.getBoundingClientRect();
    // Keep the panel on screen vertically; 320 is a generous height guess.
    const y = Math.max(8, Math.min(r.top, window.innerHeight - 320));
    setPos({ x: side === 'right' ? r.right + 10 : r.left - 10, y });
  }, [side, cancelHide]);

  // A short delay, cancelled by re-entering either the host or the tooltip
  // itself — long enough to cross the gap between them, short enough that an
  // info-only tooltip still closes as soon as the player looks away.
  const scheduleHide = useCallback(() => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPos(null), 200);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  return (
    <span ref={hostRef} className="tip-host" onMouseEnter={show} onMouseLeave={scheduleHide}>
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
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHide}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
