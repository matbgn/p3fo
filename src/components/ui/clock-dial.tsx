import React, { useRef, useEffect, useState, useCallback } from 'react';
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
    const rafRef = useRef<number | null>(null);
    const pendingValueRef = useRef<number | null>(null);

    const RADIUS = 120;
    const INNER_RADIUS = 80;
    const CENTER = { x: 140, y: 140 };

    const getPosition = (val: number, currentMode: 'hours' | 'minutes') => {
        let angle = 0;
        let r = RADIUS;

        if (currentMode === 'hours') {
            if (is24Hour) {
                angle = (val % 12) * 30 - 90;
                if (val >= 0 && val < 12) {
                    r = INNER_RADIUS;
                } else {
                    r = RADIUS;
                }
            } else {
                angle = (val % 12) * 30 - 90;
            }
        } else {
            angle = val * 6 - 90;
        }

        const rad = (angle * Math.PI) / 180;
        return {
            x: CENTER.x + r * Math.cos(rad),
            y: CENTER.y + r * Math.sin(rad),
        };
    };

    const computeValue = useCallback((clientX: number, clientY: number): number => {
        if (!containerRef.current) return value;
        const rect = containerRef.current.getBoundingClientRect();
        const dx = clientX - (rect.left + rect.width / 2);
        const dy = clientY - (rect.top + rect.height / 2);

        let angle = Math.atan2(dy, dx) * (180 / Math.PI);
        angle += 90;
        if (angle < 0) angle += 360;

        const dist = Math.sqrt(dx * dx + dy * dy);

        if (mode === 'hours') {
            if (is24Hour) {
                const isInner = dist < 100;
                const sector = Math.round(angle / 30) % 12;
                if (isInner) {
                    return sector;
                } else {
                    const v = sector + 12;
                    return v === 24 ? 12 : v;
                }
            } else {
                const sector = Math.round(angle / 30) % 12;
                return sector === 0 ? 12 : sector;
            }
        } else {
            return Math.round(angle / 6) % 60;
        }
    }, [mode, is24Hour, value]);

    const flushPendingValue = useCallback(() => {
        if (pendingValueRef.current !== null) {
            onChange(pendingValueRef.current);
            pendingValueRef.current = null;
        }
    }, [onChange]);

    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    const handleInteraction = useCallback((clientX: number, clientY: number, isFinal: boolean) => {
        const newValue = computeValue(clientX, clientY);
        if (isFinal) {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            pendingValueRef.current = null;
            onChange(newValue);
            if (onModeChange && mode === 'hours') {
                onModeChange('minutes');
            }
        } else {
            pendingValueRef.current = newValue;
            if (rafRef.current === null) {
                rafRef.current = requestAnimationFrame(() => {
                    rafRef.current = null;
                    flushPendingValue();
                });
            }
        }
    }, [computeValue, onChange, onModeChange, mode, flushPendingValue]);

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

    const handleTouchStart = (e: React.TouchEvent) => {
        setIsDragging(true);
        handleInteraction(e.touches[0].clientX, e.touches[0].clientY, false);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isDragging) {
            e.preventDefault();
            handleInteraction(e.touches[0].clientX, e.touches[0].clientY, false);
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        setIsDragging(false);
        handleInteraction(e.changedTouches[0].clientX, e.changedTouches[0].clientY, true);
    };

    const { x, y } = getPosition(value, mode);

    const renderNumbers = () => {
        const numbers = [];
        if (mode === 'hours') {
            if (is24Hour) {
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
                            dy="0.35em"
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
                <circle cx="140" cy="140" r="128" className="fill-muted/20" />
                <circle cx="140" cy="140" r="2" className="fill-primary" />
                <line
                    x1="140"
                    y1="140"
                    x2={x}
                    y2={y}
                    className="stroke-primary stroke-2"
                />
                <circle
                    cx={x}
                    cy={y}
                    r="16"
                    className="fill-primary"
                />
                {renderNumbers()}
            </svg>
        </div>
    );
};