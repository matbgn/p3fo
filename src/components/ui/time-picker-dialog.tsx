import React, { useState, useEffect } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { ClockDial } from './clock-dial';
import { Button } from './button';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { useCombinedSettings } from '@/hooks/useCombinedSettings';

interface TimePickerProps {
    isOpen: boolean;
    onClose: () => void;
    initialTime?: number; // Unix timestamp
    onTimeChange: (timestamp: number) => void; // Returns Unix timestamp
}

export const TimePickerDialog: React.FC<TimePickerProps> = ({
    isOpen,
    onClose,
    initialTime,
    onTimeChange,
}) => {
    const { settings } = useCombinedSettings();
    const [selectedDateTime, setSelectedDateTime] = useState<Temporal.PlainDateTime>(() => {
        if (initialTime) {
            const instant = Temporal.Instant.fromEpochMilliseconds(initialTime);
            const timezone = settings.timezone || 'Europe/Zurich';
            const timezoneDateTime = instant.toZonedDateTimeISO(timezone);
            return timezoneDateTime.toPlainDateTime();
        }
        // Default to current time in user's timezone
        const now = Temporal.Now.zonedDateTimeISO(settings.timezone || 'Europe/Zurich');
        return now.toPlainDateTime();
    });
    const [mode, setMode] = useState<'hours' | 'minutes'>('hours');
    const [timeInput, setTimeInput] = useState('');
    const [inputError, setInputError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (initialTime) {
                const instant = Temporal.Instant.fromEpochMilliseconds(initialTime);
                const timezoneDateTime = instant.toZonedDateTimeISO(settings.timezone || 'Europe/Zurich');
                const plainDateTime = timezoneDateTime.toPlainDateTime();
                setSelectedDateTime(plainDateTime);
                setTimeInput(`${plainDateTime.hour.toString().padStart(2, '0')}:${plainDateTime.minute.toString().padStart(2, '0')}`);
            } else {
                const now = Temporal.Now.zonedDateTimeISO(settings.timezone || 'Europe/Zurich');
                const plainDateTime = now.toPlainDateTime();
                setSelectedDateTime(plainDateTime);
                setTimeInput(`${plainDateTime.hour.toString().padStart(2, '0')}:${plainDateTime.minute.toString().padStart(2, '0')}`);
            }
            setMode('hours');
            setInputError(null);
        }
    }, [isOpen, initialTime, settings.timezone]);

    const hours = selectedDateTime.hour;
    const minutes = selectedDateTime.minute;

    // Update time input when dial changes
    useEffect(() => {
        setTimeInput(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
    }, [hours, minutes]);

    const handleDialChange = (val: number) => {
        // Always set seconds to 0 when manually editing time
        if (mode === 'hours') {
            setSelectedDateTime(selectedDateTime.with({ hour: val, second: 0 }));
        } else {
            setSelectedDateTime(selectedDateTime.with({ minute: val, second: 0 }));
        }
    };

    // Parse time input string (supports formats: HH:MM, HH:MM:SS, HHMM, H:MM, etc.)
    const parseTimeInput = (input: string): { hour: number; minute: number } | null => {
        const trimmed = input.trim();
        
        // Try HH:MM or HH:MM:SS format
        const matchWithColon = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (matchWithColon) {
            const hour = parseInt(matchWithColon[1], 10);
            const minute = parseInt(matchWithColon[2], 10);
            if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                return { hour, minute };
            }
        }
        
        // Try HHMM format (no colon)
        const matchNoColon = trimmed.match(/^(\d{1,4})$/);
        if (matchNoColon) {
            const digits = matchNoColon[1];
            if (digits.length <= 2) {
                // Single or double digit = hours only
                const hour = parseInt(digits, 10);
                if (hour >= 0 && hour <= 23) {
                    return { hour, minute: 0 };
                }
            } else if (digits.length === 3) {
                // Three digits: HMM
                const hour = parseInt(digits.slice(0, 1), 10);
                const minute = parseInt(digits.slice(1, 3), 10);
                if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                    return { hour, minute };
                }
            } else if (digits.length === 4) {
                // Four digits: HHMM
                const hour = parseInt(digits.slice(0, 2), 10);
                const minute = parseInt(digits.slice(2, 4), 10);
                if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                    return { hour, minute };
                }
            }
        }
        
        return null;
    };

    const handleTimeInputChange = (value: string) => {
        // Allow only digits and colons
        const sanitized = value.replace(/[^\d:]/g, '');
        setTimeInput(sanitized);
        setInputError(null);
        // Don't parse live - let user finish typing
    };

    const handleTimeInputBlur = () => {
        const parsed = parseTimeInput(timeInput);
        if (parsed) {
            // Always set seconds to 0 when manually editing time
            setSelectedDateTime(selectedDateTime.with({ hour: parsed.hour, minute: parsed.minute, second: 0 }));
            setTimeInput(`${parsed.hour.toString().padStart(2, '0')}:${parsed.minute.toString().padStart(2, '0')}`);
            setInputError(null);
        } else if (timeInput.trim() !== '') {
            setInputError('Invalid time format. Use HH:MM');
        }
    };

    const handleTimeInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleTimeInputBlur();
            const parsed = parseTimeInput(timeInput);
            if (parsed) {
                handleSave();
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    const handleSave = () => {
        // Validate time input first
        const parsed = parseTimeInput(timeInput);
        if (parsed) {
            // Always set seconds to 0 when manually editing time
            const finalDateTime = selectedDateTime.with({ hour: parsed.hour, minute: parsed.minute, second: 0 });
            const timezoneDateTime = finalDateTime.toZonedDateTime(settings.timezone || 'Europe/Zurich');
            onTimeChange(timezoneDateTime.epochMilliseconds);
            onClose();
        } else {
            setInputError('Invalid time format. Use HH:MM');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-auto max-w-[320px] p-0 overflow-hidden flex flex-col items-center">
                <div className="bg-primary p-6 w-full flex flex-col items-center justify-center text-primary-foreground">
                    <div className="text-xs font-medium opacity-70 mb-2 uppercase tracking-wider">Select Time</div>
                    <div className="flex items-end gap-1 text-5xl font-light">
                        <button
                            className={cn("focus:outline-none", mode === 'hours' ? "opacity-100" : "opacity-60")}
                            onClick={() => setMode('hours')}
                        >
                            {hours.toString().padStart(2, '0')}
                        </button>
                        <span className="opacity-60 mb-2 text-3xl">:</span>
                        <button
                            className={cn("focus:outline-none", mode === 'minutes' ? "opacity-100" : "opacity-60")}
                            onClick={() => setMode('minutes')}
                        >
                            {minutes.toString().padStart(2, '0')}
                        </button>
                    </div>
                </div>

                <div className="p-6 flex justify-center">
                    <ClockDial
                        mode={mode}
                        value={mode === 'hours' ? hours : minutes}
                        onChange={handleDialChange}
                        onModeChange={setMode}
                        is24Hour={true}
                    />
                </div>

                {/* Keyboard input section */}
                <div className="px-6 pb-4 w-full">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground font-medium">
                            Or type time (HH:MM)
                        </label>
                        <Input
                            type="text"
                            value={timeInput}
                            onChange={(e) => handleTimeInputChange(e.target.value)}
                            onBlur={handleTimeInputBlur}
                            onKeyDown={handleTimeInputKeyDown}
                            placeholder="14:30"
                            className={cn(
                                "w-full",
                                inputError && "border-red-500 focus-visible:ring-red-500"
                            )}
                        />
                        {inputError && (
                            <span className="text-xs text-red-500">{inputError}</span>
                        )}
                    </div>
                </div>

                <DialogFooter className="p-4 w-full flex justify-end gap-2 border-t">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>OK</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
