import React from "react";

interface LazyCardProps {
  children: React.ReactNode;
  /** Cheap content shown while the card is off-screen (usually the title). */
  preview?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  /** Mount the heavy card immediately (forced jump target). */
  forceMount?: boolean;
}

/**
 * LazyCard: mounts the heavy card subtree only when the placeholder is near
 * the viewport, but always renders a cheap `preview` (the task title) so a card
 * moved by Yjs is visible in its new column immediately.
 *
 * The previous version rendered an empty placeholder, which made moved cards
 * look missing until a reload. Mounting every card unconditionally fixed that
 * but pushed the render benchmark over its p95 budget.
 */
const LazyCard: React.FC<LazyCardProps> = React.memo(({
  children,
  preview,
  className,
  style,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  forceMount,
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

  if (!isVisible && !forceMount) {
    return (
      <div
        ref={ref}
        className={
          className ?? "rounded-md border bg-card px-2 py-1.5 text-sm text-muted-foreground"
        }
        style={{ minHeight: "60px", ...style }}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {preview}
      </div>
    );
  }

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
});

export { LazyCard };
