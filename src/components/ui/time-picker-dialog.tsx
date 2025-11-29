import React, { useState, useEffect } from 'react';
import { ClockDial } from './clock-dial';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';

interface TimePickerProps {
    isOpen: boolean;
    onClose: () => void;
    initialTime?: Date | number; // Date object or timestamp
    onTimeChange: (time: Date) => void;
}

export const TimePickerDialog: React.FC<TimePickerProps> = ({
    isOpen,
    onClose,
    initialTime,
    onTimeChange,
}) => {
    const [selectedDate, setSelectedDate] = useState<Date>(
        initialTime ? new Date(initialTime) : new Date()
    );
    const [mode, setMode] = useState<'hours' | 'minutes'>('hours');

    useEffect(() => {
        if (isOpen) {
            setSelectedDate(initialTime ? new Date(initialTime) : new Date());
            setMode('hours');
        }
    }, [isOpen, initialTime]);

    const hours = selectedDate.getHours();
    const minutes = selectedDate.getMinutes();

    const handleDialChange = (val: number) => {
        const newDate = new Date(selectedDate);
        if (mode === 'hours') {
            newDate.setHours(val);
        } else {
            newDate.setMinutes(val);
        }
        setSelectedDate(newDate);
    };

    const handleSave = () => {
        onTimeChange(selectedDate);
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
