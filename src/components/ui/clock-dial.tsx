import React, { useRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface ClockDialProps {
    mode: 'hours' | 'minutes';
    value: number;
    onChange: (value: number) => void;
    onModeChange?: (mode: 'hours' | 'minutes') => void;
    is24Hour?: boolean;
}

export const ClockDial: React.FC<ClockDialProps> = ({
    mode,
    value,
    onChange,
    onModeChange,
    is24Hour = true,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Constants for geometry
    const RADIUS = 120; // Radius of the dial
    const INNER_RADIUS = 80; // Radius for inner ring (if 24h)
    const CENTER = { x: 140, y: 140 }; // Center of the SVG (280x280)

    // Calculate position from value
    const getPosition = (val: number, currentMode: 'hours' | 'minutes') => {
        let angle = 0;
        let r = RADIUS;

        if (currentMode === 'hours') {
            if (is24Hour) {
                // 24h mode: 00-11 inner, 12-23 outer? Or vice versa?
                // Material design: 00 is top. 12 is top.
                // Usually 1-12 is inner, 13-00 is outer.
                // Let's assume standard 24h face:
                // 00 is at top (12 position).
                // 12 is at top (12 position).
                // Wait, 0-12 and 13-23.
                // Let's stick to a simpler single ring 12h if 24h is too complex, 
                // but the user showed 16:43.
                // Let's try 0-23 mapping.
                // 0 = 12 (top), 6 = bottom.
                // 12 = top.
                // If val is 0 or 12, angle is -90deg (top).
                // Angle = (val % 12) * 30 - 90.

                angle = (val % 12) * 30 - 90;
                // Inner ring for 0-11? Or 13-23?
                // Material 24h: 1-12 outer, 13-00 inner.
                // Or 00-11 inner, 12-23 outer.
                // Let's use: 00-11 (AM) inner, 12-23 (PM) outer.
                // Actually, usually 13-23 + 00 is outer, 1-12 is inner.
                // Let's try to match the screenshot which showed 16 selected.
                // Let's assume single ring for simplicity if possible, but 24 numbers is crowded.
                // I'll implement two rings for hours in 24h mode.
                if (val >= 0 && val < 12) {
                    r = INNER_RADIUS; // Inner ring for AM (0-11)
                } else {
                    r = RADIUS; // Outer ring for PM (12-23)
                }
            } else {
                // 12h mode
                angle = (val % 12) * 30 - 90;
            }
        } else {
            // Minutes: 0-59
            angle = val * 6 - 90;
        }

        const rad = (angle * Math.PI) / 180;
        return {
            x: CENTER.x + r * Math.cos(rad),
            y: CENTER.y + r * Math.sin(rad),
        };
    };

    const { x, y } = getPosition(value, mode);

    // Handle interaction
    const handleInteraction = (clientX: number, clientY: number, isFinal: boolean) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const dx = clientX - (rect.left + rect.width / 2);
        const dy = clientY - (rect.top + rect.height / 2);

        // Angle in degrees (-180 to 180)
        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        // Convert to 0-360 starting from top (-90)
        // atan2 returns 0 at 3 o'clock.
        // We want 0 at 12 o'clock.
        // 3 o'clock = 0 deg.
        // 12 o'clock = -90 deg.
        // So add 90 to align 0 with 12 o'clock.
        angle += 90;
        if (angle < 0) angle += 360;

        // Distance from center
        const dist = Math.sqrt(dx * dx + dy * dy);

        let newValue = value;

        if (mode === 'hours') {
            if (is24Hour) {
                // Determine if inner or outer ring based on distance
                // Midpoint between INNER_RADIUS (80) and RADIUS (120) is 100.
                const isInner = dist < 100;

                // Calculate hour from angle (30 deg per hour)
                // Round to nearest 30 deg
                const sector = Math.round(angle / 30) % 12;

                if (isInner) {
                    // Inner ring: 0-11
                    newValue = sector === 0 ? 0 : sector; // 12 position is 0
                    // Wait, sector 0 (top) is 0. sector 1 is 1...
                    // If sector is 0 (12 o'clock), it's 0.
                    // But usually 12 is at top for 12h clock.
                    // For 24h clock 0-11 ring: 0 is top.
                    // For 12-23 ring: 12 is top.
                    newValue = sector;
                } else {
                    // Outer ring: 12-23
                    // sector 0 (top) is 12.
                    newValue = sector + 12;
                    // Special case: if sector is 0 (top), it's 12.
                    // If sector is 1 (1 o'clock), it's 13.
                    if (newValue === 24) newValue = 12; // Should not happen with % 12
                }

                // Correction: 
                // Inner ring (0-11): 0 is top.
                // Outer ring (12-23): 12 is top.
                // Angle 0 (top) -> sector 0.
                // Inner: 0. Outer: 12.

            } else {
                // 12h mode
                const sector = Math.round(angle / 30) % 12;
                newValue = sector === 0 ? 12 : sector;
            }
        } else {
            // Minutes
            // 6 deg per minute
            const sector = Math.round(angle / 6) % 60;
            newValue = sector;
        }

        onChange(newValue);
        if (isFinal && onModeChange && mode === 'hours') {
            onModeChange('minutes');
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        handleInteraction(e.clientX, e.clientY, false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            handleInteraction(e.clientX, e.clientY, false);
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (isDragging) {
            setIsDragging(false);
            handleInteraction(e.clientX, e.clientY, true);
        }
    };

    // Touch support
    const handleTouchStart = (e: React.TouchEvent) => {
        setIsDragging(true);
        handleInteraction(e.touches[0].clientX, e.touches[0].clientY, false);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isDragging) {
            e.preventDefault(); // Prevent scrolling
            handleInteraction(e.touches[0].clientX, e.touches[0].clientY, false);
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        setIsDragging(false);
        // Use changedTouches for the final position
        handleInteraction(e.changedTouches[0].clientX, e.changedTouches[0].clientY, true);
    };

    // Render numbers
    const renderNumbers = () => {
        const numbers = [];
        if (mode === 'hours') {
            if (is24Hour) {
                // Outer ring (12-23)
                for (let i = 12; i < 24; i++) {
                    const angle = (i % 12) * 30 - 90;
                    const rad = (angle * Math.PI) / 180;
                    const nx = CENTER.x + RADIUS * Math.cos(rad);
                    const ny = CENTER.y + RADIUS * Math.sin(rad);
                    const isSelected = value === i;
                    numbers.push(
                        <text
                            key={i}
                            x={nx}
                            y={ny}
                            dy="0.35em" // Vertical center
                            textAnchor="middle"
                            className={cn(
                                "text-sm font-medium select-none pointer-events-none",
                                isSelected ? "fill-primary-foreground" : "fill-foreground"
                            )}
                        >
                            {i === 0 ? '00' : i}
                        </text>
                    );
                }
                // Inner ring (0-11)
                for (let i = 0; i < 12; i++) {
                    const angle = (i % 12) * 30 - 90;
                    const rad = (angle * Math.PI) / 180;
                    const nx = CENTER.x + INNER_RADIUS * Math.cos(rad);
                    const ny = CENTER.y + INNER_RADIUS * Math.sin(rad);
                    const isSelected = value === i;
                    numbers.push(
                        <text
                            key={i}
                            x={nx}
                            y={ny}
                            dy="0.35em"
                            textAnchor="middle"
                            className={cn(
                                "text-xs font-medium select-none pointer-events-none",
                                isSelected ? "fill-primary-foreground" : "fill-muted-foreground"
                            )}
                        >
                            {i === 0 ? '00' : i}
                        </text>
                    );
                }
            } else {
                // 12h numbers
                for (let i = 1; i <= 12; i++) {
                    const angle = (i % 12) * 30 - 90;
                    const rad = (angle * Math.PI) / 180;
                    const nx = CENTER.x + RADIUS * Math.cos(rad);
                    const ny = CENTER.y + RADIUS * Math.sin(rad);
                    const isSelected = value === i || (value === 0 && i === 12);
                    numbers.push(
                        <text
                            key={i}
                            x={nx}
                            y={ny}
                            dy="0.35em"
                            textAnchor="middle"
                            className={cn(
                                "text-sm font-medium select-none pointer-events-none",
                                isSelected ? "fill-primary-foreground" : "fill-foreground"
                            )}
                        >
                            {i}
                        </text>
                    );
                }
            }
        } else {
            // Minutes - show every 5 minutes
            for (let i = 0; i < 60; i += 5) {
                const angle = i * 6 - 90;
                const rad = (angle * Math.PI) / 180;
                const nx = CENTER.x + RADIUS * Math.cos(rad);
                const ny = CENTER.y + RADIUS * Math.sin(rad);
                const isSelected = value === i;
                numbers.push(
                    <text
                        key={i}
                        x={nx}
                        y={ny}
                        dy="0.35em"
                        textAnchor="middle"
                        className={cn(
                            "text-sm font-medium select-none pointer-events-none",
                            isSelected ? "fill-primary-foreground" : "fill-foreground"
                        )}
                    >
                        {i.toString().padStart(2, '0')}
                    </text>
                );
            }
        }
        return numbers;
    };

    return (
        <div
            ref={containerRef}
            className="relative w-64 h-64 touch-none select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <svg width="280" height="280" viewBox="0 0 280 280" className="w-full h-full bg-muted/30 rounded-full">
                {/* Clock Face Background */}
                <circle cx="140" cy="140" r="128" className="fill-muted/20" />

                {/* Center Dot */}
                <circle cx="140" cy="140" r="2" className="fill-primary" />

                {/* Hand Line */}
                <line
                    x1="140"
                    y1="140"
                    x2={x}
                    y2={y}
                    className="stroke-primary stroke-2"
                />

                {/* Hand Circle (Selector) */}
                <circle
                    cx={x}
                    cy={y}
                    r="16"
                    className="fill-primary"
                />

                {/* Numbers */}
                {renderNumbers()}
            </svg>
        </div>
    );
};
