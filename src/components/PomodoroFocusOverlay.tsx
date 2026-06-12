import React from 'react';
import { usePomodoro } from '@/hooks/usePomodoro';
import { useDocumentPiP } from '@/hooks/useDocumentPiP';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useSettingsContext } from '@/context/SettingsContext';
import { FocusModeConfig, DEFAULT_FOCUS_MODE_CONFIG } from '@/lib/pomodoro-types';
import { Pause, Play, SkipForward, RotateCcw, PictureInPicture2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const phaseConfig: Record<string, { label: string; color: string; ringColor: string; bgColor: string }> = {
  idle: { label: 'Ready', color: 'text-muted-foreground', ringColor: 'text-muted-foreground', bgColor: '' },
  work: { label: 'Focus Time', color: 'text-red-500', ringColor: 'text-red-500', bgColor: 'bg-red-500/5' },
  'short-break': { label: 'Break', color: 'text-green-500', ringColor: 'text-green-500', bgColor: 'bg-green-500/5' },
  'long-break': { label: 'Long Break', color: 'text-blue-500', ringColor: 'text-blue-500', bgColor: 'bg-blue-500/5' },
};

const formatTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const PomodoroFocusOverlay: React.FC = () => {
  const pomodoro = usePomodoro();
  const { settings } = useSettingsContext();
  const focusConfig: FocusModeConfig = settings.focusModeConfig ?? DEFAULT_FOCUS_MODE_CONFIG;
  const { isSupported: pipSupported, isPiPActive, openPiP, closePiP } = useDocumentPiP();
  const { isLocked, requestLock, releaseLock, isSupported: wakeLockSupported } = useWakeLock();

  React.useEffect(() => {
    if (!focusConfig.wakeLock || !wakeLockSupported) return;

    if (pomodoro.state.phase !== 'idle' && !isLocked) {
      requestLock();
    } else if (pomodoro.state.phase === 'idle' && isLocked) {
      releaseLock();
    }
  }, [pomodoro.state.phase, focusConfig.wakeLock, wakeLockSupported, isLocked, requestLock, releaseLock]);

  React.useEffect(() => {
    return () => {
      if (isLocked) {
        releaseLock();
      }
    };
  }, [isLocked, releaseLock]);

  const handleOpenPiP = React.useCallback(async () => {
    if (pipSupported && !isPiPActive) {
      await openPiP(focusConfig.pipWidth, focusConfig.pipHeight);
    }
  }, [pipSupported, isPiPActive, openPiP, focusConfig.pipWidth, focusConfig.pipHeight]);

  const handleClosePiP = React.useCallback(() => {
    if (isPiPActive) {
      closePiP();
    }
  }, [isPiPActive, closePiP]);

  const config = phaseConfig[pomodoro.state.phase] || phaseConfig.idle;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference * (1 - pomodoro.progress);

  if (pomodoro.state.phase === 'idle') {
    return null;
  }

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${config.bgColor} transition-colors duration-1000`}>
      {pomodoro.state.phase === 'work' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-red-500/5 animate-pulse" />
        </div>
      )}

      <div className="relative flex items-center justify-center mb-6">
        <svg width="220" height="220" viewBox="0 0 220 220" className="transform -rotate-90">
          <circle
            cx="110"
            cy="110"
            r="90"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/20"
          />
          <circle
            cx="110"
            cy="110"
            r="90"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className={config.ringColor}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-bold font-mono ${config.color}`}>
            {formatTime(pomodoro.remaining)}
          </span>
          <span className={`text-lg font-medium ${config.color} mt-1`}>
            {config.label}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mb-6">
        {Array.from({ length: pomodoro.config.cyclesBeforeLongBreak }, (_, i) => {
          // During a long break, celebrate by turning all 4 dots blue.
          if (pomodoro.state.phase === 'long-break') {
            return (
              <div
                key={i}
                className="w-3 h-3 rounded-full transition-colors bg-blue-500"
              />
            );
          }
          // Dot semantics:
          // - i < displayCycleIndex      → previously finished session, green
          // - i === displayCycleIndex + work → current work session, red
          // - i === displayCycleIndex + short-break → current break (same slot), green
          // - i > displayCycleIndex      → upcoming work session, grey
          // displayCycleIndex stays at the same position throughout work+break
          // of one session, so entering a break doesn't appear to add a new dot.
          const isFinished = pomodoro.displayCycleIndex >= 0 && i < pomodoro.displayCycleIndex;
          const isCurrent =
            pomodoro.displayCycleIndex >= 0 && i === pomodoro.displayCycleIndex;
          const isCurrentWork = isCurrent && pomodoro.state.phase === 'work';
          const dotColor = isFinished
            ? 'bg-green-500'
            : isCurrentWork
              ? 'bg-red-500'
              : isCurrent
                ? 'bg-green-500'
                : 'bg-muted-foreground/30';
          return (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${dotColor}`}
            />
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        {pomodoro.isRunning && !pomodoro.isPaused ? (
          <Button
            variant="outline"
            size="lg"
            onClick={pomodoro.pause}
            className="gap-2"
          >
            <Pause className="h-5 w-5" />
            Pause
          </Button>
        ) : pomodoro.isPaused ? (
          <Button
            variant="outline"
            size="lg"
            onClick={pomodoro.resume}
            className="gap-2"
          >
            <Play className="h-5 w-5" />
            Resume
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="lg"
          onClick={() => { pomodoro.skip(); }}
          className="gap-2"
        >
          <SkipForward className="h-5 w-5" />
          Skip
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={pomodoro.reset}
          className="gap-2"
        >
          <RotateCcw className="h-5 w-5" />
          End
        </Button>
        {pipSupported && focusConfig.enablePiP && (
          isPiPActive ? (
            <Button
              variant="outline"
              size="lg"
              onClick={handleClosePiP}
              className="gap-2"
            >
              <PictureInPicture2 className="h-5 w-5" />
              Close PiP
            </Button>
          ) : (
            <Button
              variant="outline"
              size="lg"
              onClick={handleOpenPiP}
              className="gap-2"
            >
              <PictureInPicture2 className="h-5 w-5" />
              PiP
             </Button>
          )
        )}
      </div>
    </div>
  );
};

export default PomodoroFocusOverlay;