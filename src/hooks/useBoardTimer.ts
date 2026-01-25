import { useState, useEffect, useCallback } from 'react';

interface TimerState {
    isRunning: boolean;
    startTime: number | null;
    duration: number;
}

interface BoardWithTimer {
    timer: TimerState | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

export function useBoardTimer<T extends BoardWithTimer>(
    boardState: T | null,
    saveBoard: (newState: T) => Promise<void>,
    isModerator: boolean,
    onExpire?: () => Promise<void>
) {
    const [timeLeft, setTimeLeft] = useState(0);
    const [isTimerDialogOpen, setIsTimerDialogOpen] = useState(false);
    const [timerMinutes, setTimerMinutes] = useState(15);
    const [timerSeconds, setTimerSeconds] = useState(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (boardState?.timer?.isRunning) {
            const calculateRemaining = () => {
                const now = Date.now();
                const elapsed = Math.floor((now - boardState.timer!.startTime!) / 1000);
                return Math.max(0, boardState.timer!.duration - elapsed);
            };

            const remaining = calculateRemaining();
            setTimeLeft(remaining);

            if (remaining === 0 && isModerator) {
                if (onExpire) {
                    onExpire();
                } else {
                    // Auto-stop timer when done
                    saveBoard({ ...boardState, timer: { ...boardState.timer!, isRunning: false } });
                }
            }

            interval = setInterval(() => {
                const currentRemaining = calculateRemaining();
                setTimeLeft(currentRemaining);
                if (currentRemaining === 0) {
                    clearInterval(interval);
                    if (isModerator && boardState.timer?.isRunning) {
                        if (onExpire) {
                            onExpire();
                        } else {
                            saveBoard({ ...boardState, timer: { ...boardState.timer!, isRunning: false } });
                        }
                    }
                }
            }, 1000);
        } else {
            setTimeLeft(0);
        }
        return () => clearInterval(interval);
    }, [boardState, isModerator, saveBoard, onExpire]);

    const startTimerWithDuration = async () => {
        if (!boardState || !isModerator) return;
        const durationInSeconds = (timerMinutes * 60) + timerSeconds;
        if (durationInSeconds <= 0) return;

        const newTimer: TimerState = {
            isRunning: true,
            startTime: Date.now(),
            duration: durationInSeconds
        };
        await saveBoard({ ...boardState, timer: newTimer });
        setIsTimerDialogOpen(false);
    };

    const stopTimer = async () => {
        if (!boardState || !isModerator) return;
        await saveBoard({ ...boardState, timer: null }); // Or just isRunning: false if we want to keep last duration
    };

    const adjustMinutes = (amount: number) => {
        setTimerMinutes(prev => Math.min(60, Math.max(0, prev + amount)));
    };

    const adjustSeconds = (amount: number) => {
        setTimerSeconds(prev => Math.min(59, Math.max(0, prev + amount)));
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return {
        timeLeft,
        formatTime,
        isTimerDialogOpen,
        setIsTimerDialogOpen,
        timerMinutes,
        setTimerMinutes,
        timerSeconds,
        setTimerSeconds,
        startTimerWithDuration,
        stopTimer,
        adjustMinutes,
        adjustSeconds
    };
}
