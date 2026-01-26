import React, { useState, useEffect } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { ClockDial } from './clock-dial';
import { Button } from './button';
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

    useEffect(() => {
        if (isOpen) {
            if (initialTime) {
                const instant = Temporal.Instant.fromEpochMilliseconds(initialTime);
                const timezoneDateTime = instant.toZonedDateTimeISO(settings.timezone || 'Europe/Zurich');
                setSelectedDateTime(timezoneDateTime.toPlainDateTime());
            } else {
                const now = Temporal.Now.zonedDateTimeISO(settings.timezone || 'Europe/Zurich');
                setSelectedDateTime(now.toPlainDateTime());
            }
            setMode('hours');
        }
    }, [isOpen, initialTime, settings.timezone]);

    const hours = selectedDateTime.hour;
    const minutes = selectedDateTime.minute;

    const handleDialChange = (val: number) => {
        if (mode === 'hours') {
            setSelectedDateTime(selectedDateTime.with({ hour: val }));
        } else {
            setSelectedDateTime(selectedDateTime.with({ minute: val }));
        }
    };

    const handleSave = () => {
        // Convert PlainDateTime to timestamp in user's timezone
        const timezoneDateTime = selectedDateTime.toZonedDateTime(settings.timezone || 'Europe/Zurich');
        onTimeChange(timezoneDateTime.epochMilliseconds);
        onClose();
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

                <DialogFooter className="p-4 w-full flex justify-end gap-2 border-t">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>OK</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
