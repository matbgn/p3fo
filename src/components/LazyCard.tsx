import React from "react";

/**
 * LazyCard: Only renders children when the element is near the viewport.
 * Uses IntersectionObserver with a 200px rootMargin to pre-render before scrolling into view.
 * Once visible, the card stays rendered (no unmount on scroll-out) to avoid flickering.
 */
const LazyCard: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = React.memo(({ children, className, style }) => {
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
        return <div ref={ref} className={className} style={{ minHeight: "60px", ...style }} />;
    }

    return <div ref={ref} className={className} style={style}>{children}</div>;
});

export { LazyCard };
