import React from "react";

interface LazyCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  // Drag & Drop passthrough — applied **only** to the placeholder so cards
  // remain draggable even before the heavy child subtree mounts.  When the
  // child becomes visible its own draggable surface takes over and these
  // props are intentionally omitted from the wrapper to avoid nested-drag
  // conflicts.
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
}

/**
 * LazyCard: Only renders children when the element is near the viewport.
 * Uses IntersectionObserver with a 200px rootMargin to pre-render before scrolling into view.
 * Once visible, the card stays rendered (no unmount on scroll-out) to avoid flickering.
 *
 * Drag props are forwarded to the **placeholder only** so that drag & drop works even
 * when the real card hasn't mounted yet.  When the child mounts its own
 * draggable surface takes over; the placeholder props are then irrelevant.
 */
const LazyCard: React.FC<LazyCardProps> = React.memo(({
  children,
  className,
  style,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!isVisible) {
    return (
      <div
        ref={ref}
        className={className}
        style={{ minHeight: "60px", ...style }}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
    );
  }

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
});

export { LazyCard };
