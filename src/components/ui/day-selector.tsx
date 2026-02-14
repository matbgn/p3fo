import React from 'react';
import { cn } from '@/lib/utils';
import { normalizePreferredDays } from '@/utils/scheduler-utils';

interface DaySelectorProps {
    value?: number[] | Record<string, number>;
    onChange: (value: Record<string, number>) => void;
    className?: string;
    disabled?: boolean;
}

const DAYS = [
    { label: 'M', value: 1 },
    { label: 'T', value: 2 },
    { label: 'W', value: 3 },
    { label: 'T', value: 4 },
    { label: 'F', value: 5 },
    { label: 'S', value: 6 },
    { label: 'S', value: 0 },
];

export const DaySelector: React.FC<DaySelectorProps> = ({
    value,
    onChange,
    className,
    disabled
}) => {
    const normalized = normalizePreferredDays(value);

    // Toggle Logic: 0 (Off) -> 1 (Full) -> 0.5 (Half) -> 0 (Off)
    const handleClick = (dayValue: number) => {
        if (disabled) return;

        const currentCapacity = normalized[dayValue] || 0;
        let newCapacity = 0;

        if (currentCapacity === 0) {
            newCapacity = 1;
        } else if (currentCapacity === 1) {
            newCapacity = 0.5;
        } else {
            newCapacity = 0;
        }

        const newValue: Record<string, number> = {};

        // Copy existing (filtering out the clicked day first)
        Object.entries(normalized).forEach(([d, c]) => {
            if (parseInt(d) !== dayValue) {
                newValue[d] = c;
            }
        });

        // Add new capacity if > 0
        if (newCapacity > 0) {
            newValue[dayValue] = newCapacity;
        }

        onChange(newValue);
    };

    return (
        <div className={cn("flex gap-1", className)}>
            {DAYS.map(day => {
                const capacity = normalized[day.value] || 0;

                // Style calculation
                let style: React.CSSProperties = {};
                let classes = "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-primary";

                if (capacity === 1) {
                    classes = "bg-primary text-primary-foreground border-primary";
                } else if (capacity === 0.5) {
                    classes = "text-primary-foreground border-primary";
                    style = {
                        background: 'linear-gradient(135deg, hsl(var(--primary)) 50%, transparent 50%)'
                    };
                }

                return (
                    <button
                        key={day.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleClick(day.value)}
                        style={style}
                        className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-all border",
                            classes,
                            disabled && "opacity-50 cursor-not-allowed"
                        )}
                        title={capacity === 1 ? 'Full Day' : capacity === 0.5 ? 'Half Day' : 'Off'}
                    >
                        {day.label}
                    </button>
                );
            })}
        </div>
    );
};
