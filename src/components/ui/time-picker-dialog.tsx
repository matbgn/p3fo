import React, { useState, useEffect, useRef } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { ClockDial } from './clock-dial';
import { Button } from './button';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog';
import { useSettingsContext } from '@/context/SettingsContext';

interface TimePickerProps {
    isOpen: boolean;
    onClose: () => void;
    initialTime?: number;
    onTimeChange: (timestamp: number) => void;
}

export const TimePickerDialog: React.FC<TimePickerProps> = ({
    isOpen,
    onClose,
    initialTime,
    onTimeChange,
}) => {
    const { settings } = useSettingsContext();
    const [selectedDateTime, setSelectedDateTime] = useState<Temporal.PlainDateTime>(() => {
        if (initialTime) {
            const instant = Temporal.Instant.fromEpochMilliseconds(initialTime);
            const timezone = settings.timezone || 'Europe/Zurich';
            const timezoneDateTime = instant.toZonedDateTimeISO(timezone);
            return timezoneDateTime.toPlainDateTime();
        }
        const now = Temporal.Now.zonedDateTimeISO(settings.timezone || 'Europe/Zurich');
        return now.toPlainDateTime();
    });
    const [mode, setMode] = useState<'hours' | 'minutes'>('hours');
    const [timeInput, setTimeInput] = useState('');
    const [inputError, setInputError] = useState<string | null>(null);
    const isTypingRef = useRef(false);

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

    const displayTimeInput = isTypingRef.current
        ? timeInput
        : `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    const handleDialChange = (val: number) => {
        isTypingRef.current = false;
        if (mode === 'hours') {
            setSelectedDateTime(selectedDateTime.with({ hour: val, second: 0 }));
        } else {
            setSelectedDateTime(selectedDateTime.with({ minute: val, second: 0 }));
        }
    };

    const parseTimeInput = (input: string): { hour: number; minute: number } | null => {
        const trimmed = input.trim();

        const matchWithColon = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (matchWithColon) {
            const hour = parseInt(matchWithColon[1], 10);
            const minute = parseInt(matchWithColon[2], 10);
            if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                return { hour, minute };
            }
        }

        const matchNoColon = trimmed.match(/^(\d{1,4})$/);
        if (matchNoColon) {
            const digits = matchNoColon[1];
            if (digits.length <= 2) {
                const hour = parseInt(digits, 10);
                if (hour >= 0 && hour <= 23) {
                    return { hour, minute: 0 };
                }
            } else if (digits.length === 3) {
                const hour = parseInt(digits.slice(0, 1), 10);
                const minute = parseInt(digits.slice(1, 3), 10);
                if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                    return { hour, minute };
                }
            } else if (digits.length === 4) {
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
        const sanitized = value.replace(/[^\d:]/g, '');
        setTimeInput(sanitized);
        isTypingRef.current = true;
        setInputError(null);
    };

    const handleTimeInputBlur = () => {
        isTypingRef.current = false;
        const parsed = parseTimeInput(timeInput);
        if (parsed) {
            setSelectedDateTime(selectedDateTime.with({ hour: parsed.hour, minute: parsed.minute, second: 0 }));
            setTimeInput(`${parsed.hour.toString().padStart(2, '0')}:${parsed.minute.toString().padStart(2, '0')}`);
            setInputError(null);
        } else if (timeInput.trim() !== '') {
            setInputError('Invalid time format. Use HH:MM');
        }
    };

    const handleTimeInputKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            isTypingRef.current = false;
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
        isTypingRef.current = false;
        const inputSource = isTypingRef.current ? timeInput : `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        const parsed = parseTimeInput(isTypingRef.current ? timeInput : inputSource);
        if (parsed) {
            const finalDateTime = selectedDateTime.with({ hour: parsed.hour, minute: parsed.minute, second: 0 });
            const timezoneDateTime = finalDateTime.toZonedDateTime(settings.timezone || 'Europe/Zurich');
            onTimeChange(timezoneDateTime.epochMilliseconds);
            onClose();
        } else {
            const fromDialParsed = parseTimeInput(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
            if (fromDialParsed) {
                const finalDateTime = selectedDateTime.with({ hour: fromDialParsed.hour, minute: fromDialParsed.minute, second: 0 });
                const timezoneDateTime = finalDateTime.toZonedDateTime(settings.timezone || 'Europe/Zurich');
                onTimeChange(timezoneDateTime.epochMilliseconds);
                onClose();
            } else {
                setInputError('Invalid time format. Use HH:MM');
            }
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-auto max-w-[320px] p-0 overflow-hidden flex flex-col items-center" aria-describedby={undefined}>
                <div className="bg-primary p-6 w-full flex flex-col items-center justify-center text-primary-foreground">
                    <DialogTitle className="text-xs font-medium opacity-70 mb-2 uppercase tracking-wider">Select Time</DialogTitle>
                    <DialogDescription className="sr-only">Use the clock dial or type a time in HH:MM format to set the time.</DialogDescription>
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

                <div className="px-6 pb-4 w-full">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground font-medium">
                            Or type time (HH:MM)
                        </label>
                        <Input
                            type="text"
                            value={displayTimeInput}
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